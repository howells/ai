"use client";

import {
  formatMs,
  formatTpsWithUnit,
  formatUsd,
  pluralize,
  type MetricKey,
} from "../lib/format";
import { formatProviderScore } from "../lib/result-insights";
import { Tooltip } from "./tooltip";

interface RunQueueStripProps {
  runs: number;
  models: number;
  providers: number;
  rounds: number;
  totalRequests: number;
  completed: number;
  running: boolean;
  disabled: boolean;
  disabledReason?: string;
  /** Errors in the last completed run, used to flag in the summary. */
  errors: number;
  /** Fastest TTFT in ms, used in the post-run summary. */
  fastestTtft: number | null;
  fastestModel?: string;
  fastestModelProvider?: string;
  fastestModelValue?: number;
  fastestProvider?: string;
  fastestProviderScore?: number;
  fastestProviderMatchedModels?: number;
  historicalProvider?: string;
  historicalProviderScore?: number;
  historicalProviderMatchedModels?: number;
  metric: MetricKey;
  totalCostUsd?: number;
  /** Whether to render the "complete" summary instead of the queue view. */
  hasResults: boolean;
  stale: boolean;
  onRun: () => void;
}

/*
 * The single editorial moment of the app. The big numeral renders in Fraunces
 * (display serif), surrounded by calm sentence-case meta. Slots have fixed
 * minimum widths so geometry doesn't reflow as the strip cycles through
 * idle / running / done; only the content inside each slot cross-fades.
 */
export function RunQueueStrip({
  runs,
  models,
  providers,
  rounds,
  totalRequests,
  completed,
  running,
  disabled,
  disabledReason,
  errors,
  fastestTtft,
  fastestModel,
  fastestModelProvider,
  fastestModelValue,
  fastestProvider,
  fastestProviderScore,
  fastestProviderMatchedModels,
  historicalProvider,
  historicalProviderScore,
  historicalProviderMatchedModels,
  metric,
  totalCostUsd,
  hasResults,
  stale,
  onRun,
}: RunQueueStripProps) {
  const empty = runs === 0;
  const progress =
    totalRequests > 0 ? Math.min(completed / totalRequests, 1) : 0;
  const showSummary = hasResults && !running;

  // Hero swaps to fastest time once a run has results (Observation 9). The
  // editorial Fraunces moment now carries the win condition.
  const heroIsFastest =
    showSummary && fastestModelValue !== undefined && !!fastestModel;
  const heroValue = heroIsFastest
    ? formatRunMetric(fastestModelValue, metric)
    : totalRequests.toString();
  const heroEyebrow = heroIsFastest
    ? `Fastest · ${[fastestModel, fastestModelProvider].filter(Boolean).join(" · ")}`
    : `${pluralize(totalRequests, "call")} queued`;

  const showCurrentProviderScore =
    !stale &&
    fastestProvider &&
    fastestProviderScore !== undefined &&
    fastestProviderMatchedModels !== undefined &&
    fastestProviderMatchedModels > 1;
  const showHistoricalProviderScore =
    historicalProvider &&
    historicalProviderScore !== undefined &&
    historicalProviderMatchedModels !== undefined &&
    historicalProviderMatchedModels > 1;

  // Primary insight slot — same width across all states so the hand-off
  // between "live API estimate", historical avg, current avg, and running
  // progress doesn't reflow the strip.
  let insightLabel: string | undefined;
  let insightPrimary: string | undefined;
  let insightDetail: string | undefined;
  if (running) {
    insightLabel = "Progress";
    insightPrimary = `${completed}/${totalRequests}`;
  } else if (showSummary && showCurrentProviderScore) {
    insightLabel = "Fastest route avg";
    insightPrimary = formatProviderScore(fastestProviderScore ?? 0);
    insightDetail = `${fastestProvider} · ${fastestProviderMatchedModels} matched`;
  } else if (showSummary && fastestTtft !== null && !heroIsFastest) {
    insightLabel = "Fastest";
    insightPrimary = formatMs(fastestTtft);
  } else if (!showSummary && showHistoricalProviderScore) {
    insightLabel = "Historical route avg";
    insightPrimary = formatProviderScore(historicalProviderScore ?? 0);
    insightDetail = `${historicalProvider} · ${historicalProviderMatchedModels} matched`;
  } else if (!showSummary && totalRequests > 0) {
    insightLabel = "Estimate";
    insightPrimary = `≈ ${totalRequests} live API ${pluralize(totalRequests, "call")}`;
    insightDetail = "uses your keys";
  }

  const showCost =
    showSummary && totalCostUsd !== undefined && totalCostUsd > 0;
  const showErrors = showSummary && errors > 0;

  const button = (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled && !running}
      className={`relative flex h-9 cursor-pointer items-center justify-center gap-2 self-center whitespace-nowrap rounded-[var(--radius-pill)] px-5 text-[13px] font-medium transition-colors ${
        running
          ? "bg-[var(--color-raised)] text-[var(--color-text)] hover:bg-[var(--color-overlay)]"
          : "bg-[var(--color-cta)] text-[var(--color-cta-fg)] hover:bg-[var(--color-cta-hover)] disabled:cursor-not-allowed disabled:bg-[var(--color-raised)] disabled:text-[var(--color-text-faint)]"
      }`}
    >
      {running ? (
        <>
          <span aria-hidden="true">■</span>
          Cancel
        </>
      ) : (
        <>
          {showSummary ? "Run again" : "Run"}
          {rounds > 1 && (
            <span className="data text-[var(--color-cta-fg)]/70">
              ×{rounds}
            </span>
          )}
          <span aria-hidden="true">→</span>
        </>
      )}
    </button>
  );

  return (
    <div className="relative flex items-stretch overflow-hidden border-[var(--color-border)] border-b bg-[var(--color-surface)]">
      {running && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-[var(--color-raised)] transition-[width] duration-300 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      )}

      <div className="relative flex min-w-0 flex-1 items-center gap-6 overflow-hidden px-6 py-3">
        {/* Hero numeral slot — Fraunces. Promotes to fastest-time post-run. */}
        <Slot minWidth={130}>
          <DisplayPair
            value={heroValue}
            label={heroEyebrow}
            dim={empty && !heroIsFastest}
          />
        </Slot>

        <Divider />

        {/* Scope slot — routes / models / providers / rounds. */}
        <Slot minWidth={260}>
          <div className="flex items-baseline gap-4">
            <Pair value={runs.toString()} label={pluralize(runs, "route")} dim={empty} />
            <Pair value={models.toString()} label={pluralize(models, "model")} dim={empty} />
            <Pair value={providers.toString()} label={pluralize(providers, "provider")} dim={empty} />
            <Pair value={rounds.toString()} label={pluralize(rounds, "round")} dim={false} />
          </div>
        </Slot>

        {/* Primary insight slot — sized for the longest expected content. */}
        <Slot minWidth={240}>
          {insightLabel && insightPrimary ? (
            <StatGroup
              label={insightLabel}
              primary={insightPrimary}
              detail={insightDetail}
              completed={running ? completed : undefined}
              total={running ? totalRequests : undefined}
            />
          ) : (
            <Placeholder />
          )}
        </Slot>

        {/* Cost slot — appears post-run, reserved when empty. */}
        <Slot minWidth={80}>
          {showCost ? (
            <StatGroup label="Cost" primary={formatUsd(totalCostUsd ?? 0)} />
          ) : (
            <Placeholder />
          )}
        </Slot>

        {/* Errors slot — appears post-run only when present. */}
        {showErrors && (
          <Slot minWidth={70}>
            <StatGroup
              label="Errors"
              primary={errors.toString()}
              tone="error"
            />
          </Slot>
        )}

        {empty && !running && disabledReason && (
          <span className="ml-auto truncate text-[12px] text-[var(--color-text-faint)]">
            {disabledReason}
          </span>
        )}
      </div>

      <div className="relative flex shrink-0 items-stretch border-[var(--color-border)] border-l px-3">
        {disabled && !running && disabledReason ? (
          <Tooltip content={disabledReason} side="top" align="end" width={200}>
            {button}
          </Tooltip>
        ) : (
          button
        )}
      </div>
    </div>
  );
}

