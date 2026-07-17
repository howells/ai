import { randomUUID } from "node:crypto";
import { createAI, streamText, visionMessage } from "@howells/ai";
import type { GenerationOptions, ModelService } from "@howells/ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, assertTrustedOrigin, BenchmarkApiError } from "../../../lib/api-errors";
import { requireBenchmarkSession } from "../../../lib/benchmark-auth";
import {
  BENCHMARK_PROTOCOL_VERSION,
  BenchmarkRunSpecSchema,
  BenchmarkStreamEventSchema,
} from "../../../lib/benchmark-contracts";
import type {
  BenchmarkRunSpec,
  BenchmarkStreamEvent,
  BenchmarkStreamEventPayload,
} from "../../../lib/benchmark-contracts";
import type { BenchmarkJob } from "../../../lib/benchmark-run";
import { expandBenchmarkRun } from "../../../lib/benchmark-run";
import { getBenchmarkPolicy } from "../../../lib/benchmark-policy";
import { suppressProviderStreamError } from "../../../lib/provider-errors";
import {
  finalizeBenchmarkRun,
  loadBenchmarkRunStatus,
  markBenchmarkAttempt,
  persistBenchmarkSample,
  remainingDailyAttempts,
  reserveBenchmarkRun,
} from "../../../lib/benchmark-store";
import type { PersistedSample } from "../../../lib/benchmark-store";
import { loadBenchmarkEnv } from "../../../lib/server-env";

export const maxDuration = 300;

/** Return authenticated, secret-free provider availability and safety limits. */
export async function GET(request: Request) {
  loadBenchmarkEnv();
  try {
    await requireBenchmarkSession(request);
    const policy = getBenchmarkPolicy();
    const ai = benchmarkClient();
    const response = NextResponse.json({
      availableProviders: ai.availableProviders,
      availableServices: ai.availableServices satisfies readonly ModelService[],
      limits: {
        activeRuns: policy.activeRunLimit,
        dailyAttempts: policy.dailyAttemptLimit,
        exploreConcurrency: 4,
        images: 4,
        maxOutputTokens: 4096,
        requestBytes: 20 * 1024 * 1024,
        rigorousConcurrency: 1,
        runAttempts: policy.runAttemptLimit,
      },
      remainingDailyAttempts: await remainingDailyAttempts(),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Validate, reserve, execute, persist, and stream one benchmark run. */
export async function POST(request: Request) {
  loadBenchmarkEnv();
  try {
    const policy = getBenchmarkPolicy();
    assertTrustedOrigin(request, policy.canonicalOrigin);
    const session = await requireBenchmarkSession(request);
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      throw new BenchmarkApiError(
        400,
        "benchmark/content-type",
        "Send an application/json request.",
      );
    }
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 20 * 1024 * 1024) {
      throw new BenchmarkApiError(
        413,
        "benchmark/request-too-large",
        "The benchmark request exceeds 20 MB.",
      );
    }
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf-8") > 20 * 1024 * 1024) {
      throw new BenchmarkApiError(
        413,
        "benchmark/request-too-large",
        "The benchmark request exceeds 20 MB.",
      );
    }
    const spec = BenchmarkRunSpecSchema.parse(JSON.parse(rawBody));
    validateImages(spec.images ?? []);
    const expanded = expandBenchmarkRun(spec);
    if (expanded.jobs.length === 0) {
      throw new BenchmarkApiError(
        422,
        "benchmark/no-matching-jobs",
        "No benchmark jobs matched the retry selection.",
      );
    }
    if (expanded.reservedAttempts > policy.runAttemptLimit) {
      throw new BenchmarkApiError(
        422,
        "benchmark/run-limit-exceeded",
        `This run requires ${expanded.reservedAttempts} attempts; the limit is ${policy.runAttemptLimit}.`,
        { requestedAttempts: expanded.reservedAttempts, runAttemptLimit: policy.runAttemptLimit },
      );
    }

    const ai = benchmarkClient();
    for (const route of spec.routes) {
      ai.modelDescriptor(route.model, { provider: route.provider });
      if (!ai.availableProviders.includes(route.provider)) {
        throw new BenchmarkApiError(
          422,
          "benchmark/provider-unavailable",
          `Provider ${route.provider} is not configured.`,
          { provider: route.provider },
        );
      }
    }

    const proposedRunId = randomUUID();
    const reservation = await reserveBenchmarkRun(session.id, proposedRunId, spec, expanded);
    if (reservation.existing) {
      const status = await loadBenchmarkRunStatus(session.id, reservation.runId);
      const response = NextResponse.json({
        cohortHash: reservation.cohortHash,
        existing: true,
        runId: reservation.runId,
        status,
      });
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }

    return benchmarkStream({
      ai,
      cohortHash: reservation.cohortHash,
      jobs: expanded.jobs,
      request,
      runId: reservation.runId,
      sessionId: session.id,
      spec,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: {
            code: "benchmark/invalid-json",
            message: "The benchmark request body is not valid JSON.",
          },
        },
        { status: 400 },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "benchmark/invalid-request",
            message: "The benchmark run specification is invalid.",
          },
        },
        { status: 422 },
      );
    }
    return apiErrorResponse(error);
  }
}

