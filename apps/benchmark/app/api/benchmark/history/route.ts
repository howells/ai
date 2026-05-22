import type { ProviderRoute } from "@howells/ai";
import { NextResponse, type NextRequest } from "next/server";
import { loadBenchmarkHistory } from "../../../../lib/benchmark-history";

/** Allow history aggregation enough time for remote serverless databases. */
export const maxDuration = 60;

/** Return historical benchmark summaries for the requested model/provider filters. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const models = parseCsv(searchParams.get("models"));
  const providers = parseCsv(searchParams.get("providers")) as ProviderRoute[];

  try {
    const history = await loadBenchmarkHistory({ models, providers });
    return NextResponse.json(history);
  } catch (error) {
    console.warn("Failed to load benchmark history:", error);
    return NextResponse.json({
      available: false,
      providers: [],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseCsv(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
