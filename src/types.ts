/**
 * @howells/ai — Shared types
 */

import type {
  CallSettings,
  JSONValue,
  StopCondition,
  ToolChoice,
  ToolSet,
} from "ai";

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

/** Workload hint used to choose task-optimized models within a tier. */
export type ModelTask =
  | "general"
  | "coding"
  | "agentic"
  | "chat"
  | "bulk"
  | "vision"
  | "reasoning"
  | "longContext"
  | "creative";

/** Underlying model service or author behind a provider-routed model ID. */
export type ModelService =
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "xai"
  | "qwen"
  | "zai"
  | "moonshotai";

/** Capabilities exposed by a selected language model variant. */
export interface LanguageModelCapabilities {
  /** Structured input/output is required for every default language model. */
  structured: true;
  /** Model variant is intended for AI SDK tool calling. */
  tools: boolean;
  /** Model variant accepts image inputs. */
  vision: boolean;
}

/** Public metadata for a language model exposed by the package catalogue. */
export interface LanguageModelCatalogEntry {
  /** Canonical package model ID, usually the OpenRouter-style provider/model ID. */
  id: string;
  /** Human-readable model name for UI and logs. */
  name: string;
  /** Underlying model service/author, useful for key management and filtering. */
  service?: ModelService;
  /** Workloads this model is a good override/default candidate for. */
  tasks?: readonly ModelTask[];
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

/** Task-specific model overrides layered over the general tier matrix. */
export type TaskModelMatrix = Record<
  ModelTask,
  Partial<Record<ModelTier, Partial<TierModelMatrix>>>
>;

/** Provider-specific language defaults for every tier and capability surface. */
export type ProviderLanguageModelMatrix = Record<
  ProviderRoute,
  Record<ModelTier, TierModelMatrix>
>;

/** The resolved model matrix. */
export type ModelMatrix = Record<ModelTier, TierModelMatrix> &
  Record<EmbeddingModelSlot, EmbeddingProviderModels> & {
    rerank: string;
  };

/** Model overrides accepted by createAI(). */
export type ModelOverrides = Partial<
  Record<ModelTier, Partial<TierModelMatrix>>
> & {
  tasks?: Partial<
    Record<ModelTask, Partial<Record<ModelTier, Partial<TierModelMatrix>>>>
  >;
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
  /** DeepSeek API key. Defaults to process.env.DEEPSEEK_API_KEY. */
  deepseekKey?: string;
  /** xAI API key. Defaults to process.env.XAI_API_KEY. */
  xaiKey?: string;
  /** Qwen API key. Defaults to process.env.QWEN_API_KEY. */
  qwenKey?: string;
  /** Z.ai API key. Defaults to process.env.ZAI_API_KEY. */
  zaiKey?: string;
  /** Moonshot/Kimi API key. Defaults to process.env.MOONSHOT_API_KEY. */
  moonshotKey?: string;
  /** Underlying service API keys for provider-routed model authors. */
  serviceKeys?: Partial<Record<ModelService, string>>;
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
 * - "deepseek"   — direct DeepSeek OpenAI-compatible API
 * - "xai"        — direct xAI OpenAI-compatible API
 * - "qwen"       — direct Qwen OpenAI-compatible API
 * - "zai"        — direct Z.ai OpenAI-compatible API
 * - "moonshotai" — direct Moonshot/Kimi OpenAI-compatible API
 */
export type ProviderRoute =
  | "openrouter"
  | "gateway"
  | "anthropic"
  | "openai"
  | "google"
  | "deepseek"
  | "xai"
  | "qwen"
  | "zai"
  | "moonshotai";

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
   * Select a workload-optimized model within the requested tier.
   * Defaults to "general", preserving the base tier matrix.
   */
  task?: ModelTask;
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

/** Normalized reasoning budget for generation calls. */
export type ReasoningEffort =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "max";

/** Normalized output detail hint. Currently maps to OpenAI verbosity. */
export type OutputVerbosity = "low" | "medium" | "high";

/** Normalized sampling preset. Explicit temperature/topP still win. */
export type Creativity = "deterministic" | "focused" | "balanced" | "creative";

/** Normalized response length preset or explicit output-token limit. */
export type OutputLength = "short" | "medium" | "long" | "max" | number;

/** Normalized tool-use policy for AI SDK generation calls. */
export type ToolPolicy = "none" | "auto" | "required";

/** Normalized structured-output provider behavior. */
export type StructuredOutputMode = "auto" | "strict" | "tool";

/** Normalized prompt-cache policy where providers expose one. */
export type PromptCachePolicy = "off" | "ephemeral";

/** Normalized latency/cost priority where providers expose one. */
export type ServiceTier = "auto" | "standard" | "flex" | "priority";

/** Provider-specific options object accepted by AI SDK generation calls. */
export type GenerationProviderOptions = Record<
  string,
  Record<string, JSONValue | undefined>
>;

/** Provider-neutral generation settings resolved into AI SDK call options. */
export interface GenerationOptions {
  /**
   * Provider route for the request.
   * Defaults to "gateway". Pass the same provider used for ai.model(...).
   */
  provider?: ProviderRoute;
  /**
   * Optional canonical or resolved model ID. Used to infer the underlying
   * provider when provider is "gateway".
   */
  modelId?: string;
  /** Reasoning budget/capability hint. Defaults to provider default behavior. */
  reasoning?: ReasoningEffort;
  /** Output detail hint for providers that expose verbosity. */
  verbosity?: OutputVerbosity;
  /** Sampling preset. Ignored when temperature is explicitly provided. */
  creativity?: Creativity;
  /** Output-token preset or explicit output-token limit. */
  outputLength?: OutputLength;
  /** Explicit AI SDK maxOutputTokens override. */
  maxOutputTokens?: number;
  /** Explicit AI SDK temperature override. Use null to omit temperature. */
  temperature?: number | null;
  /** AI SDK nucleus sampling. */
  topP?: number;
  /** AI SDK top-k sampling. */
  topK?: number;
  /** AI SDK presence penalty. */
  presencePenalty?: number;
  /** AI SDK frequency penalty. */
  frequencyPenalty?: number;
  /** AI SDK stop sequences. */
  stopSequences?: string[];
  /** AI SDK deterministic seed where supported. */
  seed?: number;
  /** AI SDK max retries. */
  maxRetries?: number;
  /** AI SDK timeout. */
  timeout?: CallSettings["timeout"];
  /** Tool-use policy. */
  tools?: ToolPolicy;
  /** Maximum tool loop steps. Sets stopWhen to stepCountIs(maxToolSteps). */
  maxToolSteps?: number;
  /** Whether providers should allow parallel tool calls when configurable. */
  parallelTools?: boolean;
  /** Structured-output provider behavior. Use AI SDK output schemas as usual. */
  structured?: StructuredOutputMode;
  /** Prompt caching hint where supported. */
  cache?: PromptCachePolicy;
  /** End-user or agent identifier for providers that accept one. */
  user?: string;
  /** Latency/cost priority for providers that expose one. */
  serviceTier?: ServiceTier;
}

/** AI SDK call settings produced by resolveGenerationOptions(). */
export interface ResolvedGenerationOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  timeout?: CallSettings["timeout"];
  toolChoice?: ToolChoice<ToolSet>;
  stopWhen?: StopCondition<ToolSet>;
  providerOptions?: GenerationProviderOptions;
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
  service?: ModelService;
  apiKey?: string;
  serviceApiKey?: string;
  serviceApiKeyEnv?: string;
  baseURL?: string;
  url?: string;
  headers?: Record<string, string>;
  user?: string;
}
