/**
 * @howells/routerbase-ai — Unified AI client for all projects.
 *
 * One package, 11 configurable model slots, three providers (OpenRouter + Voyage + Google).
 *
 * @example
 * ```ts
 * import { createAI } from "@howells/routerbase-ai";
 * import { generateText, generateObject, streamText, embed } from "ai";
 *
 * const ai = createAI({
 *   app: { name: "MyApp", url: "https://myapp.com" },
 * });
 *
 * // Pick a model by slot
 * await generateText({ model: ai.model("fast"), prompt: "..." });
 *
 * // Override a slot for this project
 * const ai = createAI({
 *   models: { standard: "anthropic/claude-sonnet-4-6" },
 * });
 *
 * // Embed text
 * const { embedding } = await embed({ model: ai.embedModel(), value: "hello" });
 * ```
 */

export type { AIClient } from "./client";
// Client factory
export { createAI } from "./client";

// Default model matrix and provider constants
export {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  inferProvider,
  OPENAI_MODELS,
  QWEN_MODELS,
  resolveModels,
  toDirectModelId,
  VOYAGE_MODELS,
  XAI_MODELS,
} from "./models";

// Types
export type {
  AIConfig,
  AppConfig,
  LanguageModelSlot,
  ModelMatrix,
  ModelOptions,
  ModelSlot,
  OpenRouterModelConfig,
  OpenRouterRequestConfig,
  ProviderRoute,
} from "./types";
