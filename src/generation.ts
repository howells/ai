/**
 * @howells/ai — Provider-aware generation option resolver.
 *
 * The public API stays provider-neutral while this module maps the knobs each
 * provider actually understands into AI SDK providerOptions.
 */

import { stepCountIs } from "ai";
import { inferProvider } from "./models";
import type {
  GenerationOptions,
  GenerationProviderOptions,
  OutputLength,
  ProviderRoute,
  ReasoningEffort,
  ResolvedGenerationOptions,
  ServiceTier,
} from "./types";

type ProviderOptionValue = GenerationProviderOptions[string][string];

const OUTPUT_TOKENS: Record<Exclude<OutputLength, number>, number> = {
  short: 512,
  medium: 2048,
  long: 4096,
  max: 8192,
};

const TEMPERATURES = {
  deterministic: 0,
  focused: 0.2,
  balanced: 0.7,
  creative: 1,
} as const;

const ANTHROPIC_THINKING_BUDGET: Record<Exclude<ReasoningEffort, "off">, number> =
  {
    minimal: 1024,
    low: 2048,
    medium: 4096,
    high: 8192,
    max: 16_000,
  };

const OPENAI_REASONING: Record<ReasoningEffort, string> = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  max: "xhigh",
};

const OPENROUTER_REASONING: Record<ReasoningEffort, string> = {
  off: "none",
  minimal: "minimal",
  low: "low",
  medium: "medium",
  high: "high",
  max: "xhigh",
};

const GOOGLE_REASONING: Record<Exclude<ReasoningEffort, "off" | "max">, string> =
  {
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
  };

function resolveMaxOutputTokens(options: GenerationOptions): number | undefined {
  if (options.maxOutputTokens !== undefined) return options.maxOutputTokens;
  if (options.outputLength === undefined) return undefined;
  if (typeof options.outputLength === "number") return options.outputLength;
  return OUTPUT_TOKENS[options.outputLength];
}

function inferOptionTargets(options: GenerationOptions): ProviderRoute[] {
  const provider = options.provider ?? "gateway";
  const targets = new Set<ProviderRoute>([provider]);

  if (provider === "gateway" && options.modelId) {
    const inferredProvider = inferProvider(options.modelId);
    if (inferredProvider) targets.add(inferredProvider);
  }

  return [...targets];
}

function setProviderOptions(
  providerOptions: GenerationProviderOptions,
  provider: string,
  values: Record<string, ProviderOptionValue>,
): void {
  const next: Record<string, ProviderOptionValue> = {
    ...(providerOptions[provider] ?? {}),
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) next[key] = value;
  }

  if (Object.keys(next).length === 0) return;

  providerOptions[provider] = next;
}

function mapOpenAIServiceTier(
  serviceTier: ServiceTier | undefined,
): string | undefined {
  if (serviceTier === "standard") return "default";
  return serviceTier;
}

function toProviderModelName(modelId: string | undefined): string {
  if (!modelId) return "";
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
  if (!reasoning) return undefined;

  const modelName = toProviderModelName(modelId);

  if (isOriginalGpt5Family(modelName)) {
    if (reasoning === "off") return "minimal";
    if (reasoning === "max") return "high";
    return OPENAI_REASONING[reasoning];
  }

  if (reasoning === "minimal") return "low";
  return OPENAI_REASONING[reasoning];
}

function mapGoogleServiceTier(
  serviceTier: ServiceTier | undefined,
): string | undefined {
  if (serviceTier === "auto") return undefined;
  return serviceTier;
}

function applyOpenAIOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  setProviderOptions(providerOptions, "openai", {
    reasoningEffort: resolveOpenAIReasoningEffort(
      options.reasoning,
      options.modelId,
    ),
    textVerbosity: options.verbosity,
    parallelToolCalls: options.parallelTools,
    strictJsonSchema: options.structured === "strict" ? true : undefined,
    user: options.user,
    serviceTier: mapOpenAIServiceTier(options.serviceTier),
  });
}

function applyAnthropicOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const thinking =
    options.reasoning === undefined
      ? undefined
      : options.reasoning === "off"
        ? { type: "disabled" }
        : {
            type: "enabled",
            budgetTokens: ANTHROPIC_THINKING_BUDGET[options.reasoning],
          };

  setProviderOptions(providerOptions, "anthropic", {
    thinking,
    sendReasoning:
      options.reasoning === undefined ? undefined : options.reasoning !== "off",
    structuredOutputMode:
      options.structured === "tool"
        ? "jsonTool"
        : options.structured === "strict"
          ? "outputFormat"
          : options.structured,
    disableParallelToolUse:
      options.parallelTools === undefined ? undefined : !options.parallelTools,
    cacheControl:
      options.cache === "ephemeral" ? { type: "ephemeral" } : undefined,
    metadata: options.user ? { userId: options.user } : undefined,
  });
}

function applyGoogleOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const thinkingConfig =
    options.reasoning === undefined
      ? undefined
      : options.reasoning === "off"
        ? { thinkingBudget: 0, includeThoughts: false }
        : {
            thinkingLevel:
              options.reasoning === "max"
                ? "high"
                : GOOGLE_REASONING[options.reasoning],
            includeThoughts: true,
          };

  setProviderOptions(providerOptions, "google", {
    thinkingConfig,
    structuredOutputs:
      options.structured === undefined || options.structured === "auto"
        ? undefined
        : true,
    serviceTier: mapGoogleServiceTier(options.serviceTier),
  });
}

function applyOpenRouterOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  const reasoning =
    options.reasoning === undefined
      ? undefined
      : options.reasoning === "off"
        ? { effort: OPENROUTER_REASONING.off, exclude: true }
        : { effort: OPENROUTER_REASONING[options.reasoning] };

  setProviderOptions(providerOptions, "openrouter", {
    reasoning,
    parallelToolCalls: options.parallelTools,
    user: options.user,
    cache_control:
      options.cache === "ephemeral" ? { type: "ephemeral" } : undefined,
  });
}

function applyGatewayOptions(
  providerOptions: GenerationProviderOptions,
  options: GenerationOptions,
): void {
  setProviderOptions(providerOptions, "gateway", {
    user: options.user,
  });
}

function resolveProviderOptions(
  options: GenerationOptions,
): GenerationProviderOptions | undefined {
  const providerOptions: GenerationProviderOptions = {};

  for (const target of inferOptionTargets(options)) {
    switch (target) {
      case "gateway":
        applyGatewayOptions(providerOptions, options);
        break;
      case "openrouter":
        applyOpenRouterOptions(providerOptions, options);
        break;
      case "anthropic":
        applyAnthropicOptions(providerOptions, options);
        break;
      case "openai":
        applyOpenAIOptions(providerOptions, options);
        break;
      case "google":
        applyGoogleOptions(providerOptions, options);
        break;
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

  if (maxOutputTokens !== undefined) resolved.maxOutputTokens = maxOutputTokens;
  if (options.temperature !== undefined && options.temperature !== null) {
    resolved.temperature = options.temperature;
  } else if (options.temperature === undefined && options.creativity) {
    resolved.temperature = TEMPERATURES[options.creativity];
  }
  if (options.topP !== undefined) resolved.topP = options.topP;
  if (options.topK !== undefined) resolved.topK = options.topK;
  if (options.presencePenalty !== undefined) {
    resolved.presencePenalty = options.presencePenalty;
  }
  if (options.frequencyPenalty !== undefined) {
    resolved.frequencyPenalty = options.frequencyPenalty;
  }
  if (options.stopSequences !== undefined) {
    resolved.stopSequences = options.stopSequences;
  }
  if (options.seed !== undefined) resolved.seed = options.seed;
  if (options.maxRetries !== undefined) resolved.maxRetries = options.maxRetries;
  if (options.timeout !== undefined) resolved.timeout = options.timeout;
  if (options.tools !== undefined) resolved.toolChoice = options.tools;
  if (options.maxToolSteps !== undefined) {
    resolved.stopWhen = stepCountIs(options.maxToolSteps);
  }
  if (providerOptions) resolved.providerOptions = providerOptions;

  return resolved;
}
