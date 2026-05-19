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
  ModelService,
  ModelTask,
  ModelTier,
  ProviderConfigCapabilities,
  ProviderLanguageModelMatrix,
  ProviderRoute,
  TaskModelMatrix,
  TierModelMatrix,
} from "./types";

type PartialTaskModelMatrix = Partial<
  Record<ModelTask, Partial<Record<ModelTier, Partial<TierModelMatrix>>>>
>;

type ProviderTaskModelMatrix = Partial<
  Record<ProviderRoute, PartialTaskModelMatrix>
>;

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

export const LANGUAGE_MODEL_TASKS = [
  "general",
  "coding",
  "agentic",
  "chat",
  "bulk",
  "vision",
  "reasoning",
  "longContext",
  "creative",
] as const satisfies readonly ModelTask[];

// ── Language model constants ─────────────────────────────────────────
// These use canonical Routerbase/OpenRouter "provider/model" IDs. Some
// providers use different IDs at runtime; resolveProviderModelId() maps them.

/** Supported Anthropic model IDs for language model tiers. */
export const ANTHROPIC_MODELS = {
  /** Highest-quality Claude model in the RouterBase quality tier. */
  CLAUDE_OPUS_4_7: "anthropic/claude-opus-4.7",
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
  /** Cheap million-token model for long-context/bulk work. */
  DEEPSEEK_V4_FLASH: "deepseek/deepseek-v4-flash",
} as const;

/** Supported Z.ai / GLM model IDs for workload-specific routing. */
export const GLM_MODELS = {
  /** Current GLM flagship for coding and agent workflows. */
  GLM_5: "z-ai/glm-5",
  /** Native multimodal GLM agent model. */
  GLM_5V_TURBO: "z-ai/glm-5v-turbo",
  /** High-quality GLM option with strong speed/value balance. */
  GLM_4_7: "z-ai/glm-4.7",
  /** Strong cheap 30B-class GLM option for bulk workloads. */
  GLM_4_7_FLASH: "z-ai/glm-4.7-flash",
  /** Multimodal GLM model for UI reconstruction and document vision. */
  GLM_4_6V: "z-ai/glm-4.6v",
} as const;

/** Supported Google model IDs for language model tiers. */
export const GOOGLE_MODELS = {
  /** Latest high-quality multimodal default with strong quality/cost balance. */
  GEMINI_3_5_FLASH: "google/gemini-3.5-flash",
  /** Latest lightweight Gemini model for fastest vision/tool routing. */
  GEMINI_3_1_FLASH_LITE_PREVIEW: "google/gemini-3.1-flash-lite-preview",
  /** Latest high-capability Gemini model for powerful/reasoning routing. */
  GEMINI_3_1_PRO_PREVIEW: "google/gemini-3.1-pro-preview",
  /** Legacy Gemini 3 Flash alias kept for explicit caller compatibility. */
  GEMINI_3_FLASH_PREVIEW: "google/gemini-3-flash-preview",
} as const;

/** Supported OpenAI model IDs for language model tier overrides. */
export const OPENAI_MODELS = {
  /** Current low-cost OpenAI model for nano-style defaults. */
  GPT_5_4_NANO: "openai/gpt-5.4-nano",
  /** Current small OpenAI model for fast/default direct routing. */
  GPT_5_4_MINI: "openai/gpt-5.4-mini",
  /** Current flagship OpenAI model for powerful direct routing. */
  GPT_5_4: "openai/gpt-5.4",
  /** Best OpenAI coding-specialist comparison point. */
  GPT_5_3_CODEX: "openai/gpt-5.3-codex",
} as const;

/** Supported xAI model IDs for language model tier variants. */
export const XAI_MODELS = {
  /** Current xAI flagship for high-quality long-context agent work. */
  GROK_4_3: "x-ai/grok-4.3",
} as const;

