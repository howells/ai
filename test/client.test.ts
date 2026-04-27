import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAI } from "../src";
import type { ModelTier, ProviderRoute } from "../src";

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

const modelIdOf = (model: unknown) => (model as { modelId: string }).modelId;

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

  test("translates default tier model IDs for each viable provider route", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      anthropicKey: "anthropic-key",
      googleKey: "google-key",
    });

    const cases = [
      ["nano", "gateway", "google/gemini-2.5-flash-lite"],
      ["nano", "openrouter", "google/gemini-2.5-flash-lite"],
      ["nano", "google", "gemini-2.5-flash-lite"],
      ["fast", "gateway", "deepseek/deepseek-v3.2"],
      ["fast", "openrouter", "deepseek/deepseek-v3.2"],
      ["standard", "gateway", "google/gemini-2.5-flash"],
      ["standard", "openrouter", "google/gemini-2.5-flash"],
      ["standard", "google", "gemini-2.5-flash"],
      ["powerful", "gateway", "anthropic/claude-sonnet-4.6"],
      ["powerful", "openrouter", "anthropic/claude-sonnet-4.6"],
      ["powerful", "anthropic", "claude-sonnet-4-6"],
      ["reasoning", "gateway", "anthropic/claude-opus-4.6"],
      ["reasoning", "openrouter", "anthropic/claude-opus-4.6"],
      ["reasoning", "anthropic", "claude-opus-4-6"],
    ] as const satisfies readonly [
      ModelTier,
      ProviderRoute,
      string,
    ][];

    for (const [tier, provider, expected] of cases) {
      expect(modelIdOf(ai.model(tier, { provider }))).toBe(expected);
    }
  });

  test("selects tool and vision variants inside each tier", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      googleKey: "google-key",
    });

    expect(modelIdOf(ai.model("fast", { tools: true }))).toBe(
      "xai/grok-4.1-fast-non-reasoning",
    );
    expect(
      modelIdOf(ai.model("fast", { provider: "openrouter", tools: true })),
    ).toBe("x-ai/grok-4.1-fast");
    expect(modelIdOf(ai.model("fast", { vision: true }))).toBe(
      "google/gemini-3-flash",
    );
    expect(
      modelIdOf(
        ai.model("fast", {
          provider: "openrouter",
          tools: true,
          vision: true,
        }),
      ),
    ).toBe("google/gemini-3-flash-preview");
    expect(
      modelIdOf(ai.model("standard", { provider: "google", vision: true })),
    ).toBe("gemini-3-flash-preview");
  });

  test("reports language model capabilities for selected variants", () => {
    const ai = createAI();

    expect(ai.modelCapabilities()).toEqual({
      structured: true,
      tools: false,
      vision: false,
    });
    expect(ai.modelCapabilities({ tools: true, vision: true })).toEqual({
      structured: true,
      tools: true,
      vision: true,
    });
  });

  test("normalizes legacy IDs when selecting explicit models", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      anthropicKey: "anthropic-key",
    });

    expect(
      modelIdOf(
        ai.modelById("anthropic/claude-sonnet-4-6", {
          provider: "openrouter",
        }),
      ),
    ).toBe("anthropic/claude-sonnet-4.6");
    expect(
      modelIdOf(
        ai.modelById("anthropic/claude-sonnet-4.6", {
          provider: "anthropic",
        }),
      ),
    ).toBe("claude-sonnet-4-6");
  });

  test("exposes Voyage image embedding models", () => {
    const ai = createAI({ voyageKey: "voyage-key" });

    expect(
      modelIdOf(ai.embeddingModel({ input: "image", provider: "voyage" })),
    ).toBe("voyage-multimodal-3.5");
  });

  test("exposes Google Gemini image embedding models", () => {
    const ai = createAI({ googleKey: "google-key" });

    expect(
      modelIdOf(ai.embeddingModel({ input: "image", provider: "gemini" })),
    ).toBe("gemini-embedding-2-preview");
  });

  test("exposes provider-neutral text embedding models", () => {
    const voyage = createAI({ voyageKey: "voyage-key" });
    const gemini = createAI({ googleKey: "google-key" });

    expect(
      modelIdOf(voyage.embeddingModel({ input: "text", provider: "voyage" })),
    ).toBe("voyage-3");
    expect(
      modelIdOf(gemini.embeddingModel({ input: "text", provider: "gemini" })),
    ).toBe("gemini-embedding-2-preview");
  });

  test("uses provider-specific embedding slot overrides", () => {
    const ai = createAI({
      googleKey: "google-key",
      voyageKey: "voyage-key",
      models: {
        embed: {
          voyage: "voyage-3-lite",
          gemini: "gemini-embedding-001",
        },
        multimodalEmbed: {
          voyage: "voyage-multimodal-3",
          gemini: "gemini-embedding-2-preview",
        },
      },
    });

    expect(modelIdOf(ai.embeddingModel({ provider: "voyage" }))).toBe(
      "voyage-3-lite",
    );
    expect(modelIdOf(ai.embeddingModel({ provider: "gemini" }))).toBe(
      "gemini-embedding-001",
    );
    expect(
      modelIdOf(ai.embeddingModel({ input: "image", provider: "voyage" })),
    ).toBe("voyage-multimodal-3");
    expect(
      modelIdOf(ai.embeddingModel({ input: "image", provider: "gemini" })),
    ).toBe("gemini-embedding-2-preview");
  });

  test("exposes provider-neutral runtime model config", () => {
    const env = process.env.NODE_ENV ?? "development";
    const ai = createAI({
      app: { name: "Howells AI", url: "https://github.com/howells/ai" },
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      anthropicKey: "anthropic-key",
    });

    expect(ai.modelConfig("anthropic/claude-sonnet-4.6")).toMatchObject({
      provider: "gateway",
      id: "anthropic/claude-sonnet-4.6",
      apiKey: "gateway-key",
      capabilities: {
        modelId: true,
        apiKey: true,
        baseURL: false,
        headers: false,
        appAttribution: false,
        agentAttribution: false,
      },
    });
    expect(
      ai.modelConfig("anthropic/claude-sonnet-4.6", {
        provider: "anthropic",
      }),
    ).toMatchObject({
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      apiKey: "anthropic-key",
    });
    expect(
      ai.modelConfig("anthropic/claude-sonnet-4-6", {
        provider: "openrouter",
        agent: "search",
      }),
    ).toMatchObject({
      provider: "openrouter",
      id: "anthropic/claude-sonnet-4.6",
      apiKey: "openrouter-key",
      baseURL: "https://openrouter.ai/api/v1",
      url: "https://openrouter.ai/api/v1",
      user: `search/${env}`,
      capabilities: {
        modelId: true,
        apiKey: true,
        baseURL: true,
        headers: true,
        appAttribution: true,
        agentAttribution: true,
      },
    });
  });
});
