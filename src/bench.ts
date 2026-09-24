/**
 * Cross-route latency measurement over OpenRouter.
 *
 * OpenRouter serves most models through several upstream providers, and it
 * publishes price but not speed. A claim that one route is faster than another
 * is only worth acting on if this machine measured it, so this module measures
 * it: the same prompt, the same model, one route pinned at a time.
 *
 * Every duration is in milliseconds and named accordingly. Samples are
 * summarised by median and interquartile range, never by mean: one cold start
 * otherwise swamps a five-run cohort.
 */

import { z } from "zod";

import type { RequestSettings } from "./index.ts";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

/** Prompt used when a caller supplies none. Sized to force real generation. */
export const DEFAULT_BENCH_PROMPT =
  "List the seven colours of the visible spectrum, one per line, with a five-word description of each.";

/** Output token ceiling that keeps a sample cheap but long enough to time. */
const DEFAULT_MAX_OUTPUT_TOKENS = 160;

const WARM_UP_OUTPUT_TOKENS = 16;

/** OpenRouter's own routing, with no upstream provider pinned. */
export const DEFAULT_ROUTE = "auto";

/** One completed streaming call. */
export interface BenchSample {
  /** Input tokens OpenRouter reported. */
  inputTokens: number;
  /** Output tokens OpenRouter reported. */
  outputTokens: number;
  /** Output tokens per second. */
  outputTokensPerSecond: number;
  /** The upstream provider OpenRouter used. */
  provider: string | undefined;
  /**
   * False when the upstream buffered the whole reply, so the token rate is
   * measured over the whole call rather than a generation window that did not
   * exist.
   */
  streamed: boolean;
  /** Milliseconds from request start to stream completion. */
  totalMs: number;
  /** Milliseconds from request start to the first streamed text. */
  ttftMs: number;
}

/** Summary statistics for a route's samples. */
export interface BenchStatistics {
  iqrTtftMs: number;
  medianOutputTokensPerSecond: number;
  medianTotalMs: number;
  medianTtftMs: number;
  sampleCount: number;
}

/** Everything measured for one model on one route. */
export interface BenchRouteResult {
  /** One message per failed attempt. */
  errors: readonly string[];
  modelId: string;
  /** Upstream provider slug, or `auto` for OpenRouter's own routing. */
  route: string;
  samples: readonly BenchSample[];
  /** Undefined when every attempt failed. */
  statistics: BenchStatistics | undefined;
}

/** What decides the winner: first token for interactive work, total time otherwise. */
export type BenchMetric = "ttft" | "total";

/** Options for benchmarking one model on one route. */
export interface BenchRouteOptions {
  apiKey: string;
  maxOutputTokens?: number;
  modelId: string;
  /** Identical across routes or the comparison is void. */
  prompt?: string;
  /** Upstream provider slug, or `auto`. */
  route: string;
  /** Measured runs, excluding the discarded warm-up. */
  runs?: number;
  /** Merged into every request body, e.g. `settings.vision`. */
  settings?: RequestSettings;
  signal?: AbortSignal;
  /** Discard one unmeasured call first, absorbing connection setup and cold start. */
  warmUp?: boolean;
}

/** Options for comparing one model across several routes. */
export interface BenchCompareOptions extends Omit<BenchRouteOptions, "route"> {
  /** Defaults to `total`: most calls block on the whole reply. */
  metric?: BenchMetric;
  routes: readonly string[];
}

/** One model measured across every requested route. */
export interface BenchComparison {
  /** The route the metric selects. */
  fastest: string | undefined;
  fastestByTotal: string | undefined;
  fastestByTtft: string | undefined;
  metric: BenchMetric;
  /** True when first-token and total-time rankings disagree, so the metric decided. */
  metricDisagrees: boolean;
  modelId: string;
  prompt: string;
  results: readonly BenchRouteResult[];
}

const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() }))
    .nullish(),
  error: z.object({ message: z.string().nullish() }).nullish(),
  provider: z.string().nullish(),
  usage: z
    .object({ completion_tokens: z.number().nullish(), prompt_tokens: z.number().nullish() })
    .nullish(),
});

