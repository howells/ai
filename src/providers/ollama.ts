import { createOpenAI } from "@ai-sdk/openai";
import type { EmbeddingModel, LanguageModel } from "ai";
import { envValue } from "../env";
import type { ModelOptions } from "../types";

/** Default OpenAI-compatible endpoint for a local Ollama server. */
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/**
 * Ollama ignores the Authorization header but the OpenAI SDK requires a
 * non-empty key, so we send a stable placeholder.
 */
const OLLAMA_PLACEHOLDER_API_KEY = "ollama";

/** Adapter surface for a local (or LAN/tunneled) Ollama server. */
export interface OllamaProvider {
  /** Return an AI SDK chat model for the native Ollama model ID (e.g. "qwen3.6:35b"). */
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
  /** Return an AI SDK text embedding model (e.g. "qwen3-embedding:8b"). */
  embedModel: (modelId: string) => EmbeddingModel;
  /** Return direct HTTP configuration for callers that bypass the AI SDK. */
  requestConfig: () => {
    apiKey: string;
    baseURL: string;
    url: string;
  };
}

/**
 * Create a provider adapter for Ollama's OpenAI-compatible API.
 *
 * No API key is required. The base URL resolves from the explicit config
 * value, then OLLAMA_BASE_URL, then the localhost default. Reasoning models
 * served by Ollama (qwen3.6, gpt-oss) return chain-of-thought in a separate
 * `reasoning` field, so message content arrives clean; `reasoning_effort`
 * is accepted and maps onto Ollama think levels.
 */
export function createOllamaProvider(baseURL?: string): OllamaProvider {
  let client: ReturnType<typeof createOpenAI> | null = null;

  function getBaseURL(): string {
    return baseURL ?? envValue("OLLAMA_BASE_URL") ?? OLLAMA_DEFAULT_BASE_URL;
  }

  function getClient() {
    if (client) {
      return client;
    }

    client = createOpenAI({
      apiKey: OLLAMA_PLACEHOLDER_API_KEY,
      baseURL: getBaseURL(),
    });
    return client;
  }

  return {
    embedModel(modelId) {
      return getClient().embeddingModel(modelId);
    },
    model(modelId, _options) {
      return getClient().chat(modelId);
    },
    requestConfig() {
      return {
        apiKey: OLLAMA_PLACEHOLDER_API_KEY,
        baseURL: getBaseURL(),
        url: getBaseURL(),
      };
    },
  };
}
