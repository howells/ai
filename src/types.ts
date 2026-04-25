/**
 * @howells/routerbase-ai — Shared types
 */

/**
 * The 12 configurable model slots.
 *
 * Cost tiers (generalist ladder):
 *   nano      — Free/ultra-cheap bulk processing ($0-0.10/M)
 *   fast      — Low-latency, cheap ($0.10-0.50/M)
 *   standard  — General purpose workhorse ($0.30-1.00/M)
 *   powerful  — Complex reasoning ($3-10/M)
 *   reasoning — Frontier quality ($10+/M)
 *
 * Specialties:
 *   tools     — Best tool-calling cost/quality ratio
 *   vision    — Image understanding
 *
 * Retrieval:
 *   embed           — Text embeddings (Voyage)
 *   multimodalEmbed — Text + image embeddings in same vector space (Voyage)
 *   googleEmbed     — Text embeddings (Gemini Embedding 2)
 *   googleImageEmbed — Image embeddings (Gemini Embedding 2 multimodal content)
 *   rerank          — Search result reranking (Voyage)
 */
export type ModelSlot =
  | "nano"
  | "fast"
  | "standard"
  | "powerful"
  | "reasoning"
  | "tools"
  | "vision"
  | "embed"
  | "multimodalEmbed"
  | "googleEmbed"
  | "googleImageEmbed"
  | "rerank";

/** Slots that return a LanguageModel (everything except retrieval slots). */
export type LanguageModelSlot = Exclude<
  ModelSlot,
  "embed" | "multimodalEmbed" | "googleEmbed" | "googleImageEmbed" | "rerank"
>;

/** The full model matrix — one provider model ID per slot. */
export type ModelMatrix = Record<ModelSlot, string>;

/** App-level configuration for OpenRouter attribution headers. */
export interface AppConfig {
  /** App name shown in OpenRouter rankings (X-Title header). */
  name: string;
  /** App URL for OpenRouter rankings (HTTP-Referer header). */
  url?: string;
}

/** Configuration for createAI(). */
export interface AIConfig {
  /** OpenRouter API key. Defaults to process.env.OPENROUTER_API_KEY. */
  openRouterKey?: string;
  /** Anthropic API key. Defaults to process.env.ANTHROPIC_API_KEY. */
  anthropicKey?: string;
  /** OpenAI API key. Defaults to process.env.OPENAI_API_KEY. */
  openaiKey?: string;
  /** Voyage API key. Defaults to process.env.VOYAGE_API_KEY. */
  voyageKey?: string;
  /** Google Gemini API key. Defaults to process.env.GOOGLE_GEMINI_API_KEY. */
  googleKey?: string;
  /** Vercel AI Gateway API key. Defaults to process.env.AI_GATEWAY_API_KEY. Auto-authenticates on Vercel. */
  gatewayKey?: string;
  /** Override default models for any slot. */
  models?: Partial<ModelMatrix>;
  /** App attribution for OpenRouter. */
  app?: AppConfig;
}

/**
 * Provider routes for text generation.
 *
 * - "gateway"    — Vercel AI Gateway (default, works with any model via "provider/model" strings)
 * - "openrouter" — proxied through OpenRouter (works with any OpenRouter model ID)
 * - "anthropic"  — direct Anthropic API (Anthropic models only)
 * - "openai"     — direct OpenAI API (OpenAI models only)
 * - "google"     — direct Google API (Google models only)
 */
export type ProviderRoute =
  | "openrouter"
  | "gateway"
  | "anthropic"
  | "openai"
  | "google";

/** Provider routes for embedding models. */
export type EmbeddingProviderRoute = "voyage" | "gemini";

/** Input family for provider-neutral embedding model selection. */
export type EmbeddingInputKind = "text" | "image";

/** Options passed when selecting an embedding model. */
export interface EmbeddingModelOptions {
  /**
   * Embedding provider to use.
   * Defaults to "voyage" for backwards-compatible text/image retrieval.
   */
  provider?: EmbeddingProviderRoute;
  /**
   * Input family to embed.
   * "image" covers image-only and image+text multimodal embedding calls.
   */
  input?: EmbeddingInputKind;
}

/** Options passed when selecting a model. */
export interface ModelOptions {
  /** Agent identifier for usage attribution (e.g. "search", "enrichment"). */
  agent?: string;
  /**
   * Override the provider route for this call.
   * Defaults to "gateway" (Vercel AI Gateway). Use "openrouter" for
   * OpenRouter proxying, or "anthropic", "openai", and "google" for direct
   * API access.
   *
   * The model must belong to the requested provider — e.g. requesting
   * provider "anthropic" for a DeepSeek model will throw.
   */
  provider?: ProviderRoute;
}

/** OpenRouter request configuration for code paths that need direct HTTP access. */
export interface OpenRouterRequestConfig {
  baseURL: string;
  apiKey: string;
  headers: Record<string, string>;
  /** Body-level OpenRouter user attribution value, when an agent is provided. */
  user?: string;
}

/** OpenRouter-compatible model config for runtimes that do not accept AI SDK models. */
export interface OpenRouterModelConfig {
  id: `${string}/${string}`;
  url: string;
  apiKey: string;
  headers?: Record<string, string>;
}