type StreamChunk = z.infer<typeof streamChunkSchema>;

const quantile = (sorted: readonly number[], fraction: number): number => {
  const position = (sorted.length - 1) * fraction;
  const low = sorted[Math.floor(position)] ?? 0;
  const high = sorted[Math.ceil(position)] ?? low;
  return low + (high - low) * (position - Math.floor(position));
};

const ascending = (a: number, b: number): number => a - b;

/** Median and interquartile summary of a set of samples. */
export const summarise = (samples: readonly BenchSample[]): BenchStatistics | undefined => {
  if (samples.length === 0) {
    return undefined;
  }
  const ttft = samples.map((sample) => sample.ttftMs).toSorted(ascending);
  const total = samples.map((sample) => sample.totalMs).toSorted(ascending);
  const rate = samples.map((sample) => sample.outputTokensPerSecond).toSorted(ascending);
  return {
    iqrTtftMs: Math.round(quantile(ttft, 0.75) - quantile(ttft, 0.25)),
    medianOutputTokensPerSecond: Math.round(quantile(rate, 0.5) * 10) / 10,
    medianTotalMs: Math.round(quantile(total, 0.5)),
    medianTtftMs: Math.round(quantile(ttft, 0.5)),
    sampleCount: samples.length,
  };
};

/**
 * Run `task` over `items` strictly one after another. Concurrent samples
 * contend for the same socket pool and rate limit, which inflates first-token
 * time for reasons unrelated to the route.
 */
const inSequence = async <T, R>(
  items: readonly T[],
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const [first, ...rest] = items;
  if (first === undefined) {
    return [];
  }
  const head = await task(first);
  return [head, ...(await inSequence(rest, task))];
};

/** The chat completions request body, in OpenRouter's own field names. */
interface ChatRequest extends RequestSettings {
  max_tokens: number;
  messages: readonly { content: string; role: "user" }[];
  model: string;
  provider?: { allow_fallbacks: false; only: readonly string[] };
  stream: true;
}

const requestBody = (options: BenchRouteOptions, maxOutputTokens: number): string => {
  const body: ChatRequest = {
    ...options.settings,
    max_tokens: maxOutputTokens,
    messages: [{ content: options.prompt ?? DEFAULT_BENCH_PROMPT, role: "user" }],
    model: options.modelId,
    stream: true,
  };
  if (options.route !== DEFAULT_ROUTE) {
    body.provider = { allow_fallbacks: false, only: [options.route] };
  }
  return JSON.stringify(body);
};

/** Each complete `data:` payload in an SSE buffer, and whatever is left over. */
const splitEvents = (buffer: string) => {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const payloads = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((payload) => payload !== "" && payload !== "[DONE]");
  return { payloads, rest };
};

const hasText = (chunk: StreamChunk): boolean =>
  (chunk.choices ?? []).some((choice) => (choice.delta?.content ?? "") !== "");

/** What a finished stream said, with the time its first text arrived. */
interface StreamReading {
  firstTextAt: number | undefined;
  inputTokens: number;
  outputTokens: number;
  provider: string | undefined;
}

const readStream = async (
  body: ReadableStream<Uint8Array>,
  start: number,
): Promise<StreamReading> => {
  const reading: StreamReading = {
    firstTextAt: undefined,
    inputTokens: 0,
    outputTokens: 0,
    provider: undefined,
  };
  let buffer = "";
  const decoder = new TextDecoder();
  const toText = new TransformStream<Uint8Array, string>({
    transform: (bytes, controller) => {
      controller.enqueue(decoder.decode(bytes, { stream: true }));
    },
  });
  for await (const text of body.pipeThrough(toText)) {
    const { payloads, rest } = splitEvents(buffer + text);
    buffer = rest;
    for (const payload of payloads) {
      const chunk = streamChunkSchema.parse(JSON.parse(payload));
      if (chunk.error) {
        throw new Error(chunk.error.message ?? "OpenRouter stream error");
      }
      reading.provider ??= chunk.provider ?? undefined;
      reading.inputTokens = chunk.usage?.prompt_tokens ?? reading.inputTokens;
      reading.outputTokens = chunk.usage?.completion_tokens ?? reading.outputTokens;
      if (reading.firstTextAt === undefined && hasText(chunk)) {
        reading.firstTextAt = performance.now() - start;
      }
    }
  }
  return reading;
};

