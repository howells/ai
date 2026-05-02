import {
  canRouteModelToProvider,
  DEFAULT_MODELS,
  DEFAULT_TASK_MODELS,
  inferModelService,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_TASKS,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_TIERS,
  resolveProviderModelId,
} from "@howells/ai/models";
import type {
  LanguageModelVariant,
  ModelService,
  ModelTask,
  ModelTier,
  ProviderRoute,
} from "@howells/ai";

export type ModelGroup = "defaults" | "task-optimized" | "catalog";

export interface ModelRow {
  id: string;
  name: string;
  service: ModelService;
  group: ModelGroup;
  defaultSlots: string[];
  taskSlots: string[];
  tasks: readonly ModelTask[];
  defaultTier?: ModelTier;
}

export const ALL_PROVIDERS: ProviderRoute[] = [
  "openrouter",
  "gateway",
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "xai",
  "qwen",
  "zai",
  "moonshotai",
];

export const ALL_TIERS: readonly ModelTier[] = MODEL_TIERS;
export const ALL_TASKS: readonly ModelTask[] = LANGUAGE_MODEL_TASKS;

export function formatVariant(variant: LanguageModelVariant): string {
  switch (variant) {
    case "text":
      return "text";
    case "tools":
      return "tools";
    case "vision":
      return "vision";
    case "visionTools":
      return "vision+tools";
  }
}

function defaultSlotsFor(modelId: string): string[] {
  const slots: string[] = [];
  for (const tier of MODEL_TIERS) {
    for (const variant of LANGUAGE_MODEL_VARIANTS) {
      if (DEFAULT_MODELS[tier][variant] === modelId) {
        slots.push(`${tier} ${formatVariant(variant)}`);
      }
    }
  }
  return slots;
}

function defaultTierFor(modelId: string): ModelTier | undefined {
  return MODEL_TIERS.find((tier) =>
    LANGUAGE_MODEL_VARIANTS.some(
      (variant) => DEFAULT_MODELS[tier][variant] === modelId,
    ),
  );
}

function taskSlotsFor(modelId: string): string[] {
  const slots: string[] = [];
  for (const task of LANGUAGE_MODEL_TASKS) {
    if (task === "general") continue;
    for (const tier of MODEL_TIERS) {
      for (const variant of LANGUAGE_MODEL_VARIANTS) {
        if (DEFAULT_TASK_MODELS[task][tier]?.[variant] === modelId) {
          slots.push(`${task} ${tier} ${formatVariant(variant)}`);
        }
      }
    }
  }
  return slots;
}

function groupFor(modelId: string, defaultSlots: string[]): ModelGroup {
  if (defaultSlots.length > 0) return "defaults";
  if (taskSlotsFor(modelId).length > 0) return "task-optimized";
  return "catalog";
}

function inferServiceForRow(modelId: string): ModelService {
  return inferModelService(modelId) ?? "anthropic";
}

export const MODEL_ROWS: ModelRow[] = LANGUAGE_MODEL_CATALOG.map((entry) => {
  const defaultSlots = defaultSlotsFor(entry.id);
  return {
    id: entry.id,
    name: entry.name,
    service: (entry.service as ModelService | undefined) ??
      inferServiceForRow(entry.id),
    group: groupFor(entry.id, defaultSlots),
    defaultSlots,
    taskSlots: taskSlotsFor(entry.id),
    tasks: entry.tasks ?? [],
    defaultTier: defaultTierFor(entry.id),
  } satisfies ModelRow;
}).sort((a, b) => {
  // Group order first.
  const groupOrder: Record<ModelGroup, number> = {
    defaults: 0,
    "task-optimized": 1,
    catalog: 2,
  };
  if (groupOrder[a.group] !== groupOrder[b.group]) {
    return groupOrder[a.group] - groupOrder[b.group];
  }
  const aTier = a.defaultTier ? MODEL_TIERS.indexOf(a.defaultTier) : 99;
  const bTier = b.defaultTier ? MODEL_TIERS.indexOf(b.defaultTier) : 99;
  if (aTier !== bTier) return aTier - bTier;
  return a.name.localeCompare(b.name);
});

export const ALL_SERVICES: ModelService[] = Array.from(
  new Set(MODEL_ROWS.map((row) => row.service)),
);

export const GROUP_LABELS: Record<ModelGroup, string> = {
  defaults: "Defaults",
  "task-optimized": "Task-optimized",
  catalog: "Catalog",
};

