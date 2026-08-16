/**
 * Cross-route latency measurement.
 *
 * Routers publish price but not speed: OpenRouter's `latency_last_30m` and
 * `throughput_last_30m` are null across every endpoint it serves, and
 * third-party medians measure someone else's traffic from someone else's
 * region. A claim that one route is faster than another is only worth acting
 * on if this machine measured it, so this module measures it.
 *
 * Every reported duration is in milliseconds and named accordingly. Samples
 * are summarised by median and interquartile range, never by mean — one cold
 * start otherwise swamps a five-run cohort.
 */

import { streamText } from "ai";
import type { AIClient } from "./client";
import type { ProviderRoute } from "./types";
import { resolveProviderModelId } from "./models";
import { rankingMetric } from "./taxonomy";
import type { LatencyClass } from "./taxonomy";

/** Prompt used when a caller supplies none. Sized to force real generation. */
const DEFAULT_BENCH_PROMPT =
  "List the seven colours of the visible spectrum, one per line, with a five-word description of each.";

/** Output token ceiling that keeps a sample cheap but long enough to time. */
const DEFAULT_MAX_OUTPUT_TOKENS = 160;

/** One completed streaming call. */
export interface BenchSample {
  /** Milliseconds from request start to the first streamed text delta. */
  ttftMs: number;
  /** Milliseconds from request start to stream completion. */
  totalMs: number;
  /** Output tokens the provider reported. */
  outputTokens: number;
  /** Input tokens the provider reported. */
  inputTokens: number;
  /**
   * True when the response arrived incrementally. False means the provider
   * buffered it, so `outputTokensPerSecond` is measured over the whole call
   * rather than over a generation window that did not exist.
   */
  streamed: boolean;
  /** Output tokens per second. */
  outputTokensPerSecond: number;
}

/** Summary statistics for a route's samples. */
export interface BenchStatistics {
  /** Median time to first token, milliseconds. */
  medianTtftMs: number;
  /** Interquartile range of time to first token, milliseconds. */
  iqrTtftMs: number;
  /** Median wall-clock duration, milliseconds. */
  medianTotalMs: number;
  /** Median output tokens per second. */
  medianOutputTokensPerSecond: number;
  /** Number of samples that completed. */
  sampleCount: number;
}

/** Everything measured for one canonical model on one route. */
export interface BenchRouteResult {
  /** Route the samples ran through. */
  route: ProviderRoute;
  /** Canonical model ID requested. */
  canonicalModelId: string;
  /** Route-native model ID actually called. */
  resolvedModelId: string;
  /** Successful samples, in execution order. */
  samples: readonly BenchSample[];
  /** Summary of `samples`, undefined when every attempt failed. */
  statistics: BenchStatistics | undefined;
  /** Failure messages, one per failed attempt. */
  errors: readonly string[];
}

/** Options for benchmarking one route. */
export interface BenchRouteOptions {
  /** Configured AI client supplying credentials and generation options. */
  ai: AIClient;
  /** Canonical (OpenRouter-style) model ID. */
  modelId: string;
  /** Route to measure. */
  route: ProviderRoute;
  /** Prompt to send. Identical across routes or the comparison is void. */
  prompt?: string;
  /** Measured runs, excluding the discarded warm-up. */
  runs?: number;
  /** Output token ceiling. */
  maxOutputTokens?: number;
  /**
   * Discard one unmeasured call first, absorbing connection setup and any
   * cold start so the cohort measures steady state.
   */
  warmUp?: boolean;
  signal?: AbortSignal;
}

function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] ?? 0;
  if (lower === upper) {
    return low;
  }
  const high = sorted[upper] ?? low;
  return low + (high - low) * (position - lower);
}

function summarise(samples: readonly BenchSample[]): BenchStatistics | undefined {
  if (samples.length === 0) {
    return undefined;
  }
  const ttft = samples.map((sample) => sample.ttftMs).sort((a, b) => a - b);
  const total = samples.map((sample) => sample.totalMs).sort((a, b) => a - b);
  const throughput = samples.map((sample) => sample.outputTokensPerSecond).sort((a, b) => a - b);

  return {
    medianTtftMs: Math.round(quantile(ttft, 0.5)),
    iqrTtftMs: Math.round(quantile(ttft, 0.75) - quantile(ttft, 0.25)),
    medianTotalMs: Math.round(quantile(total, 0.5)),
    medianOutputTokensPerSecond: Math.round(quantile(throughput, 0.5) * 10) / 10,
    sampleCount: samples.length,
  };
}

