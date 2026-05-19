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

export type BenchmarkCacheMode = "off" | "ephemeral" | "ephemeral-5m" | "ephemeral-1h";
export type BenchmarkReasoningMode = "default" | ReasoningEffort;
export type BenchmarkWebSearchMode = "off" | "auto" | "native" | "exa";
export type BenchmarkLogprobsMode = "off" | "basic" | "top5";
export type BenchmarkOpenRouterVariant = "off" | OpenRouterModelVariant;
export type BenchmarkServiceTier = "default" | ServiceTier;

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

export interface BenchmarkGenerationInput {
  provider: ProviderRoute;
  modelId: string;
  maxTokens: number;
  options?: BenchmarkAdvancedOptions;
}

export const DEFAULT_ADVANCED_OPTIONS: BenchmarkAdvancedOptions = {
  routePreference: "auto",
  openRouterVariant: "off",
  serviceTier: "default",
  privacy: [],
  allowProviders: [],
  denyProviders: [],
  providerOrder: [],
  fallbacks: true,
  quantizations: [],
  fallbackModels: [],
  cache: "off",
  reasoning: "default",
  webSearch: "off",
  responseHealing: false,
  includeCost: true,
  logprobs: "off",
  tags: [],
};

export const ROUTE_PREFERENCES: readonly {
  value: RoutePreference;
  label: string;
}[] = [
  { value: "auto", label: "Auto" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
  { value: "highest-throughput", label: "Throughput" },
  { value: "highest-quality", label: "Quality" },
];

export const OPENROUTER_VARIANTS: readonly {
  value: BenchmarkOpenRouterVariant;
  label: string;
  description: string;
}[] = [
  {
    value: "off",
    label: "None",
    description: "Use OpenRouter's default provider routing.",
  },
  {
    value: "nitro",
    label: "Nitro",
    description: "Append :nitro and sort providers by throughput.",
  },
  {
    value: "exacto",
    label: "Exacto",
    description: "Append :exacto for quality-first tool-use routing.",
  },
  {
    value: "floor",
    label: "Floor",
    description: "Append :floor and sort providers by price.",
  },
];

export const SERVICE_TIERS: readonly {
  value: BenchmarkServiceTier;
  label: string;
  description: string;
}[] = [
  {
    value: "default",
    label: "Provider default",
    description: "Omit service tier and let the selected provider decide.",
  },
  {
    value: "auto",
    label: "Auto",
    description: "Use provider automatic tier selection where supported.",
  },
  {
    value: "standard",
    label: "Standard",
    description: "Prefer the standard paid service tier where supported.",
  },
  {
    value: "flex",
    label: "Flex",
    description: "Prefer lower-cost, slower processing where supported.",
  },
  {
    value: "priority",
    label: "Priority",
    description: "Prefer prioritized processing where supported.",
  },
];

export const PRIVACY_OPTIONS: readonly {
  value: PrivacyConstraint;
  label: string;
}[] = [
  { value: "no-retention", label: "No retention" },
  { value: "no-training", label: "No training" },
  { value: "hipaa", label: "HIPAA" },
];

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

export function parseList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatList(value: readonly string[]): string {
  return value.join(", ");
}

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
  if (options.privacy.length > 0) routing.privacy = options.privacy;
  if (options.allowProviders.length > 0) routing.allow = options.allowProviders;
  if (options.denyProviders.length > 0) routing.deny = options.denyProviders;
  if (options.providerOrder.length > 0) routing.order = options.providerOrder;
  if (!options.fallbacks) routing.fallbacks = false;
  if (options.quantizations.length > 0) routing.quantizations = options.quantizations;

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
  if (Object.keys(maxCost).length > 0) routing.maxCost = maxCost;

  const generation: GenerationOptions = {
    provider,
    modelId,
    maxOutputTokens: maxTokens,
  };

  if (Object.keys(routing).length > 0) generation.routing = routing;
  if (options.serviceTier !== "default") {
    generation.serviceTier = options.serviceTier;
  }
  if (options.fallbackModels.length > 0) {
    generation.fallbackModels = options.fallbackModels;
  }
  if (options.tags.length > 0) generation.tags = options.tags;

  if (options.cache === "ephemeral") generation.cache = "ephemeral";
  if (options.cache === "ephemeral-5m") generation.cache = { ttl: "5m" };
  if (options.cache === "ephemeral-1h") generation.cache = { ttl: "1h" };

  if (options.reasoning !== "default" || options.reasoningTokens !== undefined) {
    const reasoningEffort =
      options.reasoning === "default" ? undefined : options.reasoning;
    generation.reasoning =
      options.reasoningTokens !== undefined
        ? {
            ...(reasoningEffort ? { effort: reasoningEffort } : {}),
            maxTokens: options.reasoningTokens,
          }
        : reasoningEffort;
  }

  if (options.webSearch === "auto") generation.webSearch = true;
  if (options.webSearch === "native" || options.webSearch === "exa") {
    generation.webSearch = { engine: options.webSearch };
  }

  if (options.responseHealing) generation.responseHealing = true;
  if (options.includeCost) generation.includeCost = true;
  if (options.logprobs === "basic") generation.logprobs = true;
  if (options.logprobs === "top5") generation.logprobs = 5;

  return generation;
}
