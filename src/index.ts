/**
 * Howells AI unified client for all projects.
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
export {
  PROVIDER_DEFINITION_BY_ID,
  PROVIDER_DEFINITIONS,
  PROVIDER_ROUTES,
  isProviderRoute,
} from "./providers/registry";

// Generation config resolver
export { resolveGenerationOptions } from "./generation";
export { imagePart, visionMessage, visionPrompt } from "./vision";

// Default model matrix and provider constants
export {
  ANTHROPIC_MODELS,
  assertLanguageModelCompatible,
  canRouteModelToProvider,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  DEFAULT_TASK_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  GLM_MODELS,
  GROQ_MODELS,
  getLanguageModelCapabilities,
  inferModelService,
  inferProvider,
  INCEPTION_MODELS,
  KIMI_MODELS,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_CAPABILITIES,
  LANGUAGE_MODEL_TASKS,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_SERVICE_ENV_VARS,
  MODEL_TIERS,
  MINIMAX_MODELS,
  NEX_AGI_MODELS,
  OLLAMA_MODELS,
  OPENAI_MODELS,
  OPENROUTER_EMBED_MODELS,
  OPENROUTER_FREE_MODELS,
  OPENROUTER_MODELS,
  PROVIDER_CONFIG_CAPABILITIES,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_TASK_DEFAULT_MODELS,
  QWEN_MODELS,
  resolveModels,
  resolveLanguageModelVariant,
  resolveOpenRouterFreeModelId,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
  resolveTaskModels,
  STEPFUN_MODELS,
  toDirectModelId,
  VOYAGE_MODELS,
  XAI_MODELS,
  XIAOMI_MODELS,
} from "./models";

// Types
export type {
  AIConfig,
  AppConfig,
  CacheTTL,
  Creativity,
  EmbeddingInputKind,
  EmbeddingModelOptions,
  EmbeddingModelSlot,
  EmbeddingProviderModels,
  EmbeddingProviderRoute,
  GenerationOptions,
  GenerationProviderOptions,
  LanguageModelCapabilities,
  LanguageModelCatalogEntry,
  LanguageModelVariant,
  ModelMatrix,
  ModelOptions,
  ModelOverrides,
  OpenRouterModelVariant,
  ModelService,
  ModelSlot,
  ModelTask,
  ModelTier,
  OutputLength,
  OutputVerbosity,
  PrivacyConstraint,
  PromptCachePolicy,
  ProviderConfigCapabilities,
  ProviderLanguageModelMatrix,
  ProviderModelDescriptor,
  ProviderRoute,
  Quantization,
  ReasoningEffort,
  ReasoningSpec,
  ResolvedGenerationOptions,
  RoutePreference,
  RoutingMaxCost,
  RoutingOptions,
  ServiceTier,
  StructuredOutputMode,
  TaskModelMatrix,
  TierModelMatrix,
  ToolPolicy,
  WebSearchEngine,
  WebSearchOptions,
} from "./types";
export type { VisionImageData, VisionInput, VisionPrompt } from "./vision";

export type { GatewayIntrospection } from "./providers/gateway";
