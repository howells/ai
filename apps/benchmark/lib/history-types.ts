import type { ProviderRoute } from "@howells/ai";
import type { MetricKey } from "./format";

/** Normalized historical score for one metric/provider pair. */
export interface HistoricalMetricSummary {
  score: number;
  matchedModels: number;
}

/** Historical benchmark rollup for one provider across matching model runs. */
export interface HistoricalProviderSummary {
  provider: ProviderRoute;
  scores: Partial<Record<MetricKey, HistoricalMetricSummary>>;
  medians: Partial<Record<MetricKey, number>>;
  runCount: number;
  lastSeen: string;
}

/** API response returned by the benchmark history endpoint. */
export interface BenchmarkHistoryResponse {
  available: boolean;
  providers: HistoricalProviderSummary[];
  error?: string;
}
