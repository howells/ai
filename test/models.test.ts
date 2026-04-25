import { describe, expect, test } from "bun:test";
import type { ModelSlot } from "../src";
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  inferProvider,
  OPENAI_MODELS,
  QWEN_MODELS,
  resolveModels,
  toDirectModelId,
  VOYAGE_MODELS,
  XAI_MODELS,
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

  test("uses provider constants for all default language model slots", () => {
    expect(DEFAULT_MODELS.nano).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE);
    expect(DEFAULT_MODELS.fast).toBe(DEEPSEEK_MODELS.DEEPSEEK_V3_2);
    expect(DEFAULT_MODELS.standard).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH);
    expect(DEFAULT_MODELS.powerful).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(DEFAULT_MODELS.reasoning).toBe(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6);
    expect(DEFAULT_MODELS.tools).toBe(XAI_MODELS.GROK_4_1_FAST);
    expect(DEFAULT_MODELS.vision).toBe(GOOGLE_MODELS.GEMINI_3_FLASH);
    expect(VOYAGE_MODELS.MULTIMODAL_3).toBe("voyage-multimodal-3");
    expect(QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT).toBe(
      "qwen/qwen2.5-vl-72b-instruct",
    );
  });

  test("returns a fresh default matrix", () => {
    const first = resolveModels();
    const second = resolveModels();

    first.fast = OPENAI_MODELS.GPT_5_NANO;

    expect(second.fast).toBe(DEFAULT_MODELS.fast);
  });

  test("merges overrides without dropping other slots", () => {
    const models = resolveModels({
      embed: VOYAGE_MODELS.VOYAGE_3_LITE,
      googleEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1,
      standard: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    });

    expect(models.embed).toBe("voyage-3-lite");
    expect(models.googleEmbed).toBe("gemini-embedding-001");
    expect(models.standard).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
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
