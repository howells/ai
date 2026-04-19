/**
 * Google Gemini provider — instance-per-client for embeddings.
 *
 * Provides access to Gemini embedding models (gemini-embedding-2-preview, etc.)
 * as an alternative to Voyage for A/B testing embedding quality.
 *
 * This provider is optional — only required if you call googleEmbedModel().
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";

export interface GoogleProvider {
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
        "GOOGLE_GEMINI_API_KEY is required for Google embeddings. " +
          "This is optional — only needed if you call googleEmbedModel(). " +
          "Pass it to createAI({ googleKey }) or set the environment variable.",
      );
    }

    client = createGoogleGenerativeAI({ apiKey: key });
    return client;
  }

  return {
    embedModel(modelId) {
      return getClient().embeddingModel(modelId);
    },
  };
}
