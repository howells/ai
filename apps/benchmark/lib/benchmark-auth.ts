import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { BenchmarkApiError } from "./api-errors";
import { BENCHMARK_SESSION_COOKIE } from "./auth-constants";
import { hashPrivateValue, hashSessionToken, secretsEqual } from "./benchmark-crypto";
import { getBenchmarkSql } from "./benchmark-db";
import { getBenchmarkPolicy } from "./benchmark-policy";

interface SessionRow {
  id: string;
}

export interface CreatedBenchmarkSession {
  expiresAt: Date;
  token: string;
}

/** Authenticate the shared secret and create a revocable opaque session. */
export async function createBenchmarkSession(
  candidate: string,
  clientAddress: string,
): Promise<CreatedBenchmarkSession> {
  const policy = getBenchmarkPolicy();
  const sql = getBenchmarkSql();
  const principalHash = hashPrivateValue(clientAddress, policy.sessionPepper, "login-ip");
  const throttle = (await sql`
    SELECT failed_attempts, blocked_until
    FROM benchmark_login_throttle
    WHERE principal_hash = ${principalHash}
  `) as unknown as { failed_attempts: number; blocked_until: Date | string | null }[];
  const blockedUntil = throttle[0]?.blocked_until ? new Date(throttle[0].blocked_until) : undefined;
  if (blockedUntil && blockedUntil.getTime() > Date.now()) {
    throw new BenchmarkApiError(
      429,
      "auth/temporarily-blocked",
      "Too many sign-in attempts. Try again later.",
    );
  }

  if (!secretsEqual(candidate, policy.sharedSecret)) {
    await sql`
      INSERT INTO benchmark_login_throttle (
        principal_hash, failed_attempts, blocked_until, updated_at
      ) VALUES (${principalHash}, 1, NULL, now())
      ON CONFLICT (principal_hash) DO UPDATE SET
        failed_attempts = benchmark_login_throttle.failed_attempts + 1,
        blocked_until = CASE
          WHEN benchmark_login_throttle.failed_attempts + 1 >= 5
          THEN now() + interval '15 minutes'
          ELSE NULL
        END,
        updated_at = now()
    `;
    throw new BenchmarkApiError(401, "auth/invalid-secret", "The shared secret is invalid.");
  }

  await sql`DELETE FROM benchmark_login_throttle WHERE principal_hash = ${principalHash}`;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + policy.sessionTtlSeconds * 1000);
  await sql`
    INSERT INTO benchmark_sessions (id, token_digest, expires_at)
    VALUES (
      ${randomUUID()},
      ${hashSessionToken(token, policy.sessionPepper)},
      ${expiresAt.toISOString()}
    )
  `;
  return { expiresAt, token };
}

/** Verify an opaque session at the route or service boundary. */
export async function requireBenchmarkSession(request?: Request): Promise<SessionRow> {
  const cookieStore = request ? undefined : await cookies();
  const token = request
    ? readCookie(request.headers.get("cookie"), BENCHMARK_SESSION_COOKIE)
    : cookieStore?.get(BENCHMARK_SESSION_COOKIE)?.value;
  if (!token) {
    throw new BenchmarkApiError(401, "auth/session-required", "Sign in to continue.");
  }

  const policy = getBenchmarkPolicy();
  const rows = (await getBenchmarkSql()`
    SELECT id
    FROM benchmark_sessions
    WHERE token_digest = ${hashSessionToken(token, policy.sessionPepper)}
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1
  `) as unknown as SessionRow[];
  const session = rows[0];
  if (!session) {
    throw new BenchmarkApiError(401, "auth/session-expired", "Your session has expired.");
  }
  return session;
}

/** Revoke the current session if it exists. */
export async function revokeBenchmarkSession(request: Request): Promise<void> {
  const token = readCookie(request.headers.get("cookie"), BENCHMARK_SESSION_COOKIE);
  if (!token) {
    return;
  }
  const policy = getBenchmarkPolicy();
  await getBenchmarkSql()`
    UPDATE benchmark_sessions
    SET revoked_at = now()
    WHERE token_digest = ${hashSessionToken(token, policy.sessionPepper)}
  `;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
  return undefined;
}
