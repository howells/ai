/**
 * Workload taxonomy, derived from fleet usage rather than invented.
 *
 * The tier/variant/task matrix was authored before anything could see how the
 * fleet actually calls models. An audit of 324 production call sites across 26
 * repositories (2026-08-16) found three faults in it:
 *
 * 1. It ranks on time to first token. 88 of 91 call sites are blocking
 *    (`generateText`, `generateObject`); only 3 stream. For everything else the
 *    number that matters is total completion time, and ranking on it flips the
 *    fastest route for 2 of 12 benchmarked models.
 * 2. It models text and vision input only. The fleet also runs image
 *    generation, segmentation and box detection, reranking and speech, none of
 *    which the tier matrix can express.
 * 3. Its nine "tasks" do not describe the observed work. 70% of call sites
 *    classify as `general`, because the axis that actually varies is the shape
 *    of the output — prose, JSON, a label from a closed set, or a tool loop —
 *    and the matrix has no dimension for it.
 *
 * This module adds the four axes the call sites do vary along. It is additive:
 * the tier matrix keeps working, and a caller that wants the old behaviour
 * changes nothing.
 */

/** What goes into the model and what comes out. */
export const MODALITIES = ["text", "vision", "image", "embed", "rerank", "speech"] as const;

/** Input/output modality of a workload. */
export type Modality = (typeof MODALITIES)[number];

/**
 * The shape the output must take. This is a hard capability filter, not a
 * preference: a model that cannot emit valid JSON cannot serve a `json`
 * workload however good it is at prose.
 */
export const OUTPUT_CONTRACTS = ["prose", "json", "labels", "tools"] as const;

/** Required output shape for a workload. */
export type OutputContract = (typeof OUTPUT_CONTRACTS)[number];

/**
 * Who is waiting, which decides which latency number to rank on.
 *
 * `interactive` is the only class where time to first token matters, because
 * it is the only class where a human watches tokens arrive. Everything else
 * ranks on total completion time.
 */
export const LATENCY_CLASSES = ["interactive", "background", "batch"] as const;

/** Latency sensitivity of a workload. */
export type LatencyClass = (typeof LATENCY_CLASSES)[number];

/** How far down the price curve a workload can go before quality bites. */
export const STAKES = ["draft", "checked", "shipped"] as const;

/**
 * Consequence of a wrong answer.
 *
 * `draft` is thrown away or regenerated, `checked` is validated downstream by
 * code or a person, `shipped` reaches a user unreviewed.
 */
export type Stakes = (typeof STAKES)[number];

/** A workload, described along the axes that actually vary. */
export interface WorkloadProfile {
  modality: Modality;
  contract: OutputContract;
  latency: LatencyClass;
  stakes: Stakes;
}

/** Which latency statistic ranks candidates for a given latency class. */
export function rankingMetric(latency: LatencyClass): "ttft" | "total" {
  return latency === "interactive" ? "ttft" : "total";
}

/**
 * Named roles observed in the fleet, mapped onto the taxonomy.
 *
 * These names were read off real identifiers in the consuming repositories
 * (`EXTRACTION_OPENROUTER_MODEL`, `VISION_TRIAGE_OPENROUTER_MODEL`,
 * `judgeModel`, `CANVAS_AGENT_MODEL_NAMES`, `OPENROUTER_EDITORIAL_MODEL`, and
 * so on) rather than invented, so a repo can adopt the taxonomy by naming the
 * role it already has.
 */
export const WORKLOAD_ROLES = {
  /** Pull structured fields out of a document or page. */
  extraction: { modality: "text", contract: "json", latency: "background", stakes: "checked" },
  /** Assign a label from a closed set, often over images. */
  triage: { modality: "vision", contract: "labels", latency: "batch", stakes: "checked" },
  /** Decide a search intent or decompose a query. */
  decompose: { modality: "text", contract: "json", latency: "interactive", stakes: "checked" },
  /** Score or judge another model's output. */
  judge: { modality: "text", contract: "json", latency: "background", stakes: "checked" },
  /** Long-horizon tool loop with persistent state. */
  agent: { modality: "text", contract: "tools", latency: "background", stakes: "checked" },
  /** Prose a reader will see. */
  editorial: { modality: "text", contract: "prose", latency: "background", stakes: "shipped" },
  /** Conversational reply with a human waiting. */
  converse: { modality: "text", contract: "prose", latency: "interactive", stakes: "shipped" },
  /** Describe or read an image. */
  describe: { modality: "vision", contract: "prose", latency: "background", stakes: "shipped" },
  /** Produce an image. */
  render: { modality: "image", contract: "prose", latency: "background", stakes: "shipped" },
  /** Vectorise text or images for retrieval. */
  embed: { modality: "embed", contract: "json", latency: "batch", stakes: "checked" },
  /** Reorder candidates by relevance. */
  rerank: { modality: "rerank", contract: "json", latency: "interactive", stakes: "checked" },
  /** Synthesise or transcribe speech. */
  speech: { modality: "speech", contract: "prose", latency: "background", stakes: "shipped" },
} as const satisfies Record<string, WorkloadProfile>;

