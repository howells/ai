import { describe, expect, test } from "bun:test";
import { createAI, resolveGenerationOptions } from "../src";

const providerOptionsFor = (
  result: ReturnType<typeof resolveGenerationOptions>,
  provider: string,
) => result.providerOptions?.[provider];

describe("resolveGenerationOptions", () => {
  test("maps common AI SDK generation settings", () => {
    const result = resolveGenerationOptions({
      creativity: "focused",
      frequencyPenalty: 0.1,
      maxRetries: 0,
      maxToolSteps: 4,
      outputLength: "short",
      presencePenalty: 0.2,
      seed: 42,
      stopSequences: ["END"],
      timeout: 5000,
      tools: "required",
      topK: 40,
      topP: 0.9,
    });

    expect(result).toMatchObject({
      frequencyPenalty: 0.1,
      maxOutputTokens: 512,
      maxRetries: 0,
      presencePenalty: 0.2,
      seed: 42,
      stopSequences: ["END"],
      temperature: 0.2,
      timeout: 5000,
      toolChoice: "required",
      topK: 40,
      topP: 0.9,
    });
    expect(result.stopWhen).toBeFunction();
  });

  test("lets explicit maxOutputTokens and temperature override presets", () => {
    const result = resolveGenerationOptions({
      creativity: "creative",
      maxOutputTokens: 123,
      outputLength: "long",
      temperature: 0,
    });

    expect(result.maxOutputTokens).toBe(123);
    expect(result.temperature).toBe(0);
  });

  test("omits temperature when requested with null", () => {
    const result = resolveGenerationOptions({
      creativity: "creative",
      temperature: null,
    });

    expect(result.temperature).toBeUndefined();
  });

  test("maps OpenAI reasoning, verbosity, structured output, and service tier", () => {
    const result = resolveGenerationOptions({
      modelId: "openai/gpt-5.4",
      parallelTools: false,
      provider: "openai",
      reasoning: "max",
      serviceTier: "standard",
      structured: "strict",
      user: "agent-search",
      verbosity: "low",
    });

    expect(providerOptionsFor(result, "openai")).toEqual({
      parallelToolCalls: false,
      reasoningEffort: "xhigh",
      serviceTier: "default",
      strictJsonSchema: true,
      textVerbosity: "low",
      user: "agent-search",
    });
  });

  test("normalizes OpenAI reasoning aliases for current default model families", () => {
    expect(
      providerOptionsFor(
        resolveGenerationOptions({
          modelId: "openai/gpt-5.4-mini",
          provider: "openai",
          reasoning: "minimal",
        }),
        "openai",
      )?.reasoningEffort,
    ).toBe("low");

    expect(
      providerOptionsFor(
        resolveGenerationOptions({
          modelId: "openai/gpt-5-nano",
          provider: "openai",
          reasoning: "off",
        }),
        "openai",
      )?.reasoningEffort,
    ).toBe("minimal");
  });

  test("maps Anthropic thinking, structured output, cache, and user metadata", () => {
    const result = resolveGenerationOptions({
      cache: "ephemeral",
      parallelTools: false,
      provider: "anthropic",
      reasoning: "high",
      structured: "tool",
      user: "agent-search",
    });

    expect(providerOptionsFor(result, "anthropic")).toEqual({
      cacheControl: { type: "ephemeral" },
      disableParallelToolUse: true,
      metadata: { userId: "agent-search" },
      sendReasoning: true,
      structuredOutputMode: "jsonTool",
      thinking: { budgetTokens: 8192, type: "enabled" },
    });
  });

  test("maps Google thinking, structured output, and service tier", () => {
    const result = resolveGenerationOptions({
      provider: "google",
      reasoning: "max",
      serviceTier: "priority",
      structured: "strict",
    });

    expect(providerOptionsFor(result, "google")).toEqual({
      serviceTier: "priority",
      structuredOutputs: true,
      thinkingConfig: { includeThoughts: true, thinkingLevel: "high" },
    });
  });

  test("maps OpenRouter reasoning, cache, parallel tools, and user", () => {
    const result = resolveGenerationOptions({
      cache: "ephemeral",
      parallelTools: true,
      provider: "openrouter",
      reasoning: "off",
      user: "agent-search",
    });

    // OpenRouter's REST API uses snake_case for OpenAI-compatible fields and
    // the SDK spreads providerOptions directly into the request body.
    expect(providerOptionsFor(result, "openrouter")).toEqual({
      cache_control: { type: "ephemeral" },
      parallel_tool_calls: true,
      reasoning: { effort: "none", exclude: true },
      user: "agent-search",
    });
  });

  test("supports cache TTL via the object form on Anthropic and OpenRouter", () => {
    const anthropic = resolveGenerationOptions({
      cache: { ttl: "1h" },
      provider: "anthropic",
    });
    expect(providerOptionsFor(anthropic, "anthropic")).toMatchObject({
      cacheControl: { ttl: "1h", type: "ephemeral" },
    });

    const openrouter = resolveGenerationOptions({
      cache: { ttl: "5m" },
      provider: "openrouter",
    });
    expect(providerOptionsFor(openrouter, "openrouter")).toMatchObject({
      cache_control: { ttl: "5m", type: "ephemeral" },
    });
  });

  test("supports reasoning by explicit token budget", () => {
    const anthropic = resolveGenerationOptions({
      provider: "anthropic",
      reasoning: { effort: "high", maxTokens: 12_000 },
    });
    expect(providerOptionsFor(anthropic, "anthropic")).toMatchObject({
      thinking: { budgetTokens: 12_000, type: "enabled" },
    });

    const openrouter = resolveGenerationOptions({
      provider: "openrouter",
      reasoning: { maxTokens: 4000 },
    });
    expect(providerOptionsFor(openrouter, "openrouter")?.reasoning).toEqual({
      max_tokens: 4000,
    });

    const google = resolveGenerationOptions({
      provider: "google",
      reasoning: { maxTokens: 8000 },
    });
    expect(providerOptionsFor(google, "google")).toMatchObject({
      thinkingConfig: { includeThoughts: true, thinkingBudget: 8000 },
    });
  });

  test("maps gateway routing preferences, fallbacks, tags, and privacy", () => {
    const result = resolveGenerationOptions({
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      modelId: "anthropic/claude-sonnet-4.6",
      provider: "gateway",
      routing: {
        allow: ["anthropic", "amazon-bedrock"],
        order: ["anthropic", "amazon-bedrock"],
        prefer: "cheapest",
        privacy: ["no-retention", "no-training", "hipaa"],
      },
      tags: ["feature:checkout"],
      user: "agent-search",
    });

    expect(providerOptionsFor(result, "gateway")).toEqual({
      disallowPromptTraining: true,
      hipaaCompliant: true,
      models: ["anthropic/claude-haiku-4.5"],
      only: ["anthropic", "amazon-bedrock"],
      order: ["anthropic", "amazon-bedrock"],
      sort: "cost",
      tags: ["feature:checkout"],
      user: "agent-search",
      zeroDataRetention: true,
    });
  });

  test("maps OpenRouter routing including max_price, quantizations, and ZDR", () => {
    const result = resolveGenerationOptions({
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      provider: "openrouter",
      routing: {
        allow: ["anthropic"],
        deny: ["openai"],
        fallbacks: false,
        maxCost: { completionPerMillion: 15, promptPerMillion: 3, requestUsd: 0.1 },
        order: ["anthropic", "google-vertex"],
        prefer: "fastest",
        privacy: ["no-retention"],
        quantizations: ["fp8", "bf16"],
      },
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      models: ["anthropic/claude-haiku-4.5"],
      provider: {
        allow_fallbacks: false,
        data_collection: "deny",
        ignore: ["openai"],
        max_price: { completion: 15, prompt: 3, request: 0.1 },
        only: ["anthropic"],
        order: ["anthropic", "google-vertex"],
        quantizations: ["fp8", "bf16"],
        sort: "latency",
        zdr: true,
      },
    });
  });

  test("maps OpenRouter throughput preference for Nitro-equivalent routing", () => {
    const result = resolveGenerationOptions({
      provider: "openrouter",
      routing: {
        prefer: "highest-throughput",
      },
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      provider: {
        sort: "throughput",
      },
    });
  });

  test("maps normalized quality preference to OpenRouter Exacto routing", () => {
    const result = resolveGenerationOptions({
      provider: "openrouter",
      routing: {
        prefer: "highest-quality",
      },
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      provider: {
        sort: "exacto",
      },
    });
  });

  test("ignores normalized quality preference on Gateway", () => {
    const result = resolveGenerationOptions({
      provider: "gateway",
      routing: {
        prefer: "highest-quality",
      },
    });

    expect(providerOptionsFor(result, "gateway")).toBeUndefined();
  });

  test("maps OpenRouter web search and response-healing plugins", () => {
    const result = resolveGenerationOptions({
      includeCost: true,
      provider: "openrouter",
      responseHealing: true,
      webSearch: { engine: "exa", maxResults: 5 },
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      plugins: [{ engine: "exa", id: "web", max_results: 5 }, { id: "response-healing" }],
      usage: { include: true },
    });
  });

  test("maps OpenRouter logprobs into logprobs + top_logprobs", () => {
    const numericLogprobs = resolveGenerationOptions({
      logitBias: { 50_256: -100 },
      logprobs: 5,
      provider: "openrouter",
    });
    expect(providerOptionsFor(numericLogprobs, "openrouter")).toMatchObject({
      logit_bias: { 50_256: -100 },
      logprobs: true,
      top_logprobs: 5,
    });

    const boolLogprobs = resolveGenerationOptions({
      logprobs: true,
      provider: "openrouter",
    });
    expect(providerOptionsFor(boolLogprobs, "openrouter")?.logprobs).toBe(true);
    expect(providerOptionsFor(boolLogprobs, "openrouter")?.top_logprobs).toBeUndefined();
  });

  test("ignores unsupported routing knobs on direct providers", () => {
    const result = resolveGenerationOptions({
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      logprobs: true,
      provider: "anthropic",
      routing: { prefer: "cheapest", privacy: ["no-retention"] },
      tags: ["feature:checkout"],
    });

    // Anthropic direct provider should see no routing/tag/logprobs leakage.
    const anthropic = providerOptionsFor(result, "anthropic");
    expect(anthropic?.sort).toBeUndefined();
    expect(anthropic?.tags).toBeUndefined();
    expect(anthropic?.logprobs).toBeUndefined();
    expect(anthropic?.models).toBeUndefined();
  });

  test("adds gateway options and inferred direct-provider options when modelId is known", () => {
    const result = resolveGenerationOptions({
      modelId: "openai/gpt-5.4",
      provider: "gateway",
      reasoning: "medium",
      user: "agent-search",
      verbosity: "high",
    });

    expect(providerOptionsFor(result, "gateway")).toEqual({
      user: "agent-search",
    });
    expect(providerOptionsFor(result, "openai")).toMatchObject({
      reasoningEffort: "medium",
      textVerbosity: "high",
      user: "agent-search",
    });
  });
});

describe("AIClient.generationOptions", () => {
  test("exposes the generation resolver on configured clients", () => {
    const ai = createAI();

    expect(
      ai.generationOptions({
        provider: "anthropic",
        reasoning: "off",
        tools: "none",
      }),
    ).toMatchObject({
      providerOptions: {
        anthropic: {
          sendReasoning: false,
          thinking: { type: "disabled" },
        },
      },
      toolChoice: "none",
    });
  });
});
