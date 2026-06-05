import { describe, expect, test } from "bun:test";
import {
  bestProviderComparison,
  getProviderComparisons,
} from "../apps/benchmark/lib/result-insights";

describe("benchmark provider comparisons", () => {
  test("normalizes provider speed by matched model instead of raw provider mix", () => {
    const comparisons = getProviderComparisons(
      [
        result("Fast model", "openrouter", { ttft: 100 }),
        result("Fast model", "gateway", { ttft: 110 }),
        result("Slow model only on OpenRouter", "openrouter", { ttft: 900 }),
      ],
      "ttft",
    );

    expect(bestProviderComparison(comparisons)?.provider).toBe("openrouter");
    expect(comparisons.gateway?.matchedModels).toBe(1);
    expect(comparisons.openrouter?.matchedModels).toBe(1);
  });

  test("uses inverse normalization for higher-is-better throughput", () => {
    const comparisons = getProviderComparisons(
      [
        result("Shared model", "openrouter", { tokensPerSecond: 100 }),
        result("Shared model", "gateway", { tokensPerSecond: 80 }),
        result("Fast gateway-only model", "gateway", { tokensPerSecond: 200 }),
      ],
      "tokensPerSecond",
    );

    expect(bestProviderComparison(comparisons)?.provider).toBe("openrouter");
  });
});

function result(
  label: string,
  provider: "openrouter" | "gateway",
  values: Partial<{
    ttft: number;
    totalTime: number;
    tokensPerSecond: number;
  }>,
) {
  return {
    label,
    provider,
    tokensPerSecond: values.tokensPerSecond ?? 10,
    totalTime: values.totalTime ?? 1000,
    ttft: values.ttft ?? 100,
  };
}