const runOnce = async (
  options: BenchRouteOptions,
  maxOutputTokens: number,
): Promise<BenchSample> => {
  const start = performance.now();
  const response = await fetch(CHAT_COMPLETIONS_URL, {
    body: requestBody(options, maxOutputTokens),
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
      "x-title": "@howells/ai bench",
    },
    method: "POST",
    signal: options.signal ?? null,
  });
  if (!response.ok || response.body === null) {
    const detail = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 200)}`);
  }

  const reading = await readStream(response.body, start);
  const totalMs = performance.now() - start;
  const ttftMs = reading.firstTextAt ?? totalMs;
  // A buffered reply leaves a generation window near zero and an absurd token
  // rate, so the whole call is the honest window for it.
  const streamed = totalMs - ttftMs > totalMs * 0.1;
  const windowMs = streamed ? totalMs - ttftMs : totalMs;

  return {
    inputTokens: reading.inputTokens,
    outputTokens: reading.outputTokens,
    outputTokensPerSecond: Math.round((reading.outputTokens / (windowMs / 1000)) * 10) / 10,
    provider: reading.provider,
    streamed,
    totalMs: Math.round(totalMs),
    ttftMs: Math.round(ttftMs),
  };
};

type Attempt = { sample: BenchSample } | { error: string };

const attempt = async (options: BenchRouteOptions, maxOutputTokens: number): Promise<Attempt> => {
  try {
    return { sample: await runOnce(options, maxOutputTokens) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
};

/** Measure one model on one route, one run at a time. */
export const benchRoute = async (options: BenchRouteOptions): Promise<BenchRouteResult> => {
  const errors: string[] = [];
  if (options.warmUp ?? true) {
    const warmUp = await attempt(options, WARM_UP_OUTPUT_TOKENS);
    if ("error" in warmUp) {
      errors.push(`warm-up: ${warmUp.error}`);
    }
  }

  const runs = Array.from({ length: options.runs ?? 3 }, (_, index) => index);
  const attempts = await inSequence(
    runs,
    async () => await attempt(options, options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS),
  );
  const samples = attempts.flatMap((result) => ("sample" in result ? [result.sample] : []));
  errors.push(...attempts.flatMap((result) => ("error" in result ? [result.error] : [])));

  return {
    errors,
    modelId: options.modelId,
    route: options.route,
    samples,
    statistics: summarise(samples),
  };
};

const lowest = (
  results: readonly BenchRouteResult[],
  pick: (statistics: BenchStatistics) => number,
): string | undefined => {
  let best: { route: string; value: number } | undefined;
  for (const result of results) {
    if (result.statistics !== undefined) {
      const value = pick(result.statistics);
      if (best === undefined || value < best.value) {
        best = { route: result.route, value };
      }
    }
  }
  return best?.route;
};

/** Measure the same model with the same prompt across several routes, one after another. */
export const benchCompare = async (options: BenchCompareOptions): Promise<BenchComparison> => {
  const prompt = options.prompt ?? DEFAULT_BENCH_PROMPT;
  const metric = options.metric ?? "total";
  const results = await inSequence(
    options.routes,
    async (route) => await benchRoute({ ...options, prompt, route }),
  );
  const byTtft = lowest(results, (statistics) => statistics.medianTtftMs);
  const byTotal = lowest(results, (statistics) => statistics.medianTotalMs);

  return {
    fastest: metric === "ttft" ? byTtft : byTotal,
    fastestByTotal: byTotal,
    fastestByTtft: byTtft,
    metric,
    metricDisagrees: byTtft !== undefined && byTotal !== undefined && byTtft !== byTotal,
    modelId: options.modelId,
    prompt,
    results,
  };
};
