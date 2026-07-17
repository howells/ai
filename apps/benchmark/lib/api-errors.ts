import { NextResponse } from "next/server";

export class BenchmarkApiError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "BenchmarkApiError";
    this.status = status;
  }
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof BenchmarkApiError) {
    const response = NextResponse.json(
      {
        error: {
          code: error.code,
          ...(error.details ? { details: error.details } : {}),
          message: error.message,
        },
      },
      { status: error.status },
    );
    response.headers.set("Cache-Control", "private, no-store");
    if (error.status === 429) {
      response.headers.set("Retry-After", "60");
    }
    return response;
  }
  const response = NextResponse.json(
    {
      error: {
        code: "benchmark/internal-error",
        message: "The benchmark request could not be completed.",
      },
    },
    { status: 500 },
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function assertTrustedOrigin(request: Request, canonicalOrigin: string): void {
  const origin = request.headers.get("origin");
  if (!origin || !canonicalOrigin || origin !== canonicalOrigin) {
    throw new BenchmarkApiError(403, "auth/origin-rejected", "Request origin was rejected.");
  }
}
