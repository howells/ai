import { randomUUID } from "node:crypto";
import type { ProviderRoute } from "@howells/ai";
import { BenchmarkApiError } from "./api-errors";
import type { BenchmarkJob, ExpandedBenchmarkRun } from "./benchmark-run";
import { RIGOROUS_SUITE } from "./benchmark-run";
import type { BenchmarkRunSpec } from "./benchmark-contracts";
import { hashPrivateValue } from "./benchmark-crypto";
import { getBenchmarkSql } from "./benchmark-db";
import { getBenchmarkPolicy } from "./benchmark-policy";

interface ReservationRow {
  run_id: string;
  existing: boolean;
  lease_slot: number;
}

export interface ReservedRun {
  cohortHash: string;
  existing: boolean;
  runId: string;
}

export type PersistedRunStatus =
  | "reserved"
  | "running"
  | "completed"
  | "partial"
  | "cancelled"
  | "failed"
  | "expired";

export interface PersistedSample {
  backingProvider?: string;
  costMicros?: number;
  errorCode?: string;
  generationDurationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  resolvedModelId?: string;
  status: "success" | "error" | "cancelled";
  totalDurationMs?: number;
  ttftMs?: number;
}

/** Reserve quota and an execution lease using the committed database function. */
export async function reserveBenchmarkRun(
  sessionId: string,
  runId: string,
  spec: BenchmarkRunSpec,
  expanded: ExpandedBenchmarkRun,
): Promise<ReservedRun> {
  const policy = getBenchmarkPolicy();
  const requestHash = privateHash(stableStringify(spec), "request");
  const promptSetHash =
    spec.mode === "rigorous"
      ? privateHash(`${RIGOROUS_SUITE.id}:${RIGOROUS_SUITE.version}`, "suite")
      : privateHash(spec.prompt, "prompt");
  const effectiveOptions =
    spec.mode === "rigorous"
      ? {
          cache: false,
          fallbacks: false,
          responseHealing: false,
          serviceTier: "default",
          webSearch: false,
        }
      : (spec.options ?? {});
  const optionsHash = privateHash(stableStringify(effectiveOptions), "options");
  const imageSetHash = privateHash(stableStringify(spec.images?.toSorted() ?? []), "images");
  const logicalModels = [...new Set(spec.routes.map((route) => route.model))].toSorted();
  const routeOptions = [
    ...new Set(
      spec.routes.map((route) =>
        stableStringify({
          model: route.model,
          reasoning: spec.mode === "rigorous" ? "off" : (route.reasoning ?? "off"),
          routeProvider: spec.mode === "explore" ? route.routeProvider : undefined,
        }),
      ),
    ),
  ].toSorted();
  const cohortHash = privateHash(
    stableStringify({
      appVersion: "0.3.0",
      hashKeyVersion: policy.hashKeyVersion,
      imageSetHash,
      logicalModels,
      maxOutputTokens: spec.maxOutputTokens,
      mode: spec.mode,
      optionsHash,
      promptSetHash,
      region: deploymentRegion(),
      routeOptions,
      samples: spec.mode === "rigorous" ? spec.samples : 1,
      schemaVersion: 1,
      suite: spec.mode === "rigorous" ? RIGOROUS_SUITE.version : undefined,
    }),
    "cohort",
  );

  try {
    const rows = (await getBenchmarkSql()`
      SELECT * FROM reserve_benchmark_run(
        ${runId}::uuid,
        ${spec.requestKey}::uuid,
        ${requestHash},
        ${sessionId}::uuid,
        ${spec.mode},
        ${spec.mode === "rigorous" ? RIGOROUS_SUITE.id : null},
        ${spec.mode === "rigorous" ? RIGOROUS_SUITE.version : null},
        ${promptSetHash},
        ${optionsHash},
        ${cohortHash},
        ${policy.hashKeyVersion},
        ${spec.seed},
        ${expanded.jobs.filter((job) => job.phase === "warmup").length},
        ${expanded.jobs.filter((job) => job.phase === "measured").length},
        ${expanded.reservedAttempts},
        ${policy.dailyAttemptLimit},
        ${policy.activeRunLimit},
        ${deploymentRegion()},
        ${"0.3.0"},
        ${process.env.VERCEL_GIT_COMMIT_SHA ?? null}
      )
    `) as unknown as ReservationRow[];
    const reservation = rows[0];
    if (!reservation) {
      throw new BenchmarkApiError(500, "benchmark/reservation-failed", "Run reservation failed.");
    }
    return { cohortHash, existing: reservation.existing, runId: reservation.run_id };
  } catch (error) {
    throw normalizeReservationError(error);
  }
}

