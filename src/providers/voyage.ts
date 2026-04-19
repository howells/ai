/**
 * Voyage AI provider — instance-per-client for embeddings and reranking.
 *
 * This is the ONLY place that touches the Voyage SDK.
 * All embedding/reranking flows through here via the AI SDK interfaces.
 *
 * Replaces all raw fetch() calls to api.voyageai.com across projects.
 */

import { createVoyage } from "voyage-ai-provider";

export interface VoyageProvider {
  embedModel: (
    modelId: string,
  ) => ReturnType<ReturnType<typeof createVoyage>["textEmbeddingModel"]>;
  multimodalEmbedModel: (
    modelId: string,
  ) => ReturnType<ReturnType<typeof createVoyage>["multimodalEmbeddingModel"]>;
  rerankModel: (
    modelId: string,
  ) => ReturnType<ReturnType<typeof createVoyage>["rerankingModel"]>;
}

/**
 * Create a Voyage provider instance.
 * Each createAI() call gets its own instance — no shared state.
 */
export function createVoyageProvider(
  apiKey: string | undefined,
): VoyageProvider {
  let client: ReturnType<typeof createVoyage> | null = null;

  function getClient() {
    if (client) return client;

    const key = apiKey ?? process.env.VOYAGE_API_KEY;
    if (!key) {
      throw new Error(
        "VOYAGE_API_KEY is required. Pass it to createAI() or set the environment variable.",
      );
    }

    client = createVoyage({ apiKey: key });
    return client;
  }

  return {
    embedModel(modelId) {
      return getClient().textEmbeddingModel(modelId);
    },
    multimodalEmbedModel(modelId) {
      return getClient().multimodalEmbeddingModel(modelId);
    },
    rerankModel(modelId) {
      return getClient().rerankingModel(modelId);
    },
  };
}
