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
