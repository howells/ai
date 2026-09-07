# @howells/ai

Unified AI client for all projects. One package, Vercel AI Gateway by default,
direct provider escape hatches, provider-aware model tiers, and normalized
generation settings.

## Quick Start

```typescript
import { createAI, visionPrompt } from "@howells/ai";
import { generateText, Output, streamText, embed } from "ai";

const ai = createAI({
  app: { name: "MyApp", url: "https://myapp.com" },
});

// Pick a model by tier
const { text } = await generateText({
  model: ai.model("fast"),
  prompt: "Classify this ingredient",
});

// Add capabilities per tier
const { text: analysis } = await generateText({
  model: ai.model("powerful", {
    agent: "taste-analysis",
    tools: true,
    vision: true,
  }),
  prompt: visionPrompt("Analyze this design", ["https://example.com/design.png"]),
});

// Structured output
const { output } = await generateText({
  model: ai.model("standard", { agent: "search" }),
  output: Output.object({ schema: myZodSchema }),
  prompt: "Extract entities from this text",
});
```

## Vision Input

Use `visionPrompt()` to build AI SDK-native text + image prompts from URLs,
data URLs, or binary image data:

```typescript
const { text } = await generateText({
  model: ai.model("standard", { vision: true }),
  prompt: visionPrompt("What changed in this screenshot?", [
    "https://example.com/screenshot.png",
    { data: screenshotBytes, mediaType: "image/png" },
  ]),
});
```

`imagePart()` is also exported when you need to compose the AI SDK message parts
yourself, and `visionMessage()` wraps the same content as a user message for
APIs that expect `messages`.

## Generation Options

Use `ai.generationOptions(...)` for the settings that vary across providers:
reasoning budget, verbosity, structured-output provider behavior, tool policy,
response length, sampling, prompt cache, user attribution, and service tier.

```typescript
const provider = "openai";

const { text } = await generateText({
  model: ai.model("powerful", { provider, tools: true }),
  prompt: "Plan the migration",
  tools: migrationTools,
  ...ai.generationOptions({
    provider,
    reasoning: "high",
    verbosity: "medium",
    structured: "strict",
    tools: "auto",
    maxToolSteps: 5,
    outputLength: "long",
    creativity: "focused",
    user: "migration-agent",
  }),
});
```

For Gateway calls, pass the canonical model ID when you want provider-specific
options inferred as well as Gateway attribution:

```typescript
const modelId = "openai/gpt-5.5";

await streamText({
  model: ai.modelById(modelId),
  prompt: "...",
  ...ai.generationOptions({
    provider: "gateway",
    modelId,
    reasoning: "medium",
    verbosity: "high",
  }),
});
```

