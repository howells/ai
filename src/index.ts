/**
 * The best model for each job, and the request settings measured with it.
 *
 * Every Model ID is a plain OpenRouter ID. Mastra takes it as
 * `openrouter/${models.agent}`; the AI SDK's OpenRouter provider takes it as is.
 *
 * @example
 * ```ts
 * import { models, settings } from "@howells/ai";
 *
 * const agent = new Agent({ model: `openrouter/${models.agent}`, ... });
 * await agent.generate(prompt, { providerOptions: { openrouter: settings.agent } });
 * ```
 */

/** The Pick for each Job. */
export const models = Object.freeze({
  /**
   * Tool-using agents that plan, call tools and answer.
   *
   * Samplize consultant, 45 turns at default reasoning: 2 hard fails and a
   * judge score of 0.94, against gpt-5.6-luna's 4 and 0.91, at half the cost,
   * 24 Sep 2026.
   *
   * Leave reasoning at the provider default. At low it barely reasons and did
   * worse (6 hard fails against 2). Mastra fills a missing reasoning option
   * from the agent's own `defaultOptions`, so an agent that sets low there must
   * remove it.
   */
  agent: "openai/gpt-6-luna",

  /**
   * Embeddings for search and similarity, text and images in one space.
   *
   * Won MaterialGraph's cross-modal retrieval eval.
   */
  embed: "voyageai/voyage-multimodal-3.5",

  /**
   * Pulling structured facts out of text, including reading long documents.
   *
   * MaterialGraph composition parsing: 135 of 166 facts at a 3.8 s median call,
   * against 125 of 166 at 32 s for deepseek-v4-flash with reasoning on,
   * 18 Sep 2026.
   */
  extract: "deepseek/deepseek-v4.1-flash",

  /**
   * Grading another model's output against a rubric.
   *
   * quarry triage scoring equal to gpt-5.6-luna at half the cost; taxonomy-cell
   * stability slightly lower (6 of 40 cells moved against 4.5), 24 Sep 2026.
   */
  judge: "openai/gpt-6-luna",

  /**
   * Hard, multi-step reasoning where quality outweighs speed and cost.
   *
   * Benchmark-led: Artificial Analysis Intelligence Index 57.6 and Arena,
   * 24 Sep 2026.
   */
  reason: "anthropic/claude-opus-5.5",

  /**
   * Cheap, fast sorting and classification, images included.
   *
   * 12 of 12 image kinds classified at 883 ms, 17 Sep 2026.
   */
  triage: "google/gemini-3.5-flash-lite",

  /**
   * Reading images: finding, placing and describing what is in them.
   *
   * 24 Sep 2026: first box in 3.2 s against 5.3 s at low reasoning, with
   * placement matching gpt-5.6-luna's own run-to-run agreement. Guard against
   * zero-size boxes in its output.
   */
  vision: "openai/gpt-6-luna",

  /**
   * Prose a person will read.
   *
   * Benchmark-led: Artificial Analysis Intelligence Index 57.6 and Arena,
   * 24 Sep 2026.
   */
  write: "anthropic/claude-opus-5.5",
} as const);

/** A kind of work a repo asks a model to do. */
export type Job = keyof typeof models;

/** An OpenRouter model identifier without a routing prefix. */
export type ModelId = (typeof models)[Job];

/** OpenRouter's `reasoning.effort` values. */
export type ReasoningEffort = "max" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

/** OpenRouter's `reasoning` request field: an effort, or reasoning switched off. */
export type Reasoning = Readonly<{ effort: ReasoningEffort }> | Readonly<{ enabled: false }>;

/**
 * Request settings in OpenRouter's own request vocabulary. Spread them into
 * `providerOptions.openrouter` (AI SDK, Mastra) or straight into a request body.
 * An alias rather than an interface, so it stays assignable to the AI SDK's
 * JSON object type.
 */
export type RequestSettings = Readonly<{ reasoning?: Reasoning }>;

/**
 * Settings measured with each Pick. A job with nothing measured gets an empty
 * object, so `settings[job]` is always safe to spread.
 */
export const settings: Readonly<Record<Job, RequestSettings>> = Object.freeze({
  agent: Object.freeze({}),
  embed: Object.freeze({}),
  /** Reasoning off, as MaterialGraph's composition parser sends it (MG-1966). */
  extract: Object.freeze({ reasoning: Object.freeze({ enabled: false } as const) }),
  judge: Object.freeze({}),
  reason: Object.freeze({}),
  triage: Object.freeze({}),
  /** Low effort, the setting the 24 Sep 2026 vision test measured. */
  vision: Object.freeze({ reasoning: Object.freeze({ effort: "low" } as const) }),
  write: Object.freeze({}),
});
