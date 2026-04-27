/**
 * Default model matrix for canonical tiers, capabilities, and retrieval models.
 *
 * These defaults are static and opinionated, chosen from actual usage
 * across 40+ projects. Override any tier variant via createAI({ models: {...} }).
 */

import type {
  EmbeddingProviderModels,
  LanguageModelCatalogEntry,
  LanguageModelCapabilities,
  LanguageModelVariant,
  ModelMatrix,
  ModelOverrides,
  ModelTier,
  ProviderConfigCapabilities,
  ProviderLanguageModelMatrix,
  ProviderRoute,
  TierModelMatrix,
} from "./types";

export const MODEL_TIERS = [
  "nano",
  "fast",
  "standard",
  "powerful",
  "reasoning",
] as const satisfies readonly ModelTier[];

export const LANGUAGE_MODEL_VARIANTS = [
  "text",
  "tools",
  "vision",
  "visionTools",
] as const satisfies readonly LanguageModelVariant[];

// ── Language model constants ─────────────────────────────────────────
// These use canonical Routerbase/OpenRouter "provider/model" IDs. Some
// providers use different IDs at runtime; resolveProviderModelId() maps them.

/** Supported Anthropic model IDs for language model tiers. */
export const ANTHROPIC_MODELS = {
  /** Frontier reasoning model for the reasoning slot. */
  CLAUDE_OPUS_4_6: "anthropic/claude-opus-4.6",
  /** Complex reasoning and coding model for the powerful slot. */
  CLAUDE_SONNET_4_6: "anthropic/claude-sonnet-4.6",
  /** Fast Claude model for low-cost direct Anthropic routing. */
  CLAUDE_HAIKU_4_5: "anthropic/claude-haiku-4.5",
} as const;

/** Supported DeepSeek model IDs for language model tiers. */
export const DEEPSEEK_MODELS = {
  /** Fast, low-cost model with strong tool-calling value. */
  DEEPSEEK_V3_2: "deepseek/deepseek-v3.2",
} as const;

/** Supported Google model IDs for language model tiers. */
export const GOOGLE_MODELS = {
  /** Latest lightweight Gemini model for nano-style routing. */
  GEMINI_3_1_FLASH_LITE: "google/gemini-3.1-flash-lite",
  /** Latest high-capability Gemini model for powerful/reasoning routing. */
  GEMINI_3_1_PRO: "google/gemini-3.1-pro",
  /** Gemini 3 Flash normalized package ID. */
  GEMINI_3_FLASH: "google/gemini-3-flash",
  /** Ultra-cheap Gemini model for bulk/simple work. */
  GEMINI_2_5_FLASH_LITE: "google/gemini-2.5-flash-lite",
  /** General-purpose Gemini model for standard work. */
  GEMINI_2_5_FLASH: "google/gemini-2.5-flash",
} as const;

/** Supported OpenAI model IDs for language model tier overrides. */
export const OPENAI_MODELS = {
  /** Current low-cost OpenAI model for nano-style defaults. */
  GPT_5_4_NANO: "openai/gpt-5.4-nano",
  /** Current small OpenAI model for fast/default direct routing. */
  GPT_5_4_MINI: "openai/gpt-5.4-mini",
  /** Current flagship OpenAI model for powerful direct routing. */
  GPT_5_4: "openai/gpt-5.4",
  /** Current top-end OpenAI model for reasoning direct routing. */
  GPT_5_5: "openai/gpt-5.5",
  /** Low-cost OpenAI model option for nano-style overrides. */
  GPT_5_NANO: "openai/gpt-5-nano",
} as const;

/** Supported xAI model IDs for language model tier variants. */
export const XAI_MODELS = {
  /** Cheap frontier-quality tool-calling model. */
  GROK_4_1_FAST: "x-ai/grok-4.1-fast",
} as const;

/** Supported Qwen model IDs for language model tier overrides. */
export const QWEN_MODELS = {
  /** Vision model with strong grounding and bounding-box support. */
  QWEN_2_5_VL_72B_INSTRUCT: "qwen/qwen2.5-vl-72b-instruct",
} as const;