| Normalized Option        | AI SDK / Provider Mapping                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reasoning`              | OpenAI `reasoningEffort`, Anthropic `thinking`, Google `thinkingConfig`, OpenRouter `reasoning`. Accepts a preset (`"high"`) or `{ effort, maxTokens }`.                                     |
| `verbosity`              | OpenAI `textVerbosity`                                                                                                                                                                       |
| `structured`             | OpenAI strict JSON schema, Anthropic structured output mode, Google structured outputs                                                                                                       |
| `tools`                  | AI SDK `toolChoice`                                                                                                                                                                          |
| `maxToolSteps`           | AI SDK `stopWhen: stepCountIs(n)`                                                                                                                                                            |
| `parallelTools`          | OpenAI/OpenRouter parallel tool calls, Anthropic inverse disable flag                                                                                                                        |
| `outputLength`           | AI SDK `maxOutputTokens` preset                                                                                                                                                              |
| `creativity`             | AI SDK `temperature` preset                                                                                                                                                                  |
| `cache`                  | Provider prompt-prefix caching: Anthropic `cacheControl`, OpenRouter `cache_control`. Pass `"ephemeral"` or `{ ttl: "5m" \| "1h" }`.                                                         |
| `responseCache`          | OpenRouter exact-response caching. Pass `"5m"`, `"1h"`, or `{ ttlSeconds, clear? }`; only enable for replay-safe requests.                                                                   |
| `sessionId`              | Stable request-session or workflow-run identifier sent as OpenRouter `user` attribution when `user` is omitted.                                                                              |
| `serviceTier`            | OpenAI/Google service tier where supported                                                                                                                                                   |
| `routing`                | Normalized route intent. Gateway `sort/only/order/zeroDataRetention/...`, OpenRouter `provider.{sort, only, ignore, order, allow_fallbacks, max_price, quantizations, zdr, data_collection}` |
| `fallbackModels`         | Gateway `models`, OpenRouter `models` (model fallback chain)                                                                                                                                 |
| `openRouterVariant`      | OpenRouter model suffixes `:nitro`, `:exacto`, `:floor` on `ai.model()` / `ai.modelById()`                                                                                                   |
| `tags`                   | Gateway `tags` (spend reporting). Ignored elsewhere.                                                                                                                                         |
| `webSearch`              | OpenRouter `plugins: [{ id: "web", ... }]`. For Gateway, wire `gateway.tools.parallelSearch()` / `perplexitySearch()` via AI SDK `tools`.                                                    |
| `responseHealing`        | OpenRouter `plugins: [{ id: "response-healing" }]` (auto-repair JSON for `generateObject`).                                                                                                  |
| `includeCost`            | OpenRouter `usage: { include: true }`. Gateway returns cost automatically.                                                                                                                   |
| `logprobs` / `logitBias` | OpenRouter only (`logprobs` + `top_logprobs`, `logit_bias`).                                                                                                                                 |

### Routing & cost

```typescript
// Cheapest provider, ZDR-only, with a price ceiling and fallback model
await generateText({
  model: ai.modelById("anthropic/claude-sonnet-4.6", { provider: "gateway" }),
  prompt: "...",
  ...ai.generationOptions({
    provider: "gateway",
    modelId: "anthropic/claude-sonnet-4.6",
    routing: {
      prefer: "cheapest",
      privacy: ["no-retention", "no-training"],
      allow: ["anthropic", "amazon-bedrock"],
    },
    fallbackModels: ["anthropic/claude-haiku-4.5"],
    tags: ["feature:checkout"],
  }),
});
```

`routing.prefer` accepts `"auto"`, `"cheapest"`, `"fastest"`, `"highest-throughput"`,
or `"highest-quality"`.
For OpenRouter, `highest-throughput` maps to `provider.sort: "throughput"`;
`highest-quality` maps to OpenRouter's Exacto-style quality/tool-calling
routing, and `cheapest` maps to price-sorted routing. You can also use
`openRouterVariant: "nitro"`, `"exacto"`, or `"floor"` to send the official
OpenRouter model suffixes explicitly.
`routing.privacy` accepts any combination of `"no-retention"`, `"no-training"`, `"hipaa"`.
`routing.maxCost` (OpenRouter only) takes USD-per-million-token ceilings:
`{ promptPerMillion, completionPerMillion, requestUsd }`.

### Gateway introspection

When the Gateway provider is configured, `ai.gateway` exposes the control-plane APIs:

```typescript
const ai = createAI();
if (ai.gateway) {
  const { balance } = await ai.gateway.credits();
  const { models } = await ai.gateway.listModels();
  const spend = await ai.gateway.spend({
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    groupBy: "model",
  });
  const info = await ai.gateway.generationInfo("gen_01H...");
}
```

## Testing

Normal tests are deterministic and do not call providers:

```bash
pnpm test
pnpm check-types
pnpm build
```

Live tests are opt-in because they use real API keys and spend provider quota.
They load keys from `.env`, `.env.local`, or `apps/benchmark/.env.local`, then
verify every configured provider/model route plus the normalized config option
matrix:

```bash
pnpm test:live
```

## CLI

The package ships a small CLI as both `ai` and `howells-ai`:

```bash
ai models
ai providers
ai doctor
ai doctor --live
ai test --provider openai
ai models --task coding
ai bench --provider gateway --task coding --tier fast --prompt "Reply in one sentence."
```

Use `--json` on every command for scriptable output. The CLI loads local keys
from `.env`, `.env.local`, and `apps/benchmark/.env.local`, and never prints
secret values.

## Choosing Models With Evidence

Four commands answer the three questions that decide a model: what it costs,
how fast it is, and how well it does the job.

```bash
ai catalog --discounted                       # live OpenRouter discounts
ai compare                                    # every catalogue model priced across routers
ai compare --model deepseek/deepseek-v4-pro --discounts
ai bench --model anthropic/claude-sonnet-4.6 --routes openrouter,anthropic --runs 3
ai audit --root ~/Sites                       # who pins what, and where it disagrees
```

- **`catalog`** reads the live OpenRouter and Vercel Gateway catalogues.
  Discounts live only on OpenRouter's per-model `endpoints` API, so
  `--discounted` sweeps it.
- **`compare`** resolves one canonical model across routers, including vendor
  prefixes that differ (`z-ai` against `zai`, `qwen` against `alibaba`), and
  reports the cheapest effective price with discounts applied.
- **`bench`** measures time to first token and output throughput. Every figure
  is measured locally in milliseconds and summarised by median and IQR, because
  routers publish price but not speed: OpenRouter returns null for latency and
  throughput on every endpoint it serves.
- **`audit`** walks a directory of repositories, finds every pinned model ID,
  infers its workload and route, and reconciles the result against the live
  catalogues. Findings name the projects affected, so the output is a work list.

The same logic is importable: `@howells/ai/catalog`, `@howells/ai/bench`,
`@howells/ai/eval`, `@howells/ai/decisions`.

## Evaluating A Discrete Task

`@howells/ai/eval` runs a fixed set of cases against several candidate models
and ranks them on score, cost, and speed. A suite is data, so it lives in the
repo that owns the workload.

```ts
import { evalCompare, jsonShapeGrader } from "@howells/ai/eval";

