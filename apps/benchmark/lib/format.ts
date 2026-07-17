/** Benchmark metric keys that can be selected for comparison and sorting. */
/** Format a millisecond duration for compact table display. */
export function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/** Format raw token-per-second throughput without the unit suffix. */
function formatTps(value: number): string {
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
