/**
 * @howells/ai — Unified AI client for all projects.
 *
 * One package, provider-aware model tiers and retrieval models.
 *
 * @example
 * ```ts
 * import { createAI } from "@howells/ai";
 * import { generateText, Output, streamText, embed } from "ai";
 *
 * const ai = createAI({
 *   app: { name: "MyApp", url: "https://myapp.com" },
 * });
 *
 * // Pick a model by tier
 * await generateText({ model: ai.model("fast"), prompt: "..." });
 *
 * // Override a tier variant for this project
 * const ai = createAI({
 *   models: { standard: { text: "anthropic/claude-sonnet-4.6" } },
 * });
 *
 * // Embed text
 * const { embedding } = await embed({
 *   model: ai.embeddingModel(),
 *   value: "hello",
 * });
 * ```
 */

export type { AIClient } from "./client";
export type { EmbeddingModel, LanguageModel, ToolSet, UIMessage } from "ai";
export {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  embed,
  embedMany,
  generateText,
  Output,
  rerank,
  stepCountIs,
  streamObject,
  streamText,
  tool,
} from "ai";
// Client factory
export { createAI } from "./client";

// Default model matrix and provider constants
export {
  ANTHROPIC_MODELS,
  canRouteModelToProvider,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  inferProvider,
  LANGUAGE_MODEL_CAPABILITIES,
  OPENAI_MODELS,
  PROVIDER_CONFIG_CAPABILITIES,
  QWEN_MODELS,
  resolveModels,
  resolveLanguageModelVariant,
  resolveProviderModelId,
  toDirectModelId,
  VOYAGE_MODELS,
  XAI_MODELS,
} from "./models";

// Types
export type {
  AIConfig,
  AppConfig,
  EmbeddingInputKind,
  EmbeddingModelSlot,
  EmbeddingModelOptions,
  EmbeddingProviderRoute,
  EmbeddingProviderModels,
  LanguageModelCapabilities,
  LanguageModelVariant,
  ModelMatrix,
  ModelOptions,
  ModelOverrides,
  ModelSlot,
  ModelTier,
  ProviderConfigCapabilities,
  ProviderModelConfig,
  ProviderRoute,
  TierModelMatrix,
} from "./types";
