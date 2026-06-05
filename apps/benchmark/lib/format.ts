/** Benchmark metric keys that can be selected for comparison and sorting. */
export type MetricKey = "ttft" | "tokensPerSecond" | "totalTime";

/** Format a millisecond duration for compact table display. */
export function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format raw token-per-second throughput without the unit suffix. */
export function formatTps(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (value < 10) {
    return value.toFixed(1);
  }
  return Math.round(value).toString();
}

/** Format token-per-second throughput with the benchmark unit suffix. */
export function formatTpsWithUnit(value: number): string {
  return `${formatTps(value)} t/s`;
}

/**
 * Per-cell cost format. Always 4 decimals so the cost column reads as a
 * single rhythm — no `$0` / `<$0.0001` / `$0.0001` mix in adjacent rows.
 * Sub-rounding (|value| < 0.00005) collapses to `$0.0000` instead of the
 * less-than form so cells stay typographically aligned.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000_05) {
    return "$0.0000";
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

/** Pluralize a count-sensitive label with an optional irregular plural form. */
export function pluralize(n: number, single: string, plural?: string): string {
  if (n === 1) {
    return single;
  }
  return plural ?? `${single}s`;
}

/** UI metadata for one benchmark metric. */
export interface MetricMeta {
  short: string;
  full: string;
  description: string;
  /** Direction "lower" means lower-is-better; "higher" means higher-is-better. */
  direction: "lower" | "higher";
  unit: string;
}

/** Display metadata for benchmark metrics used by tables, legends, and charts. */
export const METRIC_META: Record<MetricKey, MetricMeta> = {
  tokensPerSecond: {
    description: "Streaming throughput once the model starts generating. Higher is better.",
    direction: "higher",
    full: "Tokens per second",
    short: "TPS",
    unit: "t/s",
  },
  totalTime: {
    description: "End-to-end wall time from request to last token. Lower is better.",
    direction: "lower",
    full: "Total time",
    short: "TOTAL",
    unit: "ms · s",
  },
  ttft: {
    description: "Latency from request to the first streamed token. Lower is better.",
    direction: "lower",
    full: "Time to first token",
    short: "TTFT",
    unit: "ms · s",
  },
};
