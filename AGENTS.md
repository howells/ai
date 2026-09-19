# @howells/ai

The shared AI client for every Howells repo: Vercel AI Gateway by default, OpenRouter and direct-provider escape hatches, model tiers, normalised generation options, vision helpers, embeddings and reranking. It wraps the Vercel AI SDK rather than replacing it.

## Subpaths

`.` is the client: `createAI`, `ai.model(tier, opts)`, `ai.modelById(id)`, `ai.generationOptions(...)`, `visionPrompt`, `imagePart`, `visionMessage`, `ai.availableServices`. `./models` is the matrix and tier tables; `./catalog`, `./bench`, `./eval`, `./decisions` and `./taxonomy` are the measurement surfaces; `./react` is the React surface; `./server` is the only place secret-bearing connection data is available.

The `ai` and `howells-ai` binaries share one entry: `models`, `providers`, `doctor [--live]`, `test --provider <p>`, `bench`, `catalog`, `compare`, `audit`. All take `--json`, and CLI output stays scriptable.

## Using it

- Reach for the package surface rather than raw provider setup. Each `createAI()` returns an independent client with no shared module state and lazy provider init, so it is safe in tests and multi-config code.
- `generationOptions` is the normalisation seam for reasoning, verbosity, structured output, tool policy, sampling, prompt cache, routing, fallbacks, attribution and service tier. Pass the same `provider` you passed to `ai.model`, and for Gateway calls pass `modelId` so provider-specific options and spend attribution are both inferred.
- Product-specific prompts and orchestration belong in the consuming repo; this package is the shared baseline. Don't add raw provider wrappers that bypass the abstraction without a deliberate public API decision.

## Editing it

- Never update the model matrix from memory. Verify against code, installed provider types or current provider docs, and prefer a provider registry to a remembered model name.
- Provider keys are read only through the envy schema in `src/env.ts`, or passed to `createAI()` directly. No `process.env` reads anywhere else. Never print or snapshot a key; the CLI diagnostics hide secret values and must stay that way.
- Deterministic tests stay offline. Live tests sit behind `LIVE_AI_TESTS=1`, spend real quota, and load keys from `.env`, `.env.local` or `apps/benchmark/.env.local`.

## Commands

`pnpm check` is the gate: types, build, Bun tests, lint and the `apps/benchmark` build. `pnpm test:live` is the opt-in live run.
