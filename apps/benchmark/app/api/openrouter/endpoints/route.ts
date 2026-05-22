import { NextResponse, type NextRequest } from "next/server";

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
  const model = request.nextUrl.searchParams.get("model")?.trim();

  if (!model) {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }

  const response = await fetch(endpointUrl(model), {
    headers: {
      Accept: "application/json",
    },
    next: { revalidate },
  });

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `OpenRouter endpoints request failed: HTTP ${response.status}`,
      },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as OpenRouterEndpointResponse;
  return NextResponse.json({
    model: payload.data?.id ?? model,
    endpoints: payload.data?.endpoints ?? [],
  });
}
