export type MetricKey = "ttft" | "tokensPerSecond" | "totalTime";

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTps(value: number): string {
  if (value === 0) return "0";
  if (value < 10) return value.toFixed(1);
  return Math.round(value).toString();
}

export function formatTpsWithUnit(value: number): string {
  return `${formatTps(value)} t/s`;
}

/*
 * Per-cell cost format. Always 4 decimals so the cost column reads as a
 * single rhythm — no `$0` / `<$0.0001` / `$0.0001` mix in adjacent rows.
 * Sub-rounding (|value| < 0.00005) collapses to `$0.0000` instead of the
 * less-than form so cells stay typographically aligned.
 */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.00005) return "$0.0000";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

export function pluralize(n: number, single: string, plural?: string): string {
  if (n === 1) return single;
  return plural ?? `${single}s`;
}

export interface MetricMeta {
  short: string;
  full: string;
  description: string;
  /** Direction "lower" means lower-is-better; "higher" means higher-is-better. */
  direction: "lower" | "higher";
  unit: string;
}

export const METRIC_META: Record<MetricKey, MetricMeta> = {
  ttft: {
    short: "TTFT",
    full: "Time to first token",
    description:
      "Latency from request to the first streamed token. Lower is better.",
    direction: "lower",
    unit: "ms · s",
  },
  tokensPerSecond: {
    short: "TPS",
    full: "Tokens per second",
    description:
      "Streaming throughput once the model starts generating. Higher is better.",
    direction: "higher",
    unit: "t/s",
  },
  totalTime: {
    short: "TOTAL",
    full: "Total time",
    description:
      "End-to-end wall time from request to last token. Lower is better.",
    direction: "lower",
    unit: "ms · s",
  },
};
