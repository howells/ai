/**
 * Howells AI unified AI client factory.
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
import type { OllamaProvider } from "./providers/ollama";
import { createOllamaProvider } from "./providers/ollama";
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
    baseURL: "https://api.deepseek.com/v1",
    envVar: "DEEPSEEK_API_KEY",
    service: "deepseek",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    service: "groq",
  },
  moonshotai: {
    baseURL: "https://api.moonshot.ai/v1",
    envVar: "MOONSHOT_API_KEY",
    service: "moonshotai",
  },
  qwen: {
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    envVar: "QWEN_API_KEY",
    service: "qwen",
  },
  xai: {
    baseURL: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
    service: "xai",
  },
  zai: {
    baseURL: "https://api.z.ai/api/paas/v4",
    envVar: "ZAI_API_KEY",
    service: "zai",
  },
} as const satisfies Record<
  Extract<ProviderRoute, "deepseek" | "xai" | "qwen" | "zai" | "moonshotai" | "groq">,
  {
    service: ModelService;
    envVar: string;
    baseURL: string;
  }
>;

const OPENAI_COMPATIBLE_PROVIDER_ORDER = [
  "deepseek",
  "xai",
  "qwen",
  "zai",
  "moonshotai",
  "groq",
] as const satisfies readonly (keyof typeof OPENAI_COMPATIBLE_PROVIDER_CONFIG)[];

const MODEL_SERVICE_ORDER = [
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "xai",
  "qwen",
  "groq",
  "zai",
  "moonshotai",
] as const satisfies readonly ModelService[];

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
    | ReturnType<OpenRouterProvider["embedModel"]>
    | ReturnType<OllamaProvider["embedModel"]>;

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
  const openrouter = createOpenRouterProvider(config?.openRouterKey, config?.app);
  const anthropic = createAnthropicProvider(config?.anthropicKey);
  const openai = createOpenAIProvider(config?.openaiKey);
  const gateway = createGatewayProvider(config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY"));
  const voyage = createVoyageProvider(config?.voyageKey);
  const google = createGoogleProvider(config?.googleKey);
  const ollama = createOllamaProvider(config?.ollamaBaseURL);
  const compatibleProviders = {
    deepseek: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "deepseek"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.deepseek.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.deepseek.envVar,
      provider: "deepseek",
      service: "deepseek",
    }),
    groq: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "groq"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.groq.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.groq.envVar,
      provider: "groq",
      service: "groq",
    }),
    moonshotai: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "moonshotai"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.moonshotai.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.moonshotai.envVar,
      provider: "moonshotai",
      service: "moonshotai",
    }),
    qwen: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "qwen"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.qwen.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.qwen.envVar,
      provider: "qwen",
      service: "qwen",
    }),
    xai: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "xai"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.xai.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.xai.envVar,
      provider: "xai",
      service: "xai",
    }),
    zai: createOpenAICompatibleProvider({
      apiKey: getConfiguredServiceApiKey(config, "zai"),
      baseURL: OPENAI_COMPATIBLE_PROVIDER_CONFIG.zai.baseURL,
      envVar: OPENAI_COMPATIBLE_PROVIDER_CONFIG.zai.envVar,
      provider: "zai",
      service: "zai",
    }),
  };

  const available: ProviderRoute[] = [];
  // Gateway uses AI_GATEWAY_API_KEY locally and Vercel OIDC in deployments.
  if (config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY") ?? envValue("VERCEL_ENV")) {
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
  for (const provider of OPENAI_COMPATIBLE_PROVIDER_ORDER) {
    if (getConfiguredServiceApiKey(config, OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].service)) {
      available.push(provider);
    }
  }
  // Ollama needs no key: available when a base URL is set, or by the
  // localhost default when not on Vercel (serverless cannot reach localhost).
  if (isProviderConfigured("ollama")) {
    available.push("ollama");
  }

  const services: ModelService[] = [];
  for (const service of MODEL_SERVICE_ORDER) {
    if (getConfiguredServiceApiKey(config, service)) {
      services.push(service);
    }
  }

  function resolveRequestedProvider(options?: ModelOptions): ProviderRoute {
    if (!options?.free) {
      return options?.provider ?? "gateway";
    }
    if (options.provider && options.provider !== "openrouter") {
      throw new Error(
        'Free model selection is only supported through provider "openrouter". ' +
          'Remove free: true or use provider: "openrouter".',
      );
    }
    return "openrouter";
  }

  function resolveOpenRouterModelId(modelId: string, options?: ModelOptions): string {
    const resolvedId = resolveProviderModelId(modelId, "openrouter");
    const variant = options?.openRouterVariant;
    if (!variant) {
      return resolvedId;
    }
    if (!OPENROUTER_VARIANTS.has(variant)) {
      throw new Error(
        `Unknown OpenRouter model variant "${variant}". Use "nitro", "exacto", or "floor".`,
      );
    }
    return `${resolvedId.replace(OPENROUTER_VARIANT_PATTERN, "")}:${variant}`;
  }

  function assertOpenRouterVariantAllowed(provider: ProviderRoute, options?: ModelOptions): void {
    if (!options?.openRouterVariant || provider === "openrouter") {
      return;
    }

    throw new Error(
      'OpenRouter model variants are only supported with provider "openrouter". ' +
        'Use provider: "openrouter" or remove openRouterVariant.',
    );
  }

  function assertOpenRouterModelIdAllowed(modelId: string, provider: ProviderRoute): void {
    if (!OPENROUTER_VARIANT_PATTERN.test(modelId) || provider === "openrouter") {
      return;
    }

    throw new Error(
      "OpenRouter model suffixes (:nitro, :exacto, :floor) are only supported " +
        'with provider "openrouter".',
    );
  }

  function resolveModel(modelId: string, options?: ModelOptions): LanguageModel {
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
      case "anthropic": {
        return anthropic.model(providerModelId, options);
      }
      case "openai": {
        return openai.model(providerModelId, options);
      }
      case "google": {
        return google.textModel(providerModelId, options);
      }
      case "ollama": {
        return ollama.model(providerModelId, options);
      }
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
      case "groq": {
        return compatibleProviders[provider].model(providerModelId, options);
      }
      default: {
        throw new Error(`Unknown provider: ${provider}`);
      }
    }
  }

  function getProviderApiKey(provider: ProviderRoute): string | undefined {
    switch (provider) {
      case "gateway": {
        return config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY");
      }
      case "openrouter": {
        return config?.openRouterKey ?? envValue("OPENROUTER_API_KEY");
      }
      case "anthropic": {
        return config?.anthropicKey ?? envValue("ANTHROPIC_API_KEY");
      }
      case "openai": {
        return config?.openaiKey ?? envValue("OPENAI_API_KEY");
      }
      case "google": {
        return config?.googleKey ?? envValue("GOOGLE_GEMINI_API_KEY");
      }
      case "ollama": {
        // Ollama is keyless; configuration is the base URL.
        return undefined;
      }
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
      case "groq": {
        return getConfiguredServiceApiKey(
          config,
          OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].service,
        );
      }
    }
  }

  function isProviderConfigured(provider: ProviderRoute): boolean {
    if (provider === "gateway") {
      return Boolean(
        config?.gatewayKey ?? envValue("AI_GATEWAY_API_KEY") ?? envValue("VERCEL_ENV"),
      );
    }

    if (provider === "ollama") {
      if (config?.ollamaBaseURL ?? envValue("OLLAMA_BASE_URL")) {
        return true;
      }
      // The localhost default only applies off-Vercel.
      return !envValue("VERCEL_ENV");
    }

    return Boolean(getProviderApiKey(provider));
  }

  function providerKeyEnv(provider: ProviderRoute): string {
    switch (provider) {
      case "gateway": {
        return "AI_GATEWAY_API_KEY";
      }
      case "openrouter": {
        return "OPENROUTER_API_KEY";
      }
      case "anthropic": {
        return "ANTHROPIC_API_KEY";
      }
      case "openai": {
        return "OPENAI_API_KEY";
      }
      case "google": {
        return "GOOGLE_GEMINI_API_KEY";
      }
      case "ollama": {
        return "OLLAMA_BASE_URL";
      }
      case "deepseek":
      case "xai":
      case "qwen":
      case "zai":
      case "moonshotai":
      case "groq": {
        return OPENAI_COMPATIBLE_PROVIDER_CONFIG[provider].envVar;
      }
    }
  }

  function assertExplicitProviderConfigured(provider: ProviderRoute): void {
    if (isProviderConfigured(provider)) {
      return;
    }

    throw new Error(
      `Provider "${provider}" was explicitly requested but ${providerKeyEnv(provider)} is not configured. ` +
        `Pass the matching key to createAI() or set ${providerKeyEnv(provider)}.`,
    );
  }

  function getServiceApiKey(service: ModelService): string | undefined {
    return getConfiguredServiceApiKey(config, service);
  }

  function resolveModelConfig(modelId: string, options?: ModelOptions): ProviderModelConfig {
    const provider = resolveRequestedProvider(options);
    assertOpenRouterVariantAllowed(provider, options);
    assertOpenRouterModelIdAllowed(modelId, provider);
    if (options?.provider || options?.free) {
      assertExplicitProviderConfigured(provider);
    }
    if (provider && !canRouteModelToProvider(modelId, provider) && modelId.includes("/")) {
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
        : provider === "ollama"
          ? "ollama"
          : (inferModelService(modelId) ?? inferModelService(resolvedId));
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

    if (provider === "ollama") {
      const requestConfig = ollama.requestConfig();
      return {
        capabilities,
        id: resolvedId,
        provider,
        service: "ollama",
        baseURL: requestConfig.baseURL,
        url: requestConfig.url,
      };
    }

    if (provider in compatibleProviders) {
      const requestConfig =
        compatibleProviders[provider as keyof typeof compatibleProviders].requestConfig();
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
      capabilities,
      id: resolvedId,
      provider,
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

    if (provider === "ollama") {
      assertExplicitProviderConfigured("ollama");
      if (input === "image") {
        throw new Error(
          'No local multimodal embedding model is available through provider "ollama". ' +
            'Use provider "voyage" or "gemini" for image embeddings.',
        );
      }
      return ollama.embedModel(matrix.embed.ollama);
    }

    return input === "image"
      ? voyage.multimodalEmbedModel(matrix.multimodalEmbed.voyage)
      : voyage.embedModel(matrix.embed.voyage);
  }

  return {
    availableProviders: available,

    availableServices: services,

    embeddingModel(options) {
      return resolveEmbeddingModel(options);
    },

    gateway: available.includes("gateway") ? gateway.introspection : undefined,

    generationOptions(options) {
      return resolveGenerationOptions(options);
    },

    matrix,

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
      if (provider && !canRouteModelToProvider(modelId, provider) && modelId.includes("/")) {
        validateProviderMatch(modelId, provider);
      }
      assertLanguageModelCompatible(modelId, resolveLanguageModelVariant(options));
      return resolveModel(modelId, options);
    },

    modelCapabilities(options) {
      if ("modelId" in (options ?? {})) {
        const { modelId } = options as { modelId?: string };
        const capabilities = modelId ? getLanguageModelCapabilities(modelId) : undefined;
        if (capabilities) {
          return capabilities;
        }
      }
      return LANGUAGE_MODEL_CAPABILITIES[resolveLanguageModelVariant(options)];
    },

    modelConfig(modelId, options) {
      return resolveModelConfig(modelId, options);
    },

    rerankModel() {
      return voyage.rerankModel(matrix.rerank);
    },

    taskMatrix,
  };
}

function getConfiguredServiceApiKey(
  config: AIConfig | undefined,
  service: ModelService,
): string | undefined {
  const explicit = config?.serviceKeys?.[service];
  if (explicit) {
    return explicit;
  }

  switch (service) {
    case "anthropic": {
      return config?.anthropicKey ?? envValue("ANTHROPIC_API_KEY");
    }
    case "openai": {
      return config?.openaiKey ?? envValue("OPENAI_API_KEY");
    }
    case "google": {
      return config?.googleKey ?? envValue("GOOGLE_GEMINI_API_KEY");
    }
    case "groq": {
      return config?.groqKey ?? envValue("GROQ_API_KEY");
    }
    case "deepseek": {
      return config?.deepseekKey ?? envValue("DEEPSEEK_API_KEY");
    }
    case "inception":
    case "minimax":
    case "nexagi":
    case "ollama":
    case "stepfun":
    case "xiaomi": {
      return config?.serviceKeys?.[service];
    }
    case "xai": {
      return config?.xaiKey ?? envValue("XAI_API_KEY");
    }
    case "qwen": {
      return config?.qwenKey ?? envValue("QWEN_API_KEY");
    }
    case "zai": {
      return config?.zaiKey ?? envValue("ZAI_API_KEY");
    }
    case "moonshotai": {
      return config?.moonshotKey ?? envValue("MOONSHOT_API_KEY");
    }
  }
}