/** Name of an observed fleet workload role. */
export type WorkloadRole = keyof typeof WORKLOAD_ROLES;

/** Ordered role names, for CLI output and iteration. */
export const WORKLOAD_ROLE_NAMES = Object.keys(WORKLOAD_ROLES) as readonly WorkloadRole[];

/** Resolve a named role to its profile. */
export function profileForRole(role: WorkloadRole): WorkloadProfile {
  return WORKLOAD_ROLES[role];
}

/**
 * Signals that identify a workload role from source code.
 *
 * Ordered most specific first. Used by the fleet audit to classify call sites
 * without relying on the categories being tested.
 */
export const ROLE_SIGNALS: readonly { role: WorkloadRole; patterns: readonly RegExp[] }[] = [
  { role: "rerank", patterns: [/rerank/i] },
  { role: "embed", patterns: [/embed(ding)?\b/i, /vectoris|vectoriz/i] },
  {
    role: "speech",
    // Underscore is a word character, so `\btts\b` misses `cloud_tts`.
    patterns: [
      /(?:^|[^a-z])tts(?:[^a-z]|$)/i,
      /speech/i,
      /transcribe/i,
      /voice-?line/i,
      /orpheus|kokoro|voxtral|whisper/i,
    ],
  },
  {
    role: "render",
    patterns: [
      /generate-?image/i,
      /render-?image/i,
      /apply-?texture/i,
      /region-?edit/i,
      /seedream|gpt-image|\bfal\b/i,
      /motif/i,
    ],
  },
  {
    role: "triage",
    patterns: [/triage/i, /classif/i, /\blabel\b/i, /segment/i, /box-?detect/i, /synonym/i],
  },
  {
    role: "judge",
    patterns: [/\bjudge\b/i, /scorer/i, /\beval/i, /groundedness/i, /observation/i, /critique/i],
  },
  {
    role: "decompose",
    patterns: [/decompose/i, /nl-?search/i, /\bquery\b/i, /intent/i, /router?-?prompt/i],
  },
  {
    role: "extraction",
    patterns: [
      /extract/i,
      /normalis|normaliz/i,
      /parse/i,
      /enrich/i,
      /measurement/i,
      /\bschema\b/i,
    ],
  },
  {
    role: "agent",
    patterns: [/\bagent\b/i, /supervisor/i, /orchestrat/i, /workflow/i, /canvas/i, /tool-?loop/i],
  },
  { role: "describe", patterns: [/vision/i, /\bvlm\b/i, /alt-?text/i, /caption/i, /describe/i] },
  {
    role: "editorial",
    patterns: [
      /editorial/i,
      /composer/i,
      /\bcopy\b/i,
      /\bprose\b/i,
      /narrat/i,
      /summar/i,
      /\btitle\b/i,
    ],
  },
  { role: "converse", patterns: [/\bchat\b/i, /conversat/i, /interview/i, /\breply\b/i] },
];

/**
 * Highest stakes a route should serve without a task-specific eval.
 *
 * Some routes serve only a small open-weight lineup with no frontier model in
 * it. That is a real constraint and it belongs in the type system rather than
 * in someone's memory: a route can be the fastest thing available and still be
 * the wrong place to put work that reaches a user unreviewed.
 *
 * A route capped at `checked` is not barred from `shipped` work — it is barred
 * from *assuming* it. Run `ai eval` on the actual task and the ceiling is
 * answered with evidence instead of caution. Measured on 2026-08-16, Cerebras
 * gpt-oss-120b scored highest of four candidates on structured extraction, so
 * the cap is a prompt to measure, not a verdict.
 */
export const ROUTE_STAKES_CEILING: Readonly<Record<string, Stakes>> = {
  cerebras: "checked",
  groq: "checked",
  ollama: "checked",
};

/** True when a route should not take this workload without a task eval. */
export function exceedsStakesCeiling(route: string, stakes: Stakes): boolean {
  const ceiling = ROUTE_STAKES_CEILING[route];
  if (!ceiling) {
    return false;
  }
  return STAKES.indexOf(stakes) > STAKES.indexOf(ceiling);
}

/** Classify a source-derived string into a workload role, if one matches. */
export function classifyRole(haystack: string): WorkloadRole | undefined {
  for (const signal of ROLE_SIGNALS) {
    if (signal.patterns.some((pattern) => pattern.test(haystack))) {
      return signal.role;
    }
  }
  return undefined;
}
