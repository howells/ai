/**
 * @howells/ai — Unified AI client factory.
 *
 * Creates a configured client with provider-aware model tiers and retrieval models.
 * Text generation routes through Vercel AI Gateway by default.
 * Embeddings through Voyage AI or Google Gemini.
 * Reranking through Voyage AI.
 *
 * Each createAI() call returns an independent client — no shared module state.
 *
 * @example
 * ```ts
 * import { createAI } from "@howells/ai";
 * import { generateText, embed } from "ai";
 *
 * const ai = createAI({
 *   app: { name: "Sorrel", url: "https://sorrel.app" },
 *   models: { standard: { text: "anthropic/claude-sonnet-4.6" } },
 * });
 *
 * // Text generation — pick a tier and optional capabilities
 * await generateText({ model: ai.model("fast"), prompt: "..." });
 *
 * // Voyage text embeddings
 * const { embedding } = await embed({
 *   model: ai.embeddingModel(),
 *   value: "hello",
 * });
 *
 * // Provider-neutral image/multimodal embeddings
 * const imageModel = ai.embeddingModel({ input: "image", provider: "gemini" });
 * ```
 */

import type { LanguageModel } from "ai";
import {
  canRouteModelToProvider,
  inferModelService,
  LANGUAGE_MODEL_CAPABILITIES,
  MODEL_SERVICE_ENV_VARS,
  PROVIDER_CONFIG_CAPABILITIES,
  resolveModels,
  resolveLanguageModelVariant,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
  resolveTaskModels,
  validateProviderMatch,
} from "./models";
import { resolveGenerationOptions } from "./generation";
import { createAnthropicProvider } from "./providers/anthropic";
import { createGatewayProvider } from "./providers/gateway";
import type { GoogleProvider } from "./providers/google";
import { createGoogleProvider } from "./providers/google";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import { createOpenAIProvider } from "./providers/openai";
import { createOpenRouterProvider } from "./providers/openrouter";
import type { VoyageProvider } from "./providers/voyage";
import { createVoyageProvider } from "./providers/voyage";
import type {
  AIConfig,
  EmbeddingModelOptions,
  GenerationOptions,
  LanguageModelCapabilities,
  ModelMatrix,
  ModelOptions,
  ModelService,
  ModelTier,
  ProviderModelConfig,
  ProviderRoute,
  ResolvedGenerationOptions,
  TaskModelMatrix,
} from "./types";

const OPENAI_COMPATIBLE_PROVIDER_CONFIG = {
  deepseek: {
    service: "deepseek",
    envVar: "DEEPSEEK_API_KEY",
    baseURL: "https://api.deepseek.com/v1",
  },
  xai: {
    service: "xai",
    envVar: "XAI_API_KEY",
    baseURL: "https://api.x.ai/v1",
  },
  qwen: {
    service: "qwen",
    envVar: "QWEN_API_KEY",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
  },
  zai: {
    service: "zai",
    envVar: "ZAI_API_KEY",
    baseURL: "https://api.z.ai/api/paas/v4",
  },
  moonshotai: {
    service: "moonshotai",
    envVar: "MOONSHOT_API_KEY",
    baseURL: "https://api.moonshot.ai/v1",
  },
} as const satisfies Record<
  Extract<ProviderRoute, "deepseek" | "xai" | "qwen" | "zai" | "moonshotai">,
  {
    service: ModelService;
    envVar: string;
    baseURL: string;
  }
>;

/**
 * Configured Howells AI client.
 *
 * The client exposes tier-based language models, explicit model routing, and
 * retrieval helpers while keeping provider instances scoped to one `createAI`
 * call.
 */
export interface AIClient {
  /**
   * Get a LanguageModel for the given tier and capability options.
   *
   * @param tier - One of: nano, fast, standard, powerful, reasoning
   * @param options - Optional capability, agent attribution, and provider routing
   */
  model: (tier: ModelTier, options?: ModelOptions) => LanguageModel;

  /**
   * Get a LanguageModel by explicit model ID.
   *
   * When provider is "gateway" (default), pass the provider-prefixed ID
   * (e.g. "anthropic/claude-sonnet-4.6").
   * When provider is "openrouter", pass the OpenRouter-prefixed ID.
   * When provider is "anthropic"/"openai"/"google", pass the bare model ID
   * (e.g. "claude-sonnet-4-6") or a canonical provider-prefixed ID.
   */
  modelById: (modelId: string, options?: ModelOptions) => LanguageModel;

