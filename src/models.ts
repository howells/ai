/**
 * Default model matrix — the "best 10" for each slot.
 *
 * These defaults are static and opinionated, chosen from actual usage
 * across 40+ projects. Override any slot via createAI({ models: {...} }).
 */

import type { ModelMatrix, ProviderRoute } from "./types";

// ── Language model constants ─────────────────────────────────────────
// These use canonical Routerbase/OpenRouter "provider/model" IDs. Some
// providers use different IDs at runtime; resolveProviderModelId() maps them.

/** Supported Anthropic model IDs for language model slots. */
export const ANTHROPIC_MODELS = {
  /** Frontier reasoning model for the reasoning slot. */
  CLAUDE_OPUS_4_6: "anthropic/claude-opus-4.6",
  /** Complex reasoning and coding model for the powerful slot. */
  CLAUDE_SONNET_4_6: "anthropic/claude-sonnet-4.6",
} as const;

/** Supported DeepSeek model IDs for language model slots. */
export const DEEPSEEK_MODELS = {
  /** Fast, low-cost model with strong tool-calling value. */
  DEEPSEEK_V3_2: "deepseek/deepseek-v3.2",
} as const;

/** Supported Google model IDs for language model slots. */
export const GOOGLE_MODELS = {
  /** Gemini 3 Flash for fast multimodal/vision workloads. */
  GEMINI_3_FLASH: "google/gemini-3-flash-preview",
  /** Ultra-cheap Gemini model for bulk/simple work. */
  GEMINI_2_5_FLASH_LITE: "google/gemini-2.5-flash-lite",
  /** General-purpose Gemini model for standard work. */
  GEMINI_2_5_FLASH: "google/gemini-2.5-flash",
} as const;

/** Supported OpenAI model IDs for language model slot overrides. */
export const OPENAI_MODELS = {
  /** Low-cost OpenAI model option for nano-style overrides. */
  GPT_5_NANO: "openai/gpt-5-nano",
} as const;

/** Supported xAI model IDs for language model slots. */
export const XAI_MODELS = {
  /** Cheap frontier-quality tool-calling model. */
  GROK_4_1_FAST: "x-ai/grok-4.1-fast",
} as const;

/** Supported Qwen model IDs for language model slots. */
export const QWEN_MODELS = {
  /** Vision model with strong grounding and bounding-box support. */
  QWEN_2_5_VL_72B_INSTRUCT: "qwen/qwen2.5-vl-72b-instruct",
} as const;

// ── Voyage AI model constants ─────────────────────────────────────────
// Use these when overriding the embed/rerank slots in createAI().

/** Supported Voyage model IDs for embedding and reranking slots. */
export const VOYAGE_MODELS = {
  /** 1024d text embeddings — best quality, asymmetric retrieval. */
  VOYAGE_3: "voyage-3",
  /** 512d text embeddings — fast + cheap, good for high-volume. */
  VOYAGE_3_LITE: "voyage-3-lite",
  /** 1024d text embeddings — newer high-quality text embedding model. */
  VOYAGE_3_5: "voyage-3.5",
  /** 1024d text embeddings — newer fast + cheap text embedding model. */
  VOYAGE_3_5_LITE: "voyage-3.5-lite",
  /** 1024d multimodal — stable text + image embeddings in the same vector space. */
  MULTIMODAL_3: "voyage-multimodal-3",
  /** 1024d multimodal — text + images in the same vector space. */
  MULTIMODAL_3_5: "voyage-multimodal-3.5",
  /** Standard reranker — best quality. */
  RERANK_2_5: "rerank-2.5",
  /** Lightweight reranker — faster, cheaper. */
  RERANK_2_5_LITE: "rerank-2.5-lite",
} as const;

// ── Google embedding model constants ──────────────────────────────────

/** Supported Google embedding model IDs for the googleEmbed and googleImageEmbed slots. */
export const GOOGLE_EMBED_MODELS = {
  /** Gemini Embedding 2 preview — Google's latest embedding model. */
  GEMINI_EMBEDDING_2: "gemini-embedding-2-preview",
  /** Gemini Embedding 001 — stable release. */
  GEMINI_EMBEDDING_1: "gemini-embedding-001",
} as const;

// ── Default matrix ────────────────────────────────────────────────────

