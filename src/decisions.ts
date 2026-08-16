/**
 * Versioned model decisions.
 *
 * The tier matrix is an opinion about which model does which job. Opinions
 * expire: prices move, models are retired, discounts open and close. Consumers
 * need to know *which* opinion they are running, and on what evidence it was
 * formed, without making a network call to find out.
 *
 * This module stamps the matrix with a version, a review date, and the
 * evidence behind it. `ai catalog`, `ai compare`, `ai bench` and `ai audit`
 * produce that evidence; a human reviews the diff; this constant is what
 * records the outcome.
 */

import { DEFAULT_MODELS, DEFAULT_TASK_MODELS } from "./models";
import type { LanguageModelVariant, ModelTask, ModelTier } from "./types";

/** How a decision set was arrived at. */
export type DecisionEvidence =
  /** Prices read from a live router catalogue on the review date. */
  | "catalog"
  /** Time to first token and throughput measured by `ai bench`. */
  | "latency"
  /** Task accuracy measured by `ai eval`. */
  | "quality"
  /** Call-site distribution observed by `ai audit`. */
  | "fleet-usage"
  /** Chosen by judgement, with no measurement behind it. */
  | "judgement";

/** A dated, versioned statement of which models do which jobs. */
export interface ModelDecisionSet {
  /**
   * Decision-set version, independent of the package version. Bump when any
   * model in the matrix changes, so a consumer can pin behaviour.
   */
  version: string;
  /** ISO date the decisions were last reviewed against live evidence. */
  reviewedAt: string;
  /** Evidence classes that informed this revision. */
  evidence: readonly DecisionEvidence[];
  /** One-line summary of what changed and why. */
  rationale: string;
}

/**
 * The current decision set.
 *
 * `evidence` is deliberately narrow. Until `ai bench` and `ai eval` have been
 * run across the matrix, most cells rest on judgement, and claiming otherwise
 * would make the stamp worthless.
 */
export const MODEL_DECISION_SET: ModelDecisionSet = {
  version: "2026.08.16-2",
  reviewedAt: "2026-08-16",
  evidence: ["catalog", "latency", "fleet-usage", "judgement"],
  rationale:
    "Latency measured from Vercel iad1 and locally across 12 models and 3 routes. " +
    "Ranking moved from time to first token to total completion time: 88 of 91 fleet " +
    "call sites block on the whole response. Workload taxonomy in ./taxonomy replaces " +
    "the nine invented tasks with modality, output contract, latency class and stakes, " +
    "derived from 324 audited call sites. Tier defaults unchanged pending quality evals.",
};

/** A single resolved decision, with the provenance of the set it came from. */
export interface ResolvedDecision {
  tier: ModelTier;
  variant: LanguageModelVariant;
  task: ModelTask;
  modelId: string;
  decisionSet: ModelDecisionSet;
}

/**
 * Resolve the decision for a tier, variant and task from the committed matrix.
 *
 * Task defaults are layered over tier defaults, matching the runtime resolution
 * order, so this returns what a caller would actually get.
 */
export function resolveDecision(
  tier: ModelTier,
  variant: LanguageModelVariant,
  task: ModelTask = "general",
): ResolvedDecision {
  const taskModelId = DEFAULT_TASK_MODELS[task]?.[tier]?.[variant];
  const tierModelId = DEFAULT_MODELS[tier][variant];

  return {
    tier,
    variant,
    task,
    modelId: taskModelId ?? tierModelId,
    decisionSet: MODEL_DECISION_SET,
  };
}