const suite = {
  id: "material-classify",
  version: "1.0.0",
  task: "bulk",
  grader: jsonShapeGrader,
  system: "Reply with JSON only.",
  cases: [
    {
      id: "oak-matte",
      prompt: 'Classify: "brushed oak veneer, matte lacquer".',
      expected: { material: "oak", finish: "matte" },
    },
  ],
};

const ranked = await evalCompare({
  ai,
  suite,
  candidates: [
    { modelId: "deepseek/deepseek-v4-flash", route: "openrouter" },
    { modelId: "google/gemini-3.5-flash", route: "gateway" },
  ],
  inputPricePerMillion: { "deepseek/deepseek-v4-flash": 0.06 },
  outputPricePerMillion: { "deepseek/deepseek-v4-flash": 0.12 },
});

ranked.best; // highest score
ranked.bestValue; // best score per dollar within 5% of the top score
```

Bump `suite.version` on any case change. Scores are comparable only within one
version, and quietly comparing across revisions is how eval results turn into
folklore.

## Versioned Decisions

`@howells/ai/decisions` stamps the matrix with a version, a review date, and the
evidence behind it, so a consumer can tell which opinion it is running without a
network call.

```ts
import { MODEL_DECISION_SET, resolveDecision } from "@howells/ai/decisions";

