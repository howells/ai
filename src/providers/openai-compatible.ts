import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { envValue, type RuntimeEnvKey } from "../env";
import type { ModelOptions, ModelService, ProviderRoute } from "../types";

export interface OpenAICompatibleProviderConfig {
  provider: Extract<
    ProviderRoute,
    "deepseek" | "xai" | "qwen" | "zai" | "moonshotai" | "groq"
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

const GROQ_HIDDEN_REASONING_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
]);

function withGroqHiddenReasoning(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  if (typeof init?.body !== "string") {
    return fetch(input, init);
  }

  try {
    const body = JSON.parse(init.body) as {
      model?: unknown;
      include_reasoning?: unknown;
      reasoning_effort?: unknown;
      reasoning_format?: unknown;
    };

    if (typeof body.model === "string" && GROQ_HIDDEN_REASONING_MODELS.has(body.model)) {
      const { reasoning_format: _unsupportedReasoningFormat, ...rest } = body;
      return fetch(input, {
        ...init,
        body: JSON.stringify({
          ...rest,
          include_reasoning: rest.include_reasoning ?? false,
          reasoning_effort: rest.reasoning_effort ?? "low",
        }),
      });
    }
  } catch {
    // Leave non-JSON requests untouched.
  }

  return fetch(input, init);
}

export function createOpenAICompatibleProvider(
  config: OpenAICompatibleProviderConfig,
): OpenAICompatibleProvider {
  let client: ReturnType<typeof createOpenAI> | null = null;

  function getApiKey(): string {
    const key = config.apiKey ?? envValue(config.envVar as RuntimeEnvKey);
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
      ...(config.provider === "groq" ? { fetch: withGroqHiddenReasoning } : {}),
    });
    return client;
  }

  return {
    model(modelId, _options) {
      return getClient().chat(modelId);
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
