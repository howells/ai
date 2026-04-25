/**
 * OpenRouter provider — instance-per-client, no module-level state.
 *
 * This is the ONLY place that touches the OpenRouter SDK.
 * All text generation flows through here via the AI SDK LanguageModel interface.
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import type {
  AppConfig,
  ModelOptions,
  OpenRouterModelConfig,
  OpenRouterRequestConfig,
} from "../types";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Minimal OpenRouter provider adapter used by the AI client. */
export interface OpenRouterProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
  modelConfig: (
    modelId: `${string}/${string}`,
    options?: ModelOptions,
  ) => OpenRouterModelConfig;
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

  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

  function getApiKey() {
    const key = apiKey ?? process.env.OPENROUTER_API_KEY;
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
      headers["X-Title"] = app.name;
    }

    return headers;
  }

  function getUser(options?: ModelOptions) {
    return options?.agent ? `${options.agent}/${env}` : undefined;
  }

  function getClient() {
    if (client) return client;

    const headers = getHeaders();
    client = createOpenRouter({
      apiKey: getApiKey(),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    });

    return client;
  }

  return {
    model(modelId, options) {
      const user = getUser(options);
      return getClient()(modelId, user ? { user } : {});
    },
    modelConfig(modelId, _options) {
      const headers = getHeaders();
      return {
        id: modelId,
        url: OPENROUTER_BASE_URL,
        apiKey: getApiKey(),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };
    },
    requestConfig(options) {
      const user = getUser(options);
      return {
        baseURL: OPENROUTER_BASE_URL,
        apiKey: getApiKey(),
        headers: getHeaders(),
        ...(user ? { user } : {}),
      };
    },
  };
}