  /**
   * Get a provider-neutral model config for non-AI-SDK runtimes.
   *
   * Prefer `model()`/`modelById()` when the runtime accepts AI SDK models.
   * This returns the provider-resolved model ID plus a capability matrix so
   * callers can pass along only the fields their runtime supports.
   */
  modelConfig: (modelId: string, options?: ModelOptions) => ProviderModelConfig;

  /**
   * Return the structured/tool/vision capability flags for a model selection.
   */
  modelCapabilities: (
    options?: Pick<ModelOptions, "tools" | "vision">,
  ) => LanguageModelCapabilities;

  /**
   * Resolve provider-neutral generation settings into AI SDK call options.
   *
   * Spread the result into generateText/streamText alongside model, prompt,
   * output schemas, and tools.
   */
  generationOptions: (options?: GenerationOptions) => ResolvedGenerationOptions;

  /** Which providers appear configured for use in this process. */
  readonly availableProviders: readonly ProviderRoute[];

  /** Which underlying model services have direct keys configured. */
  readonly availableServices: readonly ModelService[];

  /**
   * Get a provider-neutral embedding model.
   *
   * Use `{ input: "text" }` for text embeddings and `{ input: "image" }`
   * for image-only or image+text multimodal embeddings.
   */
  embeddingModel: (
    options?: EmbeddingModelOptions,
  ) =>
    | ReturnType<VoyageProvider["embedModel"]>
    | ReturnType<VoyageProvider["multimodalEmbedModel"]>
    | ReturnType<GoogleProvider["embedModel"]>
    | ReturnType<GoogleProvider["imageEmbedModel"]>;

  /**
   * Get the Voyage reranking model for the configured rerank slot.
   */
  rerankModel: () => ReturnType<VoyageProvider["rerankModel"]>;

  /**
   * The resolved model matrix (defaults + overrides).
   * Useful for logging which models are active.
   */
  readonly matrix: Readonly<ModelMatrix>;

  /** The resolved task-specific model overrides (defaults + config). */
  readonly taskMatrix: Readonly<TaskModelMatrix>;
}

/**
 * Create a configured AI client.
 *
 * Each call returns an independent client with its own provider instances.
 * Safe to call multiple times in the same process (e.g. in tests).
 *
 * @param config - Optional configuration. Defaults work with env vars.
 */
