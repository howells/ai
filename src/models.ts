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
import { PROVIDER_DEFINITIONS } from "./providers/registry";

type PartialTaskModelMatrix = Partial<
  Record<ModelTask, Partial<Record<ModelTier, Partial<TierModelMatrix>>>>
>;

type ProviderTaskModelMatrix = Partial<Record<ProviderRoute, PartialTaskModelMatrix>>;

/** Ordered language model quality/cost tiers exposed by createAI(). */
export const MODEL_TIERS = [
  "nano",
  "fast",
  "standard",
  "powerful",
  "reasoning",
] as const satisfies readonly ModelTier[];

/** Ordered capability variants available inside each language tier. */
export const LANGUAGE_MODEL_VARIANTS = [
  "text",
  "tools",
  "vision",
  "visionTools",
] as const satisfies readonly LanguageModelVariant[];

/** Ordered workload hints used by task-optimized model defaults. */
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
  /** Most capable Claude model — premium tier, always-on thinking, for the hardest work. */
  CLAUDE_FABLE_5: "anthropic/claude-fable-5",
  /** Fast Claude model for low-cost direct Anthropic routing. */
  CLAUDE_HAIKU_4_5: "anthropic/claude-haiku-4.5",
  /** Prior-generation frontier reasoning model. */
  CLAUDE_OPUS_4_6: "anthropic/claude-opus-4.6",
  /** Previous-generation Opus reasoning model. */
  CLAUDE_OPUS_4_7: "anthropic/claude-opus-4.7",
  /** Current flagship Opus model — highest-quality reasoning default. */
  CLAUDE_OPUS_4_8: "anthropic/claude-opus-4.8",
  /** Complex reasoning and coding model for the powerful slot. */
  CLAUDE_SONNET_4_6: "anthropic/claude-sonnet-4.6",
} as const;

/** Supported DeepSeek model IDs for language model tiers. */
export const DEEPSEEK_MODELS = {
  /** Current DeepSeek flagship for general, coding, and chat workloads. */
  DEEPSEEK_V4_PRO: "deepseek/deepseek-v4-pro",
  /** Cheap million-token model for long-context/bulk work. */
  DEEPSEEK_V4_FLASH: "deepseek/deepseek-v4-flash",
} as const;

/** Supported Z.ai / GLM model IDs for workload-specific routing. */
export const GLM_MODELS = {
  /** Multimodal GLM model for UI reconstruction and document vision. */
  GLM_4_6V: "z-ai/glm-4.6v",
  /** High-quality GLM option with strong speed/value balance. */
  GLM_4_7: "z-ai/glm-4.7",
  /** Strong cheap 30B-class GLM option for bulk workloads. */
  GLM_4_7_FLASH: "z-ai/glm-4.7-flash",
  /** Current GLM flagship for coding and agent workflows. */
  GLM_5_2: "z-ai/glm-5.2",
  /** Low-cost multimodal GLM model for coding, agent, and structured-output workloads. */
  GLM_5_3_FLASH: "z-ai/glm-5.3-flash",
  /** Native multimodal GLM agent model. */
  GLM_5V_TURBO: "z-ai/glm-5v-turbo",
} as const;

/** Supported Google model IDs for language model tiers. */
export const GOOGLE_MODELS = {
  /** Latest lightweight Gemini model for fastest vision/tool routing. */
  GEMINI_3_1_FLASH_LITE: "google/gemini-3.1-flash-lite",
  /** Latest high-capability Gemini model for powerful/reasoning routing. */
  GEMINI_3_1_PRO_PREVIEW: "google/gemini-3.1-pro-preview",
  /** Latest high-quality multimodal default with strong quality/cost balance. */
  GEMINI_3_5_FLASH: "google/gemini-3.5-flash",
  /** Legacy Gemini 3 Flash alias kept for explicit caller compatibility. */
  GEMINI_3_FLASH_PREVIEW: "google/gemini-3-flash-preview",
} as const;

/** Supported OpenAI model IDs for language model tier overrides. */
export const OPENAI_MODELS = {
  /** Current flagship OpenAI model for powerful routing and coding (Codex runs on it). */
  GPT_5_5: "openai/gpt-5.5",
  /** Low-cost multimodal model for routine text, tools, and structured vision workloads. */
  GPT_5_6_LUNA: "openai/gpt-5.6-luna-20260709",
  /** Current small OpenAI model for fast/default direct routing. */
  GPT_5_4_MINI: "openai/gpt-5.4-mini",
  /** Current low-cost OpenAI model for nano-style defaults. */
  GPT_5_4_NANO: "openai/gpt-5.4-nano",
} as const;

/**
 * Supported Cerebras model IDs for latency-critical open-weight routing.
 *
 * Cerebras serves a small open-weight lineup on custom silicon at very high
 * throughput. It is a latency choice, never a general default, and any route
 * promoted onto it should carry a fidelity eval — MaterialGraph's vision
 * triage moved material recall from 71% to 100% when it switched, but the
 * result only counts because the eval was run.
 */
export const CEREBRAS_MODELS = {
  /** Vision model behind MaterialGraph and DesignRound image triage. */
  GEMMA_4_31B: "gemma-4-31b",
  /** OpenAI open-weight 120B served on Cerebras silicon. */
  GPT_OSS_120B: "gpt-oss-120b",
  /** Large Qwen MoE for high-throughput bulk text. */
  QWEN_3_235B: "qwen-3-235b-a22b-instruct",
} as const;

/** Supported Groq model IDs for direct high-throughput routing. */
export const GROQ_MODELS = {
  /** OpenAI open-weight 120B model served directly by Groq. */
  GPT_OSS_120B: "openai/gpt-oss-120b",
  /** Fast OpenAI open-weight 20B model served directly by Groq. */
  GPT_OSS_20B: "openai/gpt-oss-20b",
} as const;

