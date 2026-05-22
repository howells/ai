/**
 * @howells/ai — Unified AI client factory.
 *
 * Creates a configured client with provider-aware model tiers and retrieval models.
 * Text generation routes through Vercel AI Gateway by default.
 * Embeddings through Voyage AI, Google Gemini, or curated OpenRouter models.
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
import { envValue } from "./env";
import {
  assertLanguageModelCompatible,
  canRouteModelToProvider,
  getLanguageModelCapabilities,
  inferModelService,
  LANGUAGE_MODEL_CAPABILITIES,
  MODEL_SERVICE_ENV_VARS,
  PROVIDER_CONFIG_CAPABILITIES,
  resolveModels,
  resolveLanguageModelVariant,
  resolveOpenRouterFreeModelId,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
  resolveTaskModels,
  validateProviderMatch,
} from "./models";
import { resolveGenerationOptions } from "./generation";
import { createAnthropicProvider } from "./providers/anthropic";
import type { GatewayIntrospection } from "./providers/gateway";
import { createGatewayProvider } from "./providers/gateway";
import type { GoogleProvider } from "./providers/google";
import { createGoogleProvider } from "./providers/google";
import { createOpenAICompatibleProvider } from "./providers/openai-compatible";
import { createOpenAIProvider } from "./providers/openai";
import type { OpenRouterProvider } from "./providers/openrouter";
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

const OPENROUTER_VARIANTS = new Set(["nitro", "exacto", "floor"]);
const OPENROUTER_VARIANT_PATTERN = /:(nitro|exacto|floor)$/;

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
  groq: {
    service: "groq",
    envVar: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
  },
} as const satisfies Record<
  Extract<
    ProviderRoute,
    "deepseek" | "xai" | "qwen" | "zai" | "moonshotai" | "groq"
  >,
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
    options?: Pick<ModelOptions, "tools" | "vision"> & { modelId?: string },
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
   * Vercel AI Gateway introspection helpers (credits, spend reports,
   * generation info, model catalog).
   *
   * Present only when the gateway provider is configured. Use the
   * `availableProviders` list or a truthy check on this property to
   * detect availability.
   */
  readonly gateway?: GatewayIntrospection;

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
    | ReturnType<GoogleProvider["imageEmbedModel"]>
    | ReturnType<OpenRouterProvider["embedModel"]>;

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
  const gateway = createGatewayProvider(
    config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY"),
  );
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
    groq: createOpenAICompatibleProvider({
      provider: "groq",
      service: "groq",
      apiKey: getConfiguredServiceApiKey(config, "groq"),
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.groq.envVar,
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.groq.baseURL,
    }),
  };

  const available: ProviderRoute[] = [];
  // Gateway uses AI_GATEWAY_API_KEY locally and Vercel OIDC in deployments.
  if (
    config?.gatewayKey ??
    envValue("AI_GATEWAY_API_KEY") ??
    envValue("VERCEL_ENV")
  ) {
    available.push("gateway");
  }
  if (config?.openRouterKey ?? envValue("OPENROUTER_API_KEY")) {
    available.push("openrouter");
  }
  if (config?.anthropicKey ?? envValue("ANTHROPIC_API_KEY")) {
    available.push("anthropic");
  }
  if (config?.openaiKey ?? envValue("OPENAI_API_KEY")) {
    available.push("openai");
  }
  if (config?.googleKey ?? envValue("GOOGLE_GEMINI_API_KEY")) {
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

  function resolveRequestedProvider(options?: ModelOptions): ProviderRoute {
    if (!options?.free) return options?.provider ?? "gateway";
    if (options.provider && options.provider !== "openrouter") {
      throw new Error(
        "Free model selection is only supported through provider \"openrouter\". " +
          "Remove free: true or use provider: \"openrouter\".",
      );
    }
    return "openrouter";
  }

  function resolveOpenRouterModelId(
    modelId: string,
    options?: ModelOptions,
  ): string {
    const resolvedId = resolveProviderModelId(modelId, "openrouter");
    const variant = options?.openRouterVariant;
    if (!variant) return resolvedId;
    if (!OPENROUTER_VARIANTS.has(variant)) {
      throw new Error(
        `Unknown OpenRouter model variant "${variant}". ` +
          'Use "nitro", "exacto", or "floor".',
      );
    }
    return resolvedId.replace(OPENROUTER_VARIANT_PATTERN, "") + `:${variant}`;
  }

  function assertOpenRouterVariantAllowed(
    provider: ProviderRoute,
    options?: ModelOptions,
  ): void {
    if (!options?.openRouterVariant || provider === "openrouter") return;

    throw new Error(
      "OpenRouter model variants are only supported with provider \"openrouter\". " +
        "Use provider: \"openrouter\" or remove openRouterVariant.",
    );
  }

  function assertOpenRouterModelIdAllowed(
    modelId: string,
    provider: ProviderRoute,
  ): void {
    if (!OPENROUTER_VARIANT_PATTERN.test(modelId) || provider === "openrouter") {
      return;
    }

    throw new Error(
      "OpenRouter model suffixes (:nitro, :exacto, :floor) are only supported " +
        "with provider \"openrouter\".",
    );
  }

  function resolveModel(
    modelId: string,
    options?: ModelOptions,
  ): LanguageModel {
    const provider = resolveRequestedProvider(options);
    assertOpenRouterVariantAllowed(provider, options);
    assertOpenRouterModelIdAllowed(modelId, provider);
    if (options?.provider || options?.free) {
      assertExplicitProviderConfigured(provider);
    }

    if (provider === "openrouter") {
      return openrouter.model(resolveOpenRouterModelId(modelId, options), options);
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
      case "groq":
        return compatibleProviders[provider].model(providerModelId, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  function getProviderApiKey(provider: ProviderRoute): string | undefined {
    switch (provider) {
      case "gateway":
        return config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY");
      case "openrouter":
        return config?.openRouterKey ?? envValue("OPENROUTER_API_KEY");
      case "anthropic":
        return config?.anthropicKey ?? envValue("ANTHROPIC_API_KEY");
      case "openai":
        return config?.openaiKey ?? envValue("OPENAI_API_KEY");
      case "google":
        return config?.googleKey ?? envValue("GOOGLE_GEMINI_API_KEY");
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
      case "groq":
        return getConfiguredServiceApiKey(
          config,
          OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].service,
        );
    }
  }

  function isProviderConfigured(provider: ProviderRoute): boolean {
    if (provider === "gateway") {
      return Boolean(
        config?.gatewayKey ??
          envValue("AI_GATEWAY_API_KEY") ??
          envValue("VERCEL_ENV"),
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
      case "groq":
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
    const provider = resolveRequestedProvider(options);
    assertOpenRouterVariantAllowed(provider, options);
    assertOpenRouterModelIdAllowed(modelId, provider);
    if (options?.provider || options?.free) {
      assertExplicitProviderConfigured(provider);
    }
    if (
      provider &&
      !canRouteModelToProvider(modelId, provider) &&
      modelId.includes("/")
    ) {
      validateProviderMatch(modelId, provider);
    }

    const resolvedId =
      provider === "openrouter"
        ? resolveOpenRouterModelId(modelId, options)
        : resolveProviderModelId(modelId, provider);
    assertLanguageModelCompatible(modelId, resolveLanguageModelVariant(options));
    const capabilities = PROVIDER_CONFIG_CAPABILITIES[provider];
    const service =
      provider === "groq"
        ? "groq"
        : inferModelService(modelId) ?? inferModelService(resolvedId);
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

    if (provider === "openrouter") {
      assertExplicitProviderConfigured("openrouter");
      return input === "image"
        ? openrouter.embedModel(matrix.multimodalEmbed.openrouter)
        : openrouter.embedModel(matrix.embed.openrouter);
    }

    return input === "image"
      ? voyage.multimodalEmbedModel(matrix.multimodalEmbed.voyage)
      : voyage.embedModel(matrix.embed.voyage);
  }

  return {
    model(tier, options) {
      const variant = resolveLanguageModelVariant(options);
      const provider = resolveRequestedProvider(options);
      const modelId = options?.free
        ? resolveOpenRouterFreeModelId(tier, variant)
        : resolveProviderLanguageModelId(
            matrix,
            tier,
            variant,
            provider,
            options?.task,
            taskMatrix,
          );
      const routeOptions = options?.free
        ? { ...options, provider: "openrouter" as const }
        : options;
      assertLanguageModelCompatible(modelId, variant);
      return resolveModel(modelId, routeOptions);
    },

    modelById(modelId, options) {
      const provider = options?.provider;
      if (provider) {
        assertExplicitProviderConfigured(provider);
      }
      assertOpenRouterModelIdAllowed(modelId, provider ?? "gateway");
      if (
        provider &&
        !canRouteModelToProvider(modelId, provider) &&
        modelId.includes("/")
      ) {
        validateProviderMatch(modelId, provider);
      }
      assertLanguageModelCompatible(modelId, resolveLanguageModelVariant(options));
      return resolveModel(modelId, options);
    },

    availableProviders: available,
    availableServices: services,
    gateway: available.includes("gateway") ? gateway.introspection : undefined,

    modelConfig(modelId, options) {
      return resolveModelConfig(modelId, options);
    },

    modelCapabilities(options) {
      if ("modelId" in (options ?? {})) {
        const modelId = (options as { modelId?: string }).modelId;
        const capabilities = modelId
          ? getLanguageModelCapabilities(modelId)
          : undefined;
        if (capabilities) return capabilities;
      }
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
      return config?.anthropicKey ?? envValue("ANTHROPIC_API_KEY");
    case "openai":
      return config?.openaiKey ?? envValue("OPENAI_API_KEY");
    case "google":
      return config?.googleKey ?? envValue("GOOGLE_GEMINI_API_KEY");
    case "groq":
      return config?.groqKey ?? envValue("GROQ_API_KEY");
    case "deepseek":
      return config?.deepseekKey ?? envValue("DEEPSEEK_API_KEY");
    case "inception":
    case "minimax":
    case "nexagi":
    case "stepfun":
    case "xiaomi":
      return config?.serviceKeys?.[service];
    case "xai":
      return config?.xaiKey ?? envValue("XAI_API_KEY");
    case "qwen":
      return config?.qwenKey ?? envValue("QWEN_API_KEY");
    case "zai":
      return config?.zaiKey ?? envValue("ZAI_API_KEY");
    case "moonshotai":
      return config?.moonshotKey ?? envValue("MOONSHOT_API_KEY");
  }
}