async function runOnce(options: BenchRouteOptions, resolvedModelId: string): Promise<BenchSample> {
  const { ai, modelId, route } = options;
  const start = performance.now();
  let ttftMs: number | undefined;

  const result = streamText({
    model: ai.modelById(resolvedModelId, { provider: route }),
    prompt: options.prompt ?? DEFAULT_BENCH_PROMPT,
    ...ai.generationOptions({
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      modelId,
      provider: route,
      temperature: null,
      tools: "none",
    }),
    ...(options.signal ? { abortSignal: options.signal } : {}),
  });

  for await (const _delta of result.textStream) {
    ttftMs ??= performance.now() - start;
  }

  const totalMs = performance.now() - start;
  const usage = await result.usage;
  const outputTokens = usage.outputTokens ?? 0;
  const generationMs = totalMs - (ttftMs ?? totalMs);

  // A provider that buffers and flushes the whole response at once leaves a
  // generation window near zero, which would report an absurd token rate.
  // Fall back to the full call duration, which is the honest figure for a
  // response that never really streamed.
  const streamed = generationMs > totalMs * 0.1;
  const windowMs = streamed ? generationMs : totalMs;

  return {
    ttftMs: Math.round(ttftMs ?? totalMs),
    totalMs: Math.round(totalMs),
    outputTokens,
    inputTokens: usage.inputTokens ?? 0,
    streamed,
    outputTokensPerSecond:
      windowMs > 0 ? Math.round((outputTokens / (windowMs / 1000)) * 10) / 10 : 0,
  };
}

/**
 * Measure one canonical model on one route.
 *
 * Runs are sequential by design. Concurrent samples contend for the same
 * local socket pool and upstream rate limit, which inflates time to first
 * token in a way that has nothing to do with the route being measured.
 */
export async function benchRoute(options: BenchRouteOptions): Promise<BenchRouteResult> {
  const resolvedModelId = resolveProviderModelId(options.modelId, options.route);
  const samples: BenchSample[] = [];
  const errors: string[] = [];

  if (options.warmUp ?? true) {
    try {
      await runOnce({ ...options, maxOutputTokens: 16 }, resolvedModelId);
    } catch (error) {
      errors.push(`warm-up: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (let run = 0; run < (options.runs ?? 3); run += 1) {
    try {
      samples.push(await runOnce(options, resolvedModelId));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    route: options.route,
    canonicalModelId: options.modelId,
    resolvedModelId,
    samples,
    statistics: summarise(samples),
    errors,
  };
}

/** Options for comparing one model across several routes. */
export interface BenchCompareOptions extends Omit<BenchRouteOptions, "route"> {
  /** Routes to measure, in order. */
  routes: readonly ProviderRoute[];
  /**
   * Latency class of the workload being routed. Decides whether the winner is
   * chosen on time to first token or on total completion time. Defaults to
   * `background`, matching the overwhelming majority of fleet call sites.
   */
  latencyClass?: LatencyClass;
}

/** One model measured across every requested route. */
export interface BenchComparison {
  canonicalModelId: string;
  prompt: string;
  results: readonly BenchRouteResult[];
  /**
   * Statistic the recommendation is based on. `total` unless the workload is
   * interactive: 88 of 91 fleet call sites block on the whole response, so
   * time to first token describes almost none of them.
   */
  metric: "ttft" | "total";
  /** Route the metric selects. This is the recommendation. */
  fastest: ProviderRoute | undefined;
  /** Route with the lowest median time to first token. */
  fastestByTtft: ProviderRoute | undefined;
  /** Route with the lowest median total completion time. */
  fastestByTotal: ProviderRoute | undefined;
  /** Route with the highest median output throughput. */
  fastestByThroughput: ProviderRoute | undefined;
  /**
   * True when ranking by TTFT and by total time disagree. A flip means the
   * choice of metric decided the answer, and should be stated rather than
   * hidden behind a single winner.
   */
  metricDisagrees: boolean;
}

/**
 * Measure the same model, with the same prompt, across several routes.
 *
 * Routes run sequentially and each is measured independently, so the result
 * isolates router overhead rather than blending it with upstream variance.
 */
export async function benchCompare(options: BenchCompareOptions): Promise<BenchComparison> {
  const prompt = options.prompt ?? DEFAULT_BENCH_PROMPT;
  const results: BenchRouteResult[] = [];

  for (const route of options.routes) {
    results.push(await benchRoute({ ...options, prompt, route }));
  }

  let fastestByTtft: BenchRouteResult | undefined;
  let fastestByTotal: BenchRouteResult | undefined;
  let fastestByThroughput: BenchRouteResult | undefined;

  for (const result of results) {
    const statistics = result.statistics;
    if (!statistics) {
      continue;
    }
    if (!fastestByTtft || statistics.medianTtftMs < (fastestByTtft.statistics?.medianTtftMs ?? 0)) {
      fastestByTtft = result;
    }
    if (
      !fastestByTotal ||
      statistics.medianTotalMs < (fastestByTotal.statistics?.medianTotalMs ?? 0)
    ) {
      fastestByTotal = result;
    }
    if (
      !fastestByThroughput ||
      statistics.medianOutputTokensPerSecond >
        (fastestByThroughput.statistics?.medianOutputTokensPerSecond ?? 0)
    ) {
      fastestByThroughput = result;
    }
  }

  const metric = rankingMetric(options.latencyClass ?? "background");
  const fastest = metric === "ttft" ? fastestByTtft : fastestByTotal;

  return {
    canonicalModelId: options.modelId,
    prompt,
    results,
    metric,
    fastest: fastest?.route,
    fastestByTtft: fastestByTtft?.route,
    fastestByTotal: fastestByTotal?.route,
    fastestByThroughput: fastestByThroughput?.route,
    metricDisagrees: Boolean(
      fastestByTtft && fastestByTotal && fastestByTtft.route !== fastestByTotal.route,
    ),
  };
}
