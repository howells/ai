import { describe, expect, test } from "bun:test";
import type { ModelSlot } from "../src";
import {
  ANTHROPIC_MODELS,
  canRouteModelToProvider,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  inferProvider,
  OPENAI_MODELS,
  QWEN_MODELS,
  resolveModels,
  resolveProviderModelId,
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
  "googleImageEmbed",
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
    expect(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6).toBe(
      "anthropic/claude-opus-4.6",
    );
    expect(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(GOOGLE_MODELS.GEMINI_3_FLASH).toBe(
      "google/gemini-3-flash-preview",
    );
    expect(VOYAGE_MODELS.VOYAGE_3_5_LITE).toBe("voyage-3.5-lite");
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
      googleImageEmbed: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
      standard: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    });

    expect(models.embed).toBe("voyage-3-lite");
    expect(models.googleEmbed).toBe("gemini-embedding-001");
    expect(models.googleImageEmbed).toBe("gemini-embedding-2-preview");
    expect(models.standard).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(models.fast).toBe(DEFAULT_MODELS.fast);
  });
});

describe("provider helpers", () => {
  test("strips provider prefixes for direct provider calls", () => {
    expect(toDirectModelId("anthropic/claude-sonnet-4.6")).toBe(
      "claude-sonnet-4.6",
    );
    expect(toDirectModelId("gpt-5-nano")).toBe("gpt-5-nano");
  });

  test("infers known direct providers only", () => {
    expect(inferProvider("anthropic/claude-sonnet-4.6")).toBe("anthropic");
    expect(inferProvider("openai/gpt-5-nano")).toBe("openai");
    expect(inferProvider("google/gemini-2.5-flash")).toBe("google");
    expect(inferProvider("deepseek/deepseek-v3.2")).toBeUndefined();
    expect(inferProvider("gpt-5-nano")).toBeUndefined();
  });

  test("resolves provider-specific model IDs for known aliases", () => {
    expect(
      resolveProviderModelId(
        ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
        "openrouter",
      ),
    ).toBe("anthropic/claude-sonnet-4.6");
    expect(
      resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, "gateway"),
    ).toBe("anthropic/claude-sonnet-4.6");
    expect(
      resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, "anthropic"),
    ).toBe("claude-sonnet-4-6");

    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "openrouter"),
    ).toBe("google/gemini-3-flash-preview");
    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "gateway"),
    ).toBe("google/gemini-3-flash");
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "google")).toBe(
      "gemini-3-flash-preview",
    );

    expect(resolveProviderModelId(XAI_MODELS.GROK_4_1_FAST, "openrouter")).toBe(
      "x-ai/grok-4.1-fast",
    );
    expect(resolveProviderModelId(XAI_MODELS.GROK_4_1_FAST, "gateway")).toBe(
      "xai/grok-4.1-fast-non-reasoning",
    );
  });

  test("normalizes legacy package IDs for providers that need the new spelling", () => {
    expect(
      resolveProviderModelId("anthropic/claude-opus-4-6", "openrouter"),
    ).toBe("anthropic/claude-opus-4.6");
    expect(
      resolveProviderModelId("anthropic/claude-opus-4-6", "anthropic"),
    ).toBe("claude-opus-4-6");
    expect(resolveProviderModelId("google/gemini-3-flash", "openrouter")).toBe(
      "google/gemini-3-flash-preview",
    );
    expect(resolveProviderModelId("google/gemini-3-flash", "gateway")).toBe(
      "google/gemini-3-flash",
    );
  });

  test("reports whether a direct provider can route a model", () => {
    expect(
      canRouteModelToProvider(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6, "anthropic"),
    ).toBe(true);
    expect(
      canRouteModelToProvider(DEEPSEEK_MODELS.DEEPSEEK_V3_2, "anthropic"),
    ).toBe(false);
    expect(canRouteModelToProvider(XAI_MODELS.GROK_4_1_FAST, "gateway")).toBe(
      true,
    );
  });
});
