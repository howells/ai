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
        maxTokens: 200,
        modelId: "anthropic/claude-sonnet-4.6",
        provider: "gateway",
      }),
    ).toEqual({
      includeCost: true,
      maxOutputTokens: 200,
      modelId: "anthropic/claude-sonnet-4.6",
      provider: "gateway",
    });
  });

  test("normalizes routing, privacy, cost, fallback, and reporting knobs", () => {
    const options = buildBenchmarkGenerationOptions({
      maxTokens: 300,
      modelId: "anthropic/claude-sonnet-4.6",
      options: {
        ...DEFAULT_ADVANCED_OPTIONS,
        allowProviders: ["anthropic"],
        denyProviders: ["openai"],
        fallbackModels: ["anthropic/claude-haiku-4.5"],
        fallbacks: false,
        maxCompletionCost: 15,
        maxPromptCost: 3,
        maxRequestCost: 0.1,
        privacy: ["no-retention", "no-training"],
        providerOrder: ["anthropic", "google-vertex"],
        quantizations: ["fp8", "bf16"],
        routePreference: "fastest",
        serviceTier: "priority",
        tags: ["bench:routing"],
      },
      provider: "openrouter",
    });

    expect(options).toMatchObject({
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      maxOutputTokens: 300,
      modelId: "anthropic/claude-sonnet-4.6",
      provider: "openrouter",
      routing: {
        allow: ["anthropic"],
        deny: ["openai"],
        fallbacks: false,
        maxCost: {
          completionPerMillion: 15,
          promptPerMillion: 3,
          requestUsd: 0.1,
        },
        order: ["anthropic", "google-vertex"],
        prefer: "fastest",
        privacy: ["no-retention", "no-training"],
        quantizations: ["fp8", "bf16"],
      },
      serviceTier: "priority",
      tags: ["bench:routing"],
    });
  });

  test("normalizes reasoning, cache, search, healing, cost, and logprobs knobs", () => {
    const options = buildBenchmarkGenerationOptions({
      maxTokens: 100,
      modelId: "openai/gpt-5.4",
      options: {
        ...DEFAULT_ADVANCED_OPTIONS,
        cache: "ephemeral-1h",
        includeCost: true,
        logprobs: "top5",
        reasoning: "high",
        reasoningTokens: 4096,
        responseHealing: true,
        webSearch: "exa",
      },
      provider: "openrouter",
    });

    expect(options).toMatchObject({
      cache: { ttl: "1h" },
      includeCost: true,
      logprobs: 5,
      reasoning: { effort: "high", maxTokens: 4096 },
      responseHealing: true,
      webSearch: { engine: "exa" },
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
