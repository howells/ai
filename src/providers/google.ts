/**
 * Google Gemini provider — instance-per-client for text generation and embeddings.
 *
 * Text generation: direct access to Gemini models (eliminates OpenRouter hop).
 * Embeddings: access to Gemini embedding models as an alternative to Voyage.
 *
 * This provider is optional — only required if you call googleEmbedModel() or
 * use { provider: "google" } on a Google model slot.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import type { ModelOptions } from "../types";

/** Direct Google provider adapter for text generation and embeddings. */
export interface GoogleProvider {
  textModel: (modelId: string, options?: ModelOptions) => LanguageModel;
  embedModel: (
    modelId: string,
  ) => ReturnType<
    ReturnType<typeof createGoogleGenerativeAI>["embeddingModel"]
  >;
}

/**
 * Create a Google provider instance.
 * Each createAI() call gets its own instance — no shared state.
 */
export function createGoogleProvider(
  apiKey: string | undefined,
): GoogleProvider {
  let client: ReturnType<typeof createGoogleGenerativeAI> | null = null;

  function getClient() {
    if (client) return client;

    const key = apiKey ?? process.env.GOOGLE_GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        "GOOGLE_GEMINI_API_KEY is required for direct Google access. " +
          "Pass it to createAI({ googleKey }) or set the environment variable.",
      );
    }

    client = createGoogleGenerativeAI({ apiKey: key });
    return client;
  }

  return {
    textModel(modelId, _options) {
      return getClient()(modelId);
    },
    embedModel(modelId) {
      return getClient().embeddingModel(modelId);
    },
  };
}
