import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ModelOptions, ModelService, ProviderRoute } from "../types";

export interface OpenAICompatibleProviderConfig {
  provider: Extract<
    ProviderRoute,
    "deepseek" | "xai" | "qwen" | "zai" | "moonshotai"
  >;
  service: ModelService;
  apiKey: string | undefined;
  envVar: string;
  baseURL: string;
}

export interface OpenAICompatibleProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
  requestConfig: () => {
    apiKey: string;
    baseURL: string;
    url: string;
  };
}

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig,
): OpenAICompatibleProvider {
  let client: ReturnType<typeof createOpenAI> | null = null;

  function getApiKey(): string {
    const key = config.apiKey ?? process.env[config.envVar];
    if (!key) {
      throw new Error(
        `${config.envVar} is required for direct ${config.provider} access. ` +
          `Pass it to createAI() or set the environment variable.`,
      );
    }
    return key;
  }

  function getClient() {
    if (client) return client;

    client = createOpenAI({
      apiKey: getApiKey(),
      baseURL: config.baseURL,
    });
    return client;
  }

  return {
    model(modelId, _options) {
      return getClient()(modelId);
    },
    requestConfig() {
      return {
        apiKey: getApiKey(),
        baseURL: config.baseURL,
        url: config.baseURL,
      };
    },
  };
}
