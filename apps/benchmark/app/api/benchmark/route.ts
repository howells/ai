import {
  createAI,
  streamText,
  visionMessage,
  type ModelService,
  type ProviderRoute,
} from "@howells/ai";
import { type NextRequest, NextResponse } from "next/server";
import {
  type BenchmarkAdvancedOptions,
  type BenchmarkReasoningMode,
  buildBenchmarkGenerationOptions,
  DEFAULT_ADVANCED_OPTIONS,
} from "../../../lib/benchmark-options";
import {
  benchmarkOptionsHash,
  persistBenchmarkResult,
} from "../../../lib/benchmark-history";
import { loadBenchmarkEnv } from "../../../lib/server-env";

/** Allow benchmark streams to run for up to five minutes. */
export const maxDuration = 300;

interface RunDef {
  model: string;
  provider: ProviderRoute;
  label?: string;
  /** Optional OpenRouter backing provider slug for this specific run. */
  routeProvider?: string;
  /** Optional reasoning mode override for this specific run. */
  reasoning?: BenchmarkReasoningMode;
}

interface BenchmarkRequest {
  /** Single prompt (legacy) or array of prompts for multi-round averaging. */
  prompt: string | string[];
  /** Optional image URLs or data URLs applied to every prompt round. */
  images?: string[];
  runs: RunDef[];
  maxTokens?: number;
  options?: BenchmarkAdvancedOptions;
}

interface BenchmarkResult {
  model: string;
  provider: ProviderRoute;
  label: string;
  ttft: number;
  totalTime: number;
  outputTokens: number;
  inputTokens: number;
  tokensPerSecond: number;
  costUsd?: number;
  output: string;
  error?: string;
  region: string;
  /** Which round this result is from (0-indexed). Only present in multi-round mode. */
  round?: number;
  /** Averaged result across all rounds. Only present on summary results. */
  averaged?: boolean;
}

export function GET() {
  loadBenchmarkEnv();

  const ai = createAI({
    app: { name: "Howells AI Benchmark", url: "https://github.com/howells/ai" },
  });

  return NextResponse.json({
    availableProviders: ai.availableProviders,
    availableServices: ai.availableServices satisfies readonly ModelService[],
  });
}

async function executeRun(
  ai: ReturnType<typeof createAI>,
  run: RunDef,
  prompt: string,
  images: readonly string[],
  maxTokens: number,
  region: string,
  options?: BenchmarkAdvancedOptions,
  round?: number,
): Promise<BenchmarkResult> {
  const label = run.label ?? `${run.provider}/${run.model}`;
  const start = performance.now();
  const openRouterVariant =
    run.provider === "openrouter" && options?.openRouterVariant !== "off"
      ? options?.openRouterVariant
      : undefined;
  const resultModel =
    openRouterVariant && !run.model.endsWith(`:${openRouterVariant}`)
      ? `${run.model.replace(/:(nitro|exacto|floor)$/, "")}:${openRouterVariant}`
      : run.model;
  const resultLabel =
    openRouterVariant && !label.endsWith(`:${openRouterVariant}`)
      ? `${label} :${openRouterVariant}`
      : label;

  try {
    const model = ai.modelById(run.model, {
      provider: run.provider,
      ...(images.length > 0 ? { vision: true } : {}),
      ...(openRouterVariant ? { openRouterVariant } : {}),
    });
    const runOptions: BenchmarkAdvancedOptions | undefined =
      (run.routeProvider && run.provider === "openrouter") || run.reasoning
        ? {
            ...(options ?? DEFAULT_ADVANCED_OPTIONS),
            ...(run.routeProvider && run.provider === "openrouter"
              ? {
                  allowProviders: [run.routeProvider],
                  fallbacks: false,
                }
              : {}),
            ...(run.reasoning ? { reasoning: run.reasoning } : {}),
          }
        : options;

    const result = streamText({
      model,
      ...(images.length > 0
        ? { messages: [visionMessage(prompt, images)] }
        : { prompt }),
      ...ai.generationOptions(
        buildBenchmarkGenerationOptions({
          provider: run.provider,
          modelId: run.model,
          maxTokens,
          options: runOptions,
        }),
      ),
    });

    let ttft: number | null = null;
    let output = "";

    for await (const delta of result.textStream) {
      if (ttft === null) {
        ttft = performance.now() - start;
      }
      output += delta;
    }

    const totalTime = performance.now() - start;
    const usage = await result.usage;
    const providerMetadata = await Promise.resolve(
      (result as { providerMetadata?: unknown }).providerMetadata,
    );
    const outTokens = usage.outputTokens ?? 0;
    const inTokens = usage.inputTokens ?? 0;
    const costUsd = extractCostUsd(providerMetadata) ?? extractCostUsd(usage);

    return {
      model: resultModel,
      provider: run.provider,
      label: resultLabel,
      ttft: Math.round(ttft ?? totalTime),
      totalTime: Math.round(totalTime),
      outputTokens: outTokens,
      inputTokens: inTokens,
      tokensPerSecond:
        totalTime > 0
          ? Math.round((outTokens / (totalTime / 1000)) * 10) / 10
          : 0,
      ...(costUsd !== undefined ? { costUsd } : {}),
      output: output.slice(0, 500),
      region,
      round,
    };
  } catch (err) {
    const totalTime = performance.now() - start;
    return {
      model: resultModel,
      provider: run.provider,
      label: resultLabel,
      ttft: 0,
      totalTime: Math.round(totalTime),
      outputTokens: 0,
      inputTokens: 0,
      tokensPerSecond: 0,
      output: "",
      error: err instanceof Error ? err.message : String(err),
      region,
      round,
    };
  }
}

