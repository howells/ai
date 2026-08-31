/**
 * OpenRouter provider — instance-per-client, no module-level state.
 *
 * This is the ONLY place that touches the OpenRouter SDK.
 * All text generation flows through here via the AI SDK LanguageModel interface.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { envValue } from "../env";
import type { AppConfig, ModelOptions } from "../types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

interface OpenRouterRequestConfig {
  baseURL: string;
  apiKey: string;
  headers: Record<string, string>;
  user?: string;
}

/** Minimal OpenRouter provider adapter used by the AI client. */
export interface OpenRouterProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
  embedModel: (
    modelId: string,
  ) => ReturnType<ReturnType<typeof createOpenRouter>["textEmbeddingModel"]>;
  requestConfig: (options?: ModelOptions) => OpenRouterRequestConfig;
}

/**
 * Create an OpenRouter provider instance.
 * Each createAI() call gets its own instance — no shared state.
 */
export function createOpenRouterProvider(
  apiKey: string | undefined,
  app: AppConfig | undefined,
): OpenRouterProvider {
  let client: ReturnType<typeof createOpenRouter> | null = null;

  const env = envValue("VERCEL_ENV") ?? envValue("NODE_ENV") ?? "development";

  function getApiKey() {
    const key = apiKey ?? envValue("OPENROUTER_API_KEY");
    if (!key) {
      throw new Error(
        "OPENROUTER_API_KEY is required. Pass it to createAI() or set the environment variable.",
      );
    }
    return key;
  }

  function getHeaders() {
    const headers: Record<string, string> = {};
    if (app?.url) {
      headers["HTTP-Referer"] = app.url;
    }
    if (app?.name) {
      headers["X-OpenRouter-Title"] = app.name;
    }

    return headers;
  }

  function getUser(options?: ModelOptions) {
    const parts = [options?.agent, env, options?.sessionId].filter(Boolean);
    return parts.length > 1 ? parts.join("/") : undefined;
  }

  function getClient() {
    if (client) {
      return client;
    }

    const headers = getHeaders();
    client = createOpenRouter({
      apiKey: getApiKey(),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });

    return client;
  }

  return {
    embedModel(modelId) {
      return getClient().textEmbeddingModel(modelId);
    },
    model(modelId, options) {
      const user = getUser(options);
      return getClient()(modelId, user ? { user } : {});
    },
    requestConfig(options) {
      const user = getUser(options);
      return {
        apiKey: getApiKey(),
        baseURL: OPENROUTER_BASE_URL,
        headers: getHeaders(),
        ...(user ? { user } : {}),
      };
    },
  };
}
