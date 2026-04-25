/**
 * Anthropic provider — direct API access, no OpenRouter proxy.
 *
 * Eliminates the OpenRouter network hop for Anthropic models.
 * Supports prompt caching and all Anthropic-specific features.
 *
 * Model IDs should be bare Anthropic IDs (e.g. "claude-sonnet-4-6"),
 * NOT OpenRouter-prefixed (e.g. "anthropic/claude-sonnet-4-6").
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import type { ModelOptions } from "../types";

/** Minimal direct Anthropic provider adapter used by the AI client. */
export interface AnthropicProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
}

/**
 * Create an Anthropic provider instance.
 * Each createAI() call gets its own instance — no shared state.
 */
export function createAnthropicProvider(
  apiKey: string | undefined,
): AnthropicProvider {
  let client: ReturnType<typeof createAnthropic> | null = null;

  function getClient() {
    if (client) return client;

    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for direct Anthropic access. " +
          "Pass it to createAI({ anthropicKey }) or set the environment variable.",
      );
    }

    client = createAnthropic({ apiKey: key });
    return client;
  }

  return {
    model(modelId, _options) {
      return getClient()(modelId);
    },
  };
}
