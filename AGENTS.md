# @howells/ai

The unified AI client for every Howells repo: Vercel AI Gateway by default, OpenRouter and direct provider escape hatches, provider-aware model tiers, normalized generation options, vision helpers, embeddings and reranking. It wraps the Vercel AI SDK rather than replacing it.

## What it exports

- `.` - `createAI`, tiered `ai.model(tier, opts)`, `ai.modelById(id)`, `ai.generationOptions(...)`, `visionPrompt`, `imagePart`, `visionMessage`, `ai.availableServices`, model constants.
- `./models` - the model matrix and tier tables.
- `./server` - `createAIServer()`; secret-bearing connection data is available here only.
- `./react` - React surface.
- Binaries `ai` and `howells-ai` - `ai models`, `ai providers`, `ai doctor [--live]`, `ai test --provider <p>`, `ai bench`. All support `--json`.

## Using it

- Reach for `createAI`, tiered `ai.model(...)`, `ai.modelById(...)`, `visionPrompt` and `generationOptions(...)` rather than raw provider setup.
- Each `createAI()` returns an independent client with no shared module state and lazy provider init, so it's safe in tests and multi-config code.
- `generationOptions` is the normalization seam: reasoning, verbosity, structured output, tool policy, output length, sampling, prompt cache, routing, fallback models, user attribution, service tier. Pass the same `provider` you passed to `ai.model`, and for Gateway calls pass `modelId` so provider-specific options and spend attribution are both inferred.
- Product-specific prompts and orchestration belong in the consuming repo. This package is the shared baseline only.
- Use `zod` or the AI SDK structured-output surfaces for model IO.

## Editing this package

- Start with `README.md`, then `src/` and `test/` for exact behaviour. Search `src/` before changing docs so examples match real exports, and `test/` for provider option mappings and regression coverage.
- Never update the model matrix from memory. Verify against code, installed provider types or current provider docs; prefer provider registries over remembered model names.
- Don't add raw provider wrappers that bypass the package abstraction without a deliberate public API decision. Keep provider-specific behaviour behind the shared API unless an escape hatch already exists.
- Provider keys are read only through the envy schema in `src/env.ts` (`AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `VOYAGE_API_KEY`, `GOOGLE_GEMINI_API_KEY`, and the direct-provider keys). Don't add `process.env` reads elsewhere; keys may also be passed to `createAI()` directly.
- Never print or snapshot an API key. CLI diagnostics hide secret values and must stay that way. Keep CLI output scriptable with `--json`.
- Deterministic tests stay offline. Live provider tests sit behind `LIVE_AI_TESTS=1` and explicit user intent; they spend real quota, so say so before running them. They load keys from `.env`, `.env.local` or `apps/benchmark/.env.local`.
- The benchmark app lives in `apps/benchmark` and is part of `pnpm check`.

## Commands

- `pnpm build` - tsdown.
- `pnpm check-types` - `tsc --noEmit`.
- `pnpm test` - deterministic Bun tests.
- `pnpm test:live` - opt-in live provider tests with real keys.
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` - the shared `@howells/lint` lane.
- `pnpm check` - types, tests, lint, build and the benchmark build.
