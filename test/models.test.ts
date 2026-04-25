import { describe, expect, test } from "bun:test";
import type { ModelSlot } from "../src";
import {
  DEFAULT_MODELS,
  GOOGLE_EMBED_MODELS,
  inferProvider,
  resolveModels,
  toDirectModelId,
  VOYAGE_MODELS,
} from "../src";

const MODEL_SLOTS = [
  "nano",
  "fast",
  "standard",
  "powerful",
  "reasoning",
  "tools",
  "vision",
  "embed",
  "multimodalEmbed",
  "googleEmbed",
  "rerank",
] as const satisfies readonly ModelSlot[];

describe("model matrix", () => {
  test("defines every public model slot", () => {
    expect(Object.keys(DEFAULT_MODELS).sort()).toEqual([...MODEL_SLOTS].sort());
  });

  test("returns a fresh default matrix", () => {
    const first = resolveModels();
    const second = resolveModels();

    first.fast = "openai/gpt-5-nano";

    expect(second.fast).toBe(DEFAULT_MODELS.fast);
  });

  test("merges overrides without dropping other slots", () => {
    const models = resolveModels({
      embed: VOYAGE_MODELS.VOYAGE_3_LITE,
      googleEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1,
      standard: "anthropic/claude-sonnet-4-6",
    });

    expect(models.embed).toBe("voyage-3-lite");
    expect(models.googleEmbed).toBe("gemini-embedding-001");
    expect(models.standard).toBe("anthropic/claude-sonnet-4-6");
    expect(models.fast).toBe(DEFAULT_MODELS.fast);
  });
});

describe("provider helpers", () => {
  test("strips provider prefixes for direct provider calls", () => {
    expect(toDirectModelId("anthropic/claude-sonnet-4-6")).toBe(
      "claude-sonnet-4-6",
    );
    expect(toDirectModelId("gpt-5-nano")).toBe("gpt-5-nano");
  });

  test("infers known direct providers only", () => {
    expect(inferProvider("anthropic/claude-sonnet-4-6")).toBe("anthropic");
    expect(inferProvider("openai/gpt-5-nano")).toBe("openai");
    expect(inferProvider("google/gemini-2.5-flash")).toBe("google");
    expect(inferProvider("deepseek/deepseek-v3.2")).toBeUndefined();
    expect(inferProvider("gpt-5-nano")).toBeUndefined();
  });
});
