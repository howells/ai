import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  createAI,
  KIMI_MODELS,
  NEX_AGI_MODELS,
  OPENAI_MODELS,
  OPENROUTER_EMBED_MODELS,
  QWEN_MODELS,
} from "../src";
import type { ModelTier, ProviderRoute } from "../src";
import { createAIServer } from "../src/server";

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
  "GROQ_API_KEY",
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
      ["groq", "GROQ_API_KEY"],
    ] as const satisfies readonly [ProviderRoute, string][];

    for (const [provider, envVar] of cases) {
      const ai = createAI();

      expect(() => ai.model("fast", { provider })).toThrow(
        `Provider "${provider}" was explicitly requested but ${envVar} is not configured.`,
      );
      expect(() => ai.modelById("google/gemini-3.5-flash", { provider })).toThrow(
        `Provider "${provider}" was explicitly requested but ${envVar} is not configured.`,
      );
      expect(() => ai.modelDescriptor("provider-native-model", { provider })).not.toThrow();
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
    process.env.GROQ_API_KEY = "groq-key";

    expect(createAI().availableProviders).toEqual([
      "gateway",
      "openrouter",
      "anthropic",
      "xai",
      "moonshotai",
      "groq",
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
      deepseekKey: "deepseek-key",
      gatewayKey: "gateway-key",
      googleKey: "google-key",
      groqKey: "groq-key",
      moonshotKey: "moonshot-key",
      openRouterKey: "openrouter-key",
      openaiKey: "openai-key",
      qwenKey: "qwen-key",
      xaiKey: "xai-key",
      zaiKey: "zai-key",
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
      "groq",
    ]);
  });

  test("reports configured underlying model services separately from provider routes", () => {
    expect(createAI().availableServices).toEqual([]);

    process.env.MOONSHOT_API_KEY = "moonshot-key";
    process.env.ZAI_API_KEY = "zai-key";
    process.env.GROQ_API_KEY = "groq-key";

    expect(createAI().availableServices).toEqual(["groq", "zai", "moonshotai"]);

    delete process.env.MOONSHOT_API_KEY;
    delete process.env.ZAI_API_KEY;
    delete process.env.GROQ_API_KEY;

    expect(
      createAI({
        serviceKeys: { qwen: "qwen-key" },
        xaiKey: "xai-key",
      }).availableServices,
    ).toEqual(["xai", "qwen"]);
  });

  test("rejects modelById calls with mismatched prefixed direct providers", () => {
    const ai = createAI({ anthropicKey: "anthropic-key" });

    expect(() => ai.modelById("openai/gpt-5-nano", { provider: "anthropic" })).toThrow(
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

  test("rejects exact models known to be unavailable through Gateway", () => {
    const ai = createAI({ gatewayKey: "gateway-key" });

    expect(() =>
      ai.modelById(NEX_AGI_MODELS.NEX_N2_PRO, {
        provider: "gateway",
      }),
    ).toThrow(
      'Model "nex-agi/nex-n2-pro" is not available through provider "gateway". Use OpenRouter or choose a Gateway-supported model.',
    );
    expect(() =>
      ai.modelDescriptor(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE, {
        provider: "gateway",
      }),
    ).toThrow(
      'Model "qwen/qwen3-next-80b-a3b-instruct:free" is not available through provider "gateway". Use OpenRouter or choose a Gateway-supported model.',
    );
  });

  test("allows bare model IDs for direct provider escape hatches", () => {
    const ai = createAI({ anthropicKey: "anthropic-key" });

    expect(() => ai.modelById("claude-sonnet-4-6", { provider: "anthropic" })).not.toThrow();
  });

  test("translates default tier model IDs for each viable provider route", () => {
    const ai = createAI({
      anthropicKey: "anthropic-key",
      deepseekKey: "deepseek-key",
      gatewayKey: "gateway-key",
      googleKey: "google-key",
      groqKey: "groq-key",
      moonshotKey: "moonshot-key",
      openRouterKey: "openrouter-key",
      openaiKey: "openai-key",
      qwenKey: "qwen-key",
      xaiKey: "xai-key",
      zaiKey: "zai-key",
    });

    const cases = [
      ["nano", "gateway", "openai/gpt-5.4-nano"],
      ["nano", "openrouter", "openai/gpt-5.4-nano"],
      ["nano", "anthropic", "claude-haiku-4-5-20251001"],
      ["nano", "openai", "gpt-5.4-nano"],
      ["nano", "google", "gemini-3.1-flash-lite"],
      ["fast", "gateway", "google/gemini-3.1-flash-lite"],
      ["fast", "openrouter", "google/gemini-3.1-flash-lite"],
      ["fast", "anthropic", "claude-haiku-4-5-20251001"],
      ["fast", "openai", "gpt-5.4-nano"],
      ["fast", "google", "gemini-3.5-flash"],
      ["fast", "xai", "grok-4.3"],
      ["standard", "gateway", "google/gemini-3.5-flash"],
      ["standard", "openrouter", "google/gemini-3.5-flash"],
      ["standard", "anthropic", "claude-sonnet-4-6"],
      ["standard", "openai", "gpt-5.4-mini"],
      ["standard", "google", "gemini-3.5-flash"],
      ["powerful", "gateway", "google/gemini-3.1-pro-preview"],
      ["powerful", "openrouter", "google/gemini-3.1-pro-preview"],
      ["powerful", "anthropic", "claude-opus-4-8"],
      ["powerful", "openai", "gpt-5.5"],
      ["powerful", "google", "gemini-3.1-pro-preview"],
      ["reasoning", "gateway", "anthropic/claude-opus-4.8"],
      ["reasoning", "openrouter", "anthropic/claude-opus-4.8"],
      ["reasoning", "anthropic", "claude-opus-4-8"],
      ["reasoning", "openai", "gpt-5.5"],
      ["reasoning", "google", "gemini-3.1-pro-preview"],
      ["fast", "deepseek", "deepseek-v4-pro"],
      ["standard", "xai", "grok-4.3"],
      ["standard", "qwen", "qwen3.7-plus"],
      ["standard", "zai", "glm-4.7"],
      ["standard", "moonshotai", "kimi-k2.7-code"],
      ["standard", "groq", "openai/gpt-oss-120b"],
    ] as const satisfies readonly [ModelTier, ProviderRoute, string][];

    for (const [tier, provider, expected] of cases) {
      expect(modelIdOf(ai.model(tier, { provider }))).toBe(expected);
    }
  });

  test("selects tool and vision variants inside each tier", () => {
    const ai = createAI({
      gatewayKey: "gateway-key",
      googleKey: "google-key",
      openRouterKey: "openrouter-key",
    });

    expect(modelIdOf(ai.model("fast", { tools: true }))).toBe("google/gemini-3.1-flash-lite");
    expect(modelIdOf(ai.model("fast", { provider: "openrouter", tools: true }))).toBe(
      "google/gemini-3.1-flash-lite",
    );
    expect(modelIdOf(ai.model("fast", { vision: true }))).toBe("google/gemini-3.1-flash-lite");
    expect(
      modelIdOf(
        ai.model("fast", {
          provider: "openrouter",
          tools: true,
          vision: true,
        }),
      ),
    ).toBe("google/gemini-3.1-flash-lite");
    expect(modelIdOf(ai.model("standard", { provider: "google", vision: true }))).toBe(
      "gemini-3.5-flash",
    );
  });

  test("routes free tier selections through OpenRouter's managed free router", () => {
    const ai = createAI({
      openRouterKey: "openrouter-key",
    });

    expect(modelIdOf(ai.model("standard", { free: true }))).toBe("openrouter/free");
    expect(modelIdOf(ai.model("fast", { free: true, tools: true, vision: true }))).toBe(
      "openrouter/free",
    );
    expect(() => ai.model("standard", { free: true, provider: "gateway" })).toThrow(
      /only supported through provider "openrouter"/,
    );
  });

  test("selects task-specific tier models and falls back per provider", () => {
    const ai = createAI({
      anthropicKey: "anthropic-key",
      gatewayKey: "gateway-key",
      models: {
        tasks: {
          coding: {
            standard: {
              text: KIMI_MODELS.KIMI_K2_5,
            },
          },
        },
      },
      openRouterKey: "openrouter-key",
    });

    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "openrouter",
          task: "coding",
        }),
      ),
    ).toBe(KIMI_MODELS.KIMI_K2_5);
    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "openrouter",
          task: "coding",
          tools: true,
        }),
      ),
    ).toBe(OPENAI_MODELS.GPT_5_5);
    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "anthropic",
          task: "coding",
          tools: true,
        }),
      ),
    ).toBe("claude-sonnet-4-6");
  });

  test("uses provider-specific task defaults when one provider is pinned", () => {
    const ai = createAI({
      moonshotKey: "moonshot-key",
      openaiKey: "openai-key",
      qwenKey: "qwen-key",
      zaiKey: "zai-key",
    });

    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "openai",
          task: "coding",
          tools: true,
        }),
      ),
    ).toBe("gpt-5.5");
    expect(
      modelIdOf(
        ai.model("standard", {
          provider: "zai",
          task: "vision",
          vision: true,
        }),
      ),
    ).toBe("glm-5v-turbo");
    expect(
      modelIdOf(
        ai.model("nano", {
          provider: "qwen",
          vision: true,
        }),
      ),
    ).toBe("qwen3.7-plus");
    expect(
      modelIdOf(
        ai.model("reasoning", {
          provider: "moonshotai",
          task: "vision",
          vision: true,
        }),
      ),
    ).toBe("kimi-k2.7-code");
  });

  test("rejects incompatible capability requests before calling providers", () => {
    const ai = createAI({
      deepseekKey: "deepseek-key",
      openRouterKey: "openrouter-key",
    });

    expect(() => ai.model("nano", { provider: "deepseek", vision: true })).toThrow(
      'Model "deepseek/deepseek-v4-pro" does not support vision input. Choose a vision-capable model or remove vision: true.',
    );
    expect(() =>
      ai.modelById("deepseek/deepseek-v4-pro", {
        provider: "openrouter",
        vision: true,
      }),
    ).toThrow(
      'Model "deepseek/deepseek-v4-pro" does not support vision input. Choose a vision-capable model or remove vision: true.',
    );
    expect(() =>
      ai.modelDescriptor("deepseek/deepseek-v4-pro", {
        provider: "openrouter",
        vision: true,
      }),
    ).toThrow(
      'Model "deepseek/deepseek-v4-pro" does not support vision input. Choose a vision-capable model or remove vision: true.',
    );
  });

  test("reports actual capabilities for known model IDs", () => {
    const ai = createAI();

    expect(ai.modelCapabilities({ modelId: "deepseek/deepseek-v4-pro" })).toEqual({
      structured: true,
      tools: true,
      vision: false,
    });
    expect(ai.modelCapabilities({ vision: true })).toEqual({
      structured: true,
      tools: false,
      vision: true,
    });
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
      anthropicKey: "anthropic-key",
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
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

  test("applies OpenRouter model variants as virtual model suffixes", () => {
    const ai = createAI({
      openRouterKey: "openrouter-key",
      openaiKey: "openai-key",
    });

    expect(
      modelIdOf(
        ai.model("standard", {
          openRouterVariant: "nitro",
          provider: "openrouter",
        }),
      ),
    ).toBe("google/gemini-3.5-flash:nitro");
    expect(
      modelIdOf(
        ai.modelById("moonshotai/kimi-k2.7-code", {
          openRouterVariant: "exacto",
          provider: "openrouter",
        }),
      ),
    ).toBe("moonshotai/kimi-k2.7-code:exacto");
    expect(
      modelIdOf(
        ai.modelById("moonshotai/kimi-k2.7-code:nitro", {
          openRouterVariant: "floor",
          provider: "openrouter",
        }),
      ),
    ).toBe("moonshotai/kimi-k2.7-code:floor");
    expect(
      ai.modelDescriptor("moonshotai/kimi-k2.7-code", {
        openRouterVariant: "exacto",
        provider: "openrouter",
      }),
    ).toMatchObject({
      providerModelId: "moonshotai/kimi-k2.7-code:exacto",
    });
    expect(() =>
      ai.modelById("openai/gpt-5.5", {
        openRouterVariant: "nitro",
        provider: "openai",
      }),
    ).toThrow(/only supported with provider "openrouter"/);
    expect(() => ai.modelById("openai/gpt-5.5:nitro")).toThrow(
      /only supported with provider "openrouter"/,
    );
  });

  test("exposes Voyage image embedding models", () => {
    const ai = createAI({ voyageKey: "voyage-key" });

    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "voyage" }))).toBe(
      "voyage-multimodal-3.5",
    );
  });

  test("exposes Google Gemini image embedding models", () => {
    const ai = createAI({ googleKey: "google-key" });

    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "gemini" }))).toBe(
      "gemini-embedding-2",
    );
  });

  test("exposes provider-neutral text embedding models", () => {
    const voyage = createAI({ voyageKey: "voyage-key" });
    const gemini = createAI({ googleKey: "google-key" });
    const openrouter = createAI({ openRouterKey: "openrouter-key" });

    expect(modelIdOf(voyage.embeddingModel({ input: "text", provider: "voyage" }))).toBe(
      "voyage-4",
    );
    expect(modelIdOf(gemini.embeddingModel({ input: "text", provider: "gemini" }))).toBe(
      "gemini-embedding-2",
    );
    expect(modelIdOf(openrouter.embeddingModel({ input: "text", provider: "openrouter" }))).toBe(
      "openai/text-embedding-3-small",
    );
  });

  test("exposes curated OpenRouter embedding models", () => {
    const ai = createAI({ openRouterKey: "openrouter-key" });

    expect(modelIdOf(ai.embeddingModel({ provider: "openrouter" }))).toBe(
      OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_SMALL,
    );
    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "openrouter" }))).toBe(
      OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_2,
    );
    expect(() => createAI().embeddingModel({ provider: "openrouter" })).toThrow(
      'Provider "openrouter" was explicitly requested but OPENROUTER_API_KEY is not configured.',
    );
  });

  test("uses provider-specific embedding slot overrides", () => {
    const ai = createAI({
      googleKey: "google-key",
      models: {
        embed: {
          gemini: "gemini-embedding-001",
          openrouter: "openai/text-embedding-3-large",
          voyage: "voyage-3-lite",
        },
        multimodalEmbed: {
          gemini: "gemini-embedding-2",
          openrouter: "google/gemini-embedding-001",
          voyage: "voyage-multimodal-3",
        },
      },
      openRouterKey: "openrouter-key",
      voyageKey: "voyage-key",
    });

    expect(modelIdOf(ai.embeddingModel({ provider: "voyage" }))).toBe("voyage-3-lite");
    expect(modelIdOf(ai.embeddingModel({ provider: "gemini" }))).toBe("gemini-embedding-001");
    expect(modelIdOf(ai.embeddingModel({ provider: "openrouter" }))).toBe(
      "openai/text-embedding-3-large",
    );
    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "voyage" }))).toBe(
      "voyage-multimodal-3",
    );
    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "gemini" }))).toBe(
      "gemini-embedding-2",
    );
    expect(modelIdOf(ai.embeddingModel({ input: "image", provider: "openrouter" }))).toBe(
      "google/gemini-embedding-001",
    );
  });

  test("separates serializable descriptors from server connections", () => {
    const env = process.env.NODE_ENV ?? "development";
    const ai = createAIServer({
      anthropicKey: "anthropic-key",
      app: { name: "Howells AI", url: "https://github.com/howells/ai" },
      gatewayKey: "gateway-key",
      openRouterKey: "openrouter-key",
      xaiKey: "xai-key",
    });

    expect(ai.modelDescriptor("anthropic/claude-sonnet-4.6")).toMatchObject({
      capabilities: {
        agentAttribution: false,
        apiKey: true,
        appAttribution: false,
        baseURL: false,
        headers: false,
        modelId: true,
      },
      canonicalId: "anthropic/claude-sonnet-4.6",
      providerModelId: "anthropic/claude-sonnet-4.6",
      provider: "gateway",
      service: "anthropic",
      requiredEnvironmentVariables: ["AI_GATEWAY_API_KEY"],
    });
    expect(
      createAIServer({
        moonshotKey: "moonshot-key",
        openRouterKey: "openrouter-key",
      }).modelConnection(KIMI_MODELS.KIMI_K2_7_CODE, { provider: "openrouter" }),
    ).toMatchObject({
      credentials: { apiKey: "openrouter-key", serviceApiKey: "moonshot-key" },
      providerModelId: "moonshotai/kimi-k2.7-code",
      provider: "openrouter",
      service: "moonshotai",
    });
    expect(
      ai.modelConnection("x-ai/grok-4.3", {
        provider: "xai",
      }),
    ).toMatchObject({
      baseURL: "https://api.x.ai/v1",
      capabilities: {
        apiKey: true,
        baseURL: true,
        modelId: true,
      },
      credentials: { apiKey: "xai-key", serviceApiKey: "xai-key" },
      providerModelId: "grok-4.3",
      provider: "xai",
      service: "xai",
      url: "https://api.x.ai/v1",
    });
    expect(
      ai.modelConnection("anthropic/claude-sonnet-4.6", {
        provider: "anthropic",
      }),
    ).toMatchObject({
      credentials: { apiKey: "anthropic-key", serviceApiKey: "anthropic-key" },
      providerModelId: "claude-sonnet-4-6",
      provider: "anthropic",
    });
    expect(
      ai.modelConnection("anthropic/claude-sonnet-4-6", {
        agent: "search",
        provider: "openrouter",
      }),
    ).toMatchObject({
      baseURL: "https://openrouter.ai/api/v1",
      capabilities: {
        agentAttribution: true,
        apiKey: true,
        appAttribution: true,
        baseURL: true,
        headers: true,
        modelId: true,
      },
      credentials: {
        apiKey: "openrouter-key",
        user: `search/${env}`,
      },
      providerModelId: "anthropic/claude-sonnet-4.6",
      provider: "openrouter",
      url: "https://openrouter.ai/api/v1",
    });
  });
});
