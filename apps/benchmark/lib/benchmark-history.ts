import { createHash, randomUUID } from "node:crypto";
import type { ProviderRoute } from "@howells/ai";
import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { MetricKey } from "./format";
import type { BenchmarkHistoryResponse, HistoricalProviderSummary } from "./history-types";
import { getProviderComparisons, resultMetricValue } from "./result-insights";
import type { BenchmarkMetricResult } from "./result-insights";

const HISTORY_METRICS = ["ttft", "totalTime", "tokensPerSecond"] as const;
const HISTORY_WINDOW_DAYS = 90;
const HISTORY_LIMIT = 5000;

type HistoryMetricKey = (typeof HISTORY_METRICS)[number];

interface BenchmarkHistoryResult extends BenchmarkMetricResult {
  model: string;
  costUsd?: number;
  inputTokens: number;
  outputTokens: number;
  region: string;
  round?: number;
  averaged?: boolean;
}

/** Inputs persisted for one benchmark result row. */
export interface PersistBenchmarkResultInput {
  prompt: string;
  optionsHash: string;
  result: BenchmarkHistoryResult;
}

/** Database row shape returned from benchmark_results queries. */
export interface BenchmarkHistoryRow {
  created_at: string | Date;
  model: string;
  model_label: string;
  provider: ProviderRoute;
  route_model_id: string;
  ttft: number;
  total_time: number;
  output_tokens: number;
  input_tokens: number;
  tokens_per_second: number;
  cost_usd: number | null;
  region: string;
  round: number | null;
  averaged: boolean;
  error: string | null;
}

type SqlClient = NeonQueryFunction<false, false>;

let schemaReady: Promise<boolean> | null = null;

/** Return whether a configured database URL is available for history storage. */
export function benchmarkHistoryAvailable(): boolean {
  return Boolean(getDatabaseUrl());
}

/** Hash benchmark prompt or option text for stable grouping. */
export function hashBenchmarkText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hash structured benchmark options with stable key ordering. */
export function benchmarkOptionsHash(value: unknown): string {
  return hashBenchmarkText(stableStringify(value));
}

/** Persist one benchmark result if database history is configured. */
export async function persistBenchmarkResult({
  prompt,
  optionsHash,
  result,
}: PersistBenchmarkResultInput): Promise<void> {
  const sql = await getReadySql();
  if (!sql) {
    return;
  }

  await sql`
    INSERT INTO benchmark_results (
      id,
      prompt,
      prompt_hash,
      options_hash,
      model,
      model_label,
      provider,
      route_model_id,
      ttft,
      total_time,
      output_tokens,
      input_tokens,
      tokens_per_second,
      cost_usd,
      region,
      round,
      averaged,
      error
    )
    VALUES (
      ${randomUUID()},
      ${prompt},
      ${hashBenchmarkText(prompt)},
      ${optionsHash},
      ${result.model},
      ${result.label},
      ${result.provider},
      ${result.model},
      ${result.ttft},
      ${result.totalTime},
      ${result.outputTokens},
      ${result.inputTokens},
      ${result.tokensPerSecond},
      ${result.costUsd ?? null},
      ${result.region},
      ${result.round ?? null},
      ${Boolean(result.averaged)},
      ${result.error ?? null}
    )
  `;
}

/** Load recent benchmark history for the requested model/provider filters. */
export async function loadBenchmarkHistory({
  models,
  providers,
}: {
  models: readonly string[];
  providers: readonly ProviderRoute[];
}): Promise<BenchmarkHistoryResponse> {
  const sql = await getReadySql();
  if (!sql) {
    return { available: false, providers: [] };
  }

  const rows = (await sql`
    SELECT
      created_at,
      model,
      model_label,
      provider,
      route_model_id,
      ttft,
      total_time,
      output_tokens,
      input_tokens,
      tokens_per_second,
      cost_usd,
      region,
      round,
      averaged,
      error
    FROM benchmark_results
    WHERE created_at >= now() - (${HISTORY_WINDOW_DAYS} * interval '1 day')
      AND averaged = false
    ORDER BY created_at DESC
    LIMIT ${HISTORY_LIMIT}
  `) as unknown as BenchmarkHistoryRow[];

  return {
    available: true,
    providers: summarizeBenchmarkHistory(rows, { models, providers }),
  };
}

