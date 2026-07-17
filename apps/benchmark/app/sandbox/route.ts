import { NextResponse } from "next/server";

export function GET(request: Request): NextResponse {
  return NextResponse.redirect(new URL("/explore", request.url), 308);
}
