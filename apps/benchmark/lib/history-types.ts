import type { ProviderRoute } from "@howells/ai";
import type { MetricKey } from "./format";

export interface HistoricalMetricSummary {
  score: number;
  matchedModels: number;
}

export interface HistoricalProviderSummary {
  provider: ProviderRoute;
  scores: Partial<Record<MetricKey, HistoricalMetricSummary>>;
  medians: Partial<Record<MetricKey, number>>;
  runCount: number;
  lastSeen: string;
}

export interface BenchmarkHistoryResponse {
  available: boolean;
  providers: HistoricalProviderSummary[];
  error?: string;
}
