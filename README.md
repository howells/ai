# @howells/ai

Unified AI client for all projects. One package, Vercel AI Gateway by default,
direct provider escape hatches, provider-aware model tiers, and normalized
generation settings.

## Quick Start

```typescript
import { createAI } from "@howells/ai";
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
  prompt: "Analyze this design",
});

// Structured output
const { output } = await generateText({
  model: ai.model("standard", { agent: "search" }),
  output: Output.object({ schema: myZodSchema }),
  prompt: "Extract entities from this text",
});
```

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
const modelId = "openai/gpt-5.4";

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

| Normalized Option | AI SDK / Provider Mapping |
|-------------------|---------------------------|
| `reasoning` | OpenAI `reasoningEffort`, Anthropic `thinking`, Google `thinkingConfig`, OpenRouter `reasoning` |
| `verbosity` | OpenAI `textVerbosity` |
| `structured` | OpenAI strict JSON schema, Anthropic structured output mode, Google structured outputs |
| `tools` | AI SDK `toolChoice` |
| `maxToolSteps` | AI SDK `stopWhen: stepCountIs(n)` |
| `parallelTools` | OpenAI/OpenRouter parallel tool calls, Anthropic inverse disable flag |
| `outputLength` | AI SDK `maxOutputTokens` preset |
| `creativity` | AI SDK `temperature` preset |
| `cache` | Anthropic `cacheControl`, OpenRouter `cache_control` |
| `serviceTier` | OpenAI/Google service tier where supported |

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

Use `--json` on `models`, `providers`, `doctor`, `test`, and `bench` for
scriptable output. The CLI loads local keys from `.env`, `.env.local`, and
`apps/benchmark/.env.local`, and never prints secret values.

## Model Matrix

### Language Models (via Vercel AI Gateway by default)

Language models are selected by tier, then capability flags. Structured
input/output is a baseline requirement for every default language model.

| Tier | Text Default | Tools Default | Vision / Vision Tools Default | Use When |
|------|--------------|---------------|-------------------------------|----------|
| `nano` | `google/gemini-2.5-flash-lite` | `google/gemini-2.5-flash-lite` | `google/gemini-2.5-flash-lite` | Bulk classification, extraction, simple structured output |
| `fast` | `deepseek/deepseek-v3.2` | `x-ai/grok-4.1-fast` | `google/gemini-3-flash` | Low-latency enrichment, cheap tool calls, fast image reads |
| `standard` | `google/gemini-2.5-flash` | `google/gemini-2.5-flash` | `google/gemini-3-flash` | Everyday tasks, chat, moderate reasoning |
| `powerful` | `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-4.6` | `anthropic/claude-sonnet-4.6` | Complex analysis, synthesis, coding |
| `reasoning` | `anthropic/claude-opus-4.6` | `anthropic/claude-opus-4.6` | `anthropic/claude-opus-4.6` | Frontier quality, deep multi-step reasoning |

```typescript
ai.model("fast"); // fast text
ai.model("fast", { tools: true }); // fast tool calling
ai.model("fast", { vision: true }); // fast image understanding
ai.model("fast", { tools: true, vision: true }); // fast image + tools
```

### Workload Tasks

Pass `task` when the best model depends on the job more than the generic tier.
`general` preserves the base matrix; other tasks layer RouterBase-informed picks
over the same tier/capability shape.

```typescript
ai.model("fast", { task: "coding", tools: true }); // Grok Code Fast
ai.model("standard", { task: "coding" }); // Kimi K2.6
ai.model("fast", { task: "agentic", tools: true }); // GLM 5 Turbo
ai.model("standard", { task: "vision", vision: true }); // Qwen3 VL
ai.model("standard", { task: "longContext" }); // Grok 4.20
```

Available tasks: `general`, `coding`, `agentic`, `chat`, `bulk`, `vision`,
`reasoning`, `longContext`, and `creative`.

### Retrieval Models

| Slot | Voyage Default | Gemini Default | Use When |
|------|----------------|----------------|----------|
| `embed` | `voyage-3` | `gemini-embedding-2-preview` | Text embeddings |
| `multimodalEmbed` | `voyage-multimodal-3.5` | `gemini-embedding-2-preview` | Text + image embeddings |
| `rerank` | `rerank-2.5` | n/a | Search result reranking |