const COST_KEYS = new Set([
  "cost",
  "costUsd",
  "cost_usd",
  "totalCost",
  "total_cost",
  "totalCostUsd",
  "total_cost_usd",
]);

function numericCost(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function extractCostUsd(value: unknown, depth = 0): number | undefined {
  if (!value || depth > 5 || typeof value !== "object") return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (COST_KEYS.has(key)) {
      const cost = numericCost(child);
      if (cost !== undefined) return cost;
    }
  }

  for (const child of Object.values(value)) {
    const cost = extractCostUsd(child, depth + 1);
    if (cost !== undefined) return cost;
  }

  return undefined;
}

function averageResults(results: BenchmarkResult[]): BenchmarkResult {
  const firstResult = results[0];
  if (!firstResult) {
    throw new Error("Cannot average an empty benchmark result set");
  }

  const valid = results.filter((r) => !r.error);
  if (valid.length === 0) {
    return { ...firstResult, averaged: true, round: undefined };
  }

  const firstValid = valid[0];
  if (!firstValid) {
    return { ...firstResult, averaged: true, round: undefined };
  }

  const avg = (fn: (r: BenchmarkResult) => number) =>
    Math.round(valid.reduce((sum, r) => sum + fn(r), 0) / valid.length);

  const avgTps =
    Math.round(
      (valid.reduce((sum, r) => sum + r.tokensPerSecond, 0) / valid.length) *
        10,
    ) / 10;
  const totalCostUsd = valid.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

  return {
    model: firstValid.model,
    provider: firstValid.provider,
    label: firstValid.label,
    ttft: avg((r) => r.ttft),
    totalTime: avg((r) => r.totalTime),
    outputTokens: avg((r) => r.outputTokens),
    inputTokens: avg((r) => r.inputTokens),
    tokensPerSecond: avgTps,
    ...(totalCostUsd > 0 ? { costUsd: totalCostUsd } : {}),
    output: "",
    region: firstValid.region,
    averaged: true,
  };
}

/**
 * Stream model benchmark results for one or more prompts and provider routes.
 *
 * Each server-sent event contains either an individual run result or an averaged
 * summary for multi-round requests.
 */
export async function POST(request: NextRequest) {
  loadBenchmarkEnv();

  const body = (await request.json()) as BenchmarkRequest;
  const { runs, maxTokens = 200, options } = body;

  const prompts = Array.isArray(body.prompt) ? body.prompt : [body.prompt];
  const images = (body.images ?? []).map((image) => image.trim()).filter(Boolean);

  const firstPrompt = prompts[0];

  if (!firstPrompt || !runs?.length) {
    return NextResponse.json(
      { error: "prompt(s) and runs[] are required" },
      { status: 400 },
    );
  }

  const ai = createAI({
    app: { name: "Howells AI Benchmark", url: "https://github.com/howells/ai" },
  });

  const region = process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "local";
  const multiRound = prompts.length > 1;
  const optionsHash = benchmarkOptionsHash({ maxTokens, options, images });
  const pendingHistoryWrites: Promise<void>[] = [];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: BenchmarkResult, promptText: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        pendingHistoryWrites.push(
          persistBenchmarkResult({
            prompt: promptText,
            optionsHash,
            result: data,
          }).catch((error) => {
            console.warn("Failed to persist benchmark result:", error);
          }),
        );
      };

      if (!multiRound) {
        // Single prompt - fire all runs in parallel (original behavior)
        await Promise.all(
          runs.map((run) =>
            executeRun(
              ai,
              run,
              firstPrompt,
              images,
              maxTokens,
              region,
              options,
            ).then((result) => send(result, firstPrompt)),
          ),
        );
      } else {
        // Multi-round - run each prompt sequentially, all runs in parallel per round
        const allResults: Map<string, BenchmarkResult[]> = new Map();

        for (let round = 0; round < prompts.length; round++) {
          const promptForRound = prompts[round] ?? "";
          const roundResults = await Promise.all(
            runs.map((run) =>
              executeRun(
                ai,
                run,
                promptForRound,
                images,
                maxTokens,
                region,
                options,
                round,
              ),
            ),
          );

          // Stream each round's results
          for (const result of roundResults) {
            send(result, promptForRound);
            const key = `${result.provider}:${result.model}`;
            const existing = allResults.get(key) ?? [];
            existing.push(result);
            allResults.set(key, existing);
          }
        }

        // Send averaged summaries
        const averagedPrompt = prompts.join("\n\n---\n\n");
        for (const results of allResults.values()) {
          send(averageResults(results), averagedPrompt);
        }
      }

      await Promise.allSettled(pendingHistoryWrites);
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
