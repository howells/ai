"use client";

import { formatMs, pluralize } from "../lib/format";
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
  /** Whether to render the "complete" summary instead of the queue view. */
  hasResults: boolean;
  onRun: () => void;
}

/*
 * The single editorial moment of the app. The big numeral renders in Fraunces
 * (display serif), surrounded by calm sentence-case meta. The Run button is a
 * pure-black pill — V7 product idiom. While running, a V7-orange dot
 * acknowledges activity without screaming.
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
  hasResults,
  onRun,
}: RunQueueStripProps) {
  const empty = runs === 0;
  const progress =
    totalRequests > 0 ? Math.min(completed / totalRequests, 1) : 0;
  const showSummary = hasResults && !running;

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

      <div className="relative flex flex-1 items-center gap-7 px-6 py-3">
        {showSummary ? (
          <>
            <DisplayPair
              value={completed.toString()}
              label={`${pluralize(completed, "run")} complete`}
              dim={false}
            />

            <Divider />

            {fastestTtft !== null && (
              <Pair
                value={formatMs(fastestTtft)}
                label="fastest TTFT"
                dim={false}
              />
            )}

            {errors > 0 ? (
              <Pair
                value={errors.toString()}
                label={pluralize(errors, "error")}
                dim={false}
                tone="error"
              />
            ) : (
              <Pair value="0" label="errors" dim={false} />
            )}
          </>
        ) : (
          <>
            <DisplayPair
              value={runs.toString()}
              label={`${pluralize(runs, "run")} queued`}
              dim={empty}
            />

            <Divider />

            <Pair
              value={models.toString()}
              label={pluralize(models, "model")}
              dim={empty}
            />
            <Pair
              value={providers.toString()}
              label={pluralize(providers, "provider")}
              dim={empty}
            />
            <Pair
              value={rounds.toString()}
              label={pluralize(rounds, "round")}
              dim={false}
            />

            {!running && totalRequests > 0 && (
              <span className="data ml-2 hidden text-[11px] text-[var(--color-text-faint)] md:inline">
                ≈ {totalRequests} live API {pluralize(totalRequests, "call")} ·
                uses your keys
              </span>
            )}

            {running && (
              <div className="ml-auto flex items-center gap-2 data text-xs text-[var(--color-text-muted)]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent-strong)]"
                />
                {completed}/{totalRequests}
              </div>
            )}

            {empty && !running && disabledReason && (
              <span className="ml-auto text-[12px] text-[var(--color-text-faint)]">
                {disabledReason}
              </span>
            )}
          </>
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
      <span className="text-[12px] text-[var(--color-text-muted)]">
        {label}
      </span>
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

function Divider() {
  return (
    <span
      aria-hidden="true"
      className="h-5 w-px self-center bg-[var(--color-border)]"
    />
  );
}
