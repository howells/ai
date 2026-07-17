import { NextResponse } from "next/server";
import { apiErrorResponse, assertTrustedOrigin } from "../../../../lib/api-errors";
import { BENCHMARK_SESSION_COOKIE } from "../../../../lib/auth-constants";
import { revokeBenchmarkSession } from "../../../../lib/benchmark-auth";
import { getBenchmarkPolicy } from "../../../../lib/benchmark-policy";
import { loadBenchmarkEnv } from "../../../../lib/server-env";

export async function POST(request: Request) {
  loadBenchmarkEnv();
  try {
    const policy = getBenchmarkPolicy();
    assertTrustedOrigin(request, policy.canonicalOrigin);
    await revokeBenchmarkSession(request);
    const response = NextResponse.json({ authenticated: false });
    response.cookies.set(BENCHMARK_SESSION_COOKIE, "", {
      expires: new Date(0),
      httpOnly: true,
      path: "/",
      sameSite: "strict",
      secure: policy.secureCookies,
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return apiErrorResponse(error);
  }
}
