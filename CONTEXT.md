# @howells/ai

An opinionated answer to "which model should do this job?" across Daniel's repos. The short, curated version of what Routerbase compares in full.

## Language

**Job**:
A kind of work a repo asks a model to do, named by what the output is for rather than by model size or provider.
_Avoid_: task, tier, size, use case

**Pick**:
The single model chosen for a job, hand-curated and changed in one place for every repo.
_Avoid_: default, recommendation, route

**Model ID**:
An OpenRouter model identifier without a routing prefix, such as `anthropic/claude-sonnet-4.6`.
_Avoid_: model string, slug, model name

**Routerbase**:
Daniel's model comparison site; the research behind a pick, never a runtime dependency.
