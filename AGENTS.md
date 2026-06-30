# @howells/ai - Agent Instructions

## Communication Expectations
- Be explicit about provider, model tier, routing, and whether a test would call a live service.
- Call out cost, quota, and secret requirements before running anything live.
- Keep API explanations grounded in the current README and source exports.

## How To Work In This Codebase
- This is a published package that wraps the Vercel AI SDK, AI Gateway, direct providers, model tiers, vision helpers, and normalized generation options.
- Start with `README.md`, then inspect `src/` and `test/` for exact behavior.
- Prefer `createAI`, tiered `ai.model(...)`, `ai.modelById(...)`, `visionPrompt`, and `generationOptions(...)` over raw provider setup in examples.
- Keep provider-specific behavior behind the shared package API unless a direct escape hatch already exists.

## Editing Constraints
- Do not add raw provider wrappers that bypass the package abstraction without a deliberate public API decision.
- Do not print or snapshot API keys; CLI diagnostics must hide secret values.
- Keep deterministic tests offline. Live provider tests stay behind `LIVE_AI_TESTS=1` and explicit user intent.
- Do not update the model matrix from memory; verify against code, installed provider types, or current provider docs.

## Search Preferences
- Search `src/` before changing public docs so examples match exports.
- Search `test/` for provider option mappings and regression coverage.
- For ambiguous model support, prefer provider registries/docs over training-memory model names.

## Commands
- `pnpm build` - package build with tsdown.
- `pnpm check-types` - TypeScript check.
- `pnpm test` - deterministic Bun tests.
- `pnpm test:live` - opt-in live provider tests with real API keys.
- `pnpm lint` / `pnpm lint:fix` / `pnpm format` - lint and format through the shared lane.

## Repo-Specific Rules
- This package is the shared baseline for AI-capable repos. Product-specific prompts and orchestration belong in the consuming repo.
- Use `zod` or AI SDK structured output surfaces for model IO examples.
- Keep CLI output scriptable with `--json` where commands support it.
- Arc is useful for public API changes; Mastra is not part of this package unless a future feature explicitly needs orchestration.
