import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createAI, GLM_MODELS, KIMI_MODELS } from "../src";
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
  "DEEPSEEK_API_KEY",
  "XAI_API_KEY",
  "QWEN_API_KEY",
  "ZAI_API_KEY",
  "MOONSHOT_API_KEY",
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

  test("requires provider keys when a provider is explicitly selected", () => {
    const cases = [
      ["gateway", "AI_GATEWAY_API_KEY"],
      ["openrouter", "OPENROUTER_API_KEY"],
      ["anthropic", "ANTHROPIC_API_KEY"],
      ["openai", "OPENAI_API_KEY"],
      ["google", "GOOGLE_GEMINI_API_KEY"],
      ["deepseek", "DEEPSEEK_API_KEY"],
      ["xai", "XAI_API_KEY"],
      ["qwen", "QWEN_API_KEY"],
      ["zai", "ZAI_API_KEY"],
      ["moonshotai", "MOONSHOT_API_KEY"],
    ] as const satisfies readonly [ProviderRoute, string][];

    for (const [provider, envVar] of cases) {
      const ai = createAI();

      expect(() => ai.model("fast", { provider })).toThrow(
        `Provider "${provider}" was explicitly requested but ${envVar} is not configured.`,
      );
      expect(() =>
        ai.modelById("google/gemini-2.5-flash", { provider }),
      ).toThrow(
        `Provider "${provider}" was explicitly requested but ${envVar} is not configured.`,
      );
      expect(() =>
        ai.modelConfig("google/gemini-2.5-flash", { provider }),
      ).toThrow(
        `Provider "${provider}" was explicitly requested but ${envVar} is not configured.`,
      );
    }
  });

  test("allows explicit Gateway provider selection on Vercel without a local key", () => {
    process.env.VERCEL_ENV = "production";
    const ai = createAI();

    expect(() => ai.model("fast", { provider: "gateway" })).not.toThrow();
  });

  test("reports only providers that are configured in the current process", () => {
    expect(createAI().availableProviders).toEqual([]);

    process.env.OPENROUTER_API_KEY = "openrouter-key";
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.XAI_API_KEY = "xai-key";
    process.env.MOONSHOT_API_KEY = "moonshot-key";

    expect(createAI().availableProviders).toEqual([
      "gateway",
      "openrouter",
      "anthropic",
      "xai",
      "moonshotai",
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
      deepseekKey: "deepseek-key",
      xaiKey: "xai-key",
      qwenKey: "qwen-key",
      zaiKey: "zai-key",
      moonshotKey: "moonshot-key",
    });

    expect(ai.availableProviders).toEqual([
      "gateway",
      "openrouter",
      "openai",
      "google",
      "deepseek",
      "xai",
      "qwen",
      "zai",
      "moonshotai",
    ]);
  });

  test("reports configured underlying model services separately from provider routes", () => {
    expect(createAI().availableServices).toEqual([]);

    process.env.MOONSHOT_API_KEY = "moonshot-key";
    process.env.ZAI_API_KEY = "zai-key";

    expect(createAI().availableServices).toEqual(["zai", "moonshotai"]);

    delete process.env.MOONSHOT_API_KEY;
    delete process.env.ZAI_API_KEY;

    expect(
      createAI({
        xaiKey: "xai-key",
        serviceKeys: { qwen: "qwen-key" },
      }).availableServices,
    ).toEqual(["xai", "qwen"]);
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
      ai.modelById("meta-llama/llama-3.3-70b-instruct", {
        provider: "anthropic",
      }),
    ).toThrow(
      'Model "meta-llama/llama-3.3-70b-instruct" cannot be used with provider "anthropic". Only OpenRouter can route this model.',
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
      openaiKey: "openai-key",
      googleKey: "google-key",
      deepseekKey: "deepseek-key",
      xaiKey: "xai-key",
      qwenKey: "qwen-key",
      zaiKey: "zai-key",
      moonshotKey: "moonshot-key",
    });

    const cases = [
      ["nano", "gateway", "google/gemini-2.5-flash-lite"],
      ["nano", "openrouter", "google/gemini-2.5-flash-lite"],
      ["nano", "anthropic", "claude-haiku-4-5-20251001"],
      ["nano", "openai", "gpt-5.4-nano"],
      ["nano", "google", "gemini-3.1-flash-lite-preview"],
      ["fast", "gateway", "deepseek/deepseek-v3.2"],
      ["fast", "openrouter", "deepseek/deepseek-v3.2"],
      ["fast", "anthropic", "claude-haiku-4-5-20251001"],
      ["fast", "openai", "gpt-5.4-mini"],
      ["fast", "google", "gemini-3-flash-preview"],
      ["standard", "gateway", "google/gemini-2.5-flash"],
      ["standard", "openrouter", "google/gemini-2.5-flash"],
      ["standard", "anthropic", "claude-sonnet-4-6"],
      ["standard", "openai", "gpt-5.4-mini"],
      ["standard", "google", "gemini-3-flash-preview"],
      ["powerful", "gateway", "anthropic/claude-sonnet-4.6"],
      ["powerful", "openrouter", "anthropic/claude-sonnet-4.6"],
      ["powerful", "anthropic", "claude-sonnet-4-6"],
      ["powerful", "openai", "gpt-5.4"],
      ["powerful", "google", "gemini-3.1-pro-preview"],
      ["reasoning", "gateway", "anthropic/claude-opus-4.6"],
      ["reasoning", "openrouter", "anthropic/claude-opus-4.6"],
      ["reasoning", "anthropic", "claude-opus-4-6"],
      ["reasoning", "openai", "gpt-5.5"],
      ["reasoning", "google", "gemini-3.1-pro-preview"],
      ["fast", "deepseek", "deepseek-v3.2"],
      ["standard", "xai", "grok-4.20"],
      ["standard", "qwen", "qwen3-vl-8b-instruct"],
      ["standard", "zai", "glm-5-turbo"],
      ["standard", "moonshotai", "kimi-k2.6"],
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

  test("selects task-specific tier models and falls back per provider", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      anthropicKey: "anthropic-key",
      models: {
        tasks: {
          coding: {
            standard: {
              text: GLM_MODELS.GLM_5_1,
            },
          },
        },
      },
    });

    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "openrouter",
          task: "coding",
        }),
      ),
    ).toBe(GLM_MODELS.GLM_5_1);
    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "openrouter",
          tools: true,
          task: "coding",
        }),
      ),
    ).toBe(KIMI_MODELS.KIMI_K2_6);
    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "anthropic",
          tools: true,
          task: "coding",
        }),
      ),
    ).toBe("claude-sonnet-4-6");
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
      xaiKey: "xai-key",
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
      xaiKey: "xai-key",
    });

    expect(ai.modelConfig("anthropic/claude-sonnet-4.6")).toMatchObject({
      provider: "gateway",
      id: "anthropic/claude-sonnet-4.6",
      apiKey: "gateway-key",
      service: "anthropic",
      serviceApiKey: "anthropic-key",
      serviceApiKeyEnv: "ANTHROPIC_API_KEY",
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
      createAI({
        openRouterKey: "openrouter-key",
        moonshotKey: "moonshot-key",
      }).modelConfig(KIMI_MODELS.KIMI_K2_6, { provider: "openrouter" }),
    ).toMatchObject({
      provider: "openrouter",
      id: "moonshotai/kimi-k2.6",
      apiKey: "openrouter-key",
      service: "moonshotai",
      serviceApiKey: "moonshot-key",
      serviceApiKeyEnv: "MOONSHOT_API_KEY",
    });
    expect(
      ai.modelConfig("x-ai/grok-4.20", {
        provider: "xai",
      }),
    ).toMatchObject({
      provider: "xai",
      id: "grok-4.20",
      apiKey: "xai-key",
      service: "xai",
      serviceApiKey: "xai-key",
      serviceApiKeyEnv: "XAI_API_KEY",
      baseURL: "https://api.x.ai/v1",
      url: "https://api.x.ai/v1",
      capabilities: {
        modelId: true,
        apiKey: true,
        baseURL: true,
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
