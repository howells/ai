import { describe, expect, test } from "bun:test";
import type { ModelSlot } from "../src";
import {
  ANTHROPIC_MODELS,
  canRouteModelToProvider,
  DEEPSEEK_MODELS,
  DEFAULT_MODELS,
  DEFAULT_TASK_MODELS,
  getLanguageModelCapabilities,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  GLM_MODELS,
  GROQ_MODELS,
  inferModelService,
  inferProvider,
  INCEPTION_MODELS,
  KIMI_MODELS,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_CAPABILITIES,
  LANGUAGE_MODEL_TASKS,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_SERVICE_ENV_VARS,
  MODEL_TIERS,
  MINIMAX_MODELS,
  NEX_AGI_MODELS,
  OPENAI_MODELS,
  OPENROUTER_EMBED_MODELS,
  OPENROUTER_MODELS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_TASK_DEFAULT_MODELS,
  QWEN_MODELS,
  resolveModels,
  resolveLanguageModelVariant,
  resolveOpenRouterFreeModelId,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
  resolveTaskModels,
  STEPFUN_MODELS,
  toDirectModelId,
  VOYAGE_MODELS,
  XAI_MODELS,
  XIAOMI_MODELS,
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
  "groq",
] as const;

const GATEWAY_MODEL_IDS_USED = new Set([
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-haiku-4.5",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v4-flash",
  "zai/glm-5.2",
  "zai/glm-5v-turbo",
  "zai/glm-4.7",
  "zai/glm-4.7-flash",
  "zai/glm-4.6v",
  "google/gemini-3.1-flash-lite",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3-flash",
  "moonshotai/kimi-k2.7-code",
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2-thinking",
  "minimax/minimax-m3",
  "minimax/minimax-m2.5",
  "inception/mercury-2",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.5",
  "alibaba/qwen3.7-plus",
  "alibaba/qwen3-vl-235b-a22b-instruct",
  "anthropic/claude-fable-5",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "stepfun/step-3.7-flash",
  "xiaomi/mimo-v2.5",
  "xiaomi/mimo-v2.5-pro",
  "xai/grok-4.3",
]);

