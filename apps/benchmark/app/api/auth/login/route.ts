import { NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, assertTrustedOrigin } from "../../../../lib/api-errors";
import { BENCHMARK_SESSION_COOKIE } from "../../../../lib/auth-constants";
import { createBenchmarkSession } from "../../../../lib/benchmark-auth";
import { getBenchmarkPolicy } from "../../../../lib/benchmark-policy";
import { loadBenchmarkEnv } from "../../../../lib/server-env";

const LoginSchema = z.strictObject({ secret: z.string().min(1).max(4096) });

export async function POST(request: Request) {
  loadBenchmarkEnv();
  try {
    const policy = getBenchmarkPolicy();
    assertTrustedOrigin(request, policy.canonicalOrigin);
    const { secret } = LoginSchema.parse(await request.json());
    const clientAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const session = await createBenchmarkSession(secret, clientAddress);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(BENCHMARK_SESSION_COOKIE, session.token, {
      expires: session.expiresAt,
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: policy.secureCookies,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: "auth/invalid-request", message: "Enter the shared secret." } },
        { status: 400 },
      );
    }
    return apiErrorResponse(error);
  }
}
