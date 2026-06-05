import type {
  GenerationOptions,
  OpenRouterModelVariant,
  PrivacyConstraint,
  ProviderRoute,
  Quantization,
  ReasoningEffort,
  RoutePreference,
  ServiceTier,
} from "@howells/ai";

/** Prompt-cache modes exposed by the benchmark advanced controls. */
export type BenchmarkCacheMode = "off" | "ephemeral" | "ephemeral-5m" | "ephemeral-1h";
/** Reasoning mode selector, including the UI's provider-default sentinel. */
export type BenchmarkReasoningMode = "default" | ReasoningEffort;
/** Web-search mode selector for providers that expose native or plugin search. */
export type BenchmarkWebSearchMode = "off" | "auto" | "native" | "exa";
/** Logprobs selector used to request no, basic, or top-k token logprobs. */
export type BenchmarkLogprobsMode = "off" | "basic" | "top5";
/** OpenRouter virtual model suffix selector used by the benchmark UI. */
export type BenchmarkOpenRouterVariant = "off" | OpenRouterModelVariant;
/** Service-tier selector, including the UI's provider-default sentinel. */
export type BenchmarkServiceTier = "default" | ServiceTier;

/** Complete advanced generation option state collected by the benchmark UI. */
export interface BenchmarkAdvancedOptions {
  routePreference: RoutePreference;
  openRouterVariant: BenchmarkOpenRouterVariant;
  serviceTier: BenchmarkServiceTier;
  privacy: PrivacyConstraint[];
  allowProviders: string[];
  denyProviders: string[];
  providerOrder: string[];
  fallbacks: boolean;
  quantizations: Quantization[];
  fallbackModels: string[];
  maxPromptCost?: number;
  maxCompletionCost?: number;
  maxRequestCost?: number;
  cache: BenchmarkCacheMode;
  reasoning: BenchmarkReasoningMode;
  reasoningTokens?: number;
  webSearch: BenchmarkWebSearchMode;
  responseHealing: boolean;
  includeCost: boolean;
  logprobs: BenchmarkLogprobsMode;
  tags: string[];
}

/** Inputs required to convert benchmark UI state into generation options. */
export interface BenchmarkGenerationInput {
  provider: ProviderRoute;
  modelId: string;
  maxTokens: number;
  options?: BenchmarkAdvancedOptions;
}

/** Default advanced option values for benchmark requests and sandbox runs. */
export const DEFAULT_ADVANCED_OPTIONS: BenchmarkAdvancedOptions = {
  allowProviders: [],
  cache: "off",
  denyProviders: [],
  fallbackModels: [],
  fallbacks: true,
  includeCost: true,
  logprobs: "off",
  openRouterVariant: "off",
  privacy: [],
  providerOrder: [],
  quantizations: [],
  reasoning: "default",
  responseHealing: false,
  routePreference: "auto",
  serviceTier: "default",
  tags: [],
  webSearch: "off",
};

/** User-facing route preference options. */
export const ROUTE_PREFERENCES: readonly {
  value: RoutePreference;
  label: string;
}[] = [
  { label: "Auto", value: "auto" },
  { label: "Cheapest", value: "cheapest" },
  { label: "Fastest", value: "fastest" },
  { label: "Throughput", value: "highest-throughput" },
  { label: "Quality", value: "highest-quality" },
];

/** OpenRouter model-suffix options with labels for the advanced controls. */
export const OPENROUTER_VARIANTS: readonly {
  value: BenchmarkOpenRouterVariant;
  label: string;
  description: string;
}[] = [
  {
    description: "Use OpenRouter's default provider routing.",
    label: "None",
    value: "off",
  },
  {
    description: "Append :nitro and sort providers by throughput.",
    label: "Nitro",
    value: "nitro",
  },
  {
    description: "Append :exacto for quality-first tool-use routing.",
    label: "Exacto",
    value: "exacto",
  },
  {
    description: "Append :floor and sort providers by price.",
    label: "Floor",
    value: "floor",
  },
];

/** Service-tier options with provider-neutral UI labels. */
export const SERVICE_TIERS: readonly {
  value: BenchmarkServiceTier;
  label: string;
  description: string;
}[] = [
  {
    description: "Omit service tier and let the selected provider decide.",
    label: "Provider default",
    value: "default",
  },
  {
    description: "Use provider automatic tier selection where supported.",
    label: "Auto",
    value: "auto",
  },
  {
    description: "Prefer the standard paid service tier where supported.",
    label: "Standard",
    value: "standard",
  },
  {
    description: "Prefer lower-cost, slower processing where supported.",
    label: "Flex",
    value: "flex",
  },
  {
    description: "Prefer prioritized processing where supported.",
    label: "Priority",
    value: "priority",
  },
];