export async function markBenchmarkAttempt(runId: string): Promise<void> {
  await getBenchmarkSql()`SELECT mark_benchmark_attempt(${runId}::uuid)`;
}

export async function loadBenchmarkRunStatus(
  sessionId: string,
  runId: string,
): Promise<PersistedRunStatus> {
  const rows = (await getBenchmarkSql()`
    SELECT status
    FROM benchmark_runs
    WHERE id = ${runId}::uuid AND session_id = ${sessionId}::uuid
    LIMIT 1
  `) as unknown as { status: PersistedRunStatus }[];
  const status = rows[0]?.status;
  if (!status) {
    throw new BenchmarkApiError(500, "benchmark/run-not-found", "The existing run was not found.");
  }
  return status;
}

export async function finalizeBenchmarkRun(
  runId: string,
  status: "completed" | "partial" | "cancelled" | "failed",
): Promise<void> {
  await getBenchmarkSql()`SELECT finalize_benchmark_run(${runId}::uuid, ${status})`;
}

/** Persist one privacy-safe raw sample through the authenticated run relationship. */
export async function persistBenchmarkSample(
  sessionId: string,
  runId: string,
  job: BenchmarkJob,
  ordinal: number,
  sample: PersistedSample,
): Promise<void> {
  const policy = getBenchmarkPolicy();
  await getBenchmarkSql()`
    INSERT INTO benchmark_samples (
      id, run_id, phase, status, prompt_case_id, prompt_hash, sample_index,
      execution_ordinal, logical_model_id, requested_model_id, provider_route,
      resolved_model_id, backing_provider, route_variant, input_tokens,
      output_tokens, ttft_ms, generation_duration_ms, total_duration_ms,
      cost_micros, error_code
    )
    SELECT
      ${randomUUID()}::uuid, r.id, ${job.phase}, ${sample.status},
      ${job.promptCaseId},
      ${hashPrivateValue(job.prompt, policy.hashSecret, "prompt")},
      ${job.sampleIndex}, ${ordinal}, ${job.route.model}, ${job.route.model},
      ${job.route.provider}, ${sample.resolvedModelId ?? null},
      ${sample.backingProvider ?? null}, ${job.route.routeProvider ?? null},
      ${sample.inputTokens ?? null}, ${sample.outputTokens ?? null},
      ${sample.ttftMs ?? null}, ${sample.generationDurationMs ?? null},
      ${sample.totalDurationMs ?? null}, ${sample.costMicros ?? null},
      ${sample.errorCode ?? null}
    FROM benchmark_runs r
    WHERE r.id = ${runId}::uuid AND r.session_id = ${sessionId}::uuid
    ON CONFLICT (
      run_id, phase, prompt_case_id, sample_index, logical_model_id,
      provider_route, route_variant
    ) DO NOTHING
  `;
}

export async function remainingDailyAttempts(): Promise<number> {
  const policy = getBenchmarkPolicy();
  const rows = (await getBenchmarkSql()`
    SELECT charged_attempts
    FROM benchmark_daily_quotas
    WHERE quota_date = (now() AT TIME ZONE 'UTC')::date
  `) as unknown as { charged_attempts: number }[];
  return Math.max(0, policy.dailyAttemptLimit - (rows[0]?.charged_attempts ?? 0));
}

export interface CohortHistoryRow {
  provider: ProviderRoute;
  logicalModelId: string;
  sampleCount: number;
  successRate: number;
  medianTtftMs: number | null;
  p25TtftMs: number | null;
  p75TtftMs: number | null;
  medianTotalMs: number | null;
  medianGenerationMs: number | null;
  pairedMedianTotalDeltaMs: number | null;
  pairedSampleCount: number;
  totalCostMicros: number;
}