/** Canonical language model catalogue exposed by @howells/ai. */
export const LANGUAGE_MODEL_CATALOG = [
  {
    id: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    name: "Claude Opus 4.6",
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    name: "Claude Sonnet 4.6",
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
    name: "Claude Haiku 4.5",
  },
  {
    id: DEEPSEEK_MODELS.DEEPSEEK_V3_2,
    name: "DeepSeek V3.2",
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    name: "Gemini 3.1 Flash Lite",
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_1_PRO,
    name: "Gemini 3.1 Pro",
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_FLASH,
    name: "Gemini 3 Flash",
  },
  {
    id: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
    name: "Gemini 2.5 Flash Lite",
  },
  {
    id: GOOGLE_MODELS.GEMINI_2_5_FLASH,
    name: "Gemini 2.5 Flash",
  },
  {
    id: OPENAI_MODELS.GPT_5_4_NANO,
    name: "GPT-5.4 Nano",
  },
  {
    id: OPENAI_MODELS.GPT_5_4_MINI,
    name: "GPT-5.4 Mini",
  },
  {
    id: OPENAI_MODELS.GPT_5_4,
    name: "GPT-5.4",
  },
  {
    id: OPENAI_MODELS.GPT_5_5,
    name: "GPT-5.5",
  },
  {
    id: OPENAI_MODELS.GPT_5_NANO,
    name: "GPT-5 Nano",
  },
  {
    id: XAI_MODELS.GROK_4_1_FAST,
    name: "Grok 4.1 Fast",
  },
  {
    id: QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT,
    name: "Qwen 2.5 VL 72B Instruct",
  },
] as const satisfies readonly LanguageModelCatalogEntry[];

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

/** Supported Google embedding model IDs for the embed and multimodalEmbed slots. */
export const GOOGLE_EMBED_MODELS = {
  /** Gemini Embedding 2 preview — Google's latest embedding model. */
  GEMINI_EMBEDDING_2: "gemini-embedding-2-preview",
  /** Gemini Embedding 001 — stable release. */
  GEMINI_EMBEDDING_1: "gemini-embedding-001",
} as const;

// ── Default matrix ────────────────────────────────────────────────────

/** Default tier/capability model mapping used by `createAI()` when no override exists. */
export const DEFAULT_MODELS: ModelMatrix = {
  // ── Cost tiers ──────────────────────────────────────────────────────
  nano: {
    text: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE, // reliable JSON, 1M context
    tools: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
    vision: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
    visionTools: GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
  },
  fast: {
    text: DEEPSEEK_MODELS.DEEPSEEK_V3_2, // strong value for low-latency text
    tools: XAI_MODELS.GROK_4_1_FAST, // cheap frontier tool calling
    vision: GOOGLE_MODELS.GEMINI_3_FLASH,
    visionTools: GOOGLE_MODELS.GEMINI_3_FLASH,
  },
  standard: {
    text: GOOGLE_MODELS.GEMINI_2_5_FLASH, // general workhorse, 1M context
    tools: GOOGLE_MODELS.GEMINI_2_5_FLASH,
    vision: GOOGLE_MODELS.GEMINI_3_FLASH,
    visionTools: GOOGLE_MODELS.GEMINI_3_FLASH,
  },
  powerful: {
    text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, // complex reasoning, coding
    tools: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    vision: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    visionTools: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
  },
  reasoning: {
    text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6, // frontier quality
    tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    vision: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    visionTools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
  },

  // ── Retrieval ────────────────────────────────────────────────────────
  embed: {
    voyage: VOYAGE_MODELS.VOYAGE_3, // 1024d text embeddings
    gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
  },
  multimodalEmbed: {
    voyage: VOYAGE_MODELS.MULTIMODAL_3_5, // 1024d text + images in same space
    gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
  },
  rerank: VOYAGE_MODELS.RERANK_2_5, // standard reranker (Voyage AI)
} as const;

function everyVariant(modelId: string): TierModelMatrix {
  return {
    text: modelId,
    tools: modelId,
    vision: modelId,
    visionTools: modelId,
  };
}

/** Provider-aware language defaults used by ai.model(tier, { provider }). */
export const PROVIDER_DEFAULT_MODELS: ProviderLanguageModelMatrix = {
  gateway: {
    nano: { ...DEFAULT_MODELS.nano },
    fast: { ...DEFAULT_MODELS.fast },
    standard: { ...DEFAULT_MODELS.standard },
    powerful: { ...DEFAULT_MODELS.powerful },
    reasoning: { ...DEFAULT_MODELS.reasoning },
  },
  openrouter: {
    nano: { ...DEFAULT_MODELS.nano },
    fast: { ...DEFAULT_MODELS.fast },
    standard: { ...DEFAULT_MODELS.standard },
    powerful: { ...DEFAULT_MODELS.powerful },
    reasoning: { ...DEFAULT_MODELS.reasoning },
  },
  anthropic: {
    nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6),
  },
  openai: {
    nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    fast: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
    reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
  },
  google: {
    nano: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE),
    fast: everyVariant(GOOGLE_MODELS.GEMINI_3_FLASH),
    standard: everyVariant(GOOGLE_MODELS.GEMINI_3_FLASH),
    powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO),
    reasoning: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO),
  },
} as const;

export const LANGUAGE_MODEL_CAPABILITIES: Record<
  LanguageModelVariant,
  LanguageModelCapabilities