/** Default slot-to-model mapping used by `createAI()` when no override exists. */
export const DEFAULT_MODELS: ModelMatrix = {
  // ── Cost tiers ──────────────────────────────────────────────────────
  nano: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE, // $0.10/$0.40 — reliable JSON, 1M context
  fast: DEEPSEEK_MODELS.DEEPSEEK_V3_2, // $0.252/$0.378 — excellent tool calling, strong value
  standard: GOOGLE_MODELS.GEMINI_2_5_FLASH, // $0.30/$2.50 — built-in thinking, 1M context
  powerful: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, // $3/$15 — complex reasoning, coding
  reasoning: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6, // $5/$25 — frontier quality

  // ── Specialties ─────────────────────────────────────────────────────
  tools: XAI_MODELS.GROK_4_1_FAST, // $0.20/$0.50 — cheap frontier tool calling
  vision: GOOGLE_MODELS.GEMINI_3_FLASH, // fast multimodal vision model

  // ── Retrieval ────────────────────────────────────────────────────────
  embed: VOYAGE_MODELS.VOYAGE_3, // 1024d text embeddings (Voyage AI)
  multimodalEmbed: VOYAGE_MODELS.MULTIMODAL_3_5, // 1024d text + images in same space (Voyage AI)
  googleEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2, // Gemini Embedding 2 (Google)
  googleImageEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2, // Gemini image embeddings (Google)
  rerank: VOYAGE_MODELS.RERANK_2_5, // standard reranker (Voyage AI)
} as const;

/**
 * Merge user overrides with defaults.
 * Only overrides the slots the user specifies — everything else keeps defaults.
 */
export function resolveModels(overrides?: Partial<ModelMatrix>): ModelMatrix {
  if (!overrides) return { ...DEFAULT_MODELS };
  return { ...DEFAULT_MODELS, ...overrides };
}

// ── Provider routing helpers ─────────────────────────────────────────

/** Known OpenRouter prefixes that map to direct providers. */
const PROVIDER_PREFIXES: Record<string, ProviderRoute> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
};

const DIRECT_PROVIDER_PREFIXES: Record<string, ProviderRoute> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
};

const PROVIDER_MODEL_IDS: Record<
  string,
  Partial<Record<ProviderRoute, string>>
> = {
  "anthropic/claude-opus-4.6": {
    anthropic: "claude-opus-4-6",
  },
  "anthropic/claude-opus-4-6": {
    openrouter: "anthropic/claude-opus-4.6",
    gateway: "anthropic/claude-opus-4.6",
    anthropic: "claude-opus-4-6",
  },
  "anthropic/claude-sonnet-4.6": {
    anthropic: "claude-sonnet-4-6",
  },
  "anthropic/claude-sonnet-4-6": {
    openrouter: "anthropic/claude-sonnet-4.6",
    gateway: "anthropic/claude-sonnet-4.6",
    anthropic: "claude-sonnet-4-6",
  },
  "google/gemini-3-flash-preview": {
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3-flash": {
    openrouter: "google/gemini-3-flash-preview",
    google: "gemini-3-flash-preview",
  },
  "x-ai/grok-4.1-fast": {
    gateway: "xai/grok-4.1-fast-non-reasoning",
  },
};

function stripProviderPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

/**
 * Strip the provider prefix from a model ID.
 * "anthropic/claude-sonnet-4.6" → "claude-sonnet-4.6"
 * "gpt-4.1" (no prefix) → "gpt-4.1"
 */
export function toDirectModelId(openRouterId: string): string {
  return stripProviderPrefix(openRouterId);
}

/**
 * Infer the direct provider from a provider-prefixed model ID.
 * "anthropic/claude-sonnet-4.6" → "anthropic"
 * Returns undefined if no known direct provider matches.
 */
export function inferProvider(openRouterId: string): ProviderRoute | undefined {
  const slash = openRouterId.indexOf("/");
  if (slash === -1) return undefined;
  const prefix = openRouterId.slice(0, slash);
  return PROVIDER_PREFIXES[prefix];
}

/**
 * Validate that an OpenRouter model ID matches the requested provider.
 * Throws if the model belongs to a different provider.
 */
export function validateProviderMatch(
  openRouterId: string,
  requestedProvider: ProviderRoute,
): void {
  if (requestedProvider === "openrouter" || requestedProvider === "gateway") {
    return;
  }
  const modelProvider = inferProvider(openRouterId);
  if (modelProvider !== requestedProvider) {
    throw new Error(
      `Model "${openRouterId}" cannot be used with provider "${requestedProvider}". ` +
        (modelProvider
          ? `It belongs to "${modelProvider}".`
          : "Only OpenRouter can route this model."),
    );
  }
}

/**
 * Resolve a canonical OpenRouter-style model ID to the provider-specific ID
 * expected by the selected route.
 */
export function resolveProviderModelId(
  modelId: string,
  provider: ProviderRoute,
): string {
  const mapped = PROVIDER_MODEL_IDS[modelId]?.[provider];
  if (mapped) return mapped;

  if (provider === "openrouter" || provider === "gateway") {
    return modelId;
  }

  const prefix = inferProvider(modelId);
  if (prefix === provider || !modelId.includes("/")) {
    return stripProviderPrefix(modelId);
  }

  return modelId;
}

/** Return true when the selected provider can plausibly route this model. */
export function canRouteModelToProvider(
  modelId: string,
  provider: ProviderRoute,
): boolean {
  if (provider === "openrouter" || provider === "gateway") return true;
  if (!modelId.includes("/")) return true;

  const prefix = modelId.slice(0, modelId.indexOf("/"));
  return DIRECT_PROVIDER_PREFIXES[prefix] === provider;
}
