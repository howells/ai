import {
  createAI,
  streamText,
  type ModelService,
  type ProviderRoute,
} from "@howells/ai";
import { type NextRequest, NextResponse } from "next/server";

/** Allow benchmark streams to run for up to five minutes. */
export const maxDuration = 300;

interface RunDef {
  model: string;
  provider: ProviderRoute;
  label?: string;
}

interface BenchmarkRequest {
  /** Single prompt (legacy) or array of prompts for multi-round averaging. */
  prompt: string | string[];
  runs: RunDef[];
  maxTokens?: number;
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
  output: string;
  error?: string;
  region: string;
  /** Which round this result is from (0-indexed). Only present in multi-round mode. */
  round?: number;
  /** Averaged result across all rounds. Only present on summary results. */
  averaged?: boolean;
}

export function GET() {
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
  maxTokens: number,
  region: string,
  round?: number,
): Promise<BenchmarkResult> {
  const label = run.label ?? `${run.provider}/${run.model}`;
  const start = performance.now();

  try {
    const model = ai.modelById(run.model, { provider: run.provider });
    const result = streamText({ model, prompt, maxOutputTokens: maxTokens });

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
    const outTokens = usage.outputTokens ?? 0;
    const inTokens = usage.inputTokens ?? 0;

    return {
      model: run.model,
      provider: run.provider,
      label,
      ttft: Math.round(ttft ?? totalTime),
      totalTime: Math.round(totalTime),
      outputTokens: outTokens,
      inputTokens: inTokens,
      tokensPerSecond:
        totalTime > 0
          ? Math.round((outTokens / (totalTime / 1000)) * 10) / 10
          : 0,
      output: output.slice(0, 500),
      region,
      round,
    };
  } catch (err) {
    const totalTime = performance.now() - start;
    return {
      model: run.model,
      provider: run.provider,
      label,
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

  return {
    model: firstValid.model,
    provider: firstValid.provider,
    label: firstValid.label,
    ttft: avg((r) => r.ttft),
    totalTime: avg((r) => r.totalTime),
    outputTokens: avg((r) => r.outputTokens),
    inputTokens: avg((r) => r.inputTokens),
    tokensPerSecond: avgTps,
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
  const body = (await request.json()) as BenchmarkRequest;
  const { runs, maxTokens = 200 } = body;

  const prompts = Array.isArray(body.prompt) ? body.prompt : [body.prompt];

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: BenchmarkResult) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      if (!multiRound) {
        // Single prompt - fire all runs in parallel (original behavior)
        await Promise.all(
          runs.map((run) =>
            executeRun(ai, run, firstPrompt, maxTokens, region).then(send),
          ),
        );
      } else {
        // Multi-round - run each prompt sequentially, all runs in parallel per round
        const allResults: Map<string, BenchmarkResult[]> = new Map();

        for (let round = 0; round < prompts.length; round++) {
          const promptForRound = prompts[round] ?? "";
          const roundResults = await Promise.all(
            runs.map((run) =>
              executeRun(ai, run, promptForRound, maxTokens, region, round),
            ),
          );

          // Stream each round's results
          for (const result of roundResults) {
            send(result);
            const key = `${result.provider}:${result.model}`;
            const existing = allResults.get(key) ?? [];
            existing.push(result);
            allResults.set(key, existing);
          }
        }

        // Send averaged summaries
        for (const results of allResults.values()) {
          send(averageResults(results));
        }
      }

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
