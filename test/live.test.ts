import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { createAI, generateText } from "../src";
import type { GenerationOptions, ProviderRoute } from "../src";
import {
  canRouteModelToProvider,
  LANGUAGE_MODEL_CATALOG,
  resolveProviderModelId,
} from "../src/models";

const LIVE_TEST_TIMEOUT_MS = 300_000;
const LIVE_TESTS_ENABLED = process.env.LIVE_AI_TESTS === "1";
const liveTest = LIVE_TESTS_ENABLED ? test : test.skip;

const ENV_FILES = [
  join(process.cwd(), ".env"),
  join(process.cwd(), ".env.local"),
  join(process.cwd(), "apps/benchmark/.env.local"),
];

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalEnv(): void {
  for (const file of ENV_FILES) {
    if (!existsSync(file)) {
      continue;
    }

    for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1));
      process.env[key] ??= value;
    }
  }
}

loadLocalEnv();

const ai = createAI({
  app: { name: "Howells AI Live Tests", url: "https://github.com/howells/ai" },
});

const configuredLanguageProviders = ai.availableProviders.filter((provider) =>
  ["gateway", "openrouter", "anthropic", "openai", "google"].includes(provider),
);

interface LiveModelRun {
  provider: ProviderRoute;
  canonicalModelId: string;
  providerModelId: string;
  label: string;
}

function createLanguageMatrix(): LiveModelRun[] {
  const runs: LiveModelRun[] = [];

  for (const model of LANGUAGE_MODEL_CATALOG) {
    for (const provider of configuredLanguageProviders) {
      if (!canRouteModelToProvider(model.id, provider)) {
        continue;
      }

      runs.push({
        canonicalModelId: model.id,
        label: model.name,
        provider,
        providerModelId: resolveProviderModelId(model.id, provider),
      });
    }
  }

  return runs;
}

function assertLiveTestsAreConfigured(): void {
  expect(configuredLanguageProviders.length).toBeGreaterThan(0);
}

async function assertGenerationWorks(run: LiveModelRun): Promise<void> {
  const needsExplicitReasoning = run.canonicalModelId === "openai/gpt-5-nano";

  const result = await generateText({
    model: ai.modelById(run.providerModelId, { provider: run.provider }),
    prompt: "Reply with exactly OK.",
    ...ai.generationOptions({
      maxOutputTokens: 256,
      modelId: run.canonicalModelId,
      provider: run.provider,
      temperature: null,
      tools: "none",
      ...(needsExplicitReasoning ? { reasoning: "minimal" } : {}),
    }),
  });

  expect(result.text.trim().length).toBeGreaterThan(0);
}

const CONFIG_MATRIX: {
  provider: ProviderRoute;
  modelId: string;
  label: string;
  options: GenerationOptions;
}[] = [
  {
    label: "Gateway with inferred OpenAI options",
    modelId: "openai/gpt-5.4-mini",
    options: {
      modelId: "openai/gpt-5.4-mini",
      provider: "gateway",
      reasoning: "minimal",
      user: "live-test",
      verbosity: "low",
    },
    provider: "gateway",
  },
  {
    label: "OpenRouter reasoning/cache/user options",
    modelId: "anthropic/claude-haiku-4.5",
    options: {
      cache: "ephemeral",
      parallelTools: true,
      provider: "openrouter",
      reasoning: "off",
      user: "live-test",
    },
    provider: "openrouter",
  },
  {
    label: "Anthropic thinking/cache/structured options",
    modelId: "anthropic/claude-haiku-4.5",
    options: {
      cache: "ephemeral",
      parallelTools: false,
      provider: "anthropic",
      reasoning: "off",
      structured: "auto",
      user: "live-test",
    },
    provider: "anthropic",
  },
  {
    label: "OpenAI reasoning/verbosity/structured options",
    modelId: "openai/gpt-5.4-mini",
    options: {
      modelId: "openai/gpt-5.4-mini",
      parallelTools: false,
      provider: "openai",
      reasoning: "minimal",
      serviceTier: "auto",
      structured: "strict",
      user: "live-test",
      verbosity: "low",
    },
    provider: "openai",
  },
  {
    label: "Google thinking/structured/service-tier options",
    modelId: "google/gemini-3.1-flash-lite",
    options: {
      provider: "google",
      reasoning: "low",
      serviceTier: "standard",
      structured: "strict",
    },
    provider: "google",
  },
];

describe("live provider matrix", () => {
  liveTest(
    "every configured model/provider route generates text",
    async () => {
      assertLiveTestsAreConfigured();

      const failures: string[] = [];

      for (const run of createLanguageMatrix()) {
        try {
          await assertGenerationWorks(run);
        } catch (error) {
          failures.push(
            `${run.provider}:${run.providerModelId} (${run.label}) failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      expect(failures).toEqual([]);
    },
    LIVE_TEST_TIMEOUT_MS,
  );

  liveTest(
    "normalized config options are accepted by every configured provider",
    async () => {
      assertLiveTestsAreConfigured();

      const failures: string[] = [];

      for (const config of CONFIG_MATRIX) {
        if (!configuredLanguageProviders.includes(config.provider)) {
          continue;
        }
        if (!canRouteModelToProvider(config.modelId, config.provider)) {
          continue;
        }

        try {
          const providerModelId = resolveProviderModelId(config.modelId, config.provider);
          const result = await generateText({
            model: ai.modelById(providerModelId, {
              provider: config.provider,
            }),
            prompt: "Reply with exactly OK.",
            ...ai.generationOptions({
              ...config.options,
              maxOutputTokens: 256,
              modelId: config.modelId,
              temperature: null,
              tools: "none",
            }),
          });

          expect(result.text.trim().length).toBeGreaterThan(0);
        } catch (error) {
          failures.push(
            `${config.provider}:${config.modelId} (${config.label}) failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      expect(failures).toEqual([]);
    },
    LIVE_TEST_TIMEOUT_MS,
  );
});