/*
 * Fixed-width container for a strip section. Locks geometry so swapping
 * content inside doesn't reshape the surrounding layout.
 */
function Slot({
  minWidth,
  children,
}: {
  minWidth: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex shrink-0 items-center transition-opacity duration-150 ease-out"
      style={{ minWidth }}
    >
      {children}
    </div>
  );
}

/* Invisible spacer that keeps a slot occupied without reading to AT. */
function Placeholder() {
  return <span aria-hidden="true" className="block h-5" />;
}

/* Big editorial numeral with sentence-case meta — the hero moment. */
function DisplayPair({
  value,
  label,
  dim,
}: {
  value: string;
  label: string;
  dim: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className={`display text-[40px] tabular-nums transition-colors ${
          dim ? "text-[var(--color-text-faint)]" : "text-[var(--color-text)]"
        }`}
      >
        {value}
      </span>
      <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]">
        {label}
      </span>
    </div>
  );
}

/* Compact post-run stat: muted label, value (+ optional inline detail). */
function StatGroup({
  label,
  primary,
  detail,
  tone,
  completed,
  total,
}: {
  label: string;
  primary: string;
  detail?: string;
  tone?: "error";
  completed?: number;
  total?: number;
}) {
  const valueColor =
    tone === "error" ? "text-[var(--color-error-fg)]" : "text-[var(--color-text)]";
  const labelColor =
    tone === "error"
      ? "text-[var(--color-error-fg)]"
      : "text-[var(--color-text-muted)]";

  const primaryNode = (
    <span className={`data text-[15px] tabular-nums ${valueColor}`}>
      {primary}
    </span>
  );

  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className={`text-[12px] whitespace-nowrap ${labelColor}`}>
        {label}
      </span>
      {completed !== undefined && total !== undefined ? (
        <Tooltip
          content={`${completed} of ${total} ${pluralize(total, "call")} complete`}
          side="top"
          align="start"
          width={180}
        >
          {primaryNode}
        </Tooltip>
      ) : (
        primaryNode
      )}
      {detail && (
        <span className="min-w-0 truncate text-[12px] text-[var(--color-text-muted)]">
          {detail}
        </span>
      )}
    </div>
  );
}

function Pair({
  value,
  label,
  dim,
  tone,
}: {
  value: string;
  label: string;
  dim: boolean;
  tone?: "error";
}) {
  const valueColor = dim
    ? "text-[var(--color-text-faint)]"
    : tone === "error"
      ? "text-[var(--color-error-fg)]"
      : "text-[var(--color-text)]";
  const labelColor =
    tone === "error"
      ? "text-[var(--color-error-fg)]"
      : "text-[var(--color-text-muted)]";

  return (
    <div className="flex items-baseline gap-1.5 tabular-nums">
      <span className={`data text-[15px] transition-colors ${valueColor}`}>
        {value}
      </span>
      <span className={`text-[12px] ${labelColor}`}>{label}</span>
    </div>
  );
}

function formatRunMetric(value: number, metric: MetricKey): string {
  return metric === "tokensPerSecond" ? formatTpsWithUnit(value) : formatMs(value);
}

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-px self-center bg-[var(--color-border)]"
    />
  );
}
