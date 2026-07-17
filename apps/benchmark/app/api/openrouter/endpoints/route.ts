import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "../../../../lib/api-errors";
import { requireBenchmarkSession } from "../../../../lib/benchmark-auth";
import { loadBenchmarkEnv } from "../../../../lib/server-env";

interface OpenRouterEndpoint {
  provider_name?: string;
  tag?: string;
  status?: number;
  uptime_last_5m?: number | null;
  uptime_last_30m?: number | null;
  latency_last_30m?: number | null;
  throughput_last_30m?: number | null;
}

interface OpenRouterEndpointResponse {
  data?: {
    id?: string;
    endpoints?: OpenRouterEndpoint[];
  };
}

/** Cache OpenRouter endpoint metadata briefly to keep sandbox validation responsive. */
export const revalidate = 60;

function endpointUrl(modelId: string): string {
  const cleanModelId = modelId.replace(/:(nitro|exacto|floor)$/, "");
  const encodedModelId = cleanModelId.split("/").map(encodeURIComponent).join("/");
  return `https://openrouter.ai/api/v1/models/${encodedModelId}/endpoints`;
}

/** Proxy OpenRouter endpoint metadata for one model ID. */
export async function GET(request: NextRequest) {
  loadBenchmarkEnv();
  try {
    await requireBenchmarkSession(request);
    const model = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[a-zA-Z0-9._:/-]+$/)
      .parse(request.nextUrl.searchParams.get("model"));

    const response = await fetch(endpointUrl(model), {
      headers: {
        Accept: "application/json",
      },
      next: { revalidate },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: {
            code: "openrouter/upstream-error",
            message: "OpenRouter metadata is unavailable.",
          },
        },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as OpenRouterEndpointResponse;
    const result = NextResponse.json({
      endpoints: payload.data?.endpoints ?? [],
      model: payload.data?.id ?? model,
    });
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "openrouter/invalid-model", message: "A valid model ID is required." } },
        { status: 422 },
      );
    }
    return apiErrorResponse(error);
  }
}