export function createAI(config?: AIConfig): AIClient {
  const matrix = resolveModels(config?.models);
  const taskMatrix = resolveTaskModels(config?.models?.tasks);

  // Each client gets its own provider instances — no module-level state
  const openrouter = createOpenRouterProvider(
    config?.openRouterKey,
    config?.app,
  );
  const anthropic = createAnthropicProvider(config?.anthropicKey);
  const openai = createOpenAIProvider(config?.openaiKey);
  const gateway = createGatewayProvider(config?.gatewayKey);
  const voyage = createVoyageProvider(config?.voyageKey);
  const google = createGoogleProvider(config?.googleKey);
  const compatibleProviders = {
    deepseek: createOpenAICompatibleProvider({
      provider: "deepseek",
      service: "deepseek",
      apiKey: getConfiguredServiceApiKey(config, "deepseek"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.deepseek.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.deepseek.baseURL,
    }),
    xai: createOpenAICompatibleProvider({
      provider: "xai",
      service: "xai",
      apiKey: getConfiguredServiceApiKey(config, "xai"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.xai.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.xai.baseURL,
    }),
    qwen: createOpenAICompatibleProvider({
      provider: "qwen",
      service: "qwen",
      apiKey: getConfiguredServiceApiKey(config, "qwen"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.qwen.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.qwen.baseURL,
    }),
    zai: createOpenAICompatibleProvider({
      provider: "zai",
      service: "zai",
      apiKey: getConfiguredServiceApiKey(config, "zai"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.zai.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.zai.baseURL,
    }),
    moonshotai: createOpenAICompatibleProvider({
      provider: "moonshotai",
      service: "moonshotai",
      apiKey: getConfiguredServiceApiKey(config, "moonshotai"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.moonshotai.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.moonshotai.baseURL,
    }),
  };

  const available: ProviderRoute[] = [];
  // Gateway uses AI_GATEWAY_API_KEY locally and Vercel OIDC in deployments.
  if (
    config?.gatewayKey ??
    process.env.AI_GATEWAY_API_KEY ??
    process.env.VERCEL_ENV
  ) {
    available.push("gateway");
  }
  if (config?.openRouterKey ?? process.env.OPENROUTER_API_KEY) {
    available.push("openrouter");
  }
  if (config?.anthropicKey ?? process.env.ANTHROPIC_API_KEY) {
    available.push("anthropic");
  }
  if (config?.openaiKey ?? process.env.OPENAI_API_KEY) {
    available.push("openai");
  }
  if (config?.googleKey ?? process.env.GOOGLE_GEMINI_API_KEY) {
    available.push("google");
  }
  for (const provider of Object.keys(
    OPENAI_COMPATIBLE_PROVIDER_CONFIG,
  ) as (keyof typeof OPENAI_COMPATIBLE_PROVIDER_CONFIG)[]) {
    if (
      getConfiguredServiceApiKey(
        config,
        OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].service,
      )
    ) {
      available.push(provider);
    }
  }

  const services: ModelService[] = [];
  for (const service of Object.keys(MODEL_SERVICE_ENV_VARS) as ModelService[]) {
    if (getConfiguredServiceApiKey(config, service)) {
      services.push(service);
    }
  }

  function resolveModel(
    modelId: string,
    options?: ModelOptions,
  ): LanguageModel {
    const provider = options?.provider ?? "gateway";
    if (options?.provider) {
      assertExplicitProviderConfigured(provider);
    }

    if (provider === "openrouter") {
      return openrouter.model(
        resolveProviderModelId(modelId, provider),
        options,
      );
    }

    if (provider === "gateway") {
      return gateway.model(resolveProviderModelId(modelId, provider), options);
    }

    const providerModelId = resolveProviderModelId(modelId, provider);

    switch (provider) {
      case "anthropic":
        return anthropic.model(providerModelId, options);
      case "openai":
        return openai.model(providerModelId, options);
      case "google":
        return google.textModel(providerModelId, options);
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
        return compatibleProviders[provider].model(providerModelId, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  function getProviderApiKey(provider: ProviderRoute): string | undefined {
    switch (provider) {
      case "gateway":
        return config?.gatewayKey ?? process.env.AI_GATEWAY_API_KEY;
      case "openrouter":
        return config?.openRouterKey ?? process.env.OPENROUTER_API_KEY;
      case "anthropic":
        return config?.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
      case "openai":
        return config?.openaiKey ?? process.env.OPENAI_API_KEY;
      case "google":
        return config?.googleKey ?? process.env.GOOGLE_GEMINI_API_KEY;
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
        return getConfiguredServiceApiKey(
          config,
          OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].service,
        );
    }
  }

  function isProviderConfigured(provider: ProviderRoute): boolean {
    if (provider === "gateway") {
      return Boolean(
        config?.gatewayKey ?? process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_ENV,
      );
    }

    return Boolean(getProviderApiKey(provider));
  }

  function providerKeyEnv(provider: ProviderRoute): string {
    switch (provider) {
      case "gateway":
        return "AI_GATEWAY_API_KEY";
      case "openrouter":
        return "OPENROUTER_API_KEY";
      case "anthropic":
        return "ANTHROPIC_API_KEY";
      case "openai":
        return "OPENAI_API_KEY";
      case "google":
        return "GOOGLE_GEMINI_API_KEY";
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
        return OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].envVar;
    }
  }

  function assertExplicitProviderConfigured(provider: ProviderRoute): void {
    if (isProviderConfigured(provider)) return;

    throw new Error(
      `Provider "${provider}" was explicitly requested but ${providerKeyEnv(provider)} is not configured. ` +
        `Pass the matching key to createAI() or set ${providerKeyEnv(provider)}.`,
    );
  }

  function getServiceApiKey(service: ModelService): string | undefined {
    return getConfiguredServiceApiKey(config, service);
  }

  function resolveModelConfig(
    modelId: string,
    options?: ModelOptions,
  ): ProviderModelConfig {
    const provider = options?.provider ?? "gateway";
    if (options?.provider) {
      assertExplicitProviderConfigured(provider);
    }
    if (
      provider &&
      !canRouteModelToProvider(modelId, provider) &&
      modelId.includes("/")
    ) {
      validateProviderMatch(modelId, provider);
    }

    const resolvedId = resolveProviderModelId(modelId, provider);
    const capabilities = PROVIDER_CONFIG_CAPABILITIES[provider];
    const service = inferModelService(modelId) ?? inferModelService(resolvedId);
    const serviceApiKey = service ? getServiceApiKey(service) : undefined;
    const serviceApiKeyEnv = service ? MODEL_SERVICE_ENV_VARS[service] : undefined;

    if (provider === "openrouter") {
      const requestConfig = openrouter.requestConfig(options);
      return {
        provider,
        id: resolvedId,
        capabilities,
        ...(service ? { service } : {}),
        apiKey: requestConfig.apiKey,
        ...(serviceApiKey ? { serviceApiKey } : {}),
        ...(serviceApiKeyEnv ? { serviceApiKeyEnv } : {}),
        baseURL: requestConfig.baseURL,
        url: requestConfig.baseURL,
        headers: requestConfig.headers,
        ...(requestConfig.user ? { user: requestConfig.user } : {}),
      };
    }

    if (provider in compatibleProviders) {
      const requestConfig =
        compatibleProviders[
          provider as keyof typeof compatibleProviders
        ].requestConfig();
      return {
        provider,
        id: resolvedId,
        capabilities,
        ...(service ? { service } : {}),
        apiKey: requestConfig.apiKey,
        ...(serviceApiKey ? { serviceApiKey } : {}),
        ...(serviceApiKeyEnv ? { serviceApiKeyEnv } : {}),
        baseURL: requestConfig.baseURL,
        url: requestConfig.url,
      };
    }

    const apiKey = getProviderApiKey(provider);
    return {
      provider,
      id: resolvedId,
      capabilities,
      ...(service ? { service } : {}),
      ...(apiKey ? { apiKey } : {}),
      ...(serviceApiKey ? { serviceApiKey } : {}),
      ...(serviceApiKeyEnv ? { serviceApiKeyEnv } : {}),
    };
  }

  function resolveEmbeddingModel(options?: EmbeddingModelOptions) {
    const provider = options?.provider ?? "voyage";
    const input = options?.input ?? "text";

    if (provider === "gemini") {
      return input === "image"
        ? google.imageEmbedModel(matrix.multimodalEmbed.gemini)
        : google.embedModel(matrix.embed.gemini);
    }

    return input === "image"
      ? voyage.multimodalEmbedModel(matrix.multimodalEmbed.voyage)
      : voyage.embedModel(matrix.embed.voyage);
  }

  return {
    model(tier, options) {
      const variant = resolveLanguageModelVariant(options);
      const provider = options?.provider ?? "gateway";
      const modelId = resolveProviderLanguageModelId(
        matrix,
        tier,
        variant,
        provider,
        options?.task,
        taskMatrix,
      );
      return resolveModel(modelId, options);
    },

    modelById(modelId, options) {
      const provider = options?.provider;
      if (provider) {
        assertExplicitProviderConfigured(provider);
      }
      if (
        provider &&
        !canRouteModelToProvider(modelId, provider) &&
        modelId.includes("/")
      ) {
        validateProviderMatch(modelId, provider);
      }
      return resolveModel(modelId, options);
    },

    availableProviders: available,
    availableServices: services,

    modelConfig(modelId, options) {
      return resolveModelConfig(modelId, options);
    },

    modelCapabilities(options) {
      return LANGUAGE_MODEL_CAPABILITIES[resolveLanguageModelVariant(options)];
    },

    generationOptions(options) {
      return resolveGenerationOptions(options);
    },

    embeddingModel(options) {
      return resolveEmbeddingModel(options);
    },

    rerankModel() {
      return voyage.rerankModel(matrix.rerank);
    },

    matrix,
    taskMatrix,
  };
}

function getConfiguredServiceApiKey(
  config: AIConfig | undefined,
  service: ModelService,
): string | undefined {
  const explicit = config?.serviceKeys?.[service];
  if (explicit) return explicit;

  switch (service) {
    case "anthropic":
      return config?.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
    case "openai":
      return config?.openaiKey ?? process.env.OPENAI_API_KEY;
    case "google":
      return config?.googleKey ?? process.env.GOOGLE_GEMINI_API_KEY;
    case "deepseek":
      return config?.deepseekKey ?? process.env.DEEPSEEK_API_KEY;
    case "xai":
      return config?.xaiKey ?? process.env.XAI_API_KEY;
    case "qwen":
      return config?.qwenKey ?? process.env.QWEN_API_KEY;
    case "zai":
      return config?.zaiKey ?? process.env.ZAI_API_KEY;
    case "moonshotai":
      return config?.moonshotKey ?? process.env.MOONSHOT_API_KEY;
  }
}
