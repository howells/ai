/**
 * @routerbase/ai — Shared types
 */

/**
 * The 10 configurable model slots.
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
  | "rerank";

/** Slots that return a LanguageModel (everything except retrieval slots). */
export type LanguageModelSlot = Exclude<
  ModelSlot,
  "embed" | "multimodalEmbed" | "googleEmbed" | "rerank"
>;

/** The full model matrix — one OpenRouter/Voyage model ID per slot. */
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
  /** Voyage API key. Defaults to process.env.VOYAGE_API_KEY. */
  voyageKey?: string;
  /** Google Gemini API key. Defaults to process.env.GOOGLE_GEMINI_API_KEY. */
  googleKey?: string;
  /** Override default models for any slot. */
  models?: Partial<ModelMatrix>;
  /** App attribution for OpenRouter. */
  app?: AppConfig;
}

/** Options passed when selecting a model. */
export interface ModelOptions {
  /** Agent identifier for usage attribution (e.g. "search", "enrichment"). */
  agent?: string;
}