/** Supported xAI model IDs for language model tier variants. */
export const XAI_MODELS = {
  /** Current xAI flagship for high-quality long-context agent work. */
  GROK_4_3: "x-ai/grok-4.3",
} as const;

/** Supported Moonshot/Kimi model IDs for coding and agentic tasks. */
export const KIMI_MODELS = {
  /** Stronger value Kimi model for coding and vision comparisons. */
  KIMI_K2_5: "moonshotai/kimi-k2.5",
  /** Current Kimi coding flagship for long-horizon coding and agent orchestration. */
  KIMI_K2_7_CODE: "moonshotai/kimi-k2.7-code",
  /** Reasoning-optimized Kimi model for persistent tool-use workflows. */
  KIMI_K2_THINKING: "moonshotai/kimi-k2-thinking",
} as const;

/** Supported Qwen model IDs for language model tier overrides. */
export const QWEN_MODELS = {
  /** Open-weight Qwen MoE vision/reasoning model for bulk/chat workloads. */
  QWEN_3_VL_235B_A22B: "qwen/qwen3-vl-235b-a22b-instruct",
  /** Current high-quality Qwen vision/reasoning flagship. */
  QWEN_3_7_PLUS: "qwen/qwen3.7-plus",
  /** Best free tool/json model for OpenRouter experiments. */
  QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE: "qwen/qwen3-next-80b-a3b-instruct:free",
} as const;

/** OpenRouter-managed model IDs whose backing model can change over time. */
export const OPENROUTER_MODELS = {
  /** Free-model router that filters backing models by requested capabilities. */
  FREE: "openrouter/free",
} as const;

/** Best non-direct-provider models routed through Gateway/OpenRouter. */
export const MINIMAX_MODELS = {
  /** Faster value pick and RouterBase coding shelf candidate. */
  MINIMAX_M2_5: "minimax/minimax-m2.5",
  /** Current MiniMax flagship — high-quality multimodal general model. */
  MINIMAX_M3: "minimax/minimax-m3",
} as const;

/** Supported StepFun model IDs for Gateway/OpenRouter routing. */
export const STEPFUN_MODELS = {
  /** OpenRouter-only high-value flash model. */
  STEP_3_7_FLASH: "stepfun/step-3.7-flash",
} as const;

/** Supported Xiaomi model IDs for Gateway/OpenRouter routing. */
export const XIAOMI_MODELS = {
  /** Cheap, fast native-multimodal Xiaomi model. */
  MIMO_V2_5: "xiaomi/mimo-v2.5",
  /** Long-context high-quality Xiaomi flagship. */
  MIMO_V2_5_PRO: "xiaomi/mimo-v2.5-pro",
} as const;

/** Supported Inception Labs model IDs for extreme-throughput routing. */
export const INCEPTION_MODELS = {
  /** Extreme-throughput Mercury model for latency stress testing. */
  MERCURY_2: "inception/mercury-2",
} as const;

/** Supported Nex AGI model IDs for OpenRouter-only value routing. */
export const NEX_AGI_MODELS = {
  /** OpenRouter-only agentic MoE model for coding and tool-use workflows. */
  NEX_N2_PRO: "nex-agi/nex-n2-pro",
} as const;

// ── Ollama local model constants ──────────────────────────────────────
// Native Ollama IDs (no provider prefix). Defaults match the locally
// benchmarked lineup; override per machine via createAI({ models }).

/** Locally served Ollama model IDs for language model tiers and retrieval. */
export const OLLAMA_MODELS = {
  /** Vision specialist — most accurate local image understanding. */
  GEMMA_4_31B: "gemma4:31b",
  /** Deep reasoner and strongest local prose; proportional reasoning depth. */
  GPT_OSS_120B: "gpt-oss:120b",
  /** Fast all-rounder; thinking model (CoT arrives in the reasoning field). */
  QWEN_3_6_35B: "qwen3.6:35b",
  /** Coding specialist — fastest local model, strong tool calling. */
  QWEN_3_CODER_30B: "qwen3-coder:30b",
  /** 4096d text embeddings for local retrieval. */
  QWEN_3_EMBEDDING_8B: "qwen3-embedding:8b",
} as const;

