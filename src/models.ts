/**
 * Default model matrix — the "best 10" for each slot.
 *
 * These defaults are static and opinionated, chosen from actual usage
 * across 40+ projects. Override any slot via createAI({ models: {...} }).
 */

import type { ModelMatrix } from "./types";

// ── Voyage AI model constants ─────────────────────────────────────────
// Use these when overriding the embed/rerank slots in createAI().

export const VOYAGE_MODELS = {
  /** 1024d text embeddings — best quality, asymmetric retrieval. */
  VOYAGE_3: "voyage-3",
  /** 512d text embeddings — fast + cheap, good for high-volume. */
  VOYAGE_3_LITE: "voyage-3-lite",
  /** 1024d multimodal — text + images in the same vector space. */
  MULTIMODAL_3_5: "voyage-multimodal-3.5",
  /** Standard reranker — best quality. */
  RERANK_2_5: "rerank-2.5",
  /** Lightweight reranker — faster, cheaper. */
  RERANK_2_5_LITE: "rerank-2.5-lite",
} as const;

// ── Google embedding model constants ──────────────────────────────────

export const GOOGLE_EMBED_MODELS = {
  /** Gemini Embedding 2 preview — Google's latest embedding model. */
  GEMINI_EMBEDDING_2: "gemini-embedding-2-preview",
  /** Gemini Embedding 001 — stable release. */
  GEMINI_EMBEDDING_1: "gemini-embedding-001",
} as const;

// ── Default matrix ────────────────────────────────────────────────────

export const DEFAULT_MODELS: ModelMatrix = {
  // ── Cost tiers ──────────────────────────────────────────────────────
  nano: "google/gemini-2.5-flash-lite", // $0.075/$0.30 — reliable JSON, 1M context
  fast: "deepseek/deepseek-v3.2", // $0.14/$0.28 — excellent tool calling, fast
  standard: "google/gemini-2.5-flash", // $0.30/$2.50 — built-in thinking, 1M context
  powerful: "anthropic/claude-sonnet-4-6", // $3/$15 — complex reasoning, coding
  reasoning: "anthropic/claude-opus-4-6", // $15/$75 — frontier quality

  // ── Specialties ─────────────────────────────────────────────────────
  tools: "deepseek/deepseek-v3.2", // $0.14/$0.28 — best tool-calling value
  vision: "qwen/qwen2.5-vl-72b-instruct", // best bounding box grounding (0-1000 format)

  // ── Retrieval ────────────────────────────────────────────────────────
  embed: VOYAGE_MODELS.VOYAGE_3, // 1024d text embeddings (Voyage AI)
  multimodalEmbed: VOYAGE_MODELS.MULTIMODAL_3_5, // 1024d text + images in same space (Voyage AI)
  googleEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2, // Gemini Embedding 2 (Google)
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
