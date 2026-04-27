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

    expect(providerOptionsFor(result, "openrouter")).toEqual({
      reasoning: { effort: "none", exclude: true },
      parallelToolCalls: true,
      user: "agent-search",
      cache_control: { type: "ephemeral" },
    });
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