/** Canonical language model catalogue exposed by @howells/ai. */
export const LANGUAGE_MODEL_CATALOG = [
  {
    id: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    name: "Claude Opus 4.8",
    service: "anthropic",
    tasks: ["general", "reasoning", "coding", "agentic", "vision"],
  },
  {
    id: ANTHROPIC_MODELS.CLAUDE_FABLE_5,
    name: "Claude Fable 5",
    service: "anthropic",
    tasks: ["general", "reasoning", "coding", "agentic", "vision"],
  },
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
    id: DEEPSEEK_MODELS.DEEPSEEK_V4_PRO,
    name: "DeepSeek V4 Pro",
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
    id: GLM_MODELS.GLM_5_2,
    name: "GLM 5.2",
    service: "zai",
    tasks: ["coding", "agentic"],
  },
  {
    id: GLM_MODELS.GLM_5_3_FLASH,
    name: "GLM 5.3 Flash",
    service: "zai",
    tasks: ["general", "coding", "agentic", "bulk", "chat", "vision"],
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
    id: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    name: "Gemini 3.1 Flash Lite",
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
    id: KIMI_MODELS.KIMI_K2_7_CODE,
    name: "Kimi K2.7 Code",
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
    id: MINIMAX_MODELS.MINIMAX_M3,
    name: "MiniMax M3",
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
    id: NEX_AGI_MODELS.NEX_N2_PRO,
    name: "Nex N2 Pro",
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
    id: OPENAI_MODELS.GPT_5_5,
    name: "GPT-5.5",
    service: "openai",
    tasks: ["general", "reasoning", "coding", "agentic", "creative", "longContext"],
  },
  {
    id: OPENAI_MODELS.GPT_5_6_LUNA,
    name: "GPT-5.6 Luna",
    service: "openai",
    tasks: ["general", "vision", "chat", "bulk", "agentic"],
  },
  {
    id: GROQ_MODELS.GPT_OSS_120B,
    name: "GPT-OSS 120B",
    service: "groq",
    tasks: ["general", "reasoning", "agentic", "chat"],
  },
  {
    id: GROQ_MODELS.GPT_OSS_20B,
    name: "GPT-OSS 20B",
    service: "groq",
    tasks: ["general", "bulk", "chat"],
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
    id: QWEN_MODELS.QWEN_3_VL_235B_A22B,
    name: "Qwen3-VL 235B A22B Instruct",
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
    id: QWEN_MODELS.QWEN_3_7_PLUS,
    name: "Qwen3.7 Plus",
    service: "qwen",
    tasks: ["vision", "reasoning", "longContext"],
  },
  {
    id: STEPFUN_MODELS.STEP_3_7_FLASH,
    name: "Step 3.7 Flash",
    service: "stepfun",
    tasks: ["bulk", "chat"],
  },
  {
    id: XIAOMI_MODELS.MIMO_V2_5,
    name: "MiMo-V2.5",
    service: "xiaomi",
    tasks: ["bulk", "chat"],
  },
  {
    id: XIAOMI_MODELS.MIMO_V2_5_PRO,
    name: "MiMo-V2.5 Pro",
    service: "xiaomi",
    tasks: ["general", "longContext"],
  },
  {
    id: OLLAMA_MODELS.QWEN_3_6_35B,
    name: "Qwen 3.6 35B (local)",
    service: "ollama",
    tasks: ["general", "chat", "bulk", "longContext", "creative"],
  },
  {
    id: OLLAMA_MODELS.QWEN_3_CODER_30B,
    name: "Qwen 3 Coder 30B (local)",
    service: "ollama",
    tasks: ["coding", "agentic"],
  },
  {
    id: OLLAMA_MODELS.GPT_OSS_120B,
    name: "GPT-OSS 120B (local)",
    service: "ollama",
    tasks: ["reasoning", "creative"],
  },
  {
    id: OLLAMA_MODELS.GEMMA_4_31B,
    name: "Gemma 4 31B (local)",
    service: "ollama",
    tasks: ["vision"],
  },
] as const satisfies readonly LanguageModelCatalogEntry[];

// ── Voyage AI model constants ─────────────────────────────────────────
// Use these when overriding the embed/rerank slots in createAI().

/** Supported Voyage model IDs for embedding and reranking slots. */
export const VOYAGE_MODELS = {
  /** 1024d multimodal — stable text + image embeddings in the same vector space. */
  MULTIMODAL_3: "voyage-multimodal-3",
  /** 1024d multimodal — text + images in the same vector space. */
  MULTIMODAL_3_5: "voyage-multimodal-3.5",
  /** Standard reranker — best quality. */
  RERANK_2_5: "rerank-2.5",
  /** Lightweight reranker — faster, cheaper. */
  RERANK_2_5_LITE: "rerank-2.5-lite",
  /** 1024d text embeddings — best quality, asymmetric retrieval. */
  VOYAGE_3: "voyage-3",
  /** 1024d text embeddings — newer high-quality text embedding model. */
  VOYAGE_3_5: "voyage-3.5",
  /** 1024d text embeddings — newer fast + cheap text embedding model. */
  VOYAGE_3_5_LITE: "voyage-3.5-lite",
  /** 512d text embeddings — fast + cheap, good for high-volume. */
  VOYAGE_3_LITE: "voyage-3-lite",
  /** Current default text embeddings — Voyage 4 family, shared vector space. */
  VOYAGE_4: "voyage-4",
  /** Best-quality text embeddings — Voyage 4 MoE flagship. */
  VOYAGE_4_LARGE: "voyage-4-large",
  /** Fast + cheap Voyage 4 text embeddings. */
  VOYAGE_4_LITE: "voyage-4-lite",
  /** Smallest Voyage 4 text embeddings (open weights). */
  VOYAGE_4_NANO: "voyage-4-nano",
} as const;

// ── Google embedding model constants ──────────────────────────────────

/** Supported Google embedding model IDs for the embed and multimodalEmbed slots. */
export const GOOGLE_EMBED_MODELS = {
  /** Gemini Embedding 001 — stable release. */
  GEMINI_EMBEDDING_1: "gemini-embedding-001",
  /** Gemini Embedding 2 — Google's latest embedding model (GA). */
  GEMINI_EMBEDDING_2: "gemini-embedding-2",
} as const;

// ── OpenRouter embedding model constants ──────────────────────────────

/** Curated OpenRouter embedding model IDs. Limited to OpenAI and Gemini. */
export const OPENROUTER_EMBED_MODELS = {
  /** Stable Gemini text embedding model on OpenRouter. */
  GEMINI_EMBEDDING_1: "google/gemini-embedding-001",
  /** Latest Gemini embedding model on OpenRouter, including multimodal inputs. */
  GEMINI_EMBEDDING_2: "google/gemini-embedding-2-preview",
  /** Higher-quality OpenAI text embedding option when cost is less important. */
  OPENAI_TEXT_EMBEDDING_3_LARGE: "openai/text-embedding-3-large",
  /** Best default cost/quality pick among OpenAI and Gemini via OpenRouter. */
  OPENAI_TEXT_EMBEDDING_3_SMALL: "openai/text-embedding-3-small",
} as const;

// ── Default matrix ────────────────────────────────────────────────────