## Overriding Models

Override any tier variant or retrieval model per project:

```typescript
import {
  ANTHROPIC_MODELS,
  createAI,
  GOOGLE_EMBED_MODELS,
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
    },
    multimodalEmbed: {
      voyage: VOYAGE_MODELS.MULTIMODAL_3_5,
      gemini: GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2,
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

// Google Gemini image+text embeddings
const { embedding: imageEmbedding } = await embed({
  model: ai.embeddingModel({ input: "image", provider: "gemini" }),
  value: "green woven upholstery",
  providerOptions: {
    google: {
      content: [
        [{ inlineData: { mimeType: "image/png", data: "<base64>" } }],
      ],
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

Some frameworks accept config objects instead of AI SDK models:

```typescript
const model = ai.modelConfig("deepseek/deepseek-v3.2", {
  provider: "openrouter",
  agent: "materials-agent",
});
// { provider, id, service, capabilities, apiKey, serviceApiKey, baseURL, headers, user }
```

The `capabilities` field describes which config fields the selected provider
can consume, so callers can pass through the useful fields without branching on
one provider-specific helper.

| Provider | API Key | Base URL | Headers | App Attribution | Agent Attribution |
|----------|---------|----------|---------|-----------------|-------------------|
| `gateway` | yes | no | no | no | no |
| `openrouter` | yes | yes | yes | yes | yes |
| `anthropic` | yes | no | no | no | no |
| `openai` | yes | no | no | no | no |
| `google` | yes | no | no | no | no |
| `deepseek` | yes | yes | no | no | no |
| `xai` | yes | yes | no | no | no |
| `qwen` | yes | yes | no | no | no |
| `zai` | yes | yes | no | no | no |
| `moonshotai` | yes | yes | no | no | no |

For OpenRouter direct HTTP clients, request an OpenRouter model config and pass
`user` in the request body:

```typescript
const config = ai.modelConfig("deepseek/deepseek-v3.2", {
  provider: "openrouter",
  agent: "nl-search",
});
await fetch(`${config.baseURL}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    ...config.headers,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-v3.2",
    messages,
    user: config.user,
  }),
});
```

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
ai.modelById("claude-sonnet-4-6", { provider: "anthropic" });
ai.modelById("x-ai/grok-4.20", { provider: "xai" });
ai.modelById("moonshotai/kimi-k2.6", { provider: "moonshotai" });
```

Constants use normalized package IDs. `createAI()` translates known provider
mismatches at runtime, such as Anthropic's direct `4-6` IDs, OpenRouter and
Google direct `google/gemini-3-flash-preview` IDs for Gemini 3 Flash, and
Gateway's `xai/grok-4.1-fast-non-reasoning`. DeepSeek, xAI, Qwen, Z.ai, and
Moonshot/Kimi are direct OpenAI-compatible routes when their keys are configured.

## Agent Attribution

Tag OpenRouter requests for per-agent cost tracking:

```typescript
ai.model("fast", { agent: "search", provider: "openrouter" });
// Sends user tag when provider is "openrouter"
```

## Model Constants

```typescript
import {
  ANTHROPIC_MODELS,
  DEEPSEEK_MODELS,
  GLM_MODELS,
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
  KIMI_MODELS,
  OPENAI_MODELS,
  QWEN_MODELS,
  VOYAGE_MODELS,
  XAI_MODELS,
} from "@howells/ai";

// Anthropic
ANTHROPIC_MODELS.CLAUDE_OPUS_4_6        // "anthropic/claude-opus-4.6"
ANTHROPIC_MODELS.CLAUDE_SONNET_4_6      // "anthropic/claude-sonnet-4.6"

// DeepSeek
DEEPSEEK_MODELS.DEEPSEEK_V3_2           // "deepseek/deepseek-v3.2"

// GLM / Z.ai
GLM_MODELS.GLM_5_1                      // "z-ai/glm-5.1"
GLM_MODELS.GLM_5_TURBO                  // "z-ai/glm-5-turbo"
GLM_MODELS.GLM_4_7_FLASH                // "z-ai/glm-4.7-flash"
GLM_MODELS.GLM_4_6V                     // "z-ai/glm-4.6v"

// Kimi / Moonshot
KIMI_MODELS.KIMI_K2_6                   // "moonshotai/kimi-k2.6"
KIMI_MODELS.KIMI_K2_THINKING            // "moonshotai/kimi-k2-thinking"

// Google language models
GOOGLE_MODELS.GEMINI_3_FLASH            // "google/gemini-3-flash"
GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE     // "google/gemini-2.5-flash-lite"
GOOGLE_MODELS.GEMINI_2_5_FLASH          // "google/gemini-2.5-flash"

// OpenAI
OPENAI_MODELS.GPT_5_NANO                // "openai/gpt-5-nano"

// Qwen
QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT    // "qwen/qwen2.5-vl-72b-instruct"
QWEN_MODELS.QWEN_3_VL_8B_INSTRUCT       // "qwen/qwen3-vl-8b-instruct"

// xAI
XAI_MODELS.GROK_4_1_FAST                // "x-ai/grok-4.1-fast"
XAI_MODELS.GROK_4_20                    // "x-ai/grok-4.20"
XAI_MODELS.GROK_CODE_FAST_1             // "x-ai/grok-code-fast-1"

// Voyage
VOYAGE_MODELS.VOYAGE_3            // "voyage-3"
VOYAGE_MODELS.VOYAGE_3_LITE       // "voyage-3-lite"
VOYAGE_MODELS.VOYAGE_3_5          // "voyage-3.5"
VOYAGE_MODELS.VOYAGE_3_5_LITE     // "voyage-3.5-lite"
VOYAGE_MODELS.MULTIMODAL_3        // "voyage-multimodal-3"
VOYAGE_MODELS.MULTIMODAL_3_5      // "voyage-multimodal-3.5"
VOYAGE_MODELS.RERANK_2_5          // "rerank-2.5"
VOYAGE_MODELS.RERANK_2_5_LITE     // "rerank-2.5-lite"

// Google
GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_2  // "gemini-embedding-2-preview"
GOOGLE_EMBED_MODELS.GEMINI_EMBEDDING_1  // "gemini-embedding-001"
```

## Environment Variables

| Variable | Required | Used By |
|----------|----------|---------|
| `AI_GATEWAY_API_KEY` | Yes locally for default language models | Vercel AI Gateway |
| `OPENROUTER_API_KEY` | Only if using `provider: "openrouter"` | OpenRouter provider |
| `ANTHROPIC_API_KEY` | Only if using `provider: "anthropic"` | Anthropic provider |
| `OPENAI_API_KEY` | Only if using `provider: "openai"` | OpenAI provider |
| `VOYAGE_API_KEY` | Yes (for embed/rerank) | Voyage provider |
| `GOOGLE_GEMINI_API_KEY` | Only if using Gemini embeddings or `provider: "google"` | Google provider |
| `DEEPSEEK_API_KEY` | Only if using `provider: "deepseek"` | DeepSeek direct provider |
| `XAI_API_KEY` | Only if using `provider: "xai"` | xAI direct provider |
| `QWEN_API_KEY` | Only if using `provider: "qwen"` | Qwen direct provider |
| `ZAI_API_KEY` | Only if using `provider: "zai"` | Z.ai / GLM direct provider |
| `MOONSHOT_API_KEY` | Only if using `provider: "moonshotai"` | Moonshot / Kimi direct provider |

Keys can also be passed directly to `createAI()`:

```typescript
const ai = createAI({
  gatewayKey: "vck_...",
  openRouterKey: "sk-or-...",
  voyageKey: "pa-...",
  googleKey: "...",
  xaiKey: "...",
  moonshotKey: "...",
  serviceKeys: {
    zai: "...",
    qwen: "...",
  },
});
```

Service keys are exposed through `ai.availableServices` and `ai.modelConfig()`
for runtimes that can use provider-specific credentials. The same keys also
enable direct OpenAI-compatible AI SDK routes for DeepSeek, xAI, Qwen, Z.ai, and
Moonshot/Kimi.

## Architecture

- Each `createAI()` returns an independent client (no shared module state)
- Providers are lazy-initialized on first use
- Safe for tests and multi-config scenarios
- Language models route through Vercel AI Gateway by default
- OpenRouter and direct provider routes are available per call
- Embeddings/reranking through Voyage AI or Google
