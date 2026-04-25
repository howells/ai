/**
 * @howells/routerbase-ai — Unified AI client factory.
 *
 * Creates a configured client with an 11-slot model matrix.
 * Text generation routes through Vercel AI Gateway by default.
 * Embeddings through Voyage AI or Google Gemini.
 * Reranking through Voyage AI.
 *
 * Each createAI() call returns an independent client — no shared module state.
 *
 * @example
 * ```ts
 * import { createAI } from "@howells/routerbase-ai";
 * import { generateText, embed } from "ai";
 *
 * const ai = createAI({
 *   app: { name: "Sorrel", url: "https://sorrel.app" },
 *   models: { standard: "anthropic/claude-sonnet-4-6" },
 * });
 *
 * // Text generation — pick a slot
 * await generateText({ model: ai.model("fast"), prompt: "..." });
 *
 * // Voyage text embeddings
 * const { embedding } = await embed({ model: ai.embedModel(), value: "hello" });
 *
 * // Voyage multimodal embeddings (text + images in same space)
 * const mm = ai.multimodalEmbedModel();
 *
 * // Google Gemini embeddings (for A/B testing)
 * const { embedding: g } = await embed({ model: ai.googleEmbedModel(), value: "hello" });
 * ```
 */

import type { LanguageModel } from "ai";
import {
  resolveModels,
  toDirectModelId,
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
  LanguageModelSlot,
  ModelMatrix,
  ModelOptions,
  OpenRouterModelConfig,
  OpenRouterRequestConfig,
  ProviderRoute,
} from "./types";

/**
 * Configured Routerbase AI client.
 *
 * The client exposes slot-based language models, explicit model routing, and
 * retrieval helpers while keeping provider instances scoped to one `createAI`
 * call.
 */
export interface AIClient {
  /**
   * Get a LanguageModel for the given slot.
   *
   * @param slot - One of: nano, fast, standard, powerful, reasoning, tools, vision
   * @param options - Optional agent attribution and provider routing
   */
  model: (slot: LanguageModelSlot, options?: ModelOptions) => LanguageModel;

  /**
   * Get a LanguageModel by explicit model ID.
   *
   * When provider is "gateway" (default), pass the provider-prefixed ID
   * (e.g. "anthropic/claude-sonnet-4-6").
   * When provider is "openrouter", pass the OpenRouter-prefixed ID.
   * When provider is "anthropic"/"openai"/"google", pass the bare model ID
   * (e.g. "claude-sonnet-4-6") or the prefixed ID (the prefix will be stripped).
   */
  modelById: (modelId: string, options?: ModelOptions) => LanguageModel;

  /**
   * Get OpenRouter request settings for direct HTTP code paths.
   * Prefer `model()`/`modelById()` when the runtime accepts AI SDK models.
   */
  openRouterRequestConfig: (options?: ModelOptions) => OpenRouterRequestConfig;

  /**
   * Get an OpenRouter-compatible model config for non-AI-SDK runtimes.
   * Useful for frameworks that accept `{ id, url, apiKey, headers }`.
   */
  openRouterModelConfig: (
    modelId: `${string}/${string}`,
    options?: ModelOptions,
  ) => OpenRouterModelConfig;

  /** Which providers appear configured for use in this process. */
  readonly availableProviders: readonly ProviderRoute[];

  /**
   * Get the Voyage text embedding model for the configured embed slot.
   *
   * @example
   * ```ts
   * const { embedding } = await embed({ model: ai.embedModel(), value: "hello" });
   * ```
   */
  embedModel: () => ReturnType<VoyageProvider["embedModel"]>;

  /**
   * Get the Voyage image embedding model for the configured multimodal slot.
   * Use this for image-only embedding calls with explicit Voyage input types.
   */
  imageEmbedModel: () => ReturnType<VoyageProvider["imageEmbedModel"]>;

  /**
   * Get the Voyage multimodal embedding model.
   * Text + images in the same vector space (1024d).
   */
  multimodalEmbedModel: () => ReturnType<
    VoyageProvider["multimodalEmbedModel"]
  >;

  /**
   * Get the Google Gemini embedding model.
   * Alternative to Voyage for A/B testing embedding quality.
   * Requires GOOGLE_GEMINI_API_KEY.
   *
   * @example
   * ```ts
   * const { embedding } = await embed({ model: ai.googleEmbedModel(), value: "hello" });
   * ```
   */
  googleEmbedModel: () => ReturnType<GoogleProvider["embedModel"]>;

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
      return openrouter.model(modelId, options);
    }

    // Gateway uses "provider/model" format — same as OpenRouter IDs
    if (provider === "gateway") {
      return gateway.model(modelId, options);
    }

    // For direct providers, strip the OpenRouter prefix if present
    const directId = toDirectModelId(modelId);

    switch (provider) {
      case "anthropic":
        return anthropic.model(directId, options);
      case "openai":
        return openai.model(directId, options);
      case "google":
        return google.textModel(directId, options);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  return {
    model(slot, options) {
      const modelId = matrix[slot];
      const provider = options?.provider;
      if (provider && provider !== "openrouter" && provider !== "gateway") {
        validateProviderMatch(modelId, provider);
      }
      return resolveModel(modelId, options);
    },

    modelById(modelId, options) {
      const provider = options?.provider;
      if (
        provider &&
        provider !== "openrouter" &&
        provider !== "gateway" &&
        modelId.includes("/")
      ) {
        validateProviderMatch(modelId, provider);
      }
      return resolveModel(modelId, options);
    },

    availableProviders: available,

    openRouterRequestConfig(options) {
      return openrouter.requestConfig(options);
    },

    openRouterModelConfig(modelId, options) {
      return openrouter.modelConfig(modelId, options);
    },

    embedModel() {
      return voyage.embedModel(matrix.embed);
    },

    imageEmbedModel() {
      return voyage.imageEmbedModel(matrix.multimodalEmbed);
    },

    multimodalEmbedModel() {
      return voyage.multimodalEmbedModel(matrix.multimodalEmbed);
    },

    googleEmbedModel() {
      return google.embedModel(matrix.googleEmbed);
    },

    rerankModel() {
      return voyage.rerankModel(matrix.rerank);
    },

    matrix,
  };
}