/** Supported Moonshot/Kimi model IDs for coding and agentic tasks. */
export const KIMI_MODELS = {
  /** Current Kimi model for long-horizon coding and agent orchestration. */
  KIMI_K2_6: "moonshotai/kimi-k2.6",
  /** Stronger value Kimi model for coding and vision comparisons. */
  KIMI_K2_5: "moonshotai/kimi-k2.5",
  /** Reasoning-optimized Kimi model for persistent tool-use workflows. */
  KIMI_K2_THINKING: "moonshotai/kimi-k2-thinking",
} as const;

/** Supported Qwen model IDs for language model tier overrides. */
export const QWEN_MODELS = {
  /** Best ultra-cheap Qwen text/tool option. */
  QWEN_3_235B_A22B_2507: "qwen/qwen3-235b-a22b-2507",
  /** Best free tool/json model for OpenRouter experiments. */
  QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE:
    "qwen/qwen3-next-80b-a3b-instruct:free",
  /** High-quality Qwen vision/tool model. */
  QWEN_3_6_PLUS: "qwen/qwen3.6-plus",
} as const;

/** OpenRouter-managed model IDs whose backing model can change over time. */
export const OPENROUTER_MODELS = {
  /** Free-model router that filters backing models by requested capabilities. */
  FREE: "openrouter/free",
} as const;

/** Best non-direct-provider models routed through Gateway/OpenRouter. */
export const MINIMAX_MODELS = {
  /** High-quality, high-value general model. */
  MINIMAX_M2_7: "minimax/minimax-m2.7",
  /** Faster value pick and RouterBase coding shelf candidate. */
  MINIMAX_M2_5: "minimax/minimax-m2.5",
} as const;

export const STEPFUN_MODELS = {
  /** OpenRouter-only high-value flash model. */
  STEP_3_5_FLASH: "stepfun/step-3.5-flash",
} as const;

export const XIAOMI_MODELS = {
  /** Very cheap, fast structured/tool model. */
  MIMO_V2_FLASH: "xiaomi/mimo-v2-flash",
  /** Long-context high-quality Xiaomi model. */
  MIMO_V2_PRO: "xiaomi/mimo-v2-pro",
} as const;

export const INCEPTION_MODELS = {
  /** Extreme-throughput Mercury model for latency stress testing. */
  MERCURY_2: "inception/mercury-2",
} as const;

export const NEX_AGI_MODELS = {
  /** OpenRouter-only DeepSeek derivative from the cheap-quality shelf. */
  DEEPSEEK_V3_1_NEX_N1: "nex-agi/deepseek-v3.1-nex-n1",
} as const;