MODEL_DECISION_SET.version; // "2026.08.16"
MODEL_DECISION_SET.evidence; // ["catalog", "fleet-usage", "judgement"]
resolveDecision("standard", "text", "coding").modelId;
```

`evidence` is deliberately narrow. A cell backed only by judgement says so, and
claiming measurement that has not happened would make the stamp worthless.

## Model Matrix

### Language Models (via Vercel AI Gateway by default)

Language models are selected by tier, then capability flags. Structured
input/output is a baseline requirement for every default language model.

| Tier        | Text Default                    | Tools Default                   | Vision / Vision Tools Default   | Use When                                                  |
| ----------- | ------------------------------- | ------------------------------- | ------------------------------- | --------------------------------------------------------- |
| `nano`      | `openai/gpt-5.4-nano`           | `openai/gpt-5.4-nano`           | `google/gemini-3.1-flash-lite`  | Premium low-cost text plus lightweight Gemini vision      |
| `fast`      | `google/gemini-3.1-flash-lite`  | `google/gemini-3.1-flash-lite`  | `google/gemini-3.1-flash-lite`  | Fast premium Gemini calls across text, tools, and vision  |
| `standard`  | `google/gemini-3.5-flash`       | `google/gemini-3.5-flash`       | `google/gemini-3.5-flash`       | Everyday tasks, chat, coding, vision, 1M context          |
| `powerful`  | `google/gemini-3.1-pro-preview` | `google/gemini-3.1-pro-preview` | `google/gemini-3.1-pro-preview` | High-quality premium Gemini reasoning and multimodal work |
| `reasoning` | `anthropic/claude-opus-4.8`     | `anthropic/claude-opus-4.8`     | `anthropic/claude-opus-4.8`     | Frontier quality and deep multi-step reasoning            |

```typescript
ai.model("fast"); // fast text
ai.model("fast", { tools: true }); // fast tool calling
ai.model("fast", { vision: true }); // fast image understanding
ai.model("fast", { tools: true, vision: true }); // fast image + tools
ai.model("standard", { free: true }); // OpenRouter free-model router
```

### Workload Tasks

Pass `task` when the best model depends on the job more than the generic tier.
`general` preserves the base matrix; other tasks layer RouterBase-informed picks
over the same tier/capability shape.

```typescript
ai.model("fast", { task: "coding", tools: true }); // GLM 4.7
ai.model("standard", { task: "coding" }); // GPT-5.5
ai.model("fast", { task: "agentic", tools: true }); // GLM 4.7
ai.model("standard", { task: "vision", vision: true }); // Gemini 3.5 Flash
ai.model("standard", { task: "longContext" }); // Gemini 3.5 Flash
```

Available tasks: `general`, `coding`, `agentic`, `chat`, `bulk`, `vision`,
`reasoning`, `longContext`, and `creative`.

When you pin a provider, task selection stays inside that provider wherever the
provider has coverage. For example, `provider: "openai", task: "coding"` routes
to OpenAI's Codex line, while `provider: "zai", task: "vision"` routes to GLM's
vision model instead of falling back to the global winner from another provider.
If a requested capability is incompatible with the resolved model, selection
throws before any provider call. For example, `provider: "deepseek", vision:
true` fails locally because DeepSeek's selected models are not vision-capable.

### Retrieval Models

| Slot              | Voyage Default          | Gemini Default       | Use When                |
| ----------------- | ----------------------- | -------------------- | ----------------------- |
| `embed`           | `voyage-4`              | `gemini-embedding-2` | Text embeddings         |
| `multimodalEmbed` | `voyage-multimodal-3.5` | `gemini-embedding-2` | Text + image embeddings |
| `rerank`          | `rerank-2.5`            | n/a                  | Search result reranking |

OpenRouter embedding defaults are also available through the same slots:
`openai/text-embedding-3-small` for text and
`google/gemini-embedding-2-preview` for multimodal inputs. The OpenRouter
catalogue is intentionally curated to OpenAI and Gemini embedding models.

## Overriding Models

Override any tier variant or retrieval model per project:

```typescript
import {
  ANTHROPIC_MODELS,
  createAI,
  GOOGLE_EMBED_MODELS,
  OPENROUTER_EMBED_MODELS,
  VOYAGE_MODELS,
} from "@howells/ai";