/** Aggregate one exact authenticated cohort in Postgres. */
export async function loadCohortHistory(cohortHash: string): Promise<CohortHistoryRow[]> {
  const rows = (await getBenchmarkSql()`
    WITH measured AS (
      SELECT s.*
      FROM benchmark_samples s
      JOIN benchmark_runs r ON r.id = s.run_id
      WHERE r.cohort_hash = ${cohortHash}
        AND r.region = ${deploymentRegion()}
        AND r.status IN ('completed', 'partial')
        AND s.phase = 'measured'
    ), summaries AS (
    SELECT
      s.provider_route AS provider,
      s.logical_model_id,
      count(*)::integer AS sample_count,
      avg((s.status = 'success')::integer)::double precision AS success_rate,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.ttft_ms)
        FILTER (WHERE s.status = 'success') AS median_ttft_ms,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY s.ttft_ms)
        FILTER (WHERE s.status = 'success') AS p25_ttft_ms,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY s.ttft_ms)
        FILTER (WHERE s.status = 'success') AS p75_ttft_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.total_duration_ms)
        FILTER (WHERE s.status = 'success') AS median_total_ms,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY s.generation_duration_ms)
        FILTER (WHERE s.status = 'success') AS median_generation_ms,
      coalesce(sum(s.cost_micros), 0)::bigint AS total_cost_micros
    FROM measured s
    GROUP BY s.provider_route, s.logical_model_id
    ), baselines AS (
      SELECT DISTINCT ON (logical_model_id)
        logical_model_id, provider AS baseline_provider
      FROM summaries
      WHERE median_total_ms IS NOT NULL
      ORDER BY logical_model_id, median_total_ms, provider
    ), paired AS (
      SELECT
        candidate.provider_route AS provider,
        candidate.logical_model_id,
        count(*)::integer AS paired_sample_count,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY candidate.total_duration_ms - baseline.total_duration_ms
        ) AS paired_median_total_delta_ms
      FROM measured candidate
      JOIN baselines selected USING (logical_model_id)
      JOIN measured baseline
        ON baseline.run_id = candidate.run_id
        AND baseline.logical_model_id = candidate.logical_model_id
        AND baseline.prompt_case_id = candidate.prompt_case_id
        AND baseline.sample_index = candidate.sample_index
        AND baseline.provider_route = selected.baseline_provider
      WHERE candidate.status = 'success' AND baseline.status = 'success'
      GROUP BY candidate.provider_route, candidate.logical_model_id
    )
    SELECT summaries.*, paired.paired_sample_count, paired.paired_median_total_delta_ms
    FROM summaries
    LEFT JOIN paired USING (provider, logical_model_id)
    ORDER BY logical_model_id, provider
  `) as unknown as {
    provider: ProviderRoute;
    logical_model_id: string;
    sample_count: number;
    success_rate: number;
    median_ttft_ms: number | null;
    p25_ttft_ms: number | null;
    p75_ttft_ms: number | null;
    median_total_ms: number | null;
    median_generation_ms: number | null;
    paired_median_total_delta_ms: number | null;
    paired_sample_count: number | null;
    total_cost_micros: string | number;
  }[];
  return rows.map((row) => ({
    logicalModelId: row.logical_model_id,
    medianGenerationMs: row.median_generation_ms,
    medianTotalMs: row.median_total_ms,
    medianTtftMs: row.median_ttft_ms,
    p25TtftMs: row.p25_ttft_ms,
    p75TtftMs: row.p75_ttft_ms,
    pairedMedianTotalDeltaMs: row.paired_median_total_delta_ms,
    pairedSampleCount: row.paired_sample_count ?? 0,
    provider: row.provider,
    sampleCount: row.sample_count,
    successRate: row.success_rate,
    totalCostMicros: Number(row.total_cost_micros),
  }));
}

/** Load the newest completed rigorous cohort for initial server rendering. */
export async function loadLatestRigorousHistory(): Promise<{
  cohortHash?: string;
  rows: CohortHistoryRow[];
}> {
  const latest = (await getBenchmarkSql()`
    SELECT cohort_hash
    FROM benchmark_runs
    WHERE mode = 'rigorous'
      AND status IN ('completed', 'partial')
      AND region = ${deploymentRegion()}
    ORDER BY completed_at DESC
    LIMIT 1
  `) as unknown as { cohort_hash: string }[];
  const cohortHash = latest[0]?.cohort_hash;
  return cohortHash ? { cohortHash, rows: await loadCohortHistory(cohortHash) } : { rows: [] };
}

function privateHash(value: string, domain: string): string {
  const policy = getBenchmarkPolicy();
  return hashPrivateValue(value, policy.hashSecret, domain);
}

function normalizeReservationError(error: unknown): BenchmarkApiError {
  if (error instanceof BenchmarkApiError) {
    return error;
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("benchmark/idempotency-mismatch")) {
    return new BenchmarkApiError(
      409,
      "benchmark/idempotency-mismatch",
      "That request key was already used for different work.",
    );
  }
  if (message.includes("benchmark/daily-quota-exceeded")) {
    return new BenchmarkApiError(
      429,
      "benchmark/daily-quota-exceeded",
      "The daily benchmark limit has been reached.",
    );
  }
  if (message.includes("benchmark/concurrency-limit")) {
    return new BenchmarkApiError(
      429,
      "benchmark/concurrency-limit",
      "Two benchmark runs are already active.",
    );
  }
  return new BenchmarkApiError(500, "benchmark/reservation-failed", "Run reservation failed.");
}

function deploymentRegion(): string {
  return process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.entries(value)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}
