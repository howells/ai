import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { BENCHMARK_SESSION_COOKIE } from "./lib/auth-constants";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (
    path === "/login" ||
    path === "/sandbox" ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/_next/") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  if (!request.cookies.has(BENCHMARK_SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