describe("model matrix", () => {
  test("defines every public model tier and retrieval slot", () => {
    expect(Object.keys(DEFAULT_MODELS).toSorted()).toEqual([...MODEL_SLOTS].toSorted());
  });

  test("uses provider constants for all default language model tiers", () => {
    expect(DEFAULT_MODELS.nano.text).toBe(OPENAI_MODELS.GPT_5_4_NANO);
    expect(DEFAULT_MODELS.nano.tools).toBe(OPENAI_MODELS.GPT_5_4_NANO);
    expect(DEFAULT_MODELS.nano.vision).toBe(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE);
    expect(DEFAULT_MODELS.fast.text).toBe(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE);
    expect(DEFAULT_MODELS.fast.tools).toBe(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE);
    expect(DEFAULT_MODELS.fast.vision).toBe(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE);
    expect(DEFAULT_MODELS.standard.text).toBe(GOOGLE_MODELS.GEMINI_3_5_FLASH);
    expect(DEFAULT_MODELS.standard.tools).toBe(GOOGLE_MODELS.GEMINI_3_5_FLASH);
    expect(DEFAULT_MODELS.standard.vision).toBe(GOOGLE_MODELS.GEMINI_3_5_FLASH);
    expect(DEFAULT_MODELS.powerful.text).toBe(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW);
    expect(DEFAULT_MODELS.reasoning.text).toBe(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8);
    expect(ANTHROPIC_MODELS.CLAUDE_OPUS_4_8).toBe("anthropic/claude-opus-4.8");
    expect(ANTHROPIC_MODELS.CLAUDE_FABLE_5).toBe("anthropic/claude-fable-5");
    expect(ANTHROPIC_MODELS.CLAUDE_OPUS_4_7).toBe("anthropic/claude-opus-4.7");
    expect(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6).toBe("anthropic/claude-opus-4.6");
    expect(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6).toBe("anthropic/claude-sonnet-4.6");
    expect(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5).toBe("anthropic/claude-haiku-4.5");
    expect(GOOGLE_MODELS.GEMINI_3_5_FLASH).toBe("google/gemini-3.5-flash");
    expect(GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW).toBe("google/gemini-3-flash-preview");
    expect(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW).toBe("google/gemini-3.1-pro-preview");
    expect(OPENAI_MODELS.GPT_5_5).toBe("openai/gpt-5.5");
    expect(DEFAULT_MODELS.embed).toEqual({
      gemini: "gemini-embedding-2",
      ollama: "qwen3-embedding:8b",
      openrouter: "openai/text-embedding-3-small",
      voyage: "voyage-4",
    });
    expect(DEFAULT_MODELS.multimodalEmbed).toEqual({
      gemini: "gemini-embedding-2",
      ollama: "qwen3-embedding:8b",
      openrouter: "google/gemini-embedding-2-preview",
      voyage: "voyage-multimodal-3.5",
    });
    expect(OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_SMALL).toBe(
      "openai/text-embedding-3-small",
    );
    expect(OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_LARGE).toBe(
      "openai/text-embedding-3-large",
    );
    expect(OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_2).toBe("google/gemini-embedding-2-preview");
    expect(OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_1).toBe("google/gemini-embedding-001");
    expect(VOYAGE_MODELS.VOYAGE_3_5_LITE).toBe("voyage-3.5-lite");
    expect(VOYAGE_MODELS.MULTIMODAL_3).toBe("voyage-multimodal-3");
    expect(QWEN_MODELS.QWEN_3_VL_235B_A22B).toBe("qwen/qwen3-vl-235b-a22b-instruct");
    expect(GLM_MODELS.GLM_5_2).toBe("z-ai/glm-5.2");
    expect(GLM_MODELS.GLM_5_3_FLASH).toBe("z-ai/glm-5.3-flash");
    expect(GLM_MODELS.GLM_4_7_FLASH).toBe("z-ai/glm-4.7-flash");
    expect(KIMI_MODELS.KIMI_K2_7_CODE).toBe("moonshotai/kimi-k2.7-code");
    expect(OPENROUTER_MODELS.FREE).toBe("openrouter/free");
    expect(OPENAI_MODELS.GPT_5_6_LUNA).toBe("openai/gpt-5.6-luna-20260709");
    expect(GROQ_MODELS.GPT_OSS_20B).toBe("openai/gpt-oss-20b");
    expect(XAI_MODELS.GROK_4_3).toBe("x-ai/grok-4.3");
    expect(MINIMAX_MODELS.MINIMAX_M3).toBe("minimax/minimax-m3");
    expect(STEPFUN_MODELS.STEP_3_7_FLASH).toBe("stepfun/step-3.7-flash");
  });

  test("catalogues every public language model constant and default", () => {
    const catalogIds = new Set(LANGUAGE_MODEL_CATALOG.map((model) => model.id));
    const publicLanguageModelIds = [
      ...Object.values(ANTHROPIC_MODELS),
      ...Object.values(DEEPSEEK_MODELS),
      ...Object.values(GLM_MODELS),
      ...Object.values(GOOGLE_MODELS),
      ...Object.values(GROQ_MODELS),
      ...Object.values(INCEPTION_MODELS),
      ...Object.values(KIMI_MODELS),
      ...Object.values(MINIMAX_MODELS),
      ...Object.values(NEX_AGI_MODELS),
      ...Object.values(OPENAI_MODELS),
      ...Object.values(OPENROUTER_MODELS),
      ...Object.values(QWEN_MODELS),
      ...Object.values(STEPFUN_MODELS),
      ...Object.values(XAI_MODELS),
      ...Object.values(XIAOMI_MODELS),
    ];

    expect(new Set(publicLanguageModelIds).size).toBe(publicLanguageModelIds.length);

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
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "tools", "openrouter", "coding"),
    ).toBe(OPENAI_MODELS.GPT_5_5);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "fast", "tools", "openrouter", "coding"),
    ).toBe(GLM_MODELS.GLM_4_7);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "vision", "openrouter", "vision"),
    ).toBe(GOOGLE_MODELS.GEMINI_3_5_FLASH);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "tools", "anthropic", "coding"),
    ).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "text", "gateway", "general"),
    ).toBe(DEFAULT_MODELS.standard.text);
  });

  test("merges task overrides without dropping default task coverage", () => {
    const taskModels = resolveTaskModels({
      coding: {
        standard: {
          text: KIMI_MODELS.KIMI_K2_5,
        },
      },
    });

    expect(taskModels.coding.standard?.text).toBe(KIMI_MODELS.KIMI_K2_5);
    expect(taskModels.coding.standard?.tools).toBe(OPENAI_MODELS.GPT_5_5);
    expect(taskModels.agentic.fast?.tools).toBe(GLM_MODELS.GLM_4_7);
  });

  test("uses OpenRouter's managed free router for free model selection", () => {
    expect(resolveOpenRouterFreeModelId("standard", "visionTools")).toBe(OPENROUTER_MODELS.FREE);
  });

  test("defines provider defaults for every tier and capability surface", () => {
    for (const provider of PROVIDERS) {
      for (const tier of MODEL_TIERS) {
        for (const variant of LANGUAGE_MODEL_VARIANTS) {
          const modelId = PROVIDER_DEFAULT_MODELS[provider][tier][variant];
          expect(modelId).toBeTruthy();
          expect(canRouteModelToProvider(modelId, provider)).toBe(true);
          expect(resolveProviderLanguageModelId(DEFAULT_MODELS, tier, variant, provider)).toBe(
            modelId,
          );
        }
      }
    }
  });

  test("keeps provider-pinned task selections provider-native", () => {
    for (const provider of PROVIDERS) {
      for (const task of LANGUAGE_MODEL_TASKS) {
        for (const tier of MODEL_TIERS) {
          for (const variant of LANGUAGE_MODEL_VARIANTS) {
            const modelId = resolveProviderLanguageModelId(
              DEFAULT_MODELS,
              tier,
              variant,
              provider,
              task,
            );

            expect(canRouteModelToProvider(modelId, provider)).toBe(true);
          }
        }
      }
    }

    expect(PROVIDER_TASK_DEFAULT_MODELS.openai?.coding?.standard?.text).toBe(OPENAI_MODELS.GPT_5_5);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "tools", "openai", "coding"),
    ).toBe(OPENAI_MODELS.GPT_5_5);
    expect(
      resolveProviderLanguageModelId(DEFAULT_MODELS, "standard", "vision", "zai", "vision"),
    ).toBe(GLM_MODELS.GLM_5V_TURBO);
    expect(resolveProviderLanguageModelId(DEFAULT_MODELS, "nano", "vision", "qwen")).toBe(
      QWEN_MODELS.QWEN_3_7_PLUS,
    );
  });

  test("returns a fresh default matrix", () => {
    const first = resolveModels();
    const second = resolveModels();

    first.fast.text = OPENAI_MODELS.GPT_5_4_NANO;
    first.embed.voyage = VOYAGE_MODELS.VOYAGE_3_LITE;

    expect(second.fast.text).toBe(DEFAULT_MODELS.fast.text);
    expect(second.embed.voyage).toBe(DEFAULT_MODELS.embed.voyage);
  });

  test("merges overrides without dropping other variants", () => {
    const models = resolveModels({
      embed: {
        gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1,
        openrouter: OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_LARGE,
        voyage: VOYAGE_MODELS.VOYAGE_3_LITE,
      },
      multimodalEmbed: {
        gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
        openrouter: OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_1,
      },
      standard: {
        text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
        tools: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
      },
    });

    expect(models.embed.voyage).toBe("voyage-3-lite");
    expect(models.embed.gemini).toBe("gemini-embedding-001");
    expect(models.embed.openrouter).toBe("openai/text-embedding-3-large");
    expect(models.multimodalEmbed.voyage).toBe("voyage-multimodal-3.5");
    expect(models.multimodalEmbed.gemini).toBe("gemini-embedding-2");
    expect(models.multimodalEmbed.openrouter).toBe("google/gemini-embedding-001");
    expect(models.standard.text).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(models.standard.tools).toBe(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6);
    expect(models.standard.vision).toBe(DEFAULT_MODELS.standard.vision);
    expect(models.fast).toEqual(DEFAULT_MODELS.fast);
  });

  test("maps option flags to language model variants", () => {
    expect(resolveLanguageModelVariant()).toBe("text");
    expect(resolveLanguageModelVariant({ tools: true })).toBe("tools");
    expect(resolveLanguageModelVariant({ vision: true })).toBe("vision");
    expect(resolveLanguageModelVariant({ tools: true, vision: true })).toBe("visionTools");
    expect(LANGUAGE_MODEL_CAPABILITIES.visionTools).toEqual({
      structured: true,
      tools: true,
      vision: true,
    });
  });

  test("reports actual model capabilities separately from requested variants", () => {
    expect(getLanguageModelCapabilities(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO)).toEqual({
      structured: true,
      tools: true,
      vision: false,
    });
    expect(getLanguageModelCapabilities(QWEN_MODELS.QWEN_3_7_PLUS)).toEqual({
      structured: true,
      tools: true,
      vision: true,
    });
  });
});

