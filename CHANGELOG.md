# Changelog

## 1.0.0

`@howells/ai` is now a lookup: which model does each job, and with what request settings. It no longer wraps the AI SDK or creates clients. Call OpenRouter through your own AI SDK or Mastra setup and pass it the pick.

### Added

- `models`: a frozen object of OpenRouter Model IDs, one per job: `agent`, `extract`, `judge`, `vision`, `triage`, `write`, `reason`, `embed`.
- `settings`: the request settings measured with each pick, in OpenRouter's request vocabulary. `extract` sends `reasoning: { enabled: false }`; `vision` sends `reasoning: { effort: "low" }`; the rest are empty.
- Types `Job`, `ModelId`, `RequestSettings`, `Reasoning`, `ReasoningEffort`.
- `@howells/ai/bench` measures latency through OpenRouter, one upstream provider per route: `benchRoute`, `benchCompare`, `summarise`, `DEFAULT_BENCH_PROMPT`, `DEFAULT_ROUTE` and their types.

### Changed

- The root entry has no runtime dependencies and imports nothing.
- The `howells-ai` command keeps `models` and `bench`, both calling OpenRouter directly.
- `@howells/ai/bench` has a new signature: it takes an OpenRouter key and provider slugs instead of an AI client and provider routes.
- Tests run on Vitest.

### Removed

Every export not listed above is gone.