export const GROUP_DESCRIPTIONS: Record<ModelGroup, string> = {
  defaults: "Models wired into a default tier slot.",
  "task-optimized": "Models chosen for a specific workload.",
  catalog: "Available overrides without a default slot.",
};

export const GROUPS: ModelGroup[] = ["defaults", "task-optimized", "catalog"];

export function tiersForRow(row: ModelRow): ModelTier[] {
  const tiers = new Set<ModelTier>();
  for (const slot of row.defaultSlots) {
    const tier = slot.split(" ")[0] as ModelTier;
    if (MODEL_TIERS.includes(tier)) tiers.add(tier);
  }
  for (const slot of row.taskSlots) {
    const parts = slot.split(" ");
    const tier = parts[1] as ModelTier;
    if (tier && MODEL_TIERS.includes(tier)) tiers.add(tier);
  }
  return [...tiers];
}

export interface RouteCell {
  status: "ready" | "missing-key" | "no-route" | "result" | "running";
  providerModelId?: string;
}

export function routeCellFor(
  row: ModelRow,
  provider: ProviderRoute,
  configuredProviders: readonly ProviderRoute[],
): RouteCell {
  if (!canRouteModelToProvider(row.id, provider)) {
    return { status: "no-route" };
  }
  if (!configuredProviders.includes(provider)) {
    return {
      status: "missing-key",
      providerModelId: resolveProviderModelId(row.id, provider),
    };
  }
  return {
    status: "ready",
    providerModelId: resolveProviderModelId(row.id, provider),
  };
}

export function providerLabel(p: ProviderRoute): string {
  switch (p) {
    case "openrouter":
      return "OpenRouter";
    case "gateway":
      return "Gateway";
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    case "deepseek":
      return "DeepSeek";
    case "xai":
      return "xAI";
    case "qwen":
      return "Qwen";
    case "zai":
      return "Z.ai";
    case "moonshotai":
      return "Moonshot";
  }
}

export function providerShort(p: ProviderRoute): string {
  switch (p) {
    case "openrouter":
      return "OR";
    case "gateway":
      return "GW";
    case "anthropic":
      return "AN";
    case "openai":
      return "OAI";
    case "google":
      return "GGL";
    case "deepseek":
      return "DS";
    case "xai":
      return "XAI";
    case "qwen":
      return "QWN";
    case "zai":
      return "ZAI";
    case "moonshotai":
      return "MS";
  }
}

/*
 * Provider accent — V7 product UI keeps tabular data calm and monochrome.
 * The handle is a secondary identifier; the provider name does the labelling.
 * We render every handle in the faint text colour so the data column wins.
 */
export function providerAccent(_p: ProviderRoute): string {
  return "text-[var(--color-text-faint)]";
}

export function serviceLabel(service: ModelService): string {
  switch (service) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
    case "deepseek":
      return "DeepSeek";
    case "xai":
      return "xAI";
    case "qwen":
      return "Qwen";
    case "zai":
      return "Z.ai";
    case "moonshotai":
      return "Moonshot";
  }
}

export function tierLabel(tier: ModelTier): string {
  return tier;
}

export function taskLabel(task: ModelTask): string {
  if (task === "longContext") return "long context";
  return task;
}

export const TIER_DESCRIPTIONS: Record<ModelTier, string> = {
  nano: "Smallest, cheapest, fastest. Used for trivial classification or routing.",
  fast: "Speed-optimised mid-tier. Daily-driver for chat and short generations.",
  standard: "Balanced default tier. Most general-purpose work resolves here.",
  powerful: "Flagship tier. Higher quality, higher latency, higher cost.",
  reasoning: "Chain-of-thought / thinking models. Slow but stronger at multi-step problems.",
};

export const TASK_DESCRIPTIONS: Record<ModelTask, string> = {
  general: "Default for any unspecified task.",
  coding: "Optimised for code generation, completion, and refactoring.",
  agentic: "Long-running tool-use loops; strong at planning and tool selection.",
  chat: "Tuned for back-and-forth conversation.",
  bulk: "Cheap throughput for high-volume jobs.",
  vision: "Multi-modal models that can see images.",
  reasoning: "Chain-of-thought / thinking models.",
  longContext: "Models tuned for very large input windows.",
  creative: "Tuned for narrative, copywriting, and creative writing.",
};

export const SLOT_LEGEND =
  "Slots are (tier × variant) defaults this model fills. Pick a slot via createAI({ tier, variant }) and the model resolves automatically.";

