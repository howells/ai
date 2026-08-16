/**
 * Generalised task evaluation.
 *
 * Price comes from a catalogue and speed comes from a stopwatch, but "which
 * model is best at this job" is only answerable by running the job. Every
 * project ends up needing the same thing: a fixed set of cases, one grader,
 * several candidate models, and a ranked answer.
 *
 * A suite is data, not code. Define the cases once, keep them in the repo that
 * owns the workload, and run them against any model on any route.
 */

import { generateText } from "ai";
import type { AIClient } from "./client";
import { resolveProviderModelId } from "./models";
import type { ModelTask, ProviderRoute } from "./types";

/** Verdict for one case, between 0 (wrong) and 1 (fully correct). */
export type Score = number;

/** Grades one model output against a case. */
export type Grader = (output: string, expected: EvalCase["expected"]) => Score;

/** One test case in a suite. */
export interface EvalCase {
  /** Stable identifier, used to track a case across suite revisions. */
  id: string;
  /** Prompt sent verbatim to every candidate model. */
  prompt: string;
  /**
   * What a correct answer looks like. Interpretation is the grader's business:
   * a string for match graders, an array for keyword graders, a schema for
   * structural graders.
   */
  expected: string | readonly string[] | Record<string, unknown>;
  /** Optional per-case grader, overriding the suite grader. */
  grader?: Grader;
  /** Relative importance when averaging. Defaults to 1. */
  weight?: number;
}

/** A named, versioned set of cases measuring one discrete task. */
export interface EvalSuite {
  /** Stable suite identifier, e.g. "material-classify". */
  id: string;
  /**
   * Suite version. Bump on any case change: scores are only comparable within
   * one version, and silently comparing across revisions is how eval results
   * become folklore.
   */
  version: string;
  /** Workload this suite stands in for, linking results back to the matrix. */
  task: ModelTask;
  /** Default grader for cases that do not supply one. */
  grader: Grader;
  cases: readonly EvalCase[];
  /** System prompt applied to every case. */
  system?: string;
  /** Output token ceiling per case. */
  maxOutputTokens?: number;
  /**
   * Reasoning effort applied to every case.
   *
   * Thinking models spend the output budget on reasoning before emitting an
   * answer, so a ceiling sized for the answer alone truncates them mid-token
   * and scores a capable model at zero. Suites that grade the final answer
   * rather than the working should pin this low.
   */
  reasoning?: "minimal" | "low" | "medium" | "high";
}

function normalise(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/gu, " ");
}

/** Full credit only when the output matches exactly, ignoring case and spacing. */
export const exactMatchGrader: Grader = (output, expected) =>
  typeof expected === "string" && normalise(output) === normalise(expected) ? 1 : 0;

/** Full credit when the expected string appears anywhere in the output. */
export const containsGrader: Grader = (output, expected) =>
  typeof expected === "string" && normalise(output).includes(normalise(expected)) ? 1 : 0;

/** Partial credit in proportion to how many expected keywords appear. */
export const keywordGrader: Grader = (output, expected) => {
  if (!Array.isArray(expected) || expected.length === 0) {
    return 0;
  }
  const haystack = normalise(output);
  const hits = expected.filter((keyword) => haystack.includes(normalise(String(keyword))));
  return hits.length / expected.length;
};

/**
 * Full credit when the output parses as JSON carrying every expected key.
 * Values are compared only when the expectation supplies a non-null one.
 */
export const jsonShapeGrader: Grader = (output, expected) => {
  if (typeof expected !== "object" || expected === null || Array.isArray(expected)) {
    return 0;
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(output);
  const candidate = (fenced?.[1] ?? output).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return 0;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return 0;
  }

  const entries = Object.entries(expected);
  if (entries.length === 0) {
    return 1;
  }
  const record = parsed as Record<string, unknown>;
  const hits = entries.filter(([key, value]) => {
    if (!(key in record)) {
      return false;
    }
    return value === null || normalise(String(record[key])) === normalise(String(value));
  });
  return hits.length / entries.length;
};