- The `ai` bin alias. Use `howells-ai`.
- CLI commands `providers`, `doctor`, `test`, `catalog`, `compare` and `audit`.
- Subpaths `./react`, `./server`, `./models`, `./catalog`, `./eval`, `./decisions` and `./taxonomy`.
- The client: `createAI`, `AIClient`, `resolveGenerationOptions`, `createAIServer`, `AIServerClient`, `createAIModelBridge`, `AIModelBridge`, `AIModelBridgeOptions`, `MastraModelConfigShape`, `ModelCostProfile`, `ProviderModelConnection`, `GatewayIntrospection`.
- Re-exports of `ai`: `convertToModelMessages`, `createUIMessageStream`, `createUIMessageStreamResponse`, `embed`, `embedMany`, `generateText`, `isStepCount`, `Output`, `rerank`, `streamObject`, `streamText`, `tool`, and types `EmbeddingModel`, `LanguageModel`, `ToolSet`, `UIMessage`.
- Re-exports from `./react`: `useChat`, `useCompletion`, `DefaultChatTransport`, and types `UseChatHelpers`, `UseChatOptions`, `UseCompletionHelpers`, `UseCompletionOptions`, `ChatTransport`, `CreateUIMessage`, `HttpChatTransportInitOptions`, `UIMessage`.
- Vision helpers: `imagePart`, `visionMessage`, `visionPrompt`, and types `VisionImageData`, `VisionInput`, `VisionPrompt`.
- Provider routes: `PROVIDER_DEFINITION_BY_ID`, `PROVIDER_DEFINITIONS`, `PROVIDER_ROUTES`, `isProviderRoute`, covering Gateway, OpenRouter, the direct providers, Ollama and Voyage.
- Model catalogues and resolvers: `ANTHROPIC_MODELS`, `CEREBRAS_MODELS`, `DEEPSEEK_MODELS`, `GLM_MODELS`, `GOOGLE_EMBED_MODELS`, `GOOGLE_MODELS`, `GROQ_MODELS`, `INCEPTION_MODELS`, `KIMI_MODELS`, `MINIMAX_MODELS`, `NEX_AGI_MODELS`, `OLLAMA_MODELS`, `OPENAI_MODELS`, `OPENROUTER_EMBED_MODELS`, `OPENROUTER_FREE_MODELS`, `OPENROUTER_MODELS`, `QWEN_MODELS`, `STEPFUN_MODELS`, `VOYAGE_MODELS`, `XAI_MODELS`, `XIAOMI_MODELS`, `DEFAULT_MODELS`, `DEFAULT_TASK_MODELS`, `PROVIDER_DEFAULT_MODELS`, `PROVIDER_TASK_DEFAULT_MODELS`, `LANGUAGE_MODEL_CATALOG`, `LANGUAGE_MODEL_CAPABILITIES`, `LANGUAGE_MODEL_TASKS`, `LANGUAGE_MODEL_VARIANTS`, `MODEL_SERVICE_ENV_VARS`, `MODEL_TIERS`, `PROVIDER_CONFIG_CAPABILITIES`, `assertLanguageModelCompatible`, `canRouteModelToProvider`, `getLanguageModelCapabilities`, `inferModelService`, `inferProvider`, `resolveLanguageModelVariant`, `resolveModels`, `resolveOpenRouterFreeModelId`, `resolveProviderLanguageModelId`, `resolveProviderModelId`, `resolveTaskModels`, `toDirectModelId`, `validateProviderMatch`.
- Types from the client and matrix: `AIConfig`, `AppConfig`, `CacheTTL`, `Creativity`, `EmbeddingInputKind`, `EmbeddingModelOptions`, `EmbeddingModelSlot`, `EmbeddingProviderModels`, `EmbeddingProviderRoute`, `GenerationOptions`, `GenerationProviderOptions`, `LanguageModelCapabilities`, `LanguageModelCatalogEntry`, `LanguageModelVariant`, `ModelMatrix`, `ModelOptions`, `ModelOverrides`, `ModelService`, `ModelSlot`, `ModelTask`, `ModelTier`, `OpenRouterModelVariant`, `OpenRouterPolicy`, `OutputLength`, `OutputVerbosity`, `PrivacyConstraint`, `PromptCachePolicy`, `ProviderConfigCapabilities`, `ProviderLanguageModelMatrix`, `ProviderModelDescriptor`, `ProviderRoute`, `Quantization`, `ReasoningSpec`, `ResolvedGenerationOptions`, `ResponseCachePolicy`, `RoutePreference`, `RoutingMaxCost`, `RoutingOptions`, `ServiceTier`, `StructuredOutputMode`, `TaskModelMatrix`, `TierModelMatrix`, `ToolPolicy`, `WebSearchEngine`, `WebSearchOptions`. `ReasoningEffort` survives with OpenRouter's values.
- Router catalogues (`./catalog`): `CATALOG_ROUTERS`, `DIRECT_ONLY_ROUTES`, `bestDiscountedEndpoint`, `compareModel`, `discountedModels`, `fetchGatewayCatalog`, `fetchOpenRouterCatalog`, `isCatalogRouter`, `resolveCatalogId`, `worstCaseContextLength`, and types `CatalogEntry`, `CatalogFetchOptions`, `CatalogRouteComparison`, `CatalogRouter`, `ModelComparison`, `ModelPrice`, `OpenRouterCatalogOptions`, `OpenRouterEndpoint`, `RouterCatalog`.
- Evals (`./eval`): `containsGrader`, `evalCompare`, `exactMatchGrader`, `jsonShapeGrader`, `keywordGrader`, `runEval`, and types `EvalCandidate`, `EvalCase`, `EvalCompareOptions`, `EvalComparison`, `EvalRanking`, `EvalRunOptions`, `EvalRunResult`, `EvalCaseResult`, `EvalSuite`, `Grader`, `Score`.
- Decisions (`./decisions`): `MODEL_DECISION_SET`, `resolveDecision`, and types `DecisionEvidence`, `ModelDecisionSet`, `ResolvedDecision`.
- Taxonomy (`./taxonomy`): `DEFAULT_QUANTIZATION_FLOOR`, `LATENCY_CLASSES`, `MODALITIES`, `OUTPUT_CONTRACTS`, `ROLE_SIGNALS`, `ROUTE_STAKES_CEILING`, `STAKES`, `WORKLOAD_ROLE_NAMES`, `WORKLOAD_ROLES`, `classifyRole`, `exceedsStakesCeiling`, `preferenceForWorkload`, `profileForRole`, `rankingMetric`, `routingForWorkload`, and types `LatencyClass`, `Modality`, `OutputContract`, `Stakes`, `WorkloadProfile`, `WorkloadRole`, `WorkloadRouting`.
- The fleet audit behind `howells-ai audit`.
- Dependencies `ai`, `@ai-sdk/anthropic`, `@ai-sdk/gateway`, `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/react`, `@openrouter/ai-sdk-provider` and `voyage-ai-provider`, and the `typescript` peer dependency.
- The benchmark web app (`apps/benchmark`), which was built on the removed client.
