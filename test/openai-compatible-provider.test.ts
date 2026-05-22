import { describe, expect, mock, test } from "bun:test";

const calls = {
  create: [] as Array<{
    apiKey?: string;
    baseURL?: string;
    fetch?: typeof fetch;
  }>,
  defaultModel: [] as string[],
  chatModel: [] as string[],
};

mock.module("@ai-sdk/openai", () => ({
  createOpenAI(options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch }) {
    calls.create.push(options);

    const client = ((modelId: string) => {
      calls.defaultModel.push(modelId);
      return { modelId, mode: "default" };
    }) as ((modelId: string) => unknown) & {
      chat: (modelId: string) => unknown;
    };

    client.chat = (modelId: string) => {
      calls.chatModel.push(modelId);
      return { modelId, mode: "chat" };
    };

    return client;
  },
}));

const { createOpenAICompatibleProvider } = await import(
  "../src/providers/openai-compatible"
);

describe("createOpenAICompatibleProvider", () => {
  test("uses Chat Completions for OpenAI-compatible direct providers", () => {
    calls.create.length = 0;
    calls.defaultModel.length = 0;
    calls.chatModel.length = 0;

    const provider = createOpenAICompatibleProvider({
      provider: "moonshotai",
      service: "moonshotai",
      apiKey: "test-key",
      envVar: "MOONSHOT_API_KEY",
      baseURL: "https://api.moonshot.ai/v1",
    });

    expect(provider.model("kimi-k2.5")).toEqual({
      modelId: "kimi-k2.5",
      mode: "chat",
    });
    expect(calls.create).toEqual([
      {
        apiKey: "test-key",
        baseURL: "https://api.moonshot.ai/v1",
      },
    ]);
    expect(calls.chatModel).toEqual(["kimi-k2.5"]);
    expect(calls.defaultModel).toEqual([]);
  });

  test("excludes Groq GPT-OSS reasoning traces and lowers reasoning effort", async () => {
    calls.create.length = 0;
    calls.defaultModel.length = 0;
    calls.chatModel.length = 0;

    const originalFetch = globalThis.fetch;
    const bodies: string[] = [];

    globalThis.fetch = (async (_input, init) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const provider = createOpenAICompatibleProvider({
        provider: "groq",
        service: "groq",
        apiKey: "test-key",
        envVar: "GROQ_API_KEY",
        baseURL: "https://api.groq.com/openai/v1",
      });

      provider.model("openai/gpt-oss-20b");
      const groqFetch = calls.create[0]?.fetch;

      expect(groqFetch).toBeFunction();

      await groqFetch?.("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [{ role: "user", content: "Hi" }],
        }),
      });

      expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
        model: "openai/gpt-oss-20b",
        include_reasoning: false,
        reasoning_effort: "low",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
