# @howells/routerbase-ai

Unified AI client for all projects. One package, Vercel AI Gateway by default, direct provider escape hatches, and 11 configurable model slots.

## Quick Start

```typescript
import { createAI } from "@howells/routerbase-ai";
import { generateText, generateObject, streamText, embed } from "ai";

const ai = createAI({
  app: { name: "MyApp", url: "https://myapp.com" },
});

// Pick a model by slot
const { text } = await generateText({
  model: ai.model("fast"),
  prompt: "Classify this ingredient",
});

// With agent attribution for cost tracking
const { text: analysis } = await generateText({
  model: ai.model("powerful", { agent: "taste-analysis" }),
  prompt: "Analyze this design",
});

// Structured output
const { object } = await generateObject({
  model: ai.model("standard", { agent: "search" }),
  schema: myZodSchema,
  prompt: "Extract entities from this text",
});
```

## Model Slots

### Language Models (via Vercel AI Gateway by default)

| Slot | Default | Cost | Use When |
|------|---------|------|----------|
| `nano` | `google/gemini-2.5-flash-lite` | $0.075/M | Bulk classification, extraction, simple JSON |
| `fast` | `deepseek/deepseek-v3.2` | $0.14/M | Agent tool calls, quick enrichment |
| `standard` | `google/gemini-2.5-flash` | $0.30/M | Everyday tasks, chat, moderate reasoning |
| `powerful` | `anthropic/claude-sonnet-4-6` | $3/M | Complex analysis, synthesis, creative |
| `reasoning` | `anthropic/claude-opus-4-6` | $15/M | Frontier quality, deep multi-step reasoning |
| `tools` | `x-ai/grok-4.1-fast` | $0.20/M | Cheap frontier tool calling |
| `vision` | `google/gemini-3-flash` | varies | Fast multimodal image understanding |

### Retrieval Models

| Slot | Default | Provider | Use When |
|------|---------|----------|----------|
| `embed` | `voyage-3` | Voyage AI | Text embeddings (1024d) |
| `multimodalEmbed` | `voyage-multimodal-3.5` | Voyage AI | Text + image embeddings (1024d) |
| `googleEmbed` | `gemini-embedding-2-preview` | Google | A/B testing against Voyage |
| `rerank` | `rerank-2.5` | Voyage AI | Search result reranking |

## Overriding Slots

Override any slot per-project:

```typescript
import { ANTHROPIC_MODELS, createAI, VOYAGE_MODELS } from "@howells/routerbase-ai";

const ai = createAI({
  app: { name: "Sorrel", url: "https://sorrel.app" },
  models: {
    standard: ANTHROPIC_MODELS.CLAUDE_SONNET_4_6,  // use Sonnet for general tasks
    embed: VOYAGE_MODELS.VOYAGE_3_LITE,            // 512d, cheaper for this project
    rerank: VOYAGE_MODELS.RERANK_2_5_LITE,         // faster reranking
  },
});
```

## Embeddings

```typescript
import { embed, embedMany } from "ai";

// Voyage text embeddings
const { embedding } = await embed({
  model: ai.embedModel(),
  value: "some text",
});

// Voyage multimodal (text + images in same space)
const mm = ai.multimodalEmbedModel();

// Google Gemini embeddings (for benchmarking)
const { embedding: g } = await embed({
  model: ai.googleEmbedModel(),
  value: "some text",
});

// Batch
const { embeddings } = await embedMany({
  model: ai.embedModel(),
  values: ["text one", "text two", "text three"],
});
```

## Reranking

```typescript
const reranker = ai.rerankModel();
```

## Escape Hatch

For models that don't fit any slot:

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

## Agent Attribution

Tag OpenRouter requests for per-agent cost tracking:

```typescript
ai.model("fast", { agent: "search" })
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
} from "@howells/routerbase-ai";

// Anthropic
ANTHROPIC_MODELS.CLAUDE_OPUS_4_6        // "anthropic/claude-opus-4-6"
ANTHROPIC_MODELS.CLAUDE_SONNET_4_6      // "anthropic/claude-sonnet-4-6"

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
| `GOOGLE_GEMINI_API_KEY` | Only if using `googleEmbedModel()` or `provider: "google"` | Google provider |

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