describe("provider helpers", () => {
  test("strips provider prefixes for direct provider calls", () => {
    expect(toDirectModelId("anthropic/claude-sonnet-4.6")).toBe("claude-sonnet-4.6");
    expect(toDirectModelId("gpt-5-nano")).toBe("gpt-5-nano");
  });

  test("infers known direct providers only", () => {
    expect(inferProvider("anthropic/claude-sonnet-4.6")).toBe("anthropic");
    expect(inferProvider("openai/gpt-5-nano")).toBe("openai");
    expect(inferProvider("google/gemini-3.5-flash")).toBe("google");
    expect(inferProvider("deepseek/deepseek-v4-pro")).toBe("deepseek");
    expect(inferProvider("x-ai/grok-4.3")).toBe("xai");
    expect(inferProvider("qwen/qwen3.7-plus")).toBe("qwen");
    expect(inferProvider("z-ai/glm-5.2")).toBe("zai");
    expect(inferProvider("moonshotai/kimi-k2.7-code")).toBe("moonshotai");
    expect(inferProvider("groq/compound")).toBe("groq");
    expect(inferProvider("minimax/minimax-m3")).toBeUndefined();
    expect(inferProvider("gpt-5-nano")).toBeUndefined();
  });

  test("infers underlying model services and service key env vars", () => {
    expect(inferModelService(KIMI_MODELS.KIMI_K2_7_CODE)).toBe("moonshotai");
    expect(inferModelService(GLM_MODELS.GLM_5_2)).toBe("zai");
    expect(inferModelService(XAI_MODELS.GROK_4_3)).toBe("xai");
    expect(inferModelService(QWEN_MODELS.QWEN_3_7_PLUS)).toBe("qwen");
    expect(inferModelService("groq/compound")).toBe("groq");
    expect(inferModelService(MINIMAX_MODELS.MINIMAX_M3)).toBe("minimax");
    expect(MODEL_SERVICE_ENV_VARS.moonshotai).toBe("MOONSHOT_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.zai).toBe("ZAI_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.xai).toBe("XAI_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.groq).toBe("GROQ_API_KEY");
    expect(MODEL_SERVICE_ENV_VARS.minimax).toBeUndefined();
  });

  test("resolves provider-specific model IDs for known aliases", () => {
    expect(resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, "openrouter")).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, "gateway")).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    expect(resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_SONNET_4_6, "anthropic")).toBe(
      "claude-sonnet-4-6",
    );
    expect(resolveProviderModelId(ANTHROPIC_MODELS.CLAUDE_HAIKU_4_5, "anthropic")).toBe(
      "claude-haiku-4-5-20251001",
    );

    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_5_FLASH, "openrouter")).toBe(
      "google/gemini-3.5-flash",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_5_FLASH, "gateway")).toBe(
      "google/gemini-3.5-flash",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_5_FLASH, "google")).toBe(
      "gemini-3.5-flash",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW, "openrouter")).toBe(
      "google/gemini-3-flash-preview",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW, "gateway")).toBe(
      "google/gemini-3-flash",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_FLASH_PREVIEW, "google")).toBe(
      "gemini-3-flash-preview",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW, "google")).toBe(
      "gemini-3.1-pro-preview",
    );
    expect(resolveProviderModelId(GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE, "gateway")).toBe(
      "google/gemini-3.1-flash-lite",
    );

    expect(resolveProviderModelId(XAI_MODELS.GROK_4_3, "gateway")).toBe("xai/grok-4.3");
    expect(resolveProviderModelId(XAI_MODELS.GROK_4_3, "xai")).toBe("grok-4.3");
    expect(resolveProviderModelId(GLM_MODELS.GLM_5_2, "gateway")).toBe("zai/glm-5.2");
    expect(resolveProviderModelId(GLM_MODELS.GLM_4_7, "gateway")).toBe("zai/glm-4.7");
    expect(resolveProviderModelId(GLM_MODELS.GLM_5V_TURBO, "gateway")).toBe("zai/glm-5v-turbo");
    expect(resolveProviderModelId(GLM_MODELS.GLM_4_7_FLASH, "gateway")).toBe("zai/glm-4.7-flash");
    expect(resolveProviderModelId(GLM_MODELS.GLM_4_6V, "gateway")).toBe("zai/glm-4.6v");
    expect(resolveProviderModelId(GLM_MODELS.GLM_5_2, "zai")).toBe("glm-5.2");
    expect(resolveProviderModelId(QWEN_MODELS.QWEN_3_7_PLUS, "gateway")).toBe(
      "alibaba/qwen3.7-plus",
    );
    expect(resolveProviderModelId(KIMI_MODELS.KIMI_K2_7_CODE, "moonshotai")).toBe("kimi-k2.7-code");
    expect(resolveProviderModelId(GROQ_MODELS.GPT_OSS_20B, "groq")).toBe("openai/gpt-oss-20b");
  });

  test("only exposes exact Gateway routes with known Gateway model IDs", () => {
    for (const model of LANGUAGE_MODEL_CATALOG) {
      if (!canRouteModelToProvider(model.id, "gateway")) {
        continue;
      }

      expect(GATEWAY_MODEL_IDS_USED.has(resolveProviderModelId(model.id, "gateway"))).toBe(true);
    }

    // Verified against the live Gateway catalogue on 2026-08-16: Gateway does
    // serve Qwen3-VL and Step 3.7 Flash, under Gateway's own vendor prefix.
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_VL_235B_A22B, "gateway")).toBe(true);
    expect(resolveProviderModelId(QWEN_MODELS.QWEN_3_VL_235B_A22B, "gateway")).toBe(
      "alibaba/qwen3-vl-235b-a22b-instruct",
    );
    expect(canRouteModelToProvider(STEPFUN_MODELS.STEP_3_7_FLASH, "gateway")).toBe(true);

    // A free OpenRouter tier must not silently resolve to a billed Gateway route.
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE, "gateway")).toBe(
      false,
    );
    expect(canRouteModelToProvider(NEX_AGI_MODELS.NEX_N2_PRO, "gateway")).toBe(false);
  });

  test("normalizes legacy package IDs for providers that need the new spelling", () => {
    expect(resolveProviderModelId("anthropic/claude-opus-4-6", "openrouter")).toBe(
      "anthropic/claude-opus-4.6",
    );
    expect(resolveProviderModelId("anthropic/claude-opus-4-6", "anthropic")).toBe(
      "claude-opus-4-6",
    );
    expect(resolveProviderModelId("google/gemini-3-flash", "openrouter")).toBe(
      "google/gemini-3-flash-preview",
    );
    expect(resolveProviderModelId("google/gemini-3-flash", "gateway")).toBe(
      "google/gemini-3-flash",
    );
  });

  test("reports whether a direct provider can route a model", () => {
    expect(canRouteModelToProvider(ANTHROPIC_MODELS.CLAUDE_OPUS_4_6, "anthropic")).toBe(true);
    expect(canRouteModelToProvider(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO, "anthropic")).toBe(false);
    expect(canRouteModelToProvider(INCEPTION_MODELS.MERCURY_2, "gateway")).toBe(true);
    expect(canRouteModelToProvider(XAI_MODELS.GROK_4_3, "xai")).toBe(true);
    expect(canRouteModelToProvider(KIMI_MODELS.KIMI_K2_7_CODE, "moonshotai")).toBe(true);
    expect(canRouteModelToProvider(GLM_MODELS.GLM_5_2, "zai")).toBe(true);
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_7_PLUS, "qwen")).toBe(true);
    expect(canRouteModelToProvider(GROQ_MODELS.GPT_OSS_20B, "groq")).toBe(true);
    expect(canRouteModelToProvider(DEEPSEEK_MODELS.DEEPSEEK_V4_PRO, "deepseek")).toBe(true);
    expect(canRouteModelToProvider(KIMI_MODELS.KIMI_K2_7_CODE, "xai")).toBe(false);
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_VL_235B_A22B, "openrouter")).toBe(true);
    expect(canRouteModelToProvider(QWEN_MODELS.QWEN_3_VL_235B_A22B, "gateway")).toBe(true);
  });
});
