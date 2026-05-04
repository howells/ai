import { describe, expect, test } from "bun:test";
import {
  DEFAULT_ADVANCED_OPTIONS,
  buildBenchmarkGenerationOptions,
  parseList,
  setMembership,
} from "../apps/benchmark/lib/benchmark-options";

describe("benchmark advanced options", () => {
  test("builds minimal generation options for a run", () => {
    expect(
      buildBenchmarkGenerationOptions({
        provider: "gateway",
        modelId: "anthropic/claude-sonnet-4.6",
        maxTokens: 200,
      }),
    ).toEqual({
      provider: "gateway",
      modelId: "anthropic/claude-sonnet-4.6",
      maxOutputTokens: 200,
      includeCost: true,
    });
  });

  test("normalizes routing, privacy, cost, fallback, and reporting knobs", () => {
    const options = buildBenchmarkGenerationOptions({
      provider: "openrouter",
      modelId: "anthropic/claude-sonnet-4.6",
      maxTokens: 300,
      options: {
        ...DEFAULT_ADVANCED_OPTIONS,
        routePreference: "fastest",
        privacy: ["no-retention", "no-training"],
        allowProviders: ["anthropic"],
        denyProviders: ["openai"],
        providerOrder: ["anthropic", "google-vertex"],
        fallbacks: false,
        quantizations: ["fp8", "bf16"],
        fallbackModels: ["anthropic/claude-haiku-4.5"],
        maxPromptCost: 3,
        maxCompletionCost: 15,
        maxRequestCost: 0.1,
        tags: ["bench:routing"],
      },
    });

    expect(options).toMatchObject({
      provider: "openrouter",
      modelId: "anthropic/claude-sonnet-4.6",
      maxOutputTokens: 300,
      routing: {
        prefer: "fastest",
        privacy: ["no-retention", "no-training"],
        allow: ["anthropic"],
        deny: ["openai"],
        order: ["anthropic", "google-vertex"],
        fallbacks: false,
        quantizations: ["fp8", "bf16"],
        maxCost: {
          promptPerMillion: 3,
          completionPerMillion: 15,
          requestUsd: 0.1,
        },
      },
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      tags: ["bench:routing"],
    });
  });

  test("normalizes reasoning, cache, search, healing, cost, and logprobs knobs", () => {
    const options = buildBenchmarkGenerationOptions({
      provider: "openrouter",
      modelId: "openai/gpt-5.4",
      maxTokens: 100,
      options: {
        ...DEFAULT_ADVANCED_OPTIONS,
        cache: "ephemeral-1h",
        reasoning: "high",
        reasoningTokens: 4096,
        webSearch: "exa",
        responseHealing: true,
        includeCost: true,
        logprobs: "top5",
      },
    });

    expect(options).toMatchObject({
      cache: { ttl: "1h" },
      reasoning: { effort: "high", maxTokens: 4096 },
      webSearch: { engine: "exa" },
      responseHealing: true,
      includeCost: true,
      logprobs: 5,
    });
  });

  test("parses comma/newline lists and toggles set-like arrays", () => {
    expect(parseList("anthropic, openai\n google-vertex ")).toEqual([
      "anthropic",
      "openai",
      "google-vertex",
    ]);
    expect(setMembership(["fp8"], "bf16", true)).toEqual(["fp8", "bf16"]);
    expect(setMembership(["fp8", "bf16"], "fp8", false)).toEqual(["bf16"]);
  });
});