const ai = createAI({
  app: { name: "Sorrel", url: "https://sorrel.app" },
  models: {
    standard: {
      text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
      tools: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
    },
    tasks: {
      coding: {
        standard: {
          text: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,
        },
      },
    },
    embed: { voyage: VOYAGE_MODELS.VOYAGE_3_LITE },
    rerank: VOYAGE_MODELS.RERANK_2_5_LITE,
  },
});
```

Embedding slots are provider-aware. Configure `embed` and `multimodalEmbed`
once, then select the provider at the call site:

```typescript
const ai = createAI({
  models: {
    embed: {
      voyage: VOYAGE_MODELS.VOYAGE_3,
      gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
      openrouter: OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_SMALL,
    },
    multimodalEmbed: {
      voyage: VOYAGE_MODELS.MULTIMODAL_3_5,
      gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
      openrouter: OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_2,
    },
  },
});
```

## Embeddings

```typescript
import { embed, embedMany } from "ai";

// Provider-neutral text embeddings
const { embedding } = await embed({
  model: ai.embeddingModel({ input: "text", provider: "voyage" }),
  value: "some text",
});

// Provider-neutral image or image+text embeddings.
// Switch to { provider: "gemini" } without changing the call site shape.
const imageModel = ai.embeddingModel({ input: "image", provider: "voyage" });

// Google Gemini text embeddings (for benchmarking)
const { embedding: g } = await embed({
  model: ai.embeddingModel({ input: "text", provider: "gemini" }),
  value: "some text",
});

// OpenRouter text embeddings using the curated OpenAI default
const { embedding: openRouterEmbedding } = await embed({
  model: ai.embeddingModel({ input: "text", provider: "openrouter" }),
  value: "some text",
});

// Google Gemini image+text embeddings
const { embedding: imageEmbedding } = await embed({
  model: ai.embeddingModel({ input: "image", provider: "gemini" }),
  value: "green woven upholstery",
  providerOptions: {
    google: {
      content: [[{ inlineData: { mimeType: "image/png", data: "<base64>" } }]],
    },
  },
});

// Batch
const { embeddings } = await embedMany({
  model: ai.embeddingModel({ provider: "voyage" }),
  values: ["text one", "text two", "text three"],
});
```

## Reranking

```typescript
const reranker = ai.rerankModel();
```

## Non-AI-SDK Runtimes

Use the root package for credential-free model metadata that is safe to log or
send across a server/client boundary:

```typescript
const model = ai.modelDescriptor("deepseek/deepseek-v4-pro", {
  provider: "openrouter",
  agent: "materials-agent",
});
// { provider, canonicalId, providerModelId, service, capabilities,
//   requiredEnvironmentVariables }
```

The `capabilities` field describes which config fields the selected provider
can consume. Descriptors never contain keys, authorization headers, or user
attribution values.

| Provider     | API Key | Base URL | Headers | App Attribution | Agent Attribution |
| ------------ | ------- | -------- | ------- | --------------- | ----------------- |
| `gateway`    | yes     | no       | no      | no              | no                |
| `openrouter` | yes     | yes      | yes     | yes             | yes               |
| `anthropic`  | yes     | no       | no      | no              | no                |
| `openai`     | yes     | no       | no      | no              | no                |
| `google`     | yes     | no       | no      | no              | no                |
| `deepseek`   | yes     | yes      | no      | no              | no                |
| `xai`        | yes     | yes      | no      | no              | no                |
| `qwen`       | yes     | yes      | no      | no              | no                |
| `zai`        | yes     | yes      | no      | no              | no                |
| `moonshotai` | yes     | yes      | no      | no              | no                |
| `groq`       | yes     | yes      | no      | no              | no                |

For a direct HTTP client, import the explicit server-only surface. Never return
this object from an API route or pass it into a Client Component:

```typescript
import { createAIServer } from "@howells/ai/server";

const serverAI = createAIServer({
  app: { name: "My App", url: "https://example.com" },
});
const connection = serverAI.modelConnection("deepseek/deepseek-v4-pro", {
  provider: "openrouter",
  agent: "nl-search",
});
await fetch(`${connection.baseURL}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${connection.credentials.apiKey}`,
    ...connection.credentials.headers,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: connection.providerModelId,
    messages,
    user: connection.credentials.user,
  }),
});
```

### Migrating from 0.2 to 0.3

`modelConfig()` was removed. Use `modelDescriptor()` anywhere you need
serializable, credential-free metadata. Code that intentionally needs an
operational HTTP connection must move to the server-only entry point:

```typescript
// Before (0.2)
const config = ai.modelConfig("openai/gpt-5.5", { provider: "openai" });

