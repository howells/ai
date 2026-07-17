import type { BenchmarkRouteSpec, BenchmarkRunSpec } from "./benchmark-contracts";

export const RIGOROUS_SUITE = {
  id: "core-performance",
  version: 1,
  cases: [
    { id: "concise-explanation", prompt: "Explain why the sky appears blue in three sentences." },
    {
      id: "structured-reasoning",
      prompt: "List five practical ways to reduce website latency, ordered by likely impact.",
    },
    {
      id: "code-generation",
      prompt: "Write a TypeScript function that groups strings by their first character.",
    },
  ],
} as const;

export interface BenchmarkJob {
  readonly id: string;
  readonly phase: "warmup" | "measured";
  readonly prompt: string;
  readonly promptCaseId: string;
  readonly route: BenchmarkRouteSpec;
  readonly sampleIndex: number;
}

export interface ExpandedBenchmarkRun {
  readonly jobs: readonly BenchmarkJob[];
  readonly reservedAttempts: number;
}

/** Expand a validated run spec exactly once into deterministic provider jobs. */
export function expandBenchmarkRun(spec: BenchmarkRunSpec): ExpandedBenchmarkRun {
  const jobs: BenchmarkJob[] = [];

  if (spec.mode === "explore") {
    for (const route of spec.routes) {
      jobs.push(createJob(route, "explore", spec.prompt, "measured", 0));
    }
    const capacity = 1 + (spec.options?.fallbackModels?.length ?? 0);
    const selected = selectRetryJobs(jobs, spec.retrySampleIds);
    return { jobs: selected, reservedAttempts: selected.length * capacity };
  }

  const warmupCase = RIGOROUS_SUITE.cases[0];
  for (const route of shuffled(spec.routes, spec.seed)) {
    jobs.push(createJob(route, warmupCase.id, warmupCase.prompt, "warmup", 0));
  }

  let block = 0;
  for (const promptCase of RIGOROUS_SUITE.cases) {
    for (let sampleIndex = 0; sampleIndex < spec.samples; sampleIndex += 1) {
      for (const route of shuffled(spec.routes, spec.seed + block + 1)) {
        jobs.push(createJob(route, promptCase.id, promptCase.prompt, "measured", sampleIndex));
      }
      block += 1;
    }
  }

  const selected = selectRetryJobs(jobs, spec.retrySampleIds);
  return { jobs: selected, reservedAttempts: selected.length };
}

function selectRetryJobs(
  jobs: readonly BenchmarkJob[],
  retrySampleIds: readonly string[] | undefined,
): BenchmarkJob[] {
  if (!retrySampleIds?.length) {
    return [...jobs];
  }
  const selected = new Set(retrySampleIds);
  return jobs.filter((job) => selected.has(job.id));
}

function createJob(
  route: BenchmarkRouteSpec,
  promptCaseId: string,
  prompt: string,
  phase: BenchmarkJob["phase"],
  sampleIndex: number,
): BenchmarkJob {
  return {
    id: `${phase}:${promptCaseId}:${sampleIndex}:${route.id}`,
    phase,
    prompt,
    promptCaseId,
    route,
    sampleIndex,
  };
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  const random = mulberry32(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    const current = result[index];
    const replacement = result[target];
    if (current !== undefined && replacement !== undefined) {
      result[index] = replacement;
      result[target] = current;
    }
  }
  return result;
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value = (Math.imul(1_664_525, value) + 1_013_904_223) % 4_294_967_296;
    if (value < 0) {
      value += 4_294_967_296;
    }
    return value / 4_294_967_296;
  };
}
