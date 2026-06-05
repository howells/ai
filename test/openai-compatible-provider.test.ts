import { describe, expect, mock, test } from "bun:test";

const calls = {
  chatModel: [] as string[],
  create: [] as {
    apiKey?: string;
    baseURL?: string;
    fetch?: typeof fetch;
  }[],
  defaultModel: [] as string[],
};

mock.module("@ai-sdk/openai", () => ({
  createOpenAI(options: { apiKey?: string; baseURL?: string; fetch?: typeof fetch }) {
    calls.create.push(options);

    const client = ((modelId: string) => {
      calls.defaultModel.push(modelId);
      return { mode: "default", modelId };
    }) as ((modelId: string) => unknown) & {
      chat: (modelId: string) => unknown;
    };

    client.chat = (modelId: string) => {
      calls.chatModel.push(modelId);
      return { mode: "chat", modelId };
    };

    return client;
  },
}));

const { createOpenAICompatibleProvider } = await import("../src/providers/openai-compatible");

describe("createOpenAICompatibleProvider", () => {
  test("uses Chat Completions for OpenAI-compatible direct providers", () => {
    calls.create.length = 0;
    calls.defaultModel.length = 0;
    calls.chatModel.length = 0;

    const provider = createOpenAICompatibleProvider({
      apiKey: "test-key",
      baseURL: "https://api.moonshot.ai/v1",
      envVar: "MOONSHOT_API_KEY",
      provider: "moonshotai",
      service: "moonshotai",
    });

    expect(provider.model("kimi-k2.5")).toEqual({
      mode: "chat",
      modelId: "kimi-k2.5",
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

    globalThis.fetch = ((_input, init) => {
      if (typeof init?.body === "string") {
        bodies.push(init.body);
      }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const provider = createOpenAICompatibleProvider({
        apiKey: "test-key",
        baseURL: "https://api.groq.com/openai/v1",
        envVar: "GROQ_API_KEY",
        provider: "groq",
        service: "groq",
      });

      provider.model("openai/gpt-oss-20b");
      const groqFetch = calls.create[0]?.fetch;

      expect(groqFetch).toBeFunction();

      await groqFetch?.("https://api.groq.com/openai/v1/chat/completions", {
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hi" }],
          model: "openai/gpt-oss-20b",
        }),
        method: "POST",
      });

      expect(JSON.parse(bodies[0] ?? "{}")).toMatchObject({
        include_reasoning: false,
        model: "openai/gpt-oss-20b",
        reasoning_effort: "low",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