/** Privacy constraints available through provider routing options. */
export const PRIVACY_OPTIONS: readonly {
  value: PrivacyConstraint;
  label: string;
}[] = [
  { label: "No retention", value: "no-retention" },
  { label: "No training", value: "no-training" },
  { label: "HIPAA", value: "hipaa" },
];

/** Quantization filters available through provider routing options. */
export const QUANTIZATION_OPTIONS: readonly Quantization[] = [
  "int4",
  "int8",
  "fp4",
  "fp6",
  "fp8",
  "fp16",
  "bf16",
  "fp32",
];

/** Parse a comma- or newline-separated textarea value into a compact list. */
export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Format a list back into the textarea representation used by the UI. */
export function formatList(value: readonly string[]): string {
  return value.join(", ");
}

/** Add or remove a value from an immutable set-like array. */
export function setMembership<T extends string>(
  values: readonly T[],
  value: T,
  enabled: boolean,
): T[] {
  const next = new Set(values);
  if (enabled) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return [...next];
}

/** Convert benchmark-specific option state into provider-neutral generation options. */
export function buildBenchmarkGenerationOptions({
  provider,
  modelId,
  maxTokens,
  options = DEFAULT_ADVANCED_OPTIONS,
}: BenchmarkGenerationInput): GenerationOptions {
  const routing: GenerationOptions["routing"] = {};

  if (options.routePreference !== "auto") {
    routing.prefer = options.routePreference;
  }
  if (options.privacy.length > 0) {
    routing.privacy = options.privacy;
  }
  if (options.allowProviders.length > 0) {
    routing.allow = options.allowProviders;
  }
  if (options.denyProviders.length > 0) {
    routing.deny = options.denyProviders;
  }
  if (options.providerOrder.length > 0) {
    routing.order = options.providerOrder;
  }
  if (!options.fallbacks) {
    routing.fallbacks = false;
  }
  if (options.quantizations.length > 0) {
    routing.quantizations = options.quantizations;
  }

  const maxCost: NonNullable<GenerationOptions["routing"]>["maxCost"] = {};
  if (options.maxPromptCost !== undefined) {
    maxCost.promptPerMillion = options.maxPromptCost;
  }
  if (options.maxCompletionCost !== undefined) {
    maxCost.completionPerMillion = options.maxCompletionCost;
  }
  if (options.maxRequestCost !== undefined) {
    maxCost.requestUsd = options.maxRequestCost;
  }
  if (Object.keys(maxCost).length > 0) {
    routing.maxCost = maxCost;
  }

  const generation: GenerationOptions = {
    maxOutputTokens: maxTokens,
    modelId,
    provider,
  };

  if (Object.keys(routing).length > 0) {
    generation.routing = routing;
  }
  if (options.serviceTier !== "default") {
    generation.serviceTier = options.serviceTier;
  }
  if (options.fallbackModels.length > 0) {
    generation.fallbackModels = options.fallbackModels;
  }
  if (options.tags.length > 0) {
    generation.tags = options.tags;
  }

  if (options.cache === "ephemeral") {
    generation.cache = "ephemeral";
  }
  if (options.cache === "ephemeral-5m") {
    generation.cache = { ttl: "5m" };
  }
  if (options.cache === "ephemeral-1h") {
    generation.cache = { ttl: "1h" };
  }

  if (options.reasoning !== "default" || options.reasoningTokens !== undefined) {
    const reasoningEffort = options.reasoning === "default" ? undefined : options.reasoning;
    generation.reasoning =
      options.reasoningTokens !== undefined
        ? {
            ...(reasoningEffort ? { effort: reasoningEffort } : {}),
            maxTokens: options.reasoningTokens,
          }
        : reasoningEffort;
  }

  if (options.webSearch === "auto") {
    generation.webSearch = true;
  }
  if (options.webSearch === "native" || options.webSearch === "exa") {
    generation.webSearch = { engine: options.webSearch };
  }

  if (options.responseHealing) {
    generation.responseHealing = true;
  }
  if (options.includeCost) {
    generation.includeCost = true;
  }
  if (options.logprobs === "basic") {
    generation.logprobs = true;
  }
  if (options.logprobs === "top5") {
    generation.logprobs = 5;
  }

  return generation;
}
