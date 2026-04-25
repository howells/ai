import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAI } from "../src";

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_ENV",
  "VERCEL_API_KEY",
  "OPENROUTER_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_GEMINI_API_KEY",
  "VOYAGE_API_KEY",
] as const;

const originalEnv = new Map<string, string | undefined>();

const clearProviderEnv = () => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
  clearProviderEnv();
});

afterEach(() => {
  clearProviderEnv();
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  originalEnv.clear();
});

describe("createAI", () => {
  test("uses Gateway as the default language model route", () => {
    const ai = createAI();

    expect(() => ai.model("fast")).not.toThrow();
  });

  test("reports only providers that are configured in the current process", () => {
    expect(createAI().availableProviders).toEqual([]);

    process.env.OPENROUTER_API_KEY = "openrouter-key";
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";

    expect(createAI().availableProviders).toEqual([
      "gateway",
      "openrouter",
      "anthropic",
    ]);
  });

  test("does not treat VERCEL_API_KEY as Gateway configuration", () => {
    process.env.VERCEL_API_KEY = "vercel-api-key";

    expect(createAI().availableProviders).toEqual([]);
  });

  test("treats Vercel deployment env as Gateway configuration", () => {
    process.env.VERCEL_ENV = "production";

    expect(createAI().availableProviders).toEqual(["gateway"]);
  });

  test("uses explicit config keys when computing available providers", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      openaiKey: "openai-key",
      googleKey: "google-key",
    });

    expect(ai.availableProviders).toEqual([
      "gateway",
      "openrouter",
      "openai",
      "google",
    ]);
  });

  test("rejects modelById calls with mismatched prefixed direct providers", () => {
    const ai = createAI({ anthropicKey: "anthropic-key" });

    expect(() =>
      ai.modelById("openai/gpt-5-nano", { provider: "anthropic" }),
    ).toThrow(
      'Model "openai/gpt-5-nano" cannot be used with provider "anthropic". It belongs to "openai".',
    );
  });

  test("rejects modelById direct-provider calls for unknown provider prefixes", () => {
    const ai = createAI({ anthropicKey: "anthropic-key" });

    expect(() =>
      ai.modelById("deepseek/deepseek-v3.2", { provider: "anthropic" }),
    ).toThrow(
      'Model "deepseek/deepseek-v3.2" cannot be used with provider "anthropic". Only OpenRouter can route this model.',
    );
  });

  test("allows bare model IDs for direct provider escape hatches", () => {
    const ai = createAI({ anthropicKey: "anthropic-key" });

    expect(() =>
      ai.modelById("claude-sonnet-4-6", { provider: "anthropic" }),
    ).not.toThrow();
  });

  test("exposes Voyage image embedding models", () => {
    const ai = createAI({ voyageKey: "voyage-key" });

    expect(() => ai.imageEmbedModel()).not.toThrow();
    expect(() =>
      ai.embeddingModel({ input: "image", provider: "voyage" }),
    ).not.toThrow();
  });

  test("exposes Google Gemini image embedding models", () => {
    const ai = createAI({ googleKey: "google-key" });

    expect(() => ai.googleImageEmbedModel()).not.toThrow();
    expect(() =>
      ai.embeddingModel({ input: "image", provider: "gemini" }),
    ).not.toThrow();
  });

  test("exposes provider-neutral text embedding models", () => {
    const voyage = createAI({ voyageKey: "voyage-key" });
    const gemini = createAI({ googleKey: "google-key" });

    expect(() =>
      voyage.embeddingModel({ input: "text", provider: "voyage" }),
    ).not.toThrow();
    expect(() =>
      gemini.embeddingModel({ input: "text", provider: "gemini" }),
    ).not.toThrow();
  });

  test("exposes OpenRouter runtime config for non-AI-SDK callers", () => {
    const env = process.env.NODE_ENV ?? "development";
    const ai = createAI({
      app: { name: "Routerbase", url: "https://routerbase.dev" },
      openRouterKey: "openrouter-key",
    });

    expect(ai.openRouterRequestConfig({ agent: "search" })).toEqual({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: "openrouter-key",
      headers: {
        "HTTP-Referer": "https://routerbase.dev",
        "X-Title": "Routerbase",
      },
      user: `search/${env}`,
    });

    expect(ai.openRouterModelConfig("deepseek/deepseek-v3.2")).toMatchObject({
      id: "deepseek/deepseek-v3.2",
      url: "https://openrouter.ai/api/v1",
      apiKey: "openrouter-key",
    });
  });
});
