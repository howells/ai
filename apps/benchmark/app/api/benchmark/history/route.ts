import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse } from "../../../../lib/api-errors";
import { requireBenchmarkSession } from "../../../../lib/benchmark-auth";
import { loadCohortHistory } from "../../../../lib/benchmark-store";
import { loadBenchmarkEnv } from "../../../../lib/server-env";

export const maxDuration = 60;

const QuerySchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Return database-native aggregates for one exact authenticated cohort. */
export async function GET(request: Request) {
  loadBenchmarkEnv();
  try {
    await requireBenchmarkSession(request);
    const cohortHash = QuerySchema.parse(new URL(request.url).searchParams.get("cohort"));
    const response = NextResponse.json({
      cohortHash,
      rows: await loadCohortHistory(cohortHash),
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "history/invalid-cohort", message: "A valid cohort hash is required." } },
        { status: 422 },
      );
    }
    return apiErrorResponse(error);
  }
}