/** Default tier/capability model mapping used by `createAI()` when no override exists. */
export const DEFAULT_MODELS: ModelMatrix = {
  // ── Cost tiers ──────────────────────────────────────────────────────
  nano: {
    text: OPENAI_MODELS.GPT_5_4_NANO, // premium low-cost default
    tools: OPENAI_MODELS.GPT_5_4_NANO,
    vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
  },
  fast: {
    text: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE, // recognizable fast premium default
    tools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
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
    text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8, // current flagship Opus reasoning tier
    tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    vision: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    visionTools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
  },

  // ── Retrieval ────────────────────────────────────────────────────────
  embed: {
    gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
    ollama: OLLAMA_MODELS.QWEN_3_EMBEDDING_8B, // 4096d local text embeddings,
    openrouter: OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_SMALL,
    voyage: VOYAGE_MODELS.VOYAGE_4, // Voyage 4 text embeddings,
  },
  multimodalEmbed: {
    gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
    ollama: OLLAMA_MODELS.QWEN_3_EMBEDDING_8B, // text-only; image input throws,
    openrouter: OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_2,
    voyage: VOYAGE_MODELS.MULTIMODAL_3_5, // 1024d text + images in same space,
  },
  rerank: VOYAGE_MODELS.RERANK_2_5, // standard reranker (Voyage AI)
} as const;

/** OpenRouter-only free fallback. The backing model is intentionally router-managed. */
export const OPENROUTER_FREE_MODELS: Record<ModelTier, TierModelMatrix> = {
  fast: everyVariant(OPENROUTER_MODELS.FREE),
  nano: everyVariant(OPENROUTER_MODELS.FREE),
  powerful: everyVariant(OPENROUTER_MODELS.FREE),
  reasoning: everyVariant(OPENROUTER_MODELS.FREE),
  standard: everyVariant(OPENROUTER_MODELS.FREE),
} as const;

