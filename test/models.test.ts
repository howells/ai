import { describe, expect, test } from "bun:test";
import type { ModelSlot } from "../src";
import {
  ANTHROPIC_MODELS,
  canRouteModelToProvider,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  DEFAULT_TASK_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  GLM_MODELS,
  inferModelService,
  inferProvider,
  KIMI_MODELS,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_CAPABILITIES,
  LANGUAGE_MODEL_TASKS,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_SERVICE_ENV_VARS,
  MODEL_TIERS,
  OPENAI_MODELS,
  PROVIDER_DEFAULT_MODELS,
  QWEN_MODELS,
  resolveModels,
  resolveLanguageModelVariant,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
  resolveTaskModels,
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
  "embed",
  "multimodalEmbed",
  "rerank",
] as const satisfies readonly ModelSlot[];

const PROVIDERS = [
  "gateway",
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "xai",
  "qwen",
  "zai",
  "moonshotai",
] as const;

describe("model matrix", () => {
  test("defines every public model tier and retrieval slot", () => {
    expect(Object.keys(DEFAULT_MODELS).sort()).toEqual([...MODEL_SLOTS].sort());
  });

  test("uses provider constants for all default language model tiers", () => {
    expect(DEFAULT_MODELS.nano.text).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE);
    expect(DEFAULT_MODELS.nano.tools).toBe(
      GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE,
    );
    expect(DEFAULT_MODELS.fast.text).toBe(DEEPSEEK_MODELS.DEEPSEEK_V3_2);
    expect(DEFAULT_MODELS.fast.tools).toBe(XAI_MODELS.GROK_4_1_FAST);
    expect(DEFAULT_MODELS.fast.vision).toBe(GOOGLE_MODELS.GEMINI_3_FLASH);
    expect(DEFAULT_MODELS.fast.visionTools).toBe(
      GOOGLE_MODELS.GEMINI_3_FLASH,
    );
    expect(DEFAULT_MODELS.standard.text).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH);
    expect(DEFAULT_MODELS.standard.tools).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH);
    expect(DEFAULT_MODELS.standard.vision).toBe(GOOGLE_MODELS.GEMINI_3_FLASH);
    expect(DEFAULT_MODELS.powerful.text).toBe(
      ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    );
    expect(DEFAULT_MODELS.reasoning.text).toBe(
      ANTHROPIC_MODELS.CLAUDE_OPUS_4_6,
    );
    expect(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6).toBe(
      "anthropic/claude-opus-4.6",
    );
    expect(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5).toBe(
      "anthropic/claude-haiku-4.5",
    );
    expect(GOOGLE_MODELS.GEMINI_3_FLASH).toBe("google/gemini-3-flash");
    expect(GOOGLE_MODELS.GEMINI_3_1_PRO).toBe("google/gemini-3.1-pro");
    expect(OPENAI_MODELS.GPT_5_4).toBe("openai/gpt-5.4");
    expect(OPENAI_MODELS.GPT_5_5).toBe("openai/gpt-5.5");
    expect(DEFAULT_MODELS.embed).toEqual({
      voyage: "voyage-3",
      gemini: "gemini-embedding-2-preview",
    });
    expect(DEFAULT_MODELS.multimodalEmbed).toEqual({
      voyage: "voyage-multimodal-3.5",
      gemini: "gemini-embedding-2-preview",
    });
    expect(VOYAGE_MODELS.VOYAGE_3_5_LITE).toBe("voyage-3.5-lite");
    expect(VOYAGE_MODELS.MULTIMODAL_3).toBe("voyage-multimodal-3");
    expect(QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT).toBe(
      "qwen/qwen2.5-vl-72b-instruct",
    );
    expect(GLM_MODELS.GLM_5_1).toBe("z-ai/glm-5.1");
    expect(GLM_MODELS.GLM_4_7_FLASH).toBe("z-ai/glm-4.7-flash");
    expect(KIMI_MODELS.KIMI_K2_6).toBe("moonshotai/kimi-k2.6");
    expect(XAI_MODELS.GROK_4_20).toBe("x-ai/grok-4.20");
    expect(XAI_MODELS.GROK_CODE_FAST_1).toBe("x-ai/grok-code-fast-1");
    expect(QWEN_MODELS.QWEN_3_VL_8B_INSTRUCT).toBe(
      "qwen/qwen3-vl-8b-instruct",
    );
  });

  test("catalogues every public language model constant and default", () => {
    const catalogIds = new Set(LANGUAGE_MODEL_CATALOG.map((model) => model.id));
    const publicLanguageModelIds = [
      ...Object.values(ANTHROPIC_MODELS),
      ...Object.values(DEEPSEEK_MODELS),
      ...Object.values(GLM_MODELS),
      ...Object.values(GOOGLE_MODELS),
      ...Object.values(KIMI_MODELS),
      ...Object.values(OPENAI_MODELS),
      ...Object.values(QWEN_MODELS),
      ...Object.values(XAI_MODELS),
    ];

    expect(new Set(publicLanguageModelIds).size).toBe(
      publicLanguageModelIds.length,
    );

    for (const modelId of publicLanguageModelIds) {
      expect(catalogIds.has(modelId)).toBe(true);
    }

    for (const tier of MODEL_TIERS) {
      for (const variant of LANGUAGE_MODEL_VARIANTS) {
        expect(catalogIds.has(DEFAULT_MODELS[tier][variant])).toBe(true);
      }
    }

    for (const task of LANGUAGE_MODEL_TASKS) {
      for (const tier of MODEL_TIERS) {
        for (const variant of LANGUAGE_MODEL_VARIANTS) {
          const modelId = DEFAULT_TASK_MODELS[task][tier]?.[variant];
          if (modelId) {
            expect(catalogIds.has(modelId)).toBe(true);
          }
        }
      }
    }
  });

  test("selects task-optimized models before falling back to general defaults", () => {
    expect(
      resolveProviderLanguageModelId(
        DEFAULT_MODELS,
        "standard",
        "tools",
        "openrouter",
        "coding",
      ),
    ).toBe(KIMI_MODELS.KIMI_K2_6);
    expect(
      resolveProviderLanguageModelId(
        DEFAULT_MODELS,
        "fast",
        "tools",
        "openrouter",
        "coding",
      ),
    ).toBe(XAI_MODELS.GROK_CODE_FAST_1);
    expect(
      resolveProviderLanguageModelId(
        DEFAULT_MODELS,
        "standard",
        "vision",
        "openrouter",
        "vision",
      ),
    ).toBe(QWEN_MODELS.QWEN_3_VL_8B_INSTRUCT);
    expect(
      resolveProviderLanguageModelId(
        DEFAULT_MODELS,
        "standard",
        "tools",
        "anthropic",
        "coding",
      ),
    ).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(
      resolveProviderLanguageModelId(
        DEFAULT_MODELS,
        "standard",
        "text",
        "gateway",
        "general",
      ),
    ).toBe(DEFAULT_MODELS.standard.text);
  });

  test("merges task overrides without dropping default task coverage", () => {
    const taskModels = resolveTaskModels({
      coding: {
        standard: {
          text: GLM_MODELS.GLM_5_1,
        },
      },
    });

    expect(taskModels.coding.standard?.text).toBe(GLM_MODELS.GLM_5_1);
    expect(taskModels.coding.standard?.tools).toBe(KIMI_MODELS.KIMI_K2_6);
    expect(taskModels.agentic.fast?.tools).toBe(GLM_MODELS.GLM_5_TURBO);
  });

  test("defines provider defaults for every tier and capability surface", () => {
    for (const provider of PROVIDERS) {
      for (const tier of MODEL_TIERS) {
        for (const variant of LANGUAGE_MODEL_VARIANTS) {
          const modelId = PROVIDER_DEFAULT_MODELS[provider][tier][variant];
          expect(modelId).toBeTruthy();
          expect(canRouteModelToProvider(modelId, provider)).toBe(true);
          expect(
            resolveProviderLanguageModelId(
              DEFAULT_MODELS,
              tier,
              variant,
              provider,
            ),
          ).toBe(modelId);
        }
      }
    }
  });

  test("returns a fresh default matrix", () => {
    const first = resolveModels();
    const second = resolveModels();

    first.fast.text = OPENAI_MODELS.GPT_5_NANO;
    first.embed.voyage = VOYAGE_MODELS.VOYAGE_3_LITE;

    expect(second.fast.text).toBe(DEFAULT_MODELS.fast.text);
    expect(second.embed.voyage).toBe(DEFAULT_MODELS.embed.voyage);
  });

  test("merges overrides without dropping other variants", () => {
    const models = resolveModels({
      embed: {
        voyage: VOYAGE_MODELS.VOYAGE_3_LITE,
        gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1,
      },
      multimodalEmbed: {
        gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
      },
      standard: {
        text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
        tools: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
      },
    });

    expect(models.embed.voyage).toBe("voyage-3-lite");
    expect(models.embed.gemini).toBe("gemini-embedding-001");
    expect(models.multimodalEmbed.voyage).toBe("voyage-multimodal-3.5");
    expect(models.multimodalEmbed.gemini).toBe("gemini-embedding-2-preview");
    expect(models.standard.text).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(models.standard.tools).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(models.standard.vision).toBe(DEFAULT_MODELS.standard.vision);
    expect(models.fast).toEqual(DEFAULT_MODELS.fast);
  });

  test("maps option flags to language model variants", () => {
    expect(resolveLanguageModelVariant()).toBe("text");
    expect(resolveLanguageModelVariant({ tools: true })).toBe("tools");
    expect(resolveLanguageModelVariant({ vision: true })).toBe("vision");
    expect(resolveLanguageModelVariant({ tools: true, vision: true })).toBe(
      "visionTools",
    );
    expect(LANGUAGE_MODEL_CAPABILITIES.visionTools).toEqual({
      structured: true,
      tools: true,
      vision: true,
    });
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
    expect(inferProvider("deepseek/deepseek-v3.2")).toBe("deepseek");
    expect(inferProvider("x-ai/grok-4.20")).toBe("xai");
    expect(inferProvider("qwen/qwen3-vl-8b-instruct")).toBe("qwen");
    expect(inferProvider("z-ai/glm-5.1")).toBe("zai");
    expect(inferProvider("moonshotai/kimi-k2.6")).toBe("moonshotai");
    expect(inferProvider("gpt-5-nano")).toBeUndefined();
  });

  test("infers underlying model services and service key env vars", () => {
    expect(inferModelService(KIMI_MODELS.KIMI_K2_6)).toBe("moonshotai");
    expect(inferModelService(GLM_MODELS.GLM_5_1)).toBe("zai");
    expect(inferModelService(XAI_MODELS.GROK_4_20)).toBe("xai");
    expect(inferModelService(QWEN_MODELS.QWEN_3_VL_8B_INSTRUCT)).toBe("qwen");
    expect(MODEL_SERVICE_ENV_VARS.moonshotai).toBe("MOONSHOT_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.zai).toBe("ZAI_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.xai).toBe("XAI_API_KEY");
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
      resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5, "anthropic"),
    ).toBe("claude-haiku-4-5-20251001");

    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "openrouter"),
    ).toBe("google/gemini-3-flash-preview");
    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "gateway"),
    ).toBe("google/gemini-3-flash");
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH, "google")).toBe(
      "gemini-3-flash-preview",
    );
    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_1_PRO, "google"),
    ).toBe("gemini-3.1-pro-preview");
    expect(
      resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE, "gateway"),
    ).toBe("google/gemini-3.1-flash-lite-preview");

    expect(resolveProviderModelId(XAI_MODELS.GROK_4_1_FAST, "openrouter")).toBe(
      "x-ai/grok-4.1-fast",
    );
    expect(resolveProviderModelId(XAI_MODELS.GROK_4_1_FAST, "gateway")).toBe(
      "xai/grok-4.1-fast-non-reasoning",
    );
    expect(resolveProviderModelId(XAI_MODELS.GROK_4_20, "xai")).toBe(
      "grok-4.20",
    );
    expect(resolveProviderModelId(GLM_MODELS.GLM_5_1, "zai")).toBe("glm-5.1");
    expect(resolveProviderModelId(KIMI_MODELS.KIMI_K2_6, "moonshotai")).toBe(
      "kimi-k2.6",
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
    expect(canRouteModelToProvider(XAI_MODELS.GROK_4_20, "xai")).toBe(true);
    expect(canRouteModelToProvider(KIMI_MODELS.KIMI_K2_6, "moonshotai")).toBe(
      true,
    );
    expect(canRouteModelToProvider(GLM_MODELS.GLM_5_1, "zai")).toBe(true);
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_VL_8B_INSTRUCT, "qwen")).toBe(
      true,
    );
    expect(canRouteModelToProvider(DEEPSEEK_MODELS.DEEPSEEK_V3_2, "deepseek")).toBe(
      true,
    );
    expect(canRouteModelToProvider(KIMI_MODELS.KIMI_K2_6, "xai")).toBe(false);
    expect(
      canRouteModelToProvider(
        QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT,
        "openrouter",
      ),
    ).toBe(true);
    expect(
      canRouteModelToProvider(
        QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT,
        "gateway",
      ),
    ).toBe(false);
  });
});