// After (0.3), safe in shared code
const descriptor = ai.modelDescriptor("openai/gpt-5.5", { provider: "openai" });

// After (0.3), server-only and may contain credentials
import { createAIServer } from "@howells/ai/server";
const connection = createAIServer().modelConnection("openai/gpt-5.5", {
  provider: "openai",
});
```

Ollama is no longer implicitly available at localhost. Configure
`ollamaBaseURL` or `OLLAMA_BASE_URL` to opt in; an explicit unconfigured Ollama
request fails with the same actionable configuration error as other routes.

## Escape Hatch

For models that don't fit any tier:

```typescript
const { text } = await generateText({
  model: ai.modelById("openai/gpt-5-nano"),
  prompt: "...",
});
```

Route through OpenRouter or direct providers when needed:

```typescript
ai.model("standard", { provider: "openrouter" });
ai.model("standard", { provider: "openrouter", openRouterVariant: "exacto" });
ai.modelById("openai/gpt-5.5", { provider: "openrouter", openRouterVariant: "nitro" });
ai.model("standard", { free: true }); // always provider: "openrouter"
ai.modelById("claude-sonnet-4-6", { provider: "anthropic" });
ai.modelById("x-ai/grok-4.3", { provider: "xai" });
ai.modelById("moonshotai/kimi-k2.7-code", { provider: "moonshotai" });
```

Constants use normalized package IDs. `createAI()` translates known provider
mismatches at runtime, such as Anthropic's direct `4-6` IDs, direct Google
Gemini IDs without the `google/` prefix, legacy Gemini 3 Flash aliases, and
Alibaba-hosted Qwen IDs.
DeepSeek, xAI, Qwen, Z.ai, and Moonshot/Kimi are direct OpenAI-compatible
routes when their keys are configured. Other catalog services such as MiniMax,
StepFun, Xiaomi, Inception, and Nex AGI route through Gateway or OpenRouter.
Free selections use OpenRouter's `openrouter/free` router so the backing model
can rotate with OpenRouter's current free inventory and requested capabilities.

## Agent Attribution

Tag OpenRouter requests for per-agent cost tracking:

```typescript
const ai = createAI({
  app: { name: "My App", url: "https://example.com" },
  openRouterPolicy: {
    requireAppAttribution: true,
    requireSessionId: true,
  },
});

ai.model("fast", {
  agent: "search",
  provider: "openrouter",
  sessionId: "search-run-123",
});
// Sends search/{environment}/search-run-123 as OpenRouter user attribution.
```

Strict attribution is opt-in so applications can migrate without an outage.
Enable both checks in production apps: they reject OpenRouter language-model
calls without a stable session ID and reject any OpenRouter model or embedding
selection without an app name and URL. OpenRouter is reserved for in-app
inference; `task: "coding"` is always rejected on that route.

## Model Constants

```typescript
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  GLM_MODELS,
  GROQ_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  INCEPTION_MODELS,
  KIMI_MODELS,
  MINIMAX_MODELS,
  NEX_AGI_MODELS,
  OPENAI_MODELS,
  OPENROUTER_MODELS,
  PROVIDER_TASK_DEFAULT_MODELS,
  QWEN_MODELS,
  STEPFUN_MODELS,
  VOYAGE_MODELS,
  XAI_MODELS,
  XIAOMI_MODELS,
} from "@howells/ai";

