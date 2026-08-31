/**
 * Howells AI provider-aware generation option resolver.
 *
 * The public API stays provider-neutral while this module maps the knobs each
 * provider actually understands into AI SDK providerOptions.
 */

import { isStepCount } from "ai";
import { inferProvider } from "./models";
import type {
  CacheTTL,
  GenerationOptions,
  GenerationProviderOptions,
  OutputLength,
  PromptCachePolicy,
  ProviderRoute,
  ReasoningEffort,
  ReasoningSpec,
  ResolvedGenerationOptions,
  RoutingMaxCost,
  RoutingOptions,
  ServiceTier,
  WebSearchOptions,
} from "./types";

type ProviderOptionValue = GenerationProviderOptions[string][string];

interface NormalizedCache {
  enabled: boolean;
  ttl?: CacheTTL;
}

function resolveOpenRouterResponseCacheHeaders(
  options: GenerationOptions,
): Record<string, string> | undefined {
  if (options.provider !== "openrouter" || options.responseCache === undefined) {
    return undefined;
  }
  if (options.responseCache === "off") {
    return { "X-OpenRouter-Cache": "false" };
  }

  const headers: Record<string, string> = { "X-OpenRouter-Cache": "true" };
  const ttlSeconds =
    options.responseCache === "5m"
      ? 300
      : options.responseCache === "1h"
        ? 3600
        : options.responseCache.ttlSeconds;
  if (ttlSeconds !== undefined) {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) {
      throw new Error("OpenRouter response-cache TTL must be an integer from 1 to 86400 seconds.");
    }
    headers["X-OpenRouter-Cache-TTL"] = String(ttlSeconds);
  }
  if (typeof options.responseCache === "object" && options.responseCache.clear) {
    headers["X-OpenRouter-Cache-Clear"] = "true";
  }
  return headers;
}

function normalizeCache(cache: PromptCachePolicy | undefined): NormalizedCache | undefined {
  if (cache === undefined) {
    return undefined;
  }
  if (cache === "off") {
    return { enabled: false };
  }
  if (cache === "ephemeral") {
    return { enabled: true };
  }
  if (typeof cache === "object") {
    return { enabled: true, ttl: cache.ttl };
  }
  return undefined;
}

function normalizeReasoning(
  reasoning: ReasoningEffort | ReasoningSpec | undefined,
): ReasoningSpec | undefined {
  if (reasoning === undefined) {
    return undefined;
  }
  if (typeof reasoning === "string") {
    return { effort: reasoning };
  }
  return reasoning;
}

const OUTPUT_TOKENS: Record<Exclude<OutputLength, number>, number> = {
  long: 4096,
  max: 8192,
  medium: 2048,
  short: 512,
};

const TEMPERATURES = {
  balanced: 0.7,
  creative: 1,
  deterministic: 0,
  focused: 0.2,
} as const;

const ANTHROPIC_THINKING_BUDGET: Record<Exclude<ReasoningEffort, "off">, number> = {
  high: 8192,
  low: 2048,
  max: 16_000,
  medium: 4096,
  minimal: 1024,
};

const OPENAI_REASONING: Record<ReasoningEffort, string> = {
  high: "high",
  low: "low",
  max: "xhigh",
  medium: "medium",
  minimal: "minimal",
  off: "none",
};

const OPENROUTER_REASONING: Record<ReasoningEffort, string> = {
  high: "high",
  low: "low",
  max: "xhigh",
  medium: "medium",
  minimal: "minimal",
  off: "none",
};

const GOOGLE_REASONING: Record<Exclude<ReasoningEffort, "off" | "max">, string> = {
  high: "high",
  low: "low",
  medium: "medium",
  minimal: "minimal",
};

function resolveMaxOutputTokens(options: GenerationOptions): number | undefined {
  if (options.maxOutputTokens !== undefined) {
    return options.maxOutputTokens;
  }
  if (options.outputLength === undefined) {
    return undefined;
  }
  if (typeof options.outputLength === "number") {
    return options.outputLength;
  }
  return OUTPUT_TOKENS[options.outputLength];
}

function inferOptionTargets(options: GenerationOptions): ProviderRoute[] {
  const provider = options.provider ?? "gateway";
  const targets = new Set<ProviderRoute>([provider]);

  if (provider === "gateway" && options.modelId) {
    const inferredProvider = inferProvider(options.modelId);
    if (inferredProvider) {
      targets.add(inferredProvider);
    }
  }

  return [...targets];
}

