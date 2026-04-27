/**
 * @howells/ai — Shared types
 */

/**
 * Language model tiers.
 *
 * Every default language model must support structured input/output. Capabilities
 * such as tool calling and vision are selected per tier with ModelOptions.
 */
export type ModelTier =
  | "nano"
  | "fast"
  | "standard"
  | "powerful"
  | "reasoning";

/** Capability variants available inside each language model tier. */
export type LanguageModelVariant = "text" | "tools" | "vision" | "visionTools";

/** Capabilities exposed by a selected language model variant. */
export interface LanguageModelCapabilities {
  /** Structured input/output is required for every default language model. */
  structured: true;
  /** Model variant is intended for AI SDK tool calling. */
  tools: boolean;
  /** Model variant accepts image inputs. */
  vision: boolean;
}

/** Provider routes for embedding models. */
export type EmbeddingProviderRoute = "voyage" | "gemini";

/** Slots that return embedding models. */
export type EmbeddingModelSlot = "embed" | "multimodalEmbed";

/** Slots that return retrieval support models. */
export type RetrievalModelSlot = EmbeddingModelSlot | "rerank";

export type ModelSlot = ModelTier | RetrievalModelSlot;

/** Provider-specific model IDs for one embedding slot. */
export type EmbeddingProviderModels = Record<EmbeddingProviderRoute, string>;

/** Provider-specific language model IDs for one cost/quality tier. */
export type TierModelMatrix = Record<LanguageModelVariant, string>;

/** The resolved model matrix. */
export type ModelMatrix = Record<ModelTier, TierModelMatrix> &
  Record<EmbeddingModelSlot, EmbeddingProviderModels> & {
    rerank: string;
  };

/** Model overrides accepted by createAI(). */
export type ModelOverrides = Partial<
  Record<ModelTier, Partial<TierModelMatrix>>
> & {
  embed?: Partial<EmbeddingProviderModels>;
  multimodalEmbed?: Partial<EmbeddingProviderModels>;
  rerank?: string;
};

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
  /** Override default language tier variants and retrieval models. */
  models?: ModelOverrides;
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
  /** Select the tool-capable variant for the requested tier. */
  tools?: boolean;
  /** Select the vision-capable variant for the requested tier. */
  vision?: boolean;
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

/** Provider config fields that a route can consume. */
export interface ProviderConfigCapabilities {
  /** Provider accepts a model ID at model construction time. */
  modelId: boolean;
  /** Provider can consume an API key from config/env. */
  apiKey: boolean;
  /** Provider supports a custom base URL for direct HTTP calls. */
  baseURL: boolean;
  /** Provider supports request headers in this package. */
  headers: boolean;
  /** Provider supports app attribution headers. */
  appAttribution: boolean;
  /** Provider supports per-agent/user attribution from ModelOptions.agent. */
  agentAttribution: boolean;
}

/** Provider-neutral model config for runtimes that do not accept AI SDK models. */
export interface ProviderModelConfig {
  provider: ProviderRoute;
  id: string;
  capabilities: ProviderConfigCapabilities;
  apiKey?: string;
  baseURL?: string;
  url?: string;
  headers?: Record<string, string>;
  user?: string;
}