// Anthropic
ANTHROPIC_MODELS.CLAUDE_OPUS_4_8; // "anthropic/claude-opus-4.8"
ANTHROPIC_MODELS.CLAUDE_FABLE_5; // "anthropic/claude-fable-5"
ANTHROPIC_MODELS.CLAUDE_OPUS_4_7; // "anthropic/claude-opus-4.7"
ANTHROPIC_MODELS.CLAUDE_OPUS_4_6; // "anthropic/claude-opus-4.6"
ANTHROPIC_MODELS.CLAUDE_SONNET_4_6; // "anthropic/claude-sonnet-4.6"

// DeepSeek
DEEPSEEK_MODELS.DEEPSEEK_V4_PRO; // "deepseek/deepseek-v4-pro"
DEEPSEEK_MODELS.DEEPSEEK_V4_FLASH; // "deepseek/deepseek-v4-flash"

// GLM / Z.ai
GLM_MODELS.GLM_5_2; // "z-ai/glm-5.2"
GLM_MODELS.GLM_5_3_FLASH; // "z-ai/glm-5.3-flash"
GLM_MODELS.GLM_5V_TURBO; // "z-ai/glm-5v-turbo"
GLM_MODELS.GLM_4_7; // "z-ai/glm-4.7"
GLM_MODELS.GLM_4_7_FLASH; // "z-ai/glm-4.7-flash"
GLM_MODELS.GLM_4_6V; // "z-ai/glm-4.6v"

// Kimi / Moonshot
KIMI_MODELS.KIMI_K2_7_CODE; // "moonshotai/kimi-k2.7-code"
KIMI_MODELS.KIMI_K2_5; // "moonshotai/kimi-k2.5"
KIMI_MODELS.KIMI_K2_THINKING; // "moonshotai/kimi-k2-thinking"

// Groq
GROQ_MODELS.GPT_OSS_120B; // "openai/gpt-oss-120b"
GROQ_MODELS.GPT_OSS_20B; // "openai/gpt-oss-20b"

// Google language models
GOOGLE_MODELS.GEMINI_3_5_FLASH; // "google/gemini-3.5-flash"
GOOGLE_MODELS.GEMINI_3_1_PRO_PREVIEW; // "google/gemini-3.1-pro-preview"
GOOGLE_MODELS.GEMINI_3_1_FLASH_LITE; // "google/gemini-3.1-flash-lite"

// OpenAI
OPENAI_MODELS.GPT_5_4_NANO; // "openai/gpt-5.4-nano"
OPENAI_MODELS.GPT_5_4_MINI; // "openai/gpt-5.4-mini"
OPENAI_MODELS.GPT_5_5; // "openai/gpt-5.5"
OPENAI_MODELS.GPT_5_6_LUNA; // "openai/gpt-5.6-luna-20260709"

// OpenRouter-managed
OPENROUTER_MODELS.FREE; // "openrouter/free"

// Qwen
QWEN_MODELS.QWEN_3_VL_235B_A22B; // "qwen/qwen3-vl-235b-a22b-instruct"
QWEN_MODELS.QWEN_3_NEXT_80B_A3B_INSTRUCT_FREE;
QWEN_MODELS.QWEN_3_7_PLUS; // "qwen/qwen3.7-plus"

// xAI
XAI_MODELS.GROK_4_3; // "x-ai/grok-4.3"

// Gateway/OpenRouter-only services
MINIMAX_MODELS.MINIMAX_M3; // "minimax/minimax-m3"
MINIMAX_MODELS.MINIMAX_M2_5; // "minimax/minimax-m2.5"
STEPFUN_MODELS.STEP_3_7_FLASH; // "stepfun/step-3.7-flash"
XIAOMI_MODELS.MIMO_V2_5; // "xiaomi/mimo-v2.5"
INCEPTION_MODELS.MERCURY_2; // "inception/mercury-2"
NEX_AGI_MODELS.NEX_N2_PRO; // "nex-agi/nex-n2-pro"

// Provider-pinned task matrix
PROVIDER_TASK_DEFAULT_MODELS.openai?.coding?.standard?.text;
// "openai/gpt-5.5"

ai.modelCapabilities({ modelId: "deepseek/deepseek-v4-pro" });
// { structured: true, tools: true, vision: false }

