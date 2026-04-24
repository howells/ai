/**
 * OpenAI provider — direct API access, no OpenRouter proxy.
 *
 * Eliminates the OpenRouter network hop for OpenAI models.
 *
 * Model IDs should be bare OpenAI IDs (e.g. "gpt-4.1"),
 * NOT OpenRouter-prefixed (e.g. "openai/gpt-4.1").
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import type { ModelOptions } from "../types";

export interface OpenAIProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
}

/**
 * Create an OpenAI provider instance.
 * Each createAI() call gets its own instance — no shared state.
 */
export function createOpenAIProvider(
  apiKey: string | undefined,
): OpenAIProvider {
  let client: ReturnType<typeof createOpenAI> | null = null;

  function getClient() {
    if (client) return client;

    const key = apiKey ?? process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        "OPENAI_API_KEY is required for direct OpenAI access. " +
          "Pass it to createAI({ openaiKey }) or set the environment variable.",
      );
    }

    client = createOpenAI({ apiKey: key });
    return client;
  }

  return {
    model(modelId, _options) {
      return getClient()(modelId);
    },
  };
}
