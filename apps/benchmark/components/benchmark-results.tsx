"use client";
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- the labelled overflow region must be keyboard-scrollable */

import { PROVIDER_DEFINITION_BY_ID } from "@howells/ai";
import type { ProviderRoute } from "@howells/ai";
import { useMemo } from "react";
import { Streamdown } from "streamdown";
import type { BenchmarkJobState } from "../lib/benchmark-contracts";
import { formatMs, formatTpsWithUnit, formatUsd } from "../lib/format";

export interface BenchmarkResultView {
  costMicros?: number;
  errorCode?: string;
  generationDurationMs?: number;
  inputTokens?: number;
  output?: string;
  outputTokens?: number;
  phase: "warmup" | "measured";
  provider: ProviderRoute;
  providerModelId?: string;
  requestedModelId: string;
  sampleId: string;
  status: Extract<BenchmarkJobState, "success" | "error">;
  totalDurationMs?: number;
  ttftMs?: number;
}

interface RouteSummary {
  costMicros?: number;
  errors: BenchmarkResultView[];
  generation: MetricSummary;
  inputTokens: MetricSummary;
  key: string;
  label: string;
  model: string;
  outputTokens: MetricSummary;
  outputs: BenchmarkResultView[];
  provider: ProviderRoute;
  reliability: number;
  samples: number;
  successes: number;
  throughput: MetricSummary;
  total: MetricSummary;
  ttft: MetricSummary;
}

interface MetricSummary {
  median?: number;
  p25?: number;
  p75?: number;
}

