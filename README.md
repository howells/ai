# @howells/ai

An opinionated answer to "which model should do this job?". One OpenRouter model ID per job, and the request settings it was measured with. Change a pick here and every repo that imports it moves together.

The root entry is two frozen objects and imports nothing.

## Jobs and picks

| Job       | Model ID                         | Settings             | Evidence                                                                                                                                   |
| --------- | -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent`   | `openai/gpt-6-luna`              | provider default     | Samplize consultant, 45 turns: 2 hard fails and judge score 0.94 against gpt-5.6-luna's 4 and 0.91, at half the cost, 24 Sep 2026          |
| `extract` | `deepseek/deepseek-v4.1-flash`   | reasoning off        | MaterialGraph composition parsing: 135/166 facts at 3.8 s against 125/166 at 32 s, 18 Sep 2026. Also for reading long documents            |
| `judge`   | `openai/gpt-6-luna`              | provider default     | quarry triage scoring equal to gpt-5.6-luna at half the cost; taxonomy cells slightly less stable (6 of 40 moved against 4.5), 24 Sep 2026 |
| `vision`  | `openai/gpt-6-luna`              | reasoning effort low | First box in 3.2 s against 5.3 s, placement matching gpt-5.6-luna's own run-to-run agreement, 24 Sep 2026. Guard against zero-size boxes   |
| `triage`  | `google/gemini-3.5-flash-lite`   | none                 | 12 of 12 image kinds at 883 ms, 17 Sep 2026                                                                                                |
| `write`   | `anthropic/claude-opus-5.5`      | none                 | Benchmark-led: Artificial Analysis Intelligence 57.6, Arena, 24 Sep 2026                                                                   |
| `reason`  | `anthropic/claude-opus-5.5`      | none                 | Benchmark-led: Artificial Analysis Intelligence 57.6, Arena, 24 Sep 2026                                                                   |
| `embed`   | `voyageai/voyage-multimodal-3.5` | none                 | Won MaterialGraph's cross-modal eval; one space for text and images                                                                        |

Don't force low reasoning on `agent`: at low it barely reasons and did worse (6 hard fails against 2). Mastra fills a missing reasoning option from the agent's own `defaultOptions`, so an agent that sets low there must remove it.

`settings` is written in OpenRouter's own request vocabulary (`reasoning: { enabled: false }`, `reasoning: { effort: "low" }`), and every job has an entry, empty where nothing was measured.

## Install

```sh
pnpm add @howells/ai
```

## Mastra

```ts
import { Agent } from "@mastra/core/agent";
import { models, settings } from "@howells/ai";

const agent = new Agent({
  id: "consultant",
  instructions: "...",
  model: `openrouter/${models.agent}`,
});

await agent.generate(prompt, {
  providerOptions: { openrouter: settings.agent },
});
```

## AI SDK

```ts
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { models, settings } from "@howells/ai";

const openrouter = createOpenRouter();

await generateText({
  model: openrouter(models.extract),
  prompt,
  providerOptions: { openrouter: settings.extract },
});
```

A raw request takes the settings as they are: `{ model: models.vision, ...settings.vision, messages }`.

## Command line

```sh
npx howells-ai models
npx howells-ai bench --job triage --routes google-ai-studio,google-vertex --runs 5
```

`models` prints the table above. `bench` measures streaming latency through OpenRouter, pinning one upstream provider per route, and reads `OPENROUTER_API_KEY` from the environment, `.env` or `.env.local`. Both take `--json`. The same measurement is importable from `@howells/ai/bench`.
