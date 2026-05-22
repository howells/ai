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
      outputLength: "short",
      topP: 0.9,
      topK: 40,
      presencePenalty: 0.2,
      frequencyPenalty: 0.1,
      stopSequences: ["END"],
      seed: 42,
      maxRetries: 0,
      timeout: 5000,
      tools: "required",
      maxToolSteps: 4,
    });

    expect(result).toMatchObject({
      maxOutputTokens: 512,
      temperature: 0.2,
      topP: 0.9,
      topK: 40,
      presencePenalty: 0.2,
      frequencyPenalty: 0.1,
      stopSequences: ["END"],
      seed: 42,
      maxRetries: 0,
      timeout: 5000,
      toolChoice: "required",
    });
    expect(result.stopWhen).toBeFunction();
  });

  test("lets explicit maxOutputTokens and temperature override presets", () => {
    const result = resolveGenerationOptions({
      creativity: "creative",
      outputLength: "long",
      maxOutputTokens: 123,
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
      provider: "openai",
      modelId: "openai/gpt-5.4",
      reasoning: "max",
      verbosity: "low",
      structured: "strict",
      parallelTools: false,
      user: "agent-search",
      serviceTier: "standard",
    });

    expect(providerOptionsFor(result, "openai")).toEqual({
      reasoningEffort: "xhigh",
      textVerbosity: "low",
      parallelToolCalls: false,
      strictJsonSchema: true,
      user: "agent-search",
      serviceTier: "default",
    });
  });

  test("normalizes OpenAI reasoning aliases for current default model families", () => {
    expect(
      providerOptionsFor(
        resolveGenerationOptions({
          provider: "openai",
          modelId: "openai/gpt-5.4-mini",
          reasoning: "minimal",
        }),
        "openai",
      )?.reasoningEffort,
    ).toBe("low");

    expect(
      providerOptionsFor(
        resolveGenerationOptions({
          provider: "openai",
          modelId: "openai/gpt-5-nano",
          reasoning: "off",
        }),
        "openai",
      )?.reasoningEffort,
    ).toBe("minimal");
  });

  test("maps Anthropic thinking, structured output, cache, and user metadata", () => {
    const result = resolveGenerationOptions({
      provider: "anthropic",
      reasoning: "high",
      structured: "tool",
      parallelTools: false,
      cache: "ephemeral",
      user: "agent-search",
    });

    expect(providerOptionsFor(result, "anthropic")).toEqual({
      thinking: { type: "enabled", budgetTokens: 8192 },
      sendReasoning: true,
      structuredOutputMode: "jsonTool",
      disableParallelToolUse: true,
      cacheControl: { type: "ephemeral" },
      metadata: { userId: "agent-search" },
    });
  });

  test("maps Google thinking, structured output, and service tier", () => {
    const result = resolveGenerationOptions({
      provider: "google",
      reasoning: "max",
      structured: "strict",
      serviceTier: "priority",
    });

    expect(providerOptionsFor(result, "google")).toEqual({
      thinkingConfig: { thinkingLevel: "high", includeThoughts: true },
      structuredOutputs: true,
      serviceTier: "priority",
    });
  });

  test("maps OpenRouter reasoning, cache, parallel tools, and user", () => {
    const result = resolveGenerationOptions({
      provider: "openrouter",
      reasoning: "off",
      parallelTools: true,
      cache: "ephemeral",
      user: "agent-search",
    });

    // OpenRouter's REST API uses snake_case for OpenAI-compatible fields and
    // the SDK spreads providerOptions directly into the request body.
    expect(providerOptionsFor(result, "openrouter")).toEqual({
      reasoning: { effort: "none", exclude: true },
      parallel_tool_calls: true,
      user: "agent-search",
      cache_control: { type: "ephemeral" },
    });
  });

  test("supports cache TTL via the object form on Anthropic and OpenRouter", () => {
    const anthropic = resolveGenerationOptions({
      provider: "anthropic",
      cache: { ttl: "1h" },
    });
    expect(providerOptionsFor(anthropic, "anthropic")).toMatchObject({
      cacheControl: { type: "ephemeral", ttl: "1h" },
    });

    const openrouter = resolveGenerationOptions({
      provider: "openrouter",
      cache: { ttl: "5m" },
    });
    expect(providerOptionsFor(openrouter, "openrouter")).toMatchObject({
      cache_control: { type: "ephemeral", ttl: "5m" },
    });
  });

  test("supports reasoning by explicit token budget", () => {
    const anthropic = resolveGenerationOptions({
      provider: "anthropic",
      reasoning: { effort: "high", maxTokens: 12_000 },
    });
    expect(providerOptionsFor(anthropic, "anthropic")).toMatchObject({
      thinking: { type: "enabled", budgetTokens: 12_000 },
    });

    const openrouter = resolveGenerationOptions({
      provider: "openrouter",
      reasoning: { maxTokens: 4_000 },
    });
    expect(providerOptionsFor(openrouter, "openrouter")?.reasoning).toEqual({
      max_tokens: 4_000,
    });

    const google = resolveGenerationOptions({
      provider: "google",
      reasoning: { maxTokens: 8_000 },
    });
    expect(providerOptionsFor(google, "google")).toMatchObject({
      thinkingConfig: { thinkingBudget: 8_000, includeThoughts: true },
    });
  });

  test("maps gateway routing preferences, fallbacks, tags, and privacy", () => {
    const result = resolveGenerationOptions({
      provider: "gateway",
      modelId: "anthropic/claude-sonnet-4.6",
      routing: {
        prefer: "cheapest",
        allow: ["anthropic", "amazon-bedrock"],
        order: ["anthropic", "amazon-bedrock"],
        privacy: ["no-retention", "no-training", "hipaa"],
      },
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      tags: ["feature:checkout"],
      user: "agent-search",
    });

    expect(providerOptionsFor(result, "gateway")).toEqual({
      user: "agent-search",
      sort: "cost",
      only: ["anthropic", "amazon-bedrock"],
      order: ["anthropic", "amazon-bedrock"],
      models: ["anthropic/claude-haiku-4.5"],
      tags: ["feature:checkout"],
      zeroDataRetention: true,
      disallowPromptTraining: true,
      hipaaCompliant: true,
    });
  });

  test("maps OpenRouter routing including max_price, quantizations, and ZDR", () => {
    const result = resolveGenerationOptions({
      provider: "openrouter",
      routing: {
        prefer: "fastest",
        allow: ["anthropic"],
        deny: ["openai"],
        order: ["anthropic", "google-vertex"],
        fallbacks: false,
        quantizations: ["fp8", "bf16"],
        privacy: ["no-retention"],
        maxCost: { promptPerMillion: 3, completionPerMillion: 15, requestUsd: 0.1 },
      },
      fallbackModels: ["anthropic/claude-haiku-4.5"],
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      provider: {
        sort: "latency",
        only: ["anthropic"],
        ignore: ["openai"],
        order: ["anthropic", "google-vertex"],
        allow_fallbacks: false,
        quantizations: ["fp8", "bf16"],
        zdr: true,
        data_collection: "deny",
        max_price: { prompt: 3, completion: 15, request: 0.1 },
      },
      models: ["anthropic/claude-haiku-4.5"],
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
      provider: "openrouter",
      webSearch: { engine: "exa", maxResults: 5 },
      responseHealing: true,
      includeCost: true,
    });

    expect(providerOptionsFor(result, "openrouter")).toMatchObject({
      plugins: [
        { id: "web", max_results: 5, engine: "exa" },
        { id: "response-healing" },
      ],
      usage: { include: true },
    });
  });

  test("maps OpenRouter logprobs into logprobs + top_logprobs", () => {
    const numericLogprobs = resolveGenerationOptions({
      provider: "openrouter",
      logprobs: 5,
      logitBias: { 50256: -100 },
    });
    expect(providerOptionsFor(numericLogprobs, "openrouter")).toMatchObject({
      logprobs: true,
      top_logprobs: 5,
      logit_bias: { 50256: -100 },
    });

    const boolLogprobs = resolveGenerationOptions({
      provider: "openrouter",
      logprobs: true,
    });
    expect(providerOptionsFor(boolLogprobs, "openrouter")?.logprobs).toBe(true);
    expect(
      providerOptionsFor(boolLogprobs, "openrouter")?.top_logprobs,
    ).toBeUndefined();
  });

  test("ignores unsupported routing knobs on direct providers", () => {
    const result = resolveGenerationOptions({
      provider: "anthropic",
      routing: { prefer: "cheapest", privacy: ["no-retention"] },
      fallbackModels: ["anthropic/claude-haiku-4.5"],
      tags: ["feature:checkout"],
      logprobs: true,
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
      provider: "gateway",
      modelId: "openai/gpt-5.4",
      reasoning: "medium",
      verbosity: "high",
      user: "agent-search",
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
      toolChoice: "none",
      providerOptions: {
        anthropic: {
          thinking: { type: "disabled" },
          sendReasoning: false,
        },
      },
    });
  });
});