/** Canonical language model catalogue exposed by @howells/ai. */
export const LANGUAGE_MODEL_CATALOG = [
  {
    id: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    name: "Claude Opus 4.7",
    service: "anthropic",
    tasks: ["general", "reasoning", "coding", "agentic", "vision"],
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    name: "Claude Opus 4.6",
    service: "anthropic",
    tasks: ["general", "reasoning", "coding", "agentic", "vision"],
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    name: "Claude Sonnet 4.6",
    service: "anthropic",
    tasks: ["general", "coding", "agentic", "creative"],
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
    name: "Claude Haiku 4.5",
    service: "anthropic",
    tasks: ["general", "chat"],
  },
  {
    id: DEEPSEEK_MODELS.DEEPSEEK_V3_2,
    name: "DeepSeek V3.2",
    service: "deepseek",
    tasks: ["general", "coding", "bulk", "chat"],
  },
  {
    id: DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH,
    name: "DeepSeek V4 Flash",
    service: "deepseek",
    tasks: ["bulk", "longContext"],
  },
  {
    id: GLM_MODELS.GLM_5,
    name: "GLM 5",
    service: "zai",
    tasks: ["coding", "agentic"],
  },
  {
    id: GLM_MODELS.GLM_5V_TURBO,
    name: "GLM 5V Turbo",
    service: "zai",
    tasks: ["vision", "agentic"],
  },
  {
    id: GLM_MODELS.GLM_4_7,
    name: "GLM 4.7",
    service: "zai",
    tasks: ["coding", "chat"],
  },
  {
    id: GLM_MODELS.GLM_4_7_FLASH,
    name: "GLM 4.7 Flash",
    service: "zai",
    tasks: ["bulk", "coding"],
  },
  {
    id: GLM_MODELS.GLM_4_6V,
    name: "GLM 4.6V",
    service: "zai",
    tasks: ["vision", "longContext"],
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    name: "Gemini 3.5 Flash",
    service: "google",
    tasks: ["general", "vision", "chat", "coding", "longContext"],
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW,
    name: "Gemini 3 Flash Preview",
    service: "google",
    tasks: ["general", "vision", "chat", "coding", "longContext"],
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    name: "Gemini 3.1 Pro Preview",
    service: "google",
    tasks: ["general", "reasoning", "longContext", "vision"],
  },
  {
    id: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    name: "Gemini 3.1 Flash Lite Preview",
    service: "google",
    tasks: ["bulk", "vision"],
  },
  {
    id: INCEPTION_MODELS.MERCURY_2,
    name: "Mercury 2",
    service: "inception",
    tasks: ["bulk", "chat"],
  },
  {
    id: KIMI_MODELS.KIMI_K2_6,
    name: "Kimi K2.6",
    service: "moonshotai",
    tasks: ["coding", "agentic", "longContext", "vision"],
  },
  {
    id: KIMI_MODELS.KIMI_K2_5,
    name: "Kimi K2.5",
    service: "moonshotai",
    tasks: ["coding", "agentic", "vision"],
  },
  {
    id: KIMI_MODELS.KIMI_K2_THINKING,
    name: "Kimi K2 Thinking",
    service: "moonshotai",
    tasks: ["reasoning", "agentic", "coding"],
  },
  {
    id: MINIMAX_MODELS.MINIMAX_M2_7,
    name: "MiniMax M2.7",
    service: "minimax",
    tasks: ["general", "agentic", "longContext"],
  },
  {
    id: MINIMAX_MODELS.MINIMAX_M2_5,
    name: "MiniMax M2.5",
    service: "minimax",
    tasks: ["coding", "bulk", "chat"],
  },
  {
    id: NEX_AGI_MODELS.DEEPSEEK_V3_1_NEX_N1,
    name: "DeepSeek V3.1 Nex N1",
    service: "nexagi",
    tasks: ["coding", "bulk"],
  },
  {
    id: OPENAI_MODELS.GPT_5_4_NANO,
    name: "GPT-5.4 Nano",
    service: "openai",
    tasks: ["general", "bulk"],
  },
  {
    id: OPENAI_MODELS.GPT_5_4_MINI,
    name: "GPT-5.4 Mini",
    service: "openai",
    tasks: ["general", "chat"],
  },
  {
    id: OPENAI_MODELS.GPT_5_4,
    name: "GPT-5.4",
    service: "openai",
    tasks: ["general", "reasoning", "coding", "creative", "longContext"],
  },
  {
    id: OPENAI_MODELS.GPT_5_3_CODEX,
    name: "GPT-5.3 Codex",
    service: "openai",
    tasks: ["coding", "agentic"],
  },
  {
    id: OPENROUTER_MODELS.FREE,
    name: "OpenRouter Free Router",
    tasks: ["general", "coding", "agentic", "chat", "bulk", "vision"],
  },
  {
    id: XAI_MODELS.GROK_4_3,
    name: "Grok 4.3",
    service: "xai",
    tasks: ["general", "reasoning", "agentic", "longContext", "vision"],
  },
  {
    id: QWEN_MODELS.QWEN_3_235B_A22B_2507,
    name: "Qwen3 235B A22B Instruct 2507",
    service: "qwen",
    tasks: ["bulk", "chat"],
  },
  {
    id: QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE,
    name: "Qwen3 Next 80B A3B Instruct (free)",
    service: "qwen",
    tasks: ["bulk", "chat"],
  },
  {
    id: QWEN_MODELS.QWEN_3_6_PLUS,
    name: "Qwen3.6 Plus",
    service: "qwen",
    tasks: ["vision", "reasoning", "longContext"],
  },
  {
    id: STEPFUN_MODELS.STEP_3_5_FLASH,
    name: "Step 3.5 Flash",
    service: "stepfun",
    tasks: ["bulk", "chat"],
  },
  {
    id: XIAOMI_MODELS.MIMO_V2_FLASH,
    name: "MiMo-V2 Flash",
    service: "xiaomi",
    tasks: ["bulk", "chat"],
  },
  {
    id: XIAOMI_MODELS.MIMO_V2_PRO,
    name: "MiMo-V2 Pro",
    service: "xiaomi",
    tasks: ["general", "longContext"],
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
    text: OPENAI_MODELS.GPT_5_4_NANO, // premium low-cost default
    tools: OPENAI_MODELS.GPT_5_4_NANO,
    vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
  },
  fast: {
    text: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW, // recognizable fast premium default
    tools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
  },
  standard: {
    text: GOOGLE_MODELS.GEMINI_3_5_FLASH, // high-quality multimodal default
    tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    vision: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    visionTools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
  },
  powerful: {
    text: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    tools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    vision: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    visionTools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
  },
  reasoning: {
    text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7, // highest RouterBase quality tier
    tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    vision: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    visionTools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
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

/** OpenRouter-only free fallback. The backing model is intentionally router-managed. */
export const OPENROUTER_FREE_MODELS: Record<ModelTier, TierModelMatrix> = {
  nano: everyVariant(OPENROUTER_MODELS.FREE),
  fast: everyVariant(OPENROUTER_MODELS.FREE),
  standard: everyVariant(OPENROUTER_MODELS.FREE),
  powerful: everyVariant(OPENROUTER_MODELS.FREE),
  reasoning: everyVariant(OPENROUTER_MODELS.FREE),
} as const;

/** Workload-specific model choices layered over the general tier matrix. */
export const DEFAULT_TASK_MODELS: TaskModelMatrix = {
  general: {},
  coding: {
    fast: {
      text: GLM_MODELS.GLM_4_7,
      tools: GLM_MODELS.GLM_4_7,
    },
    standard: {
      text: OPENAI_MODELS.GPT_5_3_CODEX,
      tools: OPENAI_MODELS.GPT_5_3_CODEX,
    },
    powerful: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    },
    reasoning: {
      text: KIMI_MODELS.KIMI_K2_THINKING,
      tools: KIMI_MODELS.KIMI_K2_THINKING,
    },
  },
  agentic: {
    fast: {
      text: GLM_MODELS.GLM_4_7,
      tools: GLM_MODELS.GLM_4_7,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
    powerful: {
      text: KIMI_MODELS.KIMI_K2_6,
      tools: KIMI_MODELS.KIMI_K2_6,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    },
  },
  chat: {
    nano: {
      text: OPENAI_MODELS.GPT_5_4_NANO,
    },
    fast: {
      text: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  bulk: {
    nano: {
      text: OPENAI_MODELS.GPT_5_4_NANO,
      tools: OPENAI_MODELS.GPT_5_4_NANO,
    },
    fast: {
      text: GLM_MODELS.GLM_4_7_FLASH,
      tools: GLM_MODELS.GLM_4_7_FLASH,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  vision: {
    fast: {
      vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
      visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
    },
    standard: {
      vision: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      visionTools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
    powerful: {
      vision: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      visionTools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      vision: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
      visionTools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    },
  },
  reasoning: {
    standard: {
      text: KIMI_MODELS.KIMI_K2_THINKING,
      tools: KIMI_MODELS.KIMI_K2_THINKING,
    },
    powerful: {
      text: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      tools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    },
  },
  longContext: {
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
    powerful: {
      text: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      tools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
    },
  },
  creative: {
    standard: {
      text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    },
    powerful: {
      text: OPENAI_MODELS.GPT_5_4,
    },
  },
} as const;

function everyVariant(modelId: string): TierModelMatrix {
  return {
    text: modelId,
    tools: modelId,
    vision: modelId,
    visionTools: modelId,
  };
}

function splitVariantModels(options: {
  text: string;
  tools?: string;
  vision?: string;
  visionTools?: string;
}): TierModelMatrix {
  return {
    text: options.text,
    tools: options.tools ?? options.text,
    vision: options.vision ?? options.text,
    visionTools: options.visionTools ?? options.vision ?? options.tools ??
      options.text,
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
    powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
  },
  openai: {
    nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
    reasoning: everyVariant(OPENAI_MODELS.GPT_5_4),
  },
  google: {
    nano: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW),
    fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    reasoning: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
  },
  deepseek: {
    nano: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    reasoning: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
  },
  xai: {
    nano: everyVariant(XAI_MODELS.GROK_4_3),
    fast: everyVariant(XAI_MODELS.GROK_4_3),
    standard: everyVariant(XAI_MODELS.GROK_4_3),
    powerful: everyVariant(XAI_MODELS.GROK_4_3),
    reasoning: everyVariant(XAI_MODELS.GROK_4_3),
  },
  qwen: {
    nano: splitVariantModels({
      text: QWEN_MODELS.QWEN_3_235B_A22B_2507,
      vision: QWEN_MODELS.QWEN_3_6_PLUS,
    }),
    fast: splitVariantModels({
      text: QWEN_MODELS.QWEN_3_235B_A22B_2507,
      vision: QWEN_MODELS.QWEN_3_6_PLUS,
    }),
    standard: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    reasoning: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
  },
  zai: {
    nano: splitVariantModels({
      text: GLM_MODELS.GLM_4_7_FLASH,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    fast: splitVariantModels({
      text: GLM_MODELS.GLM_4_7,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    standard: splitVariantModels({
      text: GLM_MODELS.GLM_4_7,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    powerful: splitVariantModels({
      text: GLM_MODELS.GLM_5,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    reasoning: splitVariantModels({
      text: GLM_MODELS.GLM_5,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
  },
  moonshotai: {
    nano: everyVariant(KIMI_MODELS.KIMI_K2_6),
    fast: everyVariant(KIMI_MODELS.KIMI_K2_6),
    standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
    powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
    reasoning: everyVariant(KIMI_MODELS.KIMI_K2_6),
  },
} as const;

/** Provider-specific task choices used when a caller pins a single provider. */
export const PROVIDER_TASK_DEFAULT_MODELS: ProviderTaskModelMatrix = {
  anthropic: {
    coding: {
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    },
    agentic: {
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    },
    chat: {
      nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
      fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    },
    bulk: {
      nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
      fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    },
    vision: {
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    },
    reasoning: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    },
    longContext: {
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7),
    },
    creative: {
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6),
    },
  },
  openai: {
    coding: {
      standard: everyVariant(OPENAI_MODELS.GPT_5_3_CODEX),
      powerful: everyVariant(OPENAI_MODELS.GPT_5_3_CODEX),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_4),
    },
    agentic: {
      standard: everyVariant(OPENAI_MODELS.GPT_5_3_CODEX),
      powerful: everyVariant(OPENAI_MODELS.GPT_5_3_CODEX),
    },
    chat: {
      nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    },
    bulk: {
      nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    },
    vision: {
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
      powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_4),
    },
    reasoning: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_4),
    },
    longContext: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_4),
    },
    creative: {
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
      powerful: everyVariant(OPENAI_MODELS.GPT_5_4),
    },
  },
  google: {
    coding: {
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    agentic: {
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    chat: {
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    bulk: {
      nano: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW),
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW),
    },
    vision: {
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    reasoning: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      reasoning: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    longContext: {
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    creative: {
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
  },
  deepseek: {
    coding: {
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    },
    agentic: {
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    },
    chat: {
      fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    },
    bulk: {
      fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
    },
    longContext: {
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
    },
    creative: {
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V3_2),
    },
  },
  xai: {
    coding: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
    },
    agentic: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
    },
    chat: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    bulk: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    vision: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
    },
    reasoning: {
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      reasoning: everyVariant(XAI_MODELS.GROK_4_3),
    },
    longContext: {
      standard: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
    },
    creative: {
      standard: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
    },
  },
  qwen: {
    coding: {
      fast: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
      standard: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
    agentic: {
      standard: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
    chat: {
      nano: everyVariant(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE),
      fast: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
    },
    bulk: {
      nano: everyVariant(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE),
      fast: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
      standard: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
    },
    vision: {
      standard: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
    reasoning: {
      standard: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
      reasoning: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
    longContext: {
      standard: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
    creative: {
      standard: everyVariant(QWEN_MODELS.QWEN_3_235B_A22B_2507),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_6_PLUS),
    },
  },
  zai: {
    coding: {
      standard: everyVariant(GLM_MODELS.GLM_5),
      powerful: everyVariant(GLM_MODELS.GLM_5),
    },
    agentic: {
      standard: everyVariant(GLM_MODELS.GLM_5),
      powerful: everyVariant(GLM_MODELS.GLM_5),
    },
    chat: {
      fast: everyVariant(GLM_MODELS.GLM_4_7),
      standard: everyVariant(GLM_MODELS.GLM_4_7),
    },
    bulk: {
      nano: everyVariant(GLM_MODELS.GLM_4_7_FLASH),
      fast: everyVariant(GLM_MODELS.GLM_4_7_FLASH),
    },
    vision: {
      fast: everyVariant(GLM_MODELS.GLM_5V_TURBO),
      standard: everyVariant(GLM_MODELS.GLM_5V_TURBO),
      powerful: everyVariant(GLM_MODELS.GLM_5V_TURBO),
    },
    reasoning: {
      standard: everyVariant(GLM_MODELS.GLM_5),
      powerful: everyVariant(GLM_MODELS.GLM_5),
      reasoning: everyVariant(GLM_MODELS.GLM_5),
    },
    longContext: {
      standard: everyVariant(GLM_MODELS.GLM_5),
      powerful: everyVariant(GLM_MODELS.GLM_5),
    },
    creative: {
      standard: everyVariant(GLM_MODELS.GLM_4_7),
      powerful: everyVariant(GLM_MODELS.GLM_5),
    },
  },
  moonshotai: {
    coding: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    agentic: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    chat: {
      fast: everyVariant(KIMI_MODELS.KIMI_K2_6),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    bulk: {
      fast: everyVariant(KIMI_MODELS.KIMI_K2_6),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    vision: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_5),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    reasoning: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    longContext: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_6),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
    creative: {
      standard: everyVariant(KIMI_MODELS.KIMI_K2_5),
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_6),
    },
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

const LANGUAGE_MODEL_FEATURES: Record<
  string,
  { tools: boolean; vision: boolean }
> = Object.fromEntries(
  LANGUAGE_MODEL_CATALOG.map((model) => [
    model.id,
    {
      tools: true,
      vision: new Set<string>([
        ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
        ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
        ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
        ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
        GLM_MODELS.GLM_5V_TURBO,
        GLM_MODELS.GLM_4_6V,
        GOOGLE_MODELS.GEMINI_3_5_FLASH,
        GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW,
        GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
        GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE_PREVIEW,
        KIMI_MODELS.KIMI_K2_6,
        KIMI_MODELS.KIMI_K2_5,
        OPENAI_MODELS.GPT_5_4_NANO,
        OPENAI_MODELS.GPT_5_4_MINI,
        OPENAI_MODELS.GPT_5_4,
        OPENAI_MODELS.GPT_5_3_CODEX,
        OPENROUTER_MODELS.FREE,
        XAI_MODELS.GROK_4_3,
        QWEN_MODELS.QWEN_3_6_PLUS,
      ]).has(model.id),
    },
  ]),
);

export function getLanguageModelCapabilities(
  modelId: string,
): LanguageModelCapabilities | undefined {
  const features = LANGUAGE_MODEL_FEATURES[modelId];
  if (!features) return undefined;
  return {
    structured: true,
    tools: features.tools,
    vision: features.vision,
  };
}

export function assertLanguageModelCompatible(
  modelId: string,
  variant: LanguageModelVariant,
): void {
  const capabilities = getLanguageModelCapabilities(modelId);
  if (!capabilities) return;

  const requested = LANGUAGE_MODEL_CAPABILITIES[variant];
  if (requested.tools && !capabilities.tools) {
    throw new Error(
      `Model "${modelId}" does not support tool calling. ` +
        `Choose a tool-capable model or remove tools: true.`,
    );
  }
  if (requested.vision && !capabilities.vision) {
    throw new Error(
      `Model "${modelId}" does not support vision input. ` +
        `Choose a vision-capable model or remove vision: true.`,
    );
  }
}

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
  task: ModelTask = "general",
  taskModels: TaskModelMatrix = DEFAULT_TASK_MODELS,
): string {
  const taskModelId = taskModels[task]?.[tier]?.[variant];
  const modelId = taskModelId ?? models[tier][variant];
  if (taskModelId && canRouteModelToProvider(taskModelId, provider)) {
    return taskModelId;
  }

  const providerTaskModelId =
    PROVIDER_TASK_DEFAULT_MODELS[provider]?.[task]?.[tier]?.[variant];
  if (
    providerTaskModelId &&
    canRouteModelToProvider(providerTaskModelId, provider)
  ) {
    return providerTaskModelId;
  }

  const isDefaultModel = modelId === DEFAULT_MODELS[tier][variant];
  if (
    (provider === "gateway" ||
      provider === "openrouter" ||
      !isDefaultModel ||
      Boolean(taskModelId)) &&
    canRouteModelToProvider(modelId, provider)
  ) {
    return modelId;
  }
  return PROVIDER_DEFAULT_MODELS[provider][tier][variant];
}

export function resolveOpenRouterFreeModelId(
  tier: ModelTier,
  variant: LanguageModelVariant,
): string {
  return OPENROUTER_FREE_MODELS[tier][variant];
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

function mergeTaskTierModels(
  defaults: TaskModelMatrix[ModelTask][ModelTier] | undefined,
  overrides: TaskModelMatrix[ModelTask][ModelTier] | undefined,
): Partial<TierModelMatrix> | undefined {
  if (!defaults && !overrides) return undefined;
  return {
    ...defaults,
    ...overrides,
  };
}

/** Merge task-specific model overrides with default workload choices. */
export function resolveTaskModels(
  overrides?: ModelOverrides["tasks"],
): TaskModelMatrix {
  const resolved = {} as TaskModelMatrix;

  for (const task of LANGUAGE_MODEL_TASKS) {
    resolved[task] = {};
    for (const tier of MODEL_TIERS) {
      const tierModels = mergeTaskTierModels(
        DEFAULT_TASK_MODELS[task][tier],
        overrides?.[task]?.[tier],
      );
      if (tierModels) {
        resolved[task][tier] = tierModels;
      }
    }
  }

  return resolved;
}

// ── Provider routing helpers ─────────────────────────────────────────

/** Known OpenRouter prefixes that map to direct providers. */
const PROVIDER_PREFIXES: Record<string, ProviderRoute> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  "x-ai": "xai",
  xai: "xai",
  qwen: "qwen",
  "z-ai": "zai",
  zai: "zai",
  moonshotai: "moonshotai",
};

const DIRECT_PROVIDER_PREFIXES: Record<string, ProviderRoute> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  "x-ai": "xai",
  xai: "xai",
  qwen: "qwen",
  "z-ai": "zai",
  zai: "zai",
  moonshotai: "moonshotai",
};

export const MODEL_SERVICE_ENV_VARS: Partial<Record<ModelService, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GEMINI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  xai: "XAI_API_KEY",
  qwen: "QWEN_API_KEY",
  zai: "ZAI_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
} as const;

const MODEL_SERVICE_PREFIXES: Record<string, ModelService> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  inception: "inception",
  minimax: "minimax",
  "nex-agi": "nexagi",
  nexagi: "nexagi",
  "x-ai": "xai",
  xai: "xai",
  qwen: "qwen",
  stepfun: "stepfun",
  xiaomi: "xiaomi",
  "z-ai": "zai",
  zai: "zai",
  moonshotai: "moonshotai",
} as const;

const PROVIDER_MODEL_IDS: Record<
  string,
  Partial<Record<ProviderRoute, string>>
> = {
  "anthropic/claude-opus-4.7": {
    anthropic: "claude-opus-4-7",
  },
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
  "google/gemini-3.5-flash": {
    google: "gemini-3.5-flash",
  },
  "google/gemini-3-flash-preview": {
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3-flash": {
    openrouter: "google/gemini-3-flash-preview",
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3.1-flash-lite": {
    openrouter: "google/gemini-3.1-flash-lite-preview",
    gateway: "google/gemini-3.1-flash-lite-preview",
    google: "gemini-3.1-flash-lite-preview",
  },
  "google/gemini-3.1-flash-lite-preview": {
    gateway: "google/gemini-3.1-flash-lite-preview",
    google: "gemini-3.1-flash-lite-preview",
  },
  "google/gemini-3.1-pro": {
    openrouter: "google/gemini-3.1-pro-preview",
    gateway: "google/gemini-3.1-pro-preview",
    google: "gemini-3.1-pro-preview",
  },
  "google/gemini-3.1-pro-preview": {
    gateway: "google/gemini-3.1-pro-preview",
    google: "gemini-3.1-pro-preview",
  },
  "x-ai/grok-4.3": {
    gateway: "xai/grok-4.3",
    xai: "grok-4.3",
  },
  "qwen/qwen3.6-plus": {
    gateway: "alibaba/qwen3.6-plus",
  },
  "z-ai/glm-5": {
    gateway: "zai/glm-5",
  },
  "z-ai/glm-5v-turbo": {
    gateway: "zai/glm-5v-turbo",
  },
  "z-ai/glm-4.7": {
    gateway: "zai/glm-4.7",
  },
  "z-ai/glm-4.7-flash": {
    gateway: "zai/glm-4.7-flash",
  },
  "z-ai/glm-4.6v": {
    gateway: "zai/glm-4.6v",
  },
};

const GATEWAY_UNAVAILABLE_MODEL_IDS = new Set<string>([
  NEX_AGI_MODELS.DEEPSEEK_V3_1_NEX_N1,
  OPENROUTER_MODELS.FREE,
  QWEN_MODELS.QWEN_3_235B_A22B_2507,
  QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE,
  STEPFUN_MODELS.STEP_3_5_FLASH,
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
  deepseek: {
    modelId: true,
    apiKey: true,
    baseURL: true,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  xai: {
    modelId: true,
    apiKey: true,
    baseURL: true,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  qwen: {
    modelId: true,
    apiKey: true,
    baseURL: true,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  zai: {
    modelId: true,
    apiKey: true,
    baseURL: true,
    headers: false,
    appAttribution: false,
    agentAttribution: false,
  },
  moonshotai: {
    modelId: true,
    apiKey: true,
    baseURL: true,
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

/** Infer the underlying model service/author from a provider-prefixed model ID. */
export function inferModelService(modelId: string): ModelService | undefined {
  const slash = modelId.indexOf("/");
  if (slash === -1) return undefined;
  const prefix = modelId.slice(0, slash);
  return MODEL_SERVICE_PREFIXES[prefix];
}

/**
 * Validate that an OpenRouter model ID matches the requested provider.
 * Throws if the model belongs to a different provider.
 */
export function validateProviderMatch(
  openRouterId: string,
  requestedProvider: ProviderRoute,
): void {
  if (requestedProvider === "openrouter") {
    return;
  }
  if (requestedProvider === "gateway") {
    throw new Error(
      `Model "${openRouterId}" is not available through provider "gateway". ` +
        "Use OpenRouter or choose a Gateway-supported model.",
    );
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
  if (provider === "gateway") return !GATEWAY_UNAVAILABLE_MODEL_IDS.has(modelId);
  if (!modelId.includes("/")) return true;

  const prefix = modelId.slice(0, modelId.indexOf("/"));
  return DIRECT_PROVIDER_PREFIXES[prefix] === provider;
}