> = {
  text: {
    structured: true,
    tools: false,
    vision: false,
  },
  tools: {
    structured: true,
    tools: true,
    vision: false,
  },
  vision: {
    structured: true,
    tools: false,
    vision: true,
  },
  visionTools: {
    structured: true,
    tools: true,
    vision: true,
  },
};

export function resolveLanguageModelVariant(options?: {
  tools?: boolean;
  vision?: boolean;
}): LanguageModelVariant {
  if (options?.tools && options?.vision) return "visionTools";
  if (options?.tools) return "tools";
  if (options?.vision) return "vision";
  return "text";
}

export function resolveProviderLanguageModelId(
  models: ModelMatrix,
  tier: ModelTier,
  variant: LanguageModelVariant,
  provider: ProviderRoute,
): string {
  const modelId = models[tier][variant];
  const isDefaultModel = modelId === DEFAULT_MODELS[tier][variant];
  if (
    (provider === "gateway" || provider === "openrouter" || !isDefaultModel) &&
    canRouteModelToProvider(modelId, provider)
  ) {
    return modelId;
  }
  return PROVIDER_DEFAULT_MODELS[provider][tier][variant];
}

function resolveEmbeddingSlot(
  defaults: Readonly<EmbeddingProviderModels>,
  override: ModelOverrides["embed"],
): EmbeddingProviderModels {
  if (!override) return { ...defaults };
  return { ...defaults, ...override };
}

function resolveTierModels(
  tier: ModelTier,
  overrides?: Partial<TierModelMatrix>,
): TierModelMatrix {
  return {
    ...DEFAULT_MODELS[tier],
    ...overrides,
  };
}

/**
 * Merge user overrides with defaults.
 * Only overrides the tier variants and retrieval models the user specifies.
 */
export function resolveModels(overrides?: ModelOverrides): ModelMatrix {
  return {
    nano: resolveTierModels("nano", overrides?.nano),
    fast: resolveTierModels("fast", overrides?.fast),
    standard: resolveTierModels("standard", overrides?.standard),
    powerful: resolveTierModels("powerful", overrides?.powerful),
    reasoning: resolveTierModels("reasoning", overrides?.reasoning),
    embed: resolveEmbeddingSlot(DEFAULT_MODELS.embed, overrides?.embed),
    multimodalEmbed: resolveEmbeddingSlot(
      DEFAULT_MODELS.multimodalEmbed,
      overrides?.multimodalEmbed,
    ),
    rerank: overrides?.rerank ?? DEFAULT_MODELS.rerank,
  };
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
  "anthropic/claude-haiku-4.5": {
    anthropic: "claude-haiku-4-5-20251001",
  },
  "anthropic/claude-haiku-4-5-20251001": {
    openrouter: "anthropic/claude-haiku-4.5",
    gateway: "anthropic/claude-haiku-4.5",
    anthropic: "claude-haiku-4-5-20251001",
  },
  "google/gemini-3-flash-preview": {
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3-flash": {
    openrouter: "google/gemini-3-flash-preview",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3.1-flash-lite": {
    openrouter: "google/gemini-3.1-flash-lite-preview",
    gateway: "google/gemini-3.1-flash-lite-preview",
    google: "gemini-3.1-flash-lite-preview",
  },
  "google/gemini-3.1-pro": {
    openrouter: "google/gemini-3.1-pro-preview",
    gateway: "google/gemini-3.1-pro-preview",
    google: "gemini-3.1-pro-preview",
  },
  "x-ai/grok-4.1-fast": {
    gateway: "xai/grok-4.1-fast-non-reasoning",
  },
};

const OPENROUTER_ONLY_MODEL_IDS = new Set<string>([
  QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT,
]);

export const PROVIDER_CONFIG_CAPABILITIES: Record<
  ProviderRoute,
  ProviderConfigCapabilities
> = {
  gateway: {
    modelId: true,
    apiKey: true,
    baseURL: false,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  openrouter: {
    modelId: true,
    apiKey: true,
    baseURL: true,
    headers: true,
    appAttribution: true,
    agentAttribution: true,
  },
  anthropic: {
    modelId: true,
    apiKey: true,
    baseURL: false,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  openai: {
    modelId: true,
    apiKey: true,
    baseURL: false,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  google: {
    modelId: true,
    apiKey: true,
    baseURL: false,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
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
  if (provider === "openrouter") return true;
  if (provider === "gateway") return !OPENROUTER_ONLY_MODEL_IDS.has(modelId);
  if (!modelId.includes("/")) return true;

  const prefix = modelId.slice(0, modelId.indexOf("/"));
  return DIRECT_PROVIDER_PREFIXES[prefix] === provider;
}