/** One case, run against one model. */
export interface EvalCaseResult {
  caseId: string;
  score: Score;
  weight: number;
  output: string;
  /** Milliseconds for the call. */
  durationMs: number;
  /**
   * True when generation stopped at the token ceiling rather than finishing.
   * A truncated answer scores badly for a reason that has nothing to do with
   * the model's ability, so it is surfaced rather than folded into the score.
   */
  truncated: boolean;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

/** One model's performance on a whole suite. */
export interface EvalRunResult {
  suiteId: string;
  suiteVersion: string;
  modelId: string;
  route: ProviderRoute;
  resolvedModelId: string;
  /** Weighted mean score across cases, 0 to 1. */
  score: Score;
  /** Cases scoring a full 1. */
  passed: number;
  /** Cases attempted. */
  total: number;
  /**
   * Cases that hit the token ceiling. Any non-zero count invalidates the score
   * as a capability measure — raise the ceiling or lower reasoning effort and
   * re-run before comparing.
   */
  truncated: number;
  /** Total milliseconds across all cases. */
  totalMs: number;
  /** Total tokens billed across all cases. */
  inputTokens: number;
  outputTokens: number;
  results: readonly EvalCaseResult[];
}

/** Options for running a suite against one model. */
export interface EvalRunOptions {
  ai: AIClient;
  suite: EvalSuite;
  /** Canonical model ID to evaluate. */
  modelId: string;
  /** Route to reach it through. */
  route: ProviderRoute;
  signal?: AbortSignal;
}

/**
 * Run a suite against one model.
 *
 * A failed call scores zero rather than throwing. A model that cannot complete
 * the task is worse than one that completes it badly, and hiding that behind an
 * exception would drop it out of the ranking entirely.
 */
export async function runEval(options: EvalRunOptions): Promise<EvalRunResult> {
  const { ai, modelId, route, suite } = options;
  const resolvedModelId = resolveProviderModelId(modelId, route);
  const results: EvalCaseResult[] = [];

  for (const testCase of suite.cases) {
    const weight = testCase.weight ?? 1;
    const grader = testCase.grader ?? suite.grader;
    const start = performance.now();

    try {
      const generated = await generateText({
        model: ai.modelById(resolvedModelId, { provider: route }),
        prompt: testCase.prompt,
        ...(suite.system ? { system: suite.system } : {}),
        ...ai.generationOptions({
          maxOutputTokens: suite.maxOutputTokens ?? 512,
          modelId,
          provider: route,
          temperature: null,
          tools: "none",
          ...(suite.reasoning ? { reasoning: suite.reasoning } : {}),
        }),
        ...(options.signal ? { abortSignal: options.signal } : {}),
      });

      results.push({
        caseId: testCase.id,
        score: grader(generated.text, testCase.expected),
        weight,
        output: generated.text,
        durationMs: Math.round(performance.now() - start),
        truncated: generated.finishReason === "length",
        inputTokens: generated.usage.inputTokens ?? 0,
        outputTokens: generated.usage.outputTokens ?? 0,
      });
    } catch (error) {
      results.push({
        caseId: testCase.id,
        score: 0,
        weight,
        output: "",
        durationMs: Math.round(performance.now() - start),
        truncated: false,
        inputTokens: 0,
        outputTokens: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const totalWeight = results.reduce((sum, result) => sum + result.weight, 0);
  const weighted = results.reduce((sum, result) => sum + result.score * result.weight, 0);

  return {
    suiteId: suite.id,
    suiteVersion: suite.version,
    modelId,
    route,
    resolvedModelId,
    score: totalWeight > 0 ? weighted / totalWeight : 0,
    passed: results.filter((result) => result.score >= 1).length,
    total: results.length,
    truncated: results.filter((result) => result.truncated).length,
    totalMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
    outputTokens: results.reduce((sum, result) => sum + result.outputTokens, 0),
    results,
  };
}

/** A candidate model, and the route to reach it. */
export interface EvalCandidate {
  modelId: string;
  route: ProviderRoute;
}

/** Options for evaluating several candidates on one suite. */
export interface EvalCompareOptions {
  ai: AIClient;
  suite: EvalSuite;
  candidates: readonly EvalCandidate[];
  /** Per-million-token input price per candidate, keyed by model ID. */
  inputPricePerMillion?: Readonly<Record<string, number>>;
  /** Per-million-token output price per candidate, keyed by model ID. */
  outputPricePerMillion?: Readonly<Record<string, number>>;
  signal?: AbortSignal;
}

/** One candidate's result, with cost and value attached. */
export interface EvalRanking extends EvalRunResult {
  /** USD spent running the suite, when prices were supplied. */
  costUsd: number | undefined;
  /** Score per dollar. The ranking that matters when scores are close. */
  scorePerUsd: number | undefined;
}

/** Candidates ranked on one suite. */
export interface EvalComparison {
  suiteId: string;
  suiteVersion: string;
  task: ModelTask;
  /** Ranked best-first by score, ties broken by cost then speed. */
  rankings: readonly EvalRanking[];
  /** Highest-scoring candidate. */
  best: EvalRanking | undefined;
  /** Best score per dollar among candidates within 5% of the top score. */
  bestValue: EvalRanking | undefined;
}

/**
 * Evaluate several models on one suite and rank them.
 *
 * Candidates run sequentially so that a rate limit on one does not distort the
 * timings of another.
 */
export async function evalCompare(options: EvalCompareOptions): Promise<EvalComparison> {
  const rankings: EvalRanking[] = [];

  for (const candidate of options.candidates) {
    const result = await runEval({
      ai: options.ai,
      suite: options.suite,
      modelId: candidate.modelId,
      route: candidate.route,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    const inputPrice = options.inputPricePerMillion?.[candidate.modelId];
    const outputPrice = options.outputPricePerMillion?.[candidate.modelId];
    const costUsd =
      inputPrice === undefined || outputPrice === undefined
        ? undefined
        : (result.inputTokens / 1_000_000) * inputPrice +
          (result.outputTokens / 1_000_000) * outputPrice;

    rankings.push({
      ...result,
      costUsd,
      scorePerUsd: costUsd !== undefined && costUsd > 0 ? result.score / costUsd : undefined,
    });
  }

  rankings.sort(
    (a, b) =>
      b.score - a.score ||
      (a.costUsd ?? Number.POSITIVE_INFINITY) - (b.costUsd ?? Number.POSITIVE_INFINITY) ||
      a.totalMs - b.totalMs,
  );

  const best = rankings[0];
  const threshold = (best?.score ?? 0) * 0.95;
  const bestValue = rankings
    .filter((ranking) => ranking.score >= threshold && ranking.scorePerUsd !== undefined)
    .sort((a, b) => (b.scorePerUsd ?? 0) - (a.scorePerUsd ?? 0))[0];

  return {
    suiteId: options.suite.id,
    suiteVersion: options.suite.version,
    task: options.suite.task,
    rankings,
    best,
    bestValue,
  };
}
