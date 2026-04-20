/**
 * @howells/routerbase-ai — Unified AI client factory.
 *
 * Creates a configured client with an 11-slot model matrix.
 * Text generation routes through OpenRouter.
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
import { resolveModels } from "./models";
import type { GoogleProvider } from "./providers/google";
import { createGoogleProvider } from "./providers/google";
import { createOpenRouterProvider } from "./providers/openrouter";
import type { VoyageProvider } from "./providers/voyage";
import { createVoyageProvider } from "./providers/voyage";
import type {
  AIConfig,
  LanguageModelSlot,
  ModelMatrix,
  ModelOptions,
} from "./types";

export interface AIClient {
  /**
   * Get a LanguageModel for the given slot.
   *
   * @param slot - One of: nano, fast, standard, powerful, reasoning, tools, vision
   * @param options - Optional agent attribution for usage tracking
   */
  model: (slot: LanguageModelSlot, options?: ModelOptions) => LanguageModel;

  /**
   * Get a LanguageModel by explicit OpenRouter model ID.
   * Escape hatch for when no slot fits.
   */
  modelById: (modelId: string, options?: ModelOptions) => LanguageModel;

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
  const voyage = createVoyageProvider(config?.voyageKey);
  const google = createGoogleProvider(config?.googleKey);

  return {
    model(slot, options) {
      return openrouter.model(matrix[slot], options);
    },

    modelById(modelId, options) {
      return openrouter.model(modelId, options);
    },

    embedModel() {
      return voyage.embedModel(matrix.embed);
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