/** Workload-specific model choices layered over the general tier matrix. */
export const DEFAULT_TASK_MODELS: TaskModelMatrix = {
  agentic: {
    fast: {
      text: GLM_MODELS.GLM_4_7,
      tools: GLM_MODELS.GLM_4_7,
    },
    powerful: {
      text: KIMI_MODELS.KIMI_K2_7_CODE,
      tools: KIMI_MODELS.KIMI_K2_7_CODE,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  bulk: {
    fast: {
      text: GLM_MODELS.GLM_4_7_FLASH,
      tools: GLM_MODELS.GLM_4_7_FLASH,
    },
    nano: {
      text: OPENAI_MODELS.GPT_5_4_NANO,
      tools: OPENAI_MODELS.GPT_5_4_NANO,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  chat: {
    fast: {
      text: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    },
    nano: {
      text: OPENAI_MODELS.GPT_5_4_NANO,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  coding: {
    fast: {
      text: GLM_MODELS.GLM_4_7,
      tools: GLM_MODELS.GLM_4_7,
    },
    powerful: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    },
    reasoning: {
      text: KIMI_MODELS.KIMI_K2_THINKING,
      tools: KIMI_MODELS.KIMI_K2_THINKING,
    },
    standard: {
      text: OPENAI_MODELS.GPT_5_5,
      tools: OPENAI_MODELS.GPT_5_5,
    },
  },
  creative: {
    powerful: {
      text: OPENAI_MODELS.GPT_5_5,
    },
    standard: {
      text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    },
  },
  general: {},
  longContext: {
    powerful: {
      text: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      tools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    },
    standard: {
      text: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      tools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
  reasoning: {
    powerful: {
      text: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      tools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      text: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
      tools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    },
    standard: {
      text: KIMI_MODELS.KIMI_K2_THINKING,
      tools: KIMI_MODELS.KIMI_K2_THINKING,
    },
  },
  vision: {
    fast: {
      vision: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
      visionTools: GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
    },
    powerful: {
      vision: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
      visionTools: GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
    },
    reasoning: {
      vision: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
      visionTools: ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
    },
    standard: {
      vision: GOOGLE_MODELS.GEMINI_3_5_FLASH,
      visionTools: GOOGLE_MODELS.GEMINI_3_5_FLASH,
    },
  },
} as const;

/**
 * Cerebras tiers.
 *
 * Cerebras serves a small open-weight lineup and has no frontier model, so the
 * `powerful` and `reasoning` slots return the strongest thing it has rather
 * than something genuinely frontier-class. Requesting those tiers on this route
 * is a statement about latency, not about capability — see
 * ROUTE_STAKES_CEILING in ./taxonomy.
 *
 * Every vision variant routes to Gemma, the only multimodal model it serves.
 */
function splitCerebrasTiers(): Record<ModelTier, TierModelMatrix> {
  const text = splitVariantModels({
    text: CEREBRAS_MODELS.GPT_OSS_120B,
    vision: CEREBRAS_MODELS.GEMMA_4_31B,
  });
  const bulk = splitVariantModels({
    text: CEREBRAS_MODELS.QWEN_3_235B,
    vision: CEREBRAS_MODELS.GEMMA_4_31B,
  });
  return { fast: bulk, nano: bulk, powerful: text, reasoning: text, standard: text };
}

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
    visionTools: options.visionTools ?? options.vision ?? options.tools ?? options.text,
  };
}

/** Provider-aware language defaults used by ai.model(tier, { provider }). */
export const PROVIDER_DEFAULT_MODELS: ProviderLanguageModelMatrix = {
  anthropic: {
    fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
    reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
    standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
  },
  cerebras: splitCerebrasTiers(),
  deepseek: {
    fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    nano: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    reasoning: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
  },
  gateway: {
    fast: { ...DEFAULT_MODELS.fast },
    nano: { ...DEFAULT_MODELS.nano },
    powerful: { ...DEFAULT_MODELS.powerful },
    reasoning: { ...DEFAULT_MODELS.reasoning },
    standard: { ...DEFAULT_MODELS.standard },
  },
  google: {
    fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    nano: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE),
    powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    reasoning: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
  },
  groq: {
    fast: everyVariant(GROQ_MODELS.GPT_OSS_20B),
    nano: everyVariant(GROQ_MODELS.GPT_OSS_20B),
    powerful: everyVariant(GROQ_MODELS.GPT_OSS_120B),
    reasoning: everyVariant(GROQ_MODELS.GPT_OSS_120B),
    standard: everyVariant(GROQ_MODELS.GPT_OSS_120B),
  },
  moonshotai: {
    fast: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    nano: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    reasoning: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
  },
  ollama: {
    fast: splitVariantModels({
      text: OLLAMA_MODELS.QWEN_3_6_35B,
      vision: OLLAMA_MODELS.GEMMA_4_31B,
    }),
    nano: splitVariantModels({
      text: OLLAMA_MODELS.QWEN_3_CODER_30B,
      vision: OLLAMA_MODELS.GEMMA_4_31B,
    }),
    powerful: splitVariantModels({
      text: OLLAMA_MODELS.GPT_OSS_120B,
      vision: OLLAMA_MODELS.GEMMA_4_31B,
    }),
    reasoning: splitVariantModels({
      text: OLLAMA_MODELS.GPT_OSS_120B,
      vision: OLLAMA_MODELS.GEMMA_4_31B,
    }),
    standard: splitVariantModels({
      text: OLLAMA_MODELS.QWEN_3_6_35B,
      vision: OLLAMA_MODELS.GEMMA_4_31B,
    }),
  },
  openai: {
    fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
    reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
    standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
  },
  openrouter: {
    fast: { ...DEFAULT_MODELS.fast },
    nano: { ...DEFAULT_MODELS.nano },
    powerful: { ...DEFAULT_MODELS.powerful },
    reasoning: { ...DEFAULT_MODELS.reasoning },
    standard: { ...DEFAULT_MODELS.standard },
  },
  qwen: {
    fast: splitVariantModels({
      text: QWEN_MODELS.QWEN_3_VL_235B_A22B,
      vision: QWEN_MODELS.QWEN_3_7_PLUS,
    }),
    nano: splitVariantModels({
      text: QWEN_MODELS.QWEN_3_VL_235B_A22B,
      vision: QWEN_MODELS.QWEN_3_7_PLUS,
    }),
    powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    reasoning: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    standard: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
  },
  xai: {
    fast: everyVariant(XAI_MODELS.GROK_4_3),
    nano: everyVariant(XAI_MODELS.GROK_4_3),
    powerful: everyVariant(XAI_MODELS.GROK_4_3),
    reasoning: everyVariant(XAI_MODELS.GROK_4_3),
    standard: everyVariant(XAI_MODELS.GROK_4_3),
  },
  zai: {
    fast: splitVariantModels({
      text: GLM_MODELS.GLM_4_7,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    nano: splitVariantModels({
      text: GLM_MODELS.GLM_4_7_FLASH,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    powerful: splitVariantModels({
      text: GLM_MODELS.GLM_5_2,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    reasoning: splitVariantModels({
      text: GLM_MODELS.GLM_5_2,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
    standard: splitVariantModels({
      text: GLM_MODELS.GLM_4_7,
      vision: GLM_MODELS.GLM_5V_TURBO,
    }),
  },
} as const;

/** Provider-specific task choices used when a caller pins a single provider. */
export const PROVIDER_TASK_DEFAULT_MODELS: ProviderTaskModelMatrix = {
  anthropic: {
    agentic: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    },
    bulk: {
      fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
      nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    },
    chat: {
      fast: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
      nano: everyVariant(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5),
    },
    coding: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    },
    creative: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6),
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    },
    longContext: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    },
    reasoning: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
    },
    vision: {
      powerful: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      reasoning: everyVariant(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8),
      standard: everyVariant(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6),
    },
  },
  deepseek: {
    agentic: {
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    },
    bulk: {
      fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
    },
    chat: {
      fast: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    },
    coding: {
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    },
    creative: {
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO),
    },
    longContext: {
      powerful: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
      standard: everyVariant(DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH),
    },
  },
  google: {
    agentic: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    bulk: {
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE),
      nano: everyVariant(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE),
    },
    chat: {
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    coding: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    creative: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    longContext: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
    reasoning: {
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      reasoning: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
    },
    vision: {
      fast: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
      powerful: everyVariant(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW),
      standard: everyVariant(GOOGLE_MODELS.GEMINI_3_5_FLASH),
    },
  },
  groq: {
    agentic: {
      powerful: everyVariant(GROQ_MODELS.GPT_OSS_120B),
      standard: everyVariant(GROQ_MODELS.GPT_OSS_120B),
    },
    bulk: {
      fast: everyVariant(GROQ_MODELS.GPT_OSS_20B),
      nano: everyVariant(GROQ_MODELS.GPT_OSS_20B),
      standard: everyVariant(GROQ_MODELS.GPT_OSS_20B),
    },
    chat: {
      fast: everyVariant(GROQ_MODELS.GPT_OSS_20B),
      nano: everyVariant(GROQ_MODELS.GPT_OSS_20B),
      standard: everyVariant(GROQ_MODELS.GPT_OSS_120B),
    },
    reasoning: {
      powerful: everyVariant(GROQ_MODELS.GPT_OSS_120B),
      reasoning: everyVariant(GROQ_MODELS.GPT_OSS_120B),
      standard: everyVariant(GROQ_MODELS.GPT_OSS_120B),
    },
  },
  moonshotai: {
    agentic: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    bulk: {
      fast: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    chat: {
      fast: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    coding: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    creative: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_5),
    },
    longContext: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    reasoning: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
    },
    vision: {
      powerful: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      reasoning: everyVariant(KIMI_MODELS.KIMI_K2_7_CODE),
      standard: everyVariant(KIMI_MODELS.KIMI_K2_5),
    },
  },
  ollama: {
    agentic: {
      powerful: everyVariant(OLLAMA_MODELS.GPT_OSS_120B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_CODER_30B),
    },
    bulk: {
      fast: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
      nano: everyVariant(OLLAMA_MODELS.QWEN_3_CODER_30B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
    },
    coding: {
      fast: everyVariant(OLLAMA_MODELS.QWEN_3_CODER_30B),
      powerful: everyVariant(OLLAMA_MODELS.QWEN_3_CODER_30B),
      reasoning: everyVariant(OLLAMA_MODELS.GPT_OSS_120B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_CODER_30B),
    },
    creative: {
      powerful: everyVariant(OLLAMA_MODELS.GPT_OSS_120B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
    },
    longContext: {
      powerful: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
    },
    reasoning: {
      powerful: everyVariant(OLLAMA_MODELS.GPT_OSS_120B),
      reasoning: everyVariant(OLLAMA_MODELS.GPT_OSS_120B),
      standard: everyVariant(OLLAMA_MODELS.QWEN_3_6_35B),
    },
    vision: {
      powerful: everyVariant(OLLAMA_MODELS.GEMMA_4_31B),
      reasoning: everyVariant(OLLAMA_MODELS.GEMMA_4_31B),
      standard: everyVariant(OLLAMA_MODELS.GEMMA_4_31B),
    },
  },
  openai: {
    agentic: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      standard: everyVariant(OPENAI_MODELS.GPT_5_5),
    },
    bulk: {
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
    },
    chat: {
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      nano: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    },
    coding: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
      standard: everyVariant(OPENAI_MODELS.GPT_5_5),
    },
    creative: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    },
    longContext: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
    },
    reasoning: {
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
    },
    vision: {
      fast: everyVariant(OPENAI_MODELS.GPT_5_4_NANO),
      powerful: everyVariant(OPENAI_MODELS.GPT_5_5),
      reasoning: everyVariant(OPENAI_MODELS.GPT_5_5),
      standard: everyVariant(OPENAI_MODELS.GPT_5_4_MINI),
    },
  },
  qwen: {
    agentic: {
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    },
    bulk: {
      fast: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
      nano: everyVariant(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE),
      standard: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
    },
    chat: {
      fast: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
      nano: everyVariant(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE),
    },
    coding: {
      fast: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
    },
    creative: {
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_VL_235B_A22B),
    },
    longContext: {
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    },
    reasoning: {
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      reasoning: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    },
    vision: {
      powerful: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
      standard: everyVariant(QWEN_MODELS.QWEN_3_7_PLUS),
    },
  },
  xai: {
    agentic: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    bulk: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    chat: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    coding: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    creative: {
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    longContext: {
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
    reasoning: {
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      reasoning: everyVariant(XAI_MODELS.GROK_4_3),
    },
    vision: {
      fast: everyVariant(XAI_MODELS.GROK_4_3),
      powerful: everyVariant(XAI_MODELS.GROK_4_3),
      standard: everyVariant(XAI_MODELS.GROK_4_3),
    },
  },
  zai: {
    agentic: {
      powerful: everyVariant(GLM_MODELS.GLM_5_2),
      standard: everyVariant(GLM_MODELS.GLM_5_2),
    },
    bulk: {
      fast: everyVariant(GLM_MODELS.GLM_4_7_FLASH),
      nano: everyVariant(GLM_MODELS.GLM_4_7_FLASH),
    },
    chat: {
      fast: everyVariant(GLM_MODELS.GLM_4_7),
      standard: everyVariant(GLM_MODELS.GLM_4_7),
    },
    coding: {
      powerful: everyVariant(GLM_MODELS.GLM_5_2),
      standard: everyVariant(GLM_MODELS.GLM_5_2),
    },
    creative: {
      powerful: everyVariant(GLM_MODELS.GLM_5_2),
      standard: everyVariant(GLM_MODELS.GLM_4_7),
    },
    longContext: {
      powerful: everyVariant(GLM_MODELS.GLM_5_2),
      standard: everyVariant(GLM_MODELS.GLM_5_2),
    },
    reasoning: {
      powerful: everyVariant(GLM_MODELS.GLM_5_2),
      reasoning: everyVariant(GLM_MODELS.GLM_5_2),
      standard: everyVariant(GLM_MODELS.GLM_5_2),
    },
    vision: {
      fast: everyVariant(GLM_MODELS.GLM_5V_TURBO),
      powerful: everyVariant(GLM_MODELS.GLM_5V_TURBO),
      standard: everyVariant(GLM_MODELS.GLM_5V_TURBO),
    },
  },
} as const;

/** Capability requirements associated with each model variant. */
export const LANGUAGE_MODEL_CAPABILITIES: Record<LanguageModelVariant, LanguageModelCapabilities> =
  {
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

const LANGUAGE_MODEL_FEATURES: Record<string, { tools: boolean; vision: boolean }> =
  Object.fromEntries(
    LANGUAGE_MODEL_CATALOG.map((model) => [
      model.id,
      {
        tools: true,
        vision: new Set<string>([
          ANTHROPIC_MODELS.CLAUDE_FABLE_5,
          ANTHROPIC_MODELS.CLAUDE_OPUS_4_8,
          ANTHROPIC_MODELS.CLAUDE_OPUS_4_7,
          ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
          ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
          ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5,
          GLM_MODELS.GLM_5V_TURBO,
          GLM_MODELS.GLM_5_3_FLASH,
          GLM_MODELS.GLM_4_6V,
          GOOGLE_MODELS.GEMINI_3_5_FLASH,
          GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW,
          GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW,
          GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE,
          KIMI_MODELS.KIMI_K2_7_CODE,
          KIMI_MODELS.KIMI_K2_5,
          OPENAI_MODELS.GPT_5_4_NANO,
          OPENAI_MODELS.GPT_5_4_MINI,
          OPENAI_MODELS.GPT_5_5,
          OPENAI_MODELS.GPT_5_6_LUNA,
          OPENROUTER_MODELS.FREE,
          XAI_MODELS.GROK_4_3,
          QWEN_MODELS.QWEN_3_7_PLUS,
          OLLAMA_MODELS.GEMMA_4_31B,
          OLLAMA_MODELS.QWEN_3_6_35B,
        ]).has(model.id),
      },
    ]),
  );

/** Return known runtime capabilities for a catalogued language model. */
export function getLanguageModelCapabilities(
  modelId: string,
): LanguageModelCapabilities | undefined {
  const features = LANGUAGE_MODEL_FEATURES[modelId];
  if (!features) {
    return undefined;
  }
  return {
    structured: true,
    tools: features.tools,
    vision: features.vision,
  };
}

/** Throw when a selected model cannot satisfy a requested capability variant. */
export function assertLanguageModelCompatible(
  modelId: string,
  variant: LanguageModelVariant,
): void {
  const capabilities = getLanguageModelCapabilities(modelId);
  if (!capabilities) {
    return;
  }

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

/** Resolve tool and vision booleans into the package's model variant key. */
export function resolveLanguageModelVariant(options?: {
  tools?: boolean;
  vision?: boolean;
}): LanguageModelVariant {
  if (options?.tools && options?.vision) {
    return "visionTools";
  }
  if (options?.tools) {
    return "tools";
  }
  if (options?.vision) {
    return "vision";
  }
  return "text";
}

/**
 * Resolve the concrete model ID to use for a tier, variant, provider, and task.
 *
 * This keeps provider-pinned requests on provider-native defaults whenever the
 * global task model cannot be routed through the requested provider.
 */
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

  const providerTaskModelId = PROVIDER_TASK_DEFAULT_MODELS[provider]?.[task]?.[tier]?.[variant];
  if (providerTaskModelId && canRouteModelToProvider(providerTaskModelId, provider)) {
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

/** Return the managed OpenRouter free-router model ID for a tier and variant. */
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
  if (!override) {
    return { ...defaults };
  }
  return { ...defaults, ...override };
}

function resolveTierModels(tier: ModelTier, overrides?: Partial<TierModelMatrix>): TierModelMatrix {
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
    embed: resolveEmbeddingSlot(DEFAULT_MODELS.embed, overrides?.embed),
    fast: resolveTierModels("fast", overrides?.fast),
    multimodalEmbed: resolveEmbeddingSlot(
      DEFAULT_MODELS.multimodalEmbed,
      overrides?.multimodalEmbed,
    ),
    nano: resolveTierModels("nano", overrides?.nano),
    powerful: resolveTierModels("powerful", overrides?.powerful),
    reasoning: resolveTierModels("reasoning", overrides?.reasoning),
    rerank: overrides?.rerank ?? DEFAULT_MODELS.rerank,
    standard: resolveTierModels("standard", overrides?.standard),
  };
}

function mergeTaskTierModels(
  defaults: TaskModelMatrix[ModelTask][ModelTier] | undefined,
  overrides: TaskModelMatrix[ModelTask][ModelTier] | undefined,
): Partial<TierModelMatrix> | undefined {
  if (!defaults && !overrides) {
    return undefined;
  }
  return {
    ...defaults,
    ...overrides,
  };
}

/** Merge task-specific model overrides with default workload choices. */
export function resolveTaskModels(overrides?: ModelOverrides["tasks"]): TaskModelMatrix {
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
  deepseek: "deepseek",
  google: "google",
  groq: "groq",
  moonshotai: "moonshotai",
  openai: "openai",
  qwen: "qwen",
  "x-ai": "xai",
  xai: "xai",
  "z-ai": "zai",
  zai: "zai",
};

const DIRECT_PROVIDER_PREFIXES: Record<string, ProviderRoute> = {
  anthropic: "anthropic",
  deepseek: "deepseek",
  google: "google",
  groq: "groq",
  moonshotai: "moonshotai",
  openai: "openai",
  qwen: "qwen",
  "x-ai": "xai",
  xai: "xai",
  "z-ai": "zai",
  zai: "zai",
};

/** Environment variable names used to configure direct model services. */
export const MODEL_SERVICE_ENV_VARS: Partial<Record<ModelService, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  google: "GOOGLE_GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  moonshotai: "MOONSHOT_API_KEY",
  ollama: "OLLAMA_BASE_URL",
  openai: "OPENAI_API_KEY",
  qwen: "QWEN_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
} as const;

const MODEL_SERVICE_PREFIXES: Record<string, ModelService> = {
  anthropic: "anthropic",
  deepseek: "deepseek",
  google: "google",
  groq: "groq",
  inception: "inception",
  minimax: "minimax",
  moonshotai: "moonshotai",
  "nex-agi": "nexagi",
  nexagi: "nexagi",
  openai: "openai",
  qwen: "qwen",
  stepfun: "stepfun",
  "x-ai": "xai",
  xai: "xai",
  xiaomi: "xiaomi",
  "z-ai": "zai",
  zai: "zai",
} as const;

const PROVIDER_MODEL_IDS: Record<string, Partial<Record<ProviderRoute, string>>> = {
  "anthropic/claude-haiku-4-5-20251001": {
    anthropic: "claude-haiku-4-5-20251001",
    gateway: "anthropic/claude-haiku-4.5",
    openrouter: "anthropic/claude-haiku-4.5",
  },
  "anthropic/claude-haiku-4.5": {
    anthropic: "claude-haiku-4-5-20251001",
  },
  "anthropic/claude-opus-4-6": {
    anthropic: "claude-opus-4-6",
    gateway: "anthropic/claude-opus-4.6",
    openrouter: "anthropic/claude-opus-4.6",
  },
  "anthropic/claude-opus-4.6": {
    anthropic: "claude-opus-4-6",
  },
  "anthropic/claude-opus-4.7": {
    anthropic: "claude-opus-4-7",
  },
  "anthropic/claude-opus-4.8": {
    anthropic: "claude-opus-4-8",
  },
  "anthropic/claude-sonnet-4-6": {
    anthropic: "claude-sonnet-4-6",
    gateway: "anthropic/claude-sonnet-4.6",
    openrouter: "anthropic/claude-sonnet-4.6",
  },
  "anthropic/claude-sonnet-4.6": {
    anthropic: "claude-sonnet-4-6",
  },
  "google/gemini-3-flash": {
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
    openrouter: "google/gemini-3-flash-preview",
  },
  "google/gemini-3-flash-preview": {
    gateway: "google/gemini-3-flash",
    google: "gemini-3-flash-preview",
  },
  "google/gemini-3.1-flash-lite": {
    gateway: "google/gemini-3.1-flash-lite",
    google: "gemini-3.1-flash-lite",
    openrouter: "google/gemini-3.1-flash-lite",
  },
  "google/gemini-3.1-flash-lite-preview": {
    gateway: "google/gemini-3.1-flash-lite",
    google: "gemini-3.1-flash-lite",
  },
  "google/gemini-3.1-pro": {
    gateway: "google/gemini-3.1-pro-preview",
    google: "gemini-3.1-pro-preview",
    openrouter: "google/gemini-3.1-pro-preview",
  },
  "google/gemini-3.1-pro-preview": {
    gateway: "google/gemini-3.1-pro-preview",
    google: "gemini-3.1-pro-preview",
  },
  "google/gemini-3.5-flash": {
    google: "gemini-3.5-flash",
  },
  "openai/gpt-oss-120b": {
    cerebras: "gpt-oss-120b",
    groq: "openai/gpt-oss-120b",
  },
  "openai/gpt-oss-20b": {
    groq: "openai/gpt-oss-20b",
  },
  "qwen/qwen3-235b-a22b-2507": {
    cerebras: "qwen-3-235b-a22b-instruct",
  },
  "qwen/qwen3-vl-235b-a22b-instruct": {
    gateway: "alibaba/qwen3-vl-235b-a22b-instruct",
  },
  "qwen/qwen3.7-plus": {
    gateway: "alibaba/qwen3.7-plus",
  },
  "x-ai/grok-4.3": {
    gateway: "xai/grok-4.3",
    xai: "grok-4.3",
  },
  "z-ai/glm-4.6v": {
    gateway: "zai/glm-4.6v",
  },
  "z-ai/glm-4.7": {
    gateway: "zai/glm-4.7",
  },
  "z-ai/glm-4.7-flash": {
    gateway: "zai/glm-4.7-flash",
  },
  "z-ai/glm-5.2": {
    gateway: "zai/glm-5.2",
  },
  "z-ai/glm-5.3-flash": {
    gateway: "zai/glm-5.3-flash",
  },
  "z-ai/glm-5v-turbo": {
    gateway: "zai/glm-5v-turbo",
  },
};

/**
 * Models the Gateway does not serve.
 *
 * Verified against the live Gateway catalogue on 2026-08-16 with
 * `ai compare`. Five entries were removed as wrong on that date — Gateway
 * serves Fable 5, both GPT-OSS sizes, Qwen3-VL 235B and Step 3.7 Flash — so
 * re-verify rather than extend this list from memory.
 *
 * The `:free` Qwen model stays listed even though Gateway serves the paid
 * model behind it: ":free" is an OpenRouter tier, and resolving it to a billed
 * Gateway route would turn a free call into a charged one silently. Ollama
 * models are local and have no Gateway route by definition.
 */
const GATEWAY_UNAVAILABLE_MODEL_IDS = new Set<string>([
  GLM_MODELS.GLM_5_3_FLASH,
  NEX_AGI_MODELS.NEX_N2_PRO,
  OLLAMA_MODELS.GEMMA_4_31B,
  OLLAMA_MODELS.GPT_OSS_120B,
  OLLAMA_MODELS.QWEN_3_6_35B,
  OLLAMA_MODELS.QWEN_3_CODER_30B,
  OPENROUTER_MODELS.FREE,
  OPENAI_MODELS.GPT_5_6_LUNA,
  QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE,
]);

/** Request configuration fields supported by each provider route. */
export const PROVIDER_CONFIG_CAPABILITIES = Object.fromEntries(
  PROVIDER_DEFINITIONS.map(({ capabilities, id }) => [id, capabilities]),
) as Record<ProviderRoute, ProviderConfigCapabilities>;

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
  if (slash === -1) {
    return undefined;
  }
  const prefix = openRouterId.slice(0, slash);
  return PROVIDER_PREFIXES[prefix];
}

/** Infer the underlying model service/author from a provider-prefixed model ID. */
export function inferModelService(modelId: string): ModelService | undefined {
  const slash = modelId.indexOf("/");
  if (slash === -1) {
    return undefined;
  }
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
      `Model "${openRouterId}" cannot be used with provider "${requestedProvider}". ${
        modelProvider
          ? `It belongs to "${modelProvider}".`
          : "Only OpenRouter can route this model."
      }`,
    );
  }
}

/**
 * Resolve a canonical OpenRouter-style model ID to the provider-specific ID
 * expected by the selected route.
 */
export function resolveProviderModelId(modelId: string, provider: ProviderRoute): string {
  const mapped = PROVIDER_MODEL_IDS[modelId]?.[provider];
  if (mapped) {
    return mapped;
  }

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
export function canRouteModelToProvider(modelId: string, provider: ProviderRoute): boolean {
  if (provider === "openrouter") {
    return true;
  }
  if (provider === "gateway") {
    return !GATEWAY_UNAVAILABLE_MODEL_IDS.has(modelId);
  }
  if (PROVIDER_MODEL_IDS[modelId]?.[provider]) {
    return true;
  }
  if (!modelId.includes("/")) {
    return true;
  }

  const prefix = modelId.slice(0, modelId.indexOf("/"));
  return DIRECT_PROVIDER_PREFIXES[prefix] === provider;
}
