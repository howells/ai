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
  LANGUAGE_MODEL_CAPABILITIES,
  PROVIDER_CONFIG_CAPABILITIES,
  resolveModels,
  resolveLanguageModelVariant,
  resolveProviderModelId,
  validateProviderMatch,
} from "./models";
import { createAnthropicProvider } from "./providers/anthropic";
import { createGatewayProvider } from "./providers/gateway";
import type { GoogleProvider } from "./providers/google";
import { createGoogleProvider } from "./providers/google";
import { createOpenAIProvider } from "./providers/openai";
import { createOpenRouterProvider } from "./providers/openrouter";
import type { VoyageProvider } from "./providers/voyage";
import { createVoyageProvider } from "./providers/voyage";
import type {
  AIConfig,
  EmbeddingModelOptions,
  LanguageModelCapabilities,
  ModelMatrix,
  ModelOptions,
  ModelTier,
  ProviderModelConfig,
  ProviderRoute,
} from "./types";

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

  /** Which providers appear configured for use in this process. */
  readonly availableProviders: readonly ProviderRoute[];

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

  function resolveModel(
    modelId: string,
    options?: ModelOptions,
  ): LanguageModel {
    const provider = options?.provider ?? "gateway";

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
    }
  }

  function resolveModelConfig(
    modelId: string,
    options?: ModelOptions,
  ): ProviderModelConfig {
    const provider = options?.provider ?? "gateway";
    if (
      provider &&
      !canRouteModelToProvider(modelId, provider) &&
      modelId.includes("/")
    ) {
      validateProviderMatch(modelId, provider);
    }

    const resolvedId = resolveProviderModelId(modelId, provider);
    const capabilities = PROVIDER_CONFIG_CAPABILITIES[provider];

    if (provider === "openrouter") {
      const requestConfig = openrouter.requestConfig(options);
      return {
        provider,
        id: resolvedId,
        capabilities,
        apiKey: requestConfig.apiKey,
        baseURL: requestConfig.baseURL,
        url: requestConfig.baseURL,
        headers: requestConfig.headers,
        ...(requestConfig.user ? { user: requestConfig.user } : {}),
      };
    }

    const apiKey = getProviderApiKey(provider);
    return {
      provider,
      id: resolvedId,
      capabilities,
      ...(apiKey ? { apiKey } : {}),
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
      const modelId = matrix[tier][variant];
      const provider = options?.provider;
      if (provider && !canRouteModelToProvider(modelId, provider)) {
        validateProviderMatch(modelId, provider);
      }
      return resolveModel(modelId, options);
    },

    modelById(modelId, options) {
      const provider = options?.provider;
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

    modelConfig(modelId, options) {
      return resolveModelConfig(modelId, options);
    },

    modelCapabilities(options) {
      return LANGUAGE_MODEL_CAPABILITIES[resolveLanguageModelVariant(options)];
    },

    embeddingModel(options) {
      return resolveEmbeddingModel(options);
    },

    rerankModel() {
      return voyage.rerankModel(matrix.rerank);
    },

    matrix,
  };
}