/** Summarize raw benchmark rows into per-provider historical comparisons. */
export function summarizeBenchmarkHistory(
  rows: readonly BenchmarkHistoryRow[],
  {
    models,
    providers,
  }: {
    models?: readonly string[];
    providers?: readonly ProviderRoute[];
  } = {},
): HistoricalProviderSummary[] {
  const modelSet = models?.length ? new Set(models) : null;
  const providerSet = providers?.length ? new Set(providers) : null;
  const filtered = rows.filter((row) => {
    if (modelSet && !modelSet.has(row.model_label)) {
      return false;
    }
    if (providerSet && !providerSet.has(row.provider)) {
      return false;
    }
    return true;
  });

  const byProvider = new Map<
    ProviderRoute,
    {
      rows: BenchmarkHistoryRow[];
      lastSeen: string;
    }
  >();

  for (const row of filtered) {
    const createdAt =
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
    const current = byProvider.get(row.provider) ?? {
      lastSeen: createdAt,
      rows: [],
    };
    current.rows.push(row);
    if (createdAt > current.lastSeen) {
      current.lastSeen = createdAt;
    }
    byProvider.set(row.provider, current);
  }

  const comparisonsByMetric = new Map<
    HistoryMetricKey,
    ReturnType<typeof getProviderComparisons>
  >();
  for (const metric of HISTORY_METRICS) {
    comparisonsByMetric.set(
      metric,
      getProviderComparisons(filtered.map(historyRowToMetricResult), metric, providers),
    );
  }

  return [...byProvider.entries()]
    .map(([provider, value]) => {
      const medians: HistoricalProviderSummary["medians"] = {};
      const scores: HistoricalProviderSummary["scores"] = {};
      for (const metric of HISTORY_METRICS) {
        const metricValues = value.rows
          .filter((row) => !row.error)
          .map((row) => historyMetricValue(row, metric))
          .filter((n) => Number.isFinite(n) && n > 0)
          .toSorted((a, b) => a - b);
        const medianValue = median(metricValues);
        if (medianValue !== undefined) {
          medians[metric] = medianValue;
        }

        const comparison = comparisonsByMetric.get(metric)?.[provider];
        if (comparison) {
          scores[metric] = comparison;
        }
      }

      return {
        lastSeen: value.lastSeen,
        medians,
        provider,
        runCount: value.rows.length,
        scores,
      };
    })
    .toSorted((a, b) => a.provider.localeCompare(b.provider));
}

async function getReadySql(): Promise<SqlClient | null> {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    return null;
  }
  const sql = neon(connectionString);
  schemaReady ??= ensureBenchmarkHistorySchema(sql);
  const ready = await schemaReady;
  return ready ? sql : null;
}

async function ensureBenchmarkHistorySchema(sql: SqlClient): Promise<boolean> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS benchmark_results (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        prompt text NOT NULL,
        prompt_hash text NOT NULL,
        options_hash text NOT NULL,
        model text NOT NULL,
        model_label text NOT NULL,
        provider text NOT NULL,
        route_model_id text NOT NULL,
        ttft integer NOT NULL,
        total_time integer NOT NULL,
        output_tokens integer NOT NULL,
        input_tokens integer NOT NULL,
        tokens_per_second double precision NOT NULL,
        cost_usd double precision,
        region text NOT NULL,
        round integer,
        averaged boolean NOT NULL DEFAULT false,
        error text
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS benchmark_results_created_at_idx
      ON benchmark_results (created_at DESC)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS benchmark_results_model_provider_idx
      ON benchmark_results (model_label, provider)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS benchmark_results_prompt_options_idx
      ON benchmark_results (prompt_hash, options_hash)
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS benchmark_results_provider_created_at_idx
      ON benchmark_results (provider, created_at DESC)
    `;
    return true;
  } catch (error) {
    console.warn("Benchmark history unavailable:", error);
    schemaReady = null;
    return false;
  }
}

function getDatabaseUrl(): string | undefined {
  return process.env.POSTGRES_URL || process.env.DATABASE_URL;
}

function historyRowToMetricResult(row: BenchmarkHistoryRow): BenchmarkMetricResult {
  return {
    error: row.error ?? undefined,
    label: row.model_label,
    provider: row.provider,
    tokensPerSecond: row.tokens_per_second,
    totalTime: row.total_time,
    ttft: row.ttft,
  };
}

function historyMetricValue(row: BenchmarkHistoryRow, metric: MetricKey): number {
  return resultMetricValue(historyRowToMetricResult(row), metric);
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[middle];
  }
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  return `{${Object.entries(value)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(",")}}`;
}
