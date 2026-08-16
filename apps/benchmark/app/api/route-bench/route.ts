/**
 * Cross-route latency measurement, executed from Vercel infrastructure.
 *
 * The same `benchCompare` the CLI runs locally, moved inside the network the
 * production apps actually run in. Vercel AI Gateway is an in-network hop from
 * a Vercel function while every other router is a full internet round trip, so
 * a measurement taken on a laptop systematically understates Gateway and the
 * only honest comparison is one taken from here.
 *
 * Guarded by a shared secret because each call spends real provider quota.
 */

import { createAI } from "@howells/ai";
import { benchCompare } from "@howells/ai/bench";
import type { ProviderRoute } from "@howells/ai";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  /** Canonical model ID to measure. */
  model: z.string().min(1),
  /** Routes to compare, in order. */
  routes: z.array(z.string().min(1)).min(1).max(6),
  /** Measured runs per route, excluding the discarded warm-up. */
  runs: z.number().int().min(1).max(9).default(3),
  /** Output token ceiling per call. */
  maxOutputTokens: z.number().int().min(16).max(1024).default(120),
  /** Prompt override. Must match the local run or the comparison is void. */
  prompt: z.string().min(1).optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = process.env.ROUTE_BENCH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ROUTE_BENCH_SECRET is not configured on this deployment." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return unauthorized();
  }

  let input: z.infer<typeof RequestSchema>;
  try {
    input = RequestSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "invalid request" },
      { status: 400 },
    );
  }

  const ai = createAI({ app: { name: "route-bench", url: "https://github.com/howells/ai" } });

  const comparison = await benchCompare({
    ai,
    modelId: input.model,
    routes: input.routes as ProviderRoute[],
    runs: input.runs,
    maxOutputTokens: input.maxOutputTokens,
    ...(input.prompt ? { prompt: input.prompt } : {}),
  });

  return NextResponse.json({
    comparison,
    environment: {
      // Which Vercel region served this, so a result can be tied to a location.
      region: process.env.VERCEL_REGION ?? "unknown",
      vercelEnv: process.env.VERCEL_ENV ?? "local",
      // Gateway authenticates via OIDC on Vercel, without an explicit key.
      gatewayKeyPresent: Boolean(process.env.AI_GATEWAY_API_KEY),
      measuredAt: new Date().toISOString(),
    },
  });
}
