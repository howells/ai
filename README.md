# @howells/ai

Unified AI client for all projects. One package, Vercel AI Gateway by default,
direct provider escape hatches, and provider-aware model tiers.

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
// { provider, id, capabilities, apiKey, baseURL, headers, user }
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
```

Constants use normalized package IDs. `createAI()` translates known provider
mismatches at runtime, such as Anthropic's direct `4-6` IDs, OpenRouter and
Google direct `google/gemini-3-flash-preview` IDs for Gemini 3 Flash, and
Gateway's `xai/grok-4.1-fast-non-reasoning`.

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
  GOOGLE_EMBED_MODELS,
  GOOGLE_MODELS,
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

// Google language models
GOOGLE_MODELS.GEMINI_3_FLASH            // "google/gemini-3-flash"
GOOGLE_MODELS.GEMINI_2_5_FLASH_LITE     // "google/gemini-2.5-flash-lite"
GOOGLE_MODELS.GEMINI_2_5_FLASH          // "google/gemini-2.5-flash"

// OpenAI
OPENAI_MODELS.GPT_5_NANO                // "openai/gpt-5-nano"

// Qwen
QWEN_MODELS.QWEN_2_5_VL_72B_INSTRUCT    // "qwen/qwen2.5-vl-72b-instruct"

// xAI
XAI_MODELS.GROK_4_1_FAST                // "x-ai/grok-4.1-fast"

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

Keys can also be passed directly to `createAI()`:

```typescript
const ai = createAI({
  gatewayKey: "vck_...",
  openRouterKey: "sk-or-...",
  voyageKey: "pa-...",
  googleKey: "...",
});
```

## Architecture

- Each `createAI()` returns an independent client (no shared module state)
- Providers are lazy-initialized on first use
- Safe for tests and multi-config scenarios
- Language models route through Vercel AI Gateway by default
- OpenRouter and direct Anthropic/OpenAI/Google routes are available per call
- Embeddings/reranking through Voyage AI or Google
