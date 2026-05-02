"use client";

import { METRIC_META, type MetricKey } from "../lib/format";

interface LegendBarProps {
  metric: MetricKey;
  configuredCount: number;
  totalProviders: number;
  region: string | null;
  stale: boolean;
}

/*
 * Bottom status bar — V7 product idiom: soft tinted status pills explain the
 * cell semantics, with `·` dot separators in between. Stays calm so the data
 * above can do the talking.
 */
export function LegendBar({
  metric,
  configuredCount,
  totalProviders,
  region,
  stale,
}: LegendBarProps) {
  const meta = METRIC_META[metric];

  return (
    <div className="flex h-10 shrink-0 items-center gap-3 overflow-hidden border-[var(--color-border)] border-t bg-[var(--color-surface)] px-6 text-[11px] text-[var(--color-text-muted)]">
      <span className="pill pill--best">best</span>
      <Sep />
      <span className="text-[var(--color-text-faint)]">— no route</span>
      <Sep />
      <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent-strong)]"
        />
        running
      </span>
      <Sep />
      <span className="pill pill--warn">no key</span>
      <Sep />
      <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
        <span className="font-medium text-[var(--color-text)]">
          {meta.short}
        </span>
        <span className="hidden text-[var(--color-text-faint)] md:inline">
          · {meta.full.toLowerCase()}
        </span>
        <span className="text-[var(--color-text-faint)]">
          · {meta.direction === "lower" ? "lower wins" : "higher wins"}
        </span>
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
        {stale && (
          <span
            title="Inputs changed since last run. Re-run for fresh data."
            className="pill pill--warn"
          >
            stale
          </span>
        )}
        <span
          title={`${configuredCount} of ${totalProviders} provider API keys configured`}
          className="data tabular-nums text-[var(--color-text-muted)]"
        >
          {configuredCount}/{totalProviders} keys
        </span>
        {region && (
          <span
            title="Server region the benchmark API is running in"
            className="data tabular-nums text-[var(--color-text-faint)]"
          >
            {region.toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function Sep() {
  return (
    <span aria-hidden="true" className="text-[var(--color-text-faint)]">
      ·
    </span>
  );
}