function setProviderOptions(
  providerOptions: GenerationProviderOptions,
  provider: string,
  values: Record<string, ProviderOptionValue>,
): void {
  const next: Record<string, ProviderOptionValue> = {
    ...providerOptions[provider],
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  if (Object.keys(next).length === 0) {
    return;
  }

  providerOptions[provider] = next;
}

function mapOpenAIServiceTier(serviceTier: ServiceTier | undefined): string | undefined {
  if (serviceTier === "standard") {
    return "default";
  }
  return serviceTier;
}

function toProviderModelName(modelId: string | undefined): string {
  if (!modelId) {
    return "";
  }
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

function isOriginalGpt5Family(modelId: string): boolean {
  return (
    modelId === "gpt-5" ||
    modelId.startsWith("gpt-5-") ||
    modelId === "gpt-5-mini" ||
    modelId === "gpt-5-nano"
  );
}

function resolveOpenAIReasoningEffort(
  reasoning: ReasoningEffort | undefined,
  modelId: string | undefined,
): string | undefined {
  if (!reasoning) {
    return undefined;
  }

  const modelName = toProviderModelName(modelId);

  if (isOriginalGpt5Family(modelName)) {
    if (reasoning === "off") {
      return "minimal";
    }
    if (reasoning === "max") {
      return "high";
    }
    return OPENAI_REASONING[reasoning];
  }

  if (reasoning === "minimal") {
    return "low";
  }
  return OPENAI_REASONING[reasoning];
}

const PRICE_FIELDS: (keyof RoutingMaxCost)[] = [
  "promptPerMillion",
  "completionPerMillion",
  "imagePerMillion",
  "audioPerMillion",
];

const PRICE_FIELD_TO_OR: Partial<
  Record<keyof RoutingMaxCost, "prompt" | "completion" | "image" | "audio">
> = {
  audioPerMillion: "audio",
  completionPerMillion: "completion",
  imagePerMillion: "image",
  promptPerMillion: "prompt",
};

/**
 * Convert normalized USD-per-million-tokens prices into OpenRouter's
 * `provider.max_price` shape (USD per million tokens, as numbers).
 *
 * @see https://openrouter.ai/docs/features/provider-routing#max-price
 */
function toOpenRouterMaxPrice(
  cost: RoutingMaxCost | undefined,
): Record<string, number> | undefined {
  if (!cost) {
    return undefined;
  }

  const out: Record<string, number> = {};
  for (const field of PRICE_FIELDS) {
    const value = cost[field];
    if (value === undefined) {
      continue;
    }
    const target = PRICE_FIELD_TO_OR[field];
    if (target) {
      out[target] = value;
    }
  }
  if (cost.requestUsd !== undefined) {
    out.request = cost.requestUsd;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

const PREFER_TO_GATEWAY: Record<
  Exclude<RoutingOptions["prefer"], "auto" | "highest-quality" | undefined>,
  "cost" | "ttft" | "tps"
> = {
  cheapest: "cost",
  fastest: "ttft",
  "highest-throughput": "tps",
};

const PREFER_TO_OPENROUTER: Record<
  Exclude<RoutingOptions["prefer"], "auto" | undefined>,
  "price" | "latency" | "throughput" | "exacto"
> = {
  cheapest: "price",
  fastest: "latency",
  "highest-quality": "exacto",
  "highest-throughput": "throughput",
};

function gatewayPrivacyFlags(routing: RoutingOptions | undefined): {
  zeroDataRetention?: true;
  disallowPromptTraining?: true;
  hipaaCompliant?: true;
} {
  if (!routing?.privacy?.length) {
    return {};
  }
  const flags: {
    zeroDataRetention?: true;
    disallowPromptTraining?: true;
    hipaaCompliant?: true;
  } = {};
  for (const constraint of routing.privacy) {
    if (constraint === "no-retention") {
      flags.zeroDataRetention = true;
    }
    if (constraint === "no-training") {
      flags.disallowPromptTraining = true;
    }
    if (constraint === "hipaa") {
      flags.hipaaCompliant = true;
    }
  }
  return flags;
}

/**
 * Build the `provider` object passed to OpenRouter's chat completions API.
 *
 * @see https://openrouter.ai/docs/features/provider-routing
 */
function buildOpenRouterProviderRouting(
  routing: RoutingOptions | undefined,
): Record<string, ProviderOptionValue> | undefined {
  if (!routing) {
    return undefined;
  }
  const out: Record<string, ProviderOptionValue> = {};

  if (routing.prefer && routing.prefer !== "auto") {
    out.sort = PREFER_TO_OPENROUTER[routing.prefer];
  }
  if (routing.allow?.length) {
    out.only = routing.allow;
  }
  if (routing.deny?.length) {
    out.ignore = routing.deny;
  }
  if (routing.order?.length) {
    out.order = routing.order;
  }
  if (routing.fallbacks !== undefined) {
    out.allow_fallbacks = routing.fallbacks;
  }
  if (routing.quantizations?.length) {
    out.quantizations = routing.quantizations as string[];
  }

  const maxPrice = toOpenRouterMaxPrice(routing.maxCost);
  if (maxPrice) {
    out.max_price = maxPrice;
  }

  if (routing.privacy?.length) {
    if (routing.privacy.includes("no-retention")) {
      out.zdr = true;
    }
    if (routing.privacy.includes("no-training") || routing.privacy.includes("no-retention")) {
      out.data_collection = "deny";
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

interface OpenRouterPlugin {
  id: string;
  [key: string]: ProviderOptionValue;
}

function buildOpenRouterPlugins(options: GenerationOptions): OpenRouterPlugin[] | undefined {
  const plugins: OpenRouterPlugin[] = [];

  if (options.webSearch) {
    const ws: WebSearchOptions = options.webSearch === true ? {} : options.webSearch;
    const plugin: OpenRouterPlugin = { id: "web" };
    if (ws.maxResults !== undefined) {
      plugin.max_results = ws.maxResults;
    }
    if (ws.searchPrompt !== undefined) {
      plugin.search_prompt = ws.searchPrompt;
    }
    if (ws.engine && ws.engine !== "auto") {
      plugin.engine = ws.engine;
    }
    plugins.push(plugin);
  }

  if (options.responseHealing) {
    plugins.push({ id: "response-healing" });
  }

  return plugins.length > 0 ? plugins : undefined;
}

function mapGoogleServiceTier(serviceTier: ServiceTier | undefined): string | undefined {
  if (serviceTier === "auto") {
    return undefined;
  }
  return serviceTier;
}

function applyOpenAIOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const reasoning = normalizeReasoning(options.reasoning);
  setProviderOptions(providerOptions, "openai", {
    parallelToolCalls: options.parallelTools,
    reasoningEffort: resolveOpenAIReasoningEffort(reasoning?.effort, options.modelId),
    serviceTier: mapOpenAIServiceTier(options.serviceTier),
    strictJsonSchema: options.structured === "strict" ? true : undefined,
    textVerbosity: options.verbosity,
    user: options.user ?? options.sessionId,
  });
}

function applyAnthropicOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const reasoning = normalizeReasoning(options.reasoning);
  const cache = normalizeCache(options.cache);

  const thinking =
    reasoning === undefined
      ? undefined
      : reasoning.effort === "off"
        ? { type: "disabled" }
        : {
            type: "enabled",
            budgetTokens:
              reasoning.maxTokens ??
              (reasoning.effort
                ? ANTHROPIC_THINKING_BUDGET[reasoning.effort]
                : ANTHROPIC_THINKING_BUDGET.medium),
          };

  const cacheControl = cache?.enabled
    ? cache.ttl
      ? { type: "ephemeral", ttl: cache.ttl }
      : { type: "ephemeral" }
    : undefined;

  setProviderOptions(providerOptions, "anthropic", {
    cacheControl,
    disableParallelToolUse:
      options.parallelTools === undefined ? undefined : !options.parallelTools,
    metadata:
      options.user || options.sessionId ? { userId: options.user ?? options.sessionId } : undefined,
    sendReasoning: reasoning === undefined ? undefined : reasoning.effort !== "off",
    structuredOutputMode:
      options.structured === "tool"
        ? "jsonTool"
        : options.structured === "strict"
          ? "outputFormat"
          : options.structured,
    thinking,
  });
}

function applyGoogleOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const reasoning = normalizeReasoning(options.reasoning);
  const thinkingConfig =
    reasoning === undefined
      ? undefined
      : reasoning.effort === "off"
        ? { includeThoughts: false, thinkingBudget: 0 }
        : reasoning.maxTokens !== undefined
          ? { includeThoughts: true, thinkingBudget: reasoning.maxTokens }
          : reasoning.effort
            ? {
                includeThoughts: true,
                thinkingLevel:
                  reasoning.effort === "max" ? "high" : GOOGLE_REASONING[reasoning.effort],
              }
            : undefined;

  setProviderOptions(providerOptions, "google", {
    serviceTier: mapGoogleServiceTier(options.serviceTier),
    structuredOutputs:
      options.structured === undefined || options.structured === "auto" ? undefined : true,
    thinkingConfig,
  });
}

function applyOpenRouterOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const reasoning = normalizeReasoning(options.reasoning);
  const cache = normalizeCache(options.cache);

  // OpenRouter's reasoning shape: { enabled?, exclude?, effort | max_tokens }.
  // Prefer max_tokens when both are supplied (effort then becomes implicit).
  const reasoningField =
    reasoning === undefined
      ? undefined
      : reasoning.effort === "off"
        ? { effort: OPENROUTER_REASONING.off, exclude: true }
        : reasoning.maxTokens !== undefined
          ? { max_tokens: reasoning.maxTokens }
          : reasoning.effort
            ? { effort: OPENROUTER_REASONING[reasoning.effort] }
            : undefined;

  const cache_control = cache?.enabled
    ? cache.ttl
      ? { type: "ephemeral", ttl: cache.ttl }
      : { type: "ephemeral" }
    : undefined;

  const provider = buildOpenRouterProviderRouting(options.routing);
  const plugins = buildOpenRouterPlugins(options);
  const usage = options.includeCost ? { include: true } : undefined;

  // OpenRouter is OpenAI-compatible; logprobs splits into `logprobs` (bool)
  // and `top_logprobs` (n) for numeric inputs.
  const logprobsValues =
    options.logprobs === undefined
      ? {}
      : typeof options.logprobs === "number"
        ? { logprobs: true, top_logprobs: options.logprobs }
        : { logprobs: options.logprobs };

  setProviderOptions(providerOptions, "openrouter", {
    reasoning: reasoningField,
    // OpenRouter's REST API uses snake_case for OpenAI-compatible fields and
    // providerOptions are spread directly into the request body.
    parallel_tool_calls: options.parallelTools,
    user: options.user ?? options.sessionId,
    cache_control,
    provider,
    plugins,
    models: options.fallbackModels?.length ? options.fallbackModels : undefined,
    usage,
    logit_bias: options.logitBias,
    ...logprobsValues,
  });
}

function applyGatewayOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const { routing } = options;
  const sort =
    routing?.prefer && routing.prefer !== "auto" && routing.prefer !== "highest-quality"
      ? PREFER_TO_GATEWAY[routing.prefer]
      : undefined;
  const privacy = gatewayPrivacyFlags(routing);

  setProviderOptions(providerOptions, "gateway", {
    disallowPromptTraining: privacy.disallowPromptTraining,
    hipaaCompliant: privacy.hipaaCompliant,
    models: options.fallbackModels?.length ? options.fallbackModels : undefined,
    only: routing?.allow?.length ? routing.allow : undefined,
    order: routing?.order?.length ? routing.order : undefined,
    sort,
    tags: options.tags?.length ? options.tags : undefined,
    user: options.user ?? options.sessionId,
    zeroDataRetention: privacy.zeroDataRetention,
  });
}

function resolveProviderOptions(options: GenerationOptions): GenerationProviderOptions | undefined {
  const providerOptions: GenerationProviderOptions = {};

  for (const target of inferOptionTargets(options)) {
    switch (target) {
      case "gateway": {
        applyGatewayOptions(providerOptions, options);
        break;
      }
      case "openrouter": {
        applyOpenRouterOptions(providerOptions, options);
        break;
      }
      case "anthropic": {
        applyAnthropicOptions(providerOptions, options);
        break;
      }
      case "openai": {
        applyOpenAIOptions(providerOptions, options);
        break;
      }
      case "google": {
        applyGoogleOptions(providerOptions, options);
        break;
      }
    }
  }

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}

/**
 * Resolve provider-neutral generation settings into AI SDK call options.
 *
 * Spread the result into generateText/streamText. Use AI SDK output schemas,
 * prompts, messages, and tools as usual.
 */
export function resolveGenerationOptions(
  options: GenerationOptions = {},
): ResolvedGenerationOptions {
  const resolved: ResolvedGenerationOptions = {};
  const maxOutputTokens = resolveMaxOutputTokens(options);
  const providerOptions = resolveProviderOptions(options);
  const headers = resolveOpenRouterResponseCacheHeaders(options);

  if (headers) {
    resolved.headers = headers;
  }

  if (maxOutputTokens !== undefined) {
    resolved.maxOutputTokens = maxOutputTokens;
  }
  if (options.temperature !== undefined && options.temperature !== null) {
    resolved.temperature = options.temperature;
  } else if (options.temperature === undefined && options.creativity) {
    resolved.temperature = TEMPERATURES[options.creativity];
  }
  if (options.topP !== undefined) {
    resolved.topP = options.topP;
  }
  if (options.topK !== undefined) {
    resolved.topK = options.topK;
  }
  if (options.presencePenalty !== undefined) {
    resolved.presencePenalty = options.presencePenalty;
  }
  if (options.frequencyPenalty !== undefined) {
    resolved.frequencyPenalty = options.frequencyPenalty;
  }
  if (options.stopSequences !== undefined) {
    resolved.stopSequences = options.stopSequences;
  }
  if (options.seed !== undefined) {
    resolved.seed = options.seed;
  }
  if (options.maxRetries !== undefined) {
    resolved.maxRetries = options.maxRetries;
  }
  if (options.timeout !== undefined) {
    resolved.timeout = options.timeout;
  }
  if (options.tools !== undefined) {
    resolved.toolChoice = options.tools;
  }
  if (options.maxToolSteps !== undefined) {
    resolved.stopWhen = isStepCount(options.maxToolSteps);
  }
  if (providerOptions) {
    resolved.providerOptions = providerOptions;
  }

  return resolved;
}
