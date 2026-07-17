import { createAI } from "@howells/ai";
import type { ProviderRoute } from "@howells/ai";
import { requireBenchmarkSession } from "./benchmark-auth";
import { getBenchmarkPolicy } from "./benchmark-policy";
import { loadLatestRigorousHistory, remainingDailyAttempts } from "./benchmark-store";
import type { CohortHistoryRow } from "./benchmark-store";
import { loadBenchmarkEnv } from "./server-env";

export interface BenchmarkPageData {
  availableProviders: readonly ProviderRoute[];
  history: { cohortHash?: string; error?: string; rows: CohortHistoryRow[] };
  limits: {
    dailyAttempts: number;
    maxOutputTokens: number;
    runAttempts: number;
  };
  remainingDailyAttempts: number;
}

/** Load the authenticated server-rendered benchmark frame data. */
export async function loadBenchmarkPageData(): Promise<BenchmarkPageData> {
  loadBenchmarkEnv();
  await requireBenchmarkSession();
  const policy = getBenchmarkPolicy();
  const ai = createAI({
    app: { name: "Howells AI Benchmark", url: "https://github.com/howells/ai" },
  });
  const remaining = await remainingDailyAttempts();
  const history = await loadLatestRigorousHistory().catch(() => ({
    error: "History is temporarily unavailable. New runs can still be configured.",
    rows: [],
  }));
  return {
    availableProviders: ai.availableProviders,
    history,
    limits: {
      dailyAttempts: policy.dailyAttemptLimit,
      maxOutputTokens: 4096,
      runAttempts: policy.runAttemptLimit,
    },
    remainingDailyAttempts: remaining,
  };
}
