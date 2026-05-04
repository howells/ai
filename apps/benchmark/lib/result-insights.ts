import type { ProviderRoute } from "@howells/ai";
import type { MetricKey } from "./format";

export interface BenchmarkMetricResult {
  provider: ProviderRoute;
  label: string;
  error?: string;
  ttft: number;
  totalTime: number;
  tokensPerSecond: number;
}

export interface ProviderComparison {
  /** Median-normalized score. Lower is better for every metric. */
  score: number;
  matchedModels: number;
}

export type ProviderComparisons = Partial<Record<ProviderRoute, ProviderComparison>>;

export function resultMetricValue(
  result: BenchmarkMetricResult,
  metric: MetricKey,
): number {
  return result[metric];
}

export function isBetterMetric(
  candidate: number,
  incumbent: number,
  metric: MetricKey,
): boolean {
  return metric === "tokensPerSecond"
    ? candidate > incumbent
    : candidate < incumbent;
}

export function formatProviderScore(score: number): string {
  if (score < 0.01) return "<0.01x";
  if (score < 10) return `${score.toFixed(2)}x`;
  return `${score.toFixed(1)}x`;
}

export function getProviderComparisons(
  results: readonly BenchmarkMetricResult[],
  metric: MetricKey,
  providers?: readonly ProviderRoute[],
): ProviderComparisons {
  const providerSet = providers ? new Set(providers) : null;
  const resultsByModel = new Map<string, Map<ProviderRoute, BenchmarkMetricResult>>();

  for (const result of results) {
    if (result.error) continue;
    if (providerSet && !providerSet.has(result.provider)) continue;
    const value = resultMetricValue(result, metric);
    if (!Number.isFinite(value) || value <= 0) continue;

    const modelResults = resultsByModel.get(result.label) ?? new Map();
    modelResults.set(result.provider, result);
    resultsByModel.set(result.label, modelResults);
  }

  const scoreSums = new Map<ProviderRoute, { sum: number; count: number }>();

  for (const modelResults of resultsByModel.values()) {
    const comparableResults = Array.from(modelResults.values());
    if (comparableResults.length < 2) continue;

    const values = comparableResults
      .map((result) => resultMetricValue(result, metric))
      .sort((a, b) => a - b);
    const baseline = median(values);
    if (!Number.isFinite(baseline) || baseline <= 0) continue;

    for (const result of comparableResults) {
      const value = resultMetricValue(result, metric);
      const score =
        metric === "tokensPerSecond" ? baseline / value : value / baseline;
      if (!Number.isFinite(score) || score <= 0) continue;

      const current = scoreSums.get(result.provider) ?? { sum: 0, count: 0 };
      current.sum += score;
      current.count += 1;
      scoreSums.set(result.provider, current);
    }
  }

  const comparisons: ProviderComparisons = {};
  for (const [provider, value] of scoreSums) {
    comparisons[provider] = {
      score: value.sum / value.count,
      matchedModels: value.count,
    };
  }
  return comparisons;
}

export function bestProviderComparison(
  comparisons: ProviderComparisons,
  providers?: readonly ProviderRoute[],
): (ProviderComparison & { provider: ProviderRoute }) | undefined {
  const orderedProviders =
    providers ?? (Object.keys(comparisons) as ProviderRoute[]);
  let best: (ProviderComparison & { provider: ProviderRoute }) | undefined;

  for (const provider of orderedProviders) {
    const comparison = comparisons[provider];
    if (!comparison) continue;
    if (
      !best ||
      comparison.score < best.score ||
      (comparison.score === best.score &&
        comparison.matchedModels > best.matchedModels)
    ) {
      best = { provider, ...comparison };
    }
  }

  return best;
}

function median(values: readonly number[]): number {
  const middle = Math.floor(values.length / 2);
  if (values.length % 2 === 1) return values[middle] ?? 0;
  return ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
}