// Voyage
VOYAGE_MODELS.VOYAGE_4; // "voyage-4"
VOYAGE_MODELS.VOYAGE_4_LARGE; // "voyage-4-large"
VOYAGE_MODELS.VOYAGE_4_LITE; // "voyage-4-lite"
VOYAGE_MODELS.VOYAGE_4_NANO; // "voyage-4-nano"
VOYAGE_MODELS.MULTIMODAL_3_5; // "voyage-multimodal-3.5"
VOYAGE_MODELS.RERANK_2_5; // "rerank-2.5"
VOYAGE_MODELS.RERANK_2_5_LITE; // "rerank-2.5-lite"

// Google
GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2; // "gemini-embedding-2"
GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1; // "gemini-embedding-001"

// OpenRouter embeddings
OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_SMALL; // "openai/text-embedding-3-small"
OPENROUTER_EMBED_MODELS.OPENAI_TEXT_EMBEDDING_3_LARGE; // "openai/text-embedding-3-large"
OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_2; // "google/gemini-embedding-2-preview"
OPENROUTER_EMBED_MODELS.GEMINI_EMBEDDING_1; // "google/gemini-embedding-001"
```

## Environment Variables

| Variable                | Required                                                | Used By                         |
| ----------------------- | ------------------------------------------------------- | ------------------------------- |
| `AI_GATEWAY_API_KEY`    | Yes locally for default language models                 | Vercel AI Gateway               |
| `OPENROUTER_API_KEY`    | Only if using `provider: "openrouter"`                  | OpenRouter provider             |
| `ANTHROPIC_API_KEY`     | Only if using `provider: "anthropic"`                   | Anthropic provider              |
| `OPENAI_API_KEY`        | Only if using `provider: "openai"`                      | OpenAI provider                 |
| `VOYAGE_API_KEY`        | Yes (for embed/rerank)                                  | Voyage provider                 |
| `GOOGLE_GEMINI_API_KEY` | Only if using Gemini embeddings or `provider: "google"` | Google provider                 |
| `DEEPSEEK_API_KEY`      | Only if using `provider: "deepseek"`                    | DeepSeek direct provider        |
| `XAI_API_KEY`           | Only if using `provider: "xai"`                         | xAI direct provider             |
| `QWEN_API_KEY`          | Only if using `provider: "qwen"`                        | Qwen direct provider            |
| `ZAI_API_KEY`           | Only if using `provider: "zai"`                         | Z.ai / GLM direct provider      |
| `MOONSHOT_API_KEY`      | Only if using `provider: "moonshotai"`                  | Moonshot / Kimi direct provider |
| `GROQ_API_KEY`          | Only if using `provider: "groq"`                        | Groq direct provider            |

Keys can also be passed directly to `createAI()`:

```typescript
const ai = createAI({
  gatewayKey: "vck_...",
  openRouterKey: "sk-or-...",
  voyageKey: "pa-...",
  googleKey: "...",
  xaiKey: "...",
  groqKey: "...",
  moonshotKey: "...",
  serviceKeys: {
    zai: "...",
    qwen: "...",
  },
});
```

Configured services are reported through `ai.availableServices`. Secret-bearing
connection data is available only through `createAIServer()` from
`@howells/ai/server`. The same keys enable direct OpenAI-compatible AI SDK routes
for DeepSeek, xAI, Qwen, Z.ai, and Moonshot/Kimi.

## Architecture

- Each `createAI()` returns an independent client (no shared module state)
- Providers are lazy-initialized on first use
- Safe for tests and multi-config scenarios
- Language models route through Vercel AI Gateway by default
- OpenRouter and direct provider routes are available per call
- Embeddings/reranking through Voyage AI or Google

## TypeScript compatibility

Development checks use native TypeScript 7. The published declarations support
TypeScript 5, 6 and 7; the package does not expose the compiler API. Declaration
builds remain on the existing tsdown pipeline and are checked through the packed
package export surface.