export function BenchmarkResults({
  mode,
  results,
}: {
  mode: "rigorous" | "explore";
  results: readonly BenchmarkResultView[];
}) {
  const summaries = useMemo(() => summarizeRoutes(results), [results]);
  const measuredCount = results.filter((result) => result.phase === "measured").length;

  if (measuredCount === 0) {
    return (
      <section aria-labelledby="results-heading" className="empty-state">
        <p className="eyebrow">Comparison matrix</p>
        <h2 id="results-heading">Ready when you are</h2>
        <p>
          {mode === "rigorous"
            ? "Choose up to three routes, then run the controlled suite."
            : "Set a prompt and routes to compare complete responses side by side."}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="results-heading" className="results-section">
      <div className="section-heading results-heading">
        <div>
          <p className="eyebrow">Measured samples · warm-ups excluded</p>
          <h2 id="results-heading">Route comparison</h2>
        </div>
        <p className="data">{measuredCount} observations</p>
      </div>

      <div
        aria-label="Benchmark comparison table, horizontally scrollable"
        className="results-table-scroll scroll-shadow-x scrollbar-thin"
        tabIndex={0}
      >
        <table className="results-table">
          <caption className="sr-only">
            Median provider performance with interquartile ranges by route
          </caption>
          <thead>
            <tr>
              <th className="metric-column" scope="col">
                Metric
              </th>
              {summaries.map((summary) => (
                <th key={summary.key} scope="col">
                  <span className="provider-heading">{summary.label}</span>
                  <span className="provider-model data">{summary.model}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow
              format={(value) => formatMs(value)}
              label="Time to first token"
              summaries={summaries}
              value={(summary) => summary.ttft}
            />
            <MetricRow
              format={(value) => formatMs(value)}
              label="Generation time"
              summaries={summaries}
              value={(summary) => summary.generation}
            />
            <MetricRow
              format={(value) => formatMs(value)}
              label="Total time"
              summaries={summaries}
              value={(summary) => summary.total}
            />
            <MetricRow
              format={(value) => formatTpsWithUnit(value)}
              higherWins
              label="Throughput"
              summaries={summaries}
              value={(summary) => summary.throughput}
            />
            <MetricRow
              format={(value) => Math.round(value).toString()}
              label="Output tokens"
              noWinner
              summaries={summaries}
              value={(summary) => summary.outputTokens}
            />
            <tr>
              <th scope="row">
                <span>Reported cost</span>
                <small>successful samples</small>
              </th>
              {summaries.map((summary) => (
                <td className="data" key={summary.key}>
                  {summary.costMicros === undefined
                    ? "Unknown"
                    : formatUsd(summary.costMicros / 1_000_000)}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row">
                <span>Reliability</span>
                <small>success / measured</small>
              </th>
              {summaries.map((summary) => (
                <td key={summary.key}>
                  <span
                    className={`pill ${summary.reliability === 1 ? "pill--best" : "pill--warn"}`}
                  >
                    <span className="data">{Math.round(summary.reliability * 100)}%</span>
                    <span>
                      {summary.successes}/{summary.samples}
                    </span>
                  </span>
                  {summary.errors.length > 0 ? <ErrorSummary errors={summary.errors} /> : null}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="result-cards">
        {summaries.map((summary) => (
          <RouteCard key={summary.key} summary={summary} />
        ))}
      </div>

      {mode === "explore" ? <ExploreOutputs summaries={summaries} /> : null}
    </section>
  );
}

function MetricRow({
  format,
  higherWins = false,
  label,
  noWinner = false,
  summaries,
  value,
}: {
  format: (value: number) => string;
  higherWins?: boolean;
  label: string;
  noWinner?: boolean;
  summaries: readonly RouteSummary[];
  value: (summary: RouteSummary) => MetricSummary;
}) {
  const values = summaries.flatMap((summary) => {
    const median = value(summary).median;
    return median === undefined ? [] : [median];
  });
  const best = values.length > 0 ? (higherWins ? Math.max(...values) : Math.min(...values)) : null;
  return (
    <tr>
      <th scope="row">
        <span>{label}</span>
        <small>median · p25–p75</small>
      </th>
      {summaries.map((summary) => {
        const metric = value(summary);
        const isBest = !noWinner && metric.median !== undefined && metric.median === best;
        return (
          <td key={summary.key}>
            {metric.median === undefined ? (
              <span className="data metric-empty">—</span>
            ) : (
              <div className={`metric-value${isBest ? " metric-value--best" : ""}`}>
                <span className="data">{format(metric.median)}</span>
                <small className="data">
                  {format(metric.p25 ?? metric.median)}–{format(metric.p75 ?? metric.median)}
                </small>
                {isBest && summaries.length > 1 ? (
                  <span className="pill pill--best">best</span>
                ) : null}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function RouteCard({ summary }: { summary: RouteSummary }) {
  return (
    <article className="result-card">
      <header className="result-card__heading">
        <div>
          <p className="eyebrow">{summary.label}</p>
          <h3>{summary.model}</h3>
        </div>
        <span className={`pill ${summary.reliability === 1 ? "pill--best" : "pill--warn"}`}>
          {Math.round(summary.reliability * 100)}%
        </span>
      </header>
      <dl>
        <CardMetric label="TTFT" metric={summary.ttft} />
        <CardMetric label="Generation" metric={summary.generation} />
        <CardMetric label="Total" metric={summary.total} />
        <CardMetric label="Throughput" metric={summary.throughput} throughput />
        <div>
          <dt>Reported cost</dt>
          <dd className="data">
            {summary.costMicros === undefined
              ? "Unknown"
              : formatUsd(summary.costMicros / 1_000_000)}
          </dd>
        </div>
      </dl>
      {summary.errors.length > 0 ? <ErrorSummary errors={summary.errors} /> : null}
    </article>
  );
}

function CardMetric({
  label,
  metric,
  throughput = false,
}: {
  label: string;
  metric: MetricSummary;
  throughput?: boolean;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className="data">
        {metric.median === undefined
          ? "—"
          : throughput
            ? formatTpsWithUnit(metric.median)
            : formatMs(metric.median)}
      </dd>
    </div>
  );
}

function ExploreOutputs({ summaries }: { summaries: readonly RouteSummary[] }) {
  return (
    <section aria-labelledby="outputs-heading" className="explore-outputs">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Complete responses</p>
          <h3 id="outputs-heading">Outputs</h3>
        </div>
      </div>
      <div className="output-columns">
        {summaries.map((summary) => {
          const result = summary.outputs.at(-1);
          return (
            <article className="output-column" key={summary.key}>
              <header>
                <strong>{summary.label}</strong>
                <span className="data">{summary.model}</span>
              </header>
              {result?.output ? (
                <Streamdown className="streamdown-output">{result.output}</Streamdown>
              ) : (
                <p className="empty-copy">No successful output.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ErrorSummary({ errors }: { errors: readonly BenchmarkResultView[] }) {
  return (
    <details className="error-disclosure">
      <summary>{errors.length} failed</summary>
      <ul>
        {[...new Set(errors.map((error) => error.errorCode ?? "provider/generation-failed"))].map(
          (code) => (
            <li className="data" key={code}>
              {code}
            </li>
          ),
        )}
      </ul>
    </details>
  );
}

function summarizeRoutes(results: readonly BenchmarkResultView[]): RouteSummary[] {
  const measured = results.filter((result) => result.phase === "measured");
  const groups = new Map<string, BenchmarkResultView[]>();
  for (const result of measured) {
    const key = `${result.provider}:${result.requestedModelId}:${result.providerModelId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.entries()].map(([key, routeResults]) => {
    const successful = routeResults.filter((result) => result.status === "success");
    const first = routeResults[0];
    if (!first) {
      throw new Error("A route summary requires at least one result.");
    }
    const costs = successful.flatMap((result) =>
      result.costMicros === undefined ? [] : [result.costMicros],
    );
    return {
      costMicros: costs.length > 0 ? costs.reduce((sum, value) => sum + value, 0) : undefined,
      errors: routeResults.filter((result) => result.status === "error"),
      generation: stats(successful.flatMap((result) => numberValue(result.generationDurationMs))),
      inputTokens: stats(successful.flatMap((result) => numberValue(result.inputTokens))),
      key,
      label: PROVIDER_DEFINITION_BY_ID[first.provider].label,
      model: first.providerModelId ?? first.requestedModelId,
      outputTokens: stats(successful.flatMap((result) => numberValue(result.outputTokens))),
      outputs: successful.filter((result) => Boolean(result.output)),
      provider: first.provider,
      reliability: routeResults.length > 0 ? successful.length / routeResults.length : 0,
      samples: routeResults.length,
      successes: successful.length,
      throughput: stats(
        successful.flatMap((result) => {
          if (!result.outputTokens || !result.generationDurationMs) {
            return [];
          }
          return [result.outputTokens / (result.generationDurationMs / 1000)];
        }),
      ),
      total: stats(successful.flatMap((result) => numberValue(result.totalDurationMs))),
      ttft: stats(successful.flatMap((result) => numberValue(result.ttftMs))),
    };
  });
}

function stats(values: readonly number[]): MetricSummary {
  if (values.length === 0) {
    return {};
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: percentile(sorted, 0.5),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
  };
}

function percentile(values: readonly number[], quantile: number): number {
  const position = (values.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = values[lower] ?? 0;
  const upperValue = values[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * (position - lower);
}

function numberValue(value: number | undefined): number[] {
  return value === undefined ? [] : [value];
}
