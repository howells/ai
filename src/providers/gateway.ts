/**
 * Vercel AI Gateway provider — unified routing with zero data retention.
 *
 * Uses plain "provider/model" strings (e.g. "anthropic/claude-sonnet-4-6").
 * Runs on Vercel infrastructure, so requests from Vercel Functions
 * have near-zero added latency.
 */

import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";
import type { ModelOptions } from "../types";

export interface GatewayProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
}

/**
 * Create a Vercel AI Gateway provider instance.
 * Each createAI() call gets its own instance — no shared state.
 *
 * The gateway uses the VERCEL_API_KEY env var for authentication
 * when running outside Vercel. On Vercel, it authenticates automatically.
 */
export function createGatewayProvider(
  apiKey: string | undefined,
): GatewayProvider {
  let client: ReturnType<typeof createGateway> | null = null;

  function getClient() {
    if (client) return client;

    // The SDK reads AI_GATEWAY_API_KEY from process.env automatically.
    // Only pass apiKey explicitly if one was provided to createAI().
    client = apiKey ? createGateway({ apiKey }) : createGateway();
    return client;
  }

  return {
    model(modelId, _options) {
      return getClient()(modelId);
    },
  };
}
