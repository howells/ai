/**
 * Vercel AI Gateway provider — unified routing with zero data retention.
 *
 * Uses Gateway "provider/model" strings (e.g. "anthropic/claude-sonnet-4.6").
 * Runs on Vercel infrastructure, so requests from Vercel Functions
 * have near-zero added latency.
 */

import { createGateway } from "@ai-sdk/gateway";
import type {
  GatewayCreditsResponse,
  GatewayGenerationInfo,
  GatewayLanguageModelEntry,
  GatewaySpendReportParams,
  GatewaySpendReportResponse,
} from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";
import type { ModelOptions } from "../types";

/**
 * Introspection methods backed by the Vercel AI Gateway control plane.
 *
 * Available only when the `gateway` provider is configured (an
 * `AI_GATEWAY_API_KEY` is present, an explicit `gatewayKey` was passed
 * to `createAI`, or the process is running on Vercel with OIDC).
 */
export interface GatewayIntrospection {
  /** Remaining gateway credit balance and total consumed credit. */
  credits: () => Promise<GatewayCreditsResponse>;
  /**
   * Aggregate spend report grouped by day, user, model, tag, provider, or
   * credential type.
   */
  spend: (params: GatewaySpendReportParams) => Promise<GatewaySpendReportResponse>;
  /**
   * Per-generation cost, latency, token, and provider details.
   *
   * @param id - Generation id (format: `gen_<ulid>`)
   */
  generationInfo: (id: string) => Promise<GatewayGenerationInfo>;
  /** Dynamic catalog of every model the gateway exposes for this account. */
  listModels: () => Promise<GatewayLanguageModelEntry[]>;
}

/** Minimal Vercel AI Gateway provider adapter used by the AI client. */
export interface GatewayProvider {
  model: (modelId: string, options?: ModelOptions) => LanguageModel;
  introspection: GatewayIntrospection;
}

/**
 * Create a Vercel AI Gateway provider instance.
 * Each createAI() call gets its own instance — no shared state.
 *
 * The gateway uses the AI_GATEWAY_API_KEY env var for authentication
 * when running outside Vercel. On Vercel, it authenticates automatically.
 */
export function createGatewayProvider(apiKey: string | undefined): GatewayProvider {
  let client: ReturnType<typeof createGateway> | null = null;

  function getClient() {
    if (client) {
      return client;
    }

    // The SDK reads AI_GATEWAY_API_KEY from process.env automatically.
    // Only pass apiKey explicitly if one was provided to createAI().
    client = apiKey ? createGateway({ apiKey }) : createGateway();
    return client;
  }

  const introspection: GatewayIntrospection = {
    credits: async () => await getClient().getCredits(),
    generationInfo: async (id) => await getClient().getGenerationInfo({ id }),
    listModels: async () => {
      const response = await getClient().getAvailableModels();
      return response.models;
    },
    spend: async (params) => await getClient().getSpendReport(params),
  };

  return {
    introspection,
    model(modelId, _options) {
      return getClient()(modelId);
    },
  };
}
