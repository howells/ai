# @howells/ai

The best model for each job across Daniel's repos: `models` (one OpenRouter Model ID per Job) and `settings` (the request settings measured with each Pick). Terms are in `CONTEXT.md`.

## Surfaces

- `.` is `src/index.ts`: plain frozen data and types. It imports nothing, and a test fails if the packed root entry does.
- `./bench` and the `howells-ai` bin (`models`, `bench`) call OpenRouter with plain `fetch`. The CLI's key is read only in `src/env.ts`, through envy. Never print or snapshot a key.

## Changing a pick

- A pick changes only on measured evidence or a stated benchmark, and its doc comment carries that evidence and its date. The README table repeats it in one line.
- `settings` stays in OpenRouter's request vocabulary and plain JSON, so it spreads into `providerOptions.openrouter` or a raw request body. A job with nothing measured gets `{}`.
- A pick is a version bump: consumers take it on upgrade.

## Commands

`pnpm prepush` is the gate: typecheck, the lint ratchet (baseline zero) and the tests. `pnpm test` includes a live check that every pick is listed on OpenRouter with no expiration date, and a pack of the tarball.
