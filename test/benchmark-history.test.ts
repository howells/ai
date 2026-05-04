import { describe, expect, test } from "bun:test";
import {
  summarizeBenchmarkHistory,
  type BenchmarkHistoryRow,
} from "../apps/benchmark/lib/benchmark-history";

describe("benchmark history aggregation", () => {
  test("scores historical providers using matched model comparisons", () => {
    const summaries = summarizeBenchmarkHistory([
      row("Fast model", "openrouter", { ttft: 100 }),
      row("Fast model", "gateway", { ttft: 120 }),
      row("Slow OpenRouter-only model", "openrouter", { ttft: 900 }),
    ]);

    const openrouter = summaries.find((summary) => summary.provider === "openrouter");
    const gateway = summaries.find((summary) => summary.provider === "gateway");

    expect(openrouter?.runCount).toBe(2);
    expect(gateway?.runCount).toBe(1);
    expect(openrouter?.scores.ttft?.matchedModels).toBe(1);
    expect(gateway?.scores.ttft?.matchedModels).toBe(1);
    expect(openrouter?.scores.ttft?.score).toBeLessThan(
      gateway?.scores.ttft?.score ?? 0,
    );
  });

  test("returns raw provider medians without using them as route scores", () => {
    const summaries = summarizeBenchmarkHistory([
      row("Shared model", "openrouter", { tokensPerSecond: 100 }),
      row("Shared model", "gateway", { tokensPerSecond: 80 }),
      row("Gateway-only model", "gateway", { tokensPerSecond: 200 }),
    ]);

    const gateway = summaries.find((summary) => summary.provider === "gateway");
    const openrouter = summaries.find((summary) => summary.provider === "openrouter");

    expect(gateway?.medians.tokensPerSecond).toBe(140);
    expect(openrouter?.scores.tokensPerSecond?.score).toBeLessThan(
      gateway?.scores.tokensPerSecond?.score ?? 0,
    );
  });
});

function row(
  modelLabel: string,
  provider: "openrouter" | "gateway",
  values: Partial<{
    ttft: number;
    totalTime: number;
    tokensPerSecond: number;
  }>,
): BenchmarkHistoryRow {
  return {
    created_at: "2026-05-04T00:00:00.000Z",
    model: `${provider}/${modelLabel.toLowerCase().replaceAll(" ", "-")}`,
    model_label: modelLabel,
    provider,
    route_model_id: `${provider}/${modelLabel}`,
    ttft: values.ttft ?? 100,
    total_time: values.totalTime ?? 1000,
    output_tokens: 20,
    input_tokens: 10,
    tokens_per_second: values.tokensPerSecond ?? 10,
    cost_usd: null,
    region: "test",
    round: null,
    averaged: false,
    error: null,
  };
}
