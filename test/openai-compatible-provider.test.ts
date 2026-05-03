import { describe, expect, mock, test } from "bun:test";

const calls = {
  create: [] as Array<{ apiKey?: string; baseURL?: string }>,
  defaultModel: [] as string[],
  chatModel: [] as string[],
};

mock.module("@ai-sdk/openai", () => ({
  createOpenAI(options: { apiKey?: string; baseURL?: string }) {
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
});