function benchmarkStream({
  ai,
  cohortHash,
  jobs,
  request,
  runId,
  sessionId,
  spec,
}: {
  ai: ReturnType<typeof createAI>;
  cohortHash: string;
  jobs: readonly BenchmarkJob[];
  request: Request;
  runId: string;
  sessionId: string;
  spec: BenchmarkRunSpec;
}): Response {
  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let closed = false;
  let sequence = 0;
  let attemptedJobs = 0;
  let failedJobs = 0;
  let successfulJobs = 0;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const hardTimeout = setTimeout(() => {
    abortController.abort("timeout");
  }, 295_000);
  const abortFromRequest = () => {
    abortController.abort("client-disconnect");
  };
  request.signal.addEventListener("abort", abortFromRequest, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      closed = true;
      abortController.abort("stream-cancelled");
    },
    start(controller) {
      const send = (event: BenchmarkStreamEventPayload) => {
        if (closed) {
          return;
        }
        const envelope = BenchmarkStreamEventSchema.parse({
          ...event,
          runId,
          sequence,
          version: BENCHMARK_PROTOCOL_VERSION,
        });
        sequence += 1;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(envelope)}\n\n`));
      };

      heartbeat = setInterval(() => {
        send({ completedJobs: successfulJobs + failedJobs, type: "heartbeat" });
      }, 15_000);

      void (async () => {
        let terminal: "completed" | "partial" | "cancelled" | "failed" = "failed";
        try {
          send({ cohortHash, totalJobs: jobs.length, type: "started" });
          const concurrency = spec.mode === "rigorous" ? 1 : Math.min(4, jobs.length);
          const pendingSamples: {
            job: BenchmarkJob;
            ordinal: number;
            outcome: Awaited<ReturnType<typeof executeJob>>;
          }[] = [];
          const flushSamples = async () => {
            const batch = pendingSamples.splice(0);
            await Promise.all(
              batch.map(async ({ job, ordinal, outcome }) =>
                persistBenchmarkSample(sessionId, runId, job, ordinal, outcome.sample),
              ),
            );
            for (const { outcome } of batch) {
              if (outcome.event.type === "sample-result") {
                successfulJobs += 1;
              } else {
                failedJobs += 1;
              }
              send({
                ...outcome.event,
                completedJobs: successfulJobs + failedJobs,
              });
            }
          };
          await runWithConcurrency(jobs, concurrency, async (job, ordinal) => {
            if (abortController.signal.aborted) {
              return;
            }
            await markBenchmarkAttempt(runId);
            const outcome = await executeJob(ai, spec, job, abortController.signal);
            attemptedJobs += outcome.attemptsUsed;
            for (let attempt = 1; attempt < outcome.attemptsUsed; attempt += 1) {
              await markBenchmarkAttempt(runId);
            }
            pendingSamples.push({ job, ordinal, outcome });
            if (spec.mode === "rigorous" && endsMeasuredBlock(jobs, ordinal)) {
              await flushSamples();
            }
          });
          await flushSamples();

          if (abortController.signal.aborted) {
            terminal = "cancelled";
            send({ attemptedJobs, type: "cancelled" });
          } else {
            terminal = failedJobs === 0 ? "completed" : successfulJobs === 0 ? "failed" : "partial";
            send({ attemptedJobs, failedJobs, successfulJobs, type: "completed" });
          }
        } catch {
          failedJobs += 1;
          terminal = abortController.signal.aborted ? "cancelled" : "failed";
          if (terminal === "cancelled") {
            send({ attemptedJobs, type: "cancelled" });
          } else {
            send({ attemptedJobs, failedJobs, successfulJobs, type: "completed" });
          }
        } finally {
          try {
            await finalizeBenchmarkRun(runId, terminal);
          } finally {
            closed = true;
            if (heartbeat) {
              clearInterval(heartbeat);
            }
            clearTimeout(hardTimeout);
            request.signal.removeEventListener("abort", abortFromRequest);
            try {
              controller.close();
            } catch {
              // The browser may already have cancelled the response stream.
            }
          }
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-cache, no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function endsMeasuredBlock(jobs: readonly BenchmarkJob[], ordinal: number): boolean {
  const current = jobs[ordinal];
  const next = jobs[ordinal + 1];
  return (
    !current ||
    !next ||
    current.phase !== next.phase ||
    current.promptCaseId !== next.promptCaseId ||
    current.sampleIndex !== next.sampleIndex
  );
}

async function executeJob(
  ai: ReturnType<typeof createAI>,
  spec: BenchmarkRunSpec,
  job: BenchmarkJob,
  abortSignal: AbortSignal,
): Promise<{
  attemptsUsed: number;
  event:
    | Omit<
        Extract<BenchmarkStreamEvent, { type: "sample-result" }>,
        "runId" | "sequence" | "version" | "completedJobs"
      >
    | Omit<
        Extract<BenchmarkStreamEvent, { type: "sample-error" }>,
        "runId" | "sequence" | "version" | "completedJobs"
      >;
  sample: PersistedSample;
}> {
  const start = performance.now();
  const descriptor = ai.modelDescriptor(job.route.model, { provider: job.route.provider });
  try {
    const model = ai.modelById(job.route.model, {
      provider: job.route.provider,
      ...(spec.images?.length ? { vision: true } : {}),
    });
    const result = streamText({
      abortSignal,
      maxRetries: 0,
      model,
      onError: suppressProviderStreamError,
      ...(spec.images?.length
        ? { messages: [visionMessage(job.prompt, spec.images)] }
        : { prompt: job.prompt }),
      ...ai.generationOptions(generationOptions(spec, job)),
    });

    let firstTokenAt: number | undefined;
    let output = "";
    for await (const delta of result.textStream) {
      firstTokenAt ??= performance.now();
      output += delta;
    }
    const finishedAt = performance.now();
    const usage = await result.usage;
    const response = await result.response;
    const providerMetadata = await result.providerMetadata;
    const ttftMs = Math.round((firstTokenAt ?? finishedAt) - start);
    const generationDurationMs = Math.max(0, Math.round(finishedAt - (firstTokenAt ?? finishedAt)));
    const totalDurationMs = Math.round(finishedAt - start);
    const costUsd = extractCostUsd(providerMetadata) ?? extractCostUsd(usage);
    const costMicros = costUsd === undefined ? undefined : Math.round(costUsd * 1_000_000);
    const resolvedModelId = response.modelId || descriptor.providerModelId;
    const backingProvider =
      extractMetadataString(
        providerMetadata,
        new Set(["provider", "providerName", "provider_name"]),
      ) ?? job.route.routeProvider;
    const attemptsUsed = successfulAttemptCount(spec, resolvedModelId);
    const sample: PersistedSample = {
      ...(costMicros === undefined ? {} : { costMicros }),
      ...(backingProvider ? { backingProvider } : {}),
      generationDurationMs,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      resolvedModelId,
      status: "success",
      totalDurationMs,
      ttftMs,
    };
    return {
      attemptsUsed,
      event: {
        ...(costMicros === undefined ? {} : { costMicros }),
        generationDurationMs,
        inputTokens: usage.inputTokens ?? 0,
        output: spec.mode === "explore" ? output : "",
        outputTokens: usage.outputTokens ?? 0,
        phase: job.phase,
        promptCaseId: job.promptCaseId,
        provider: job.route.provider,
        providerModelId: resolvedModelId,
        requestedModelId: job.route.model,
        sampleId: job.id,
        sampleIndex: job.sampleIndex,
        totalDurationMs,
        ttftMs,
        type: "sample-result",
      },
      sample,
    };
  } catch {
    const code = abortSignal.aborted ? "provider/aborted" : "provider/generation-failed";
    return {
      attemptsUsed: abortSignal.aborted
        ? 1
        : 1 + (spec.mode === "explore" ? (spec.options?.fallbackModels?.length ?? 0) : 0),
      event: {
        code,
        phase: job.phase,
        promptCaseId: job.promptCaseId,
        provider: job.route.provider,
        requestedModelId: job.route.model,
        sampleId: job.id,
        sampleIndex: job.sampleIndex,
        type: "sample-error",
      },
      sample: {
        errorCode: code,
        resolvedModelId: descriptor.providerModelId,
        status: abortSignal.aborted ? "cancelled" : "error",
        totalDurationMs: Math.round(performance.now() - start),
      },
    };
  }
}

function successfulAttemptCount(spec: BenchmarkRunSpec, resolvedModelId: string): number {
  if (spec.mode !== "explore") {
    return 1;
  }
  const fallbackIndex = spec.options?.fallbackModels?.indexOf(resolvedModelId) ?? -1;
  return fallbackIndex < 0 ? 1 : fallbackIndex + 2;
}

function generationOptions(spec: BenchmarkRunSpec, job: BenchmarkJob): GenerationOptions {
  if (spec.mode === "rigorous") {
    return {
      cache: "off",
      maxOutputTokens: spec.maxOutputTokens,
      maxRetries: 0,
      modelId: job.route.model,
      provider: job.route.provider,
      reasoning: "off",
      routing: { fallbacks: false },
      seed: spec.seed + job.sampleIndex,
      serviceTier: "standard",
    };
  }
  return {
    cache: spec.options?.cache ? "ephemeral" : "off",
    fallbackModels: spec.options?.fallbackModels,
    maxOutputTokens: spec.maxOutputTokens,
    maxRetries: 0,
    modelId: job.route.model,
    provider: job.route.provider,
    reasoning: job.route.reasoning ?? "off",
    responseHealing: spec.options?.responseHealing,
    routing: job.route.routeProvider ? { allow: [job.route.routeProvider] } : undefined,
    serviceTier: spec.options?.serviceTier,
    webSearch: spec.options?.webSearch,
  };
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const item = items[index];
      if (item !== undefined) {
        await run(item, index);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

function validateImages(images: readonly string[]): void {
  let totalBytes = 0;
  for (const image of images) {
    if (image.startsWith("data:")) {
      if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image)) {
        throw new BenchmarkApiError(
          422,
          "benchmark/image-type",
          "Only PNG, JPEG, WebP, and GIF data images are supported.",
        );
      }
      const encoded = image.slice(image.indexOf(",") + 1);
      totalBytes += Math.floor((encoded.length * 3) / 4);
      continue;
    }
    let url: URL;
    try {
      url = new URL(image);
    } catch {
      throw new BenchmarkApiError(
        422,
        "benchmark/image-url",
        "Image URLs must be valid HTTPS URLs.",
      );
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new BenchmarkApiError(
        422,
        "benchmark/image-url",
        "Image URLs must use HTTPS without embedded credentials.",
      );
    }
    totalBytes += Buffer.byteLength(image, "utf-8");
  }
  if (totalBytes > 20 * 1024 * 1024) {
    throw new BenchmarkApiError(
      413,
      "benchmark/images-too-large",
      "Images exceed the 20 MB request limit.",
    );
  }
}

const COST_KEYS = new Set(["cost", "costUsd", "cost_usd", "totalCost", "total_cost"]);

function extractCostUsd(value: unknown, depth = 0): number | undefined {
  if (!value || depth > 5 || typeof value !== "object") {
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (COST_KEYS.has(key)) {
      const cost =
        typeof child === "number"
          ? child
          : typeof child === "string"
            ? Number.parseFloat(child)
            : Number.NaN;
      if (Number.isFinite(cost) && cost >= 0) {
        return cost;
      }
    }
  }
  for (const child of Object.values(value)) {
    const cost = extractCostUsd(child, depth + 1);
    if (cost !== undefined) {
      return cost;
    }
  }
  return undefined;
}

function extractMetadataString(
  value: unknown,
  keys: ReadonlySet<string>,
  depth = 0,
): string | undefined {
  if (!value || depth > 5 || typeof value !== "object") {
    return undefined;
  }
  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string" && child.length > 0) {
      return child;
    }
  }
  for (const child of Object.values(value)) {
    const match = extractMetadataString(child, keys, depth + 1);
    if (match) {
      return match;
    }
  }
  return undefined;
}

function benchmarkClient() {
  return createAI({ app: { name: "Howells AI Benchmark", url: "https://github.com/howells/ai" } });
}
