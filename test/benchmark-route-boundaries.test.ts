import { beforeAll, describe, expect, test } from "bun:test";

beforeAll(() => {
  process.env.BENCHMARK_CANONICAL_ORIGIN = "https://benchmark.test";
  process.env.BENCHMARK_HASH_SECRET = "test-hash-secret-that-is-at-least-32-characters";
  process.env.BENCHMARK_SESSION_PEPPER = "test-session-pepper-at-least-32-characters";
  process.env.BENCHMARK_SHARED_SECRET = "test-shared-secret";
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
});

describe("benchmark route authorization boundaries", () => {
  test("rejects an untrusted mutation origin before session or database work", async () => {
    const { POST } = await import("../apps/benchmark/app/api/benchmark/route");
    const response = await POST(
      new Request("https://benchmark.test/api/benchmark", {
        body: "{}",
        headers: { "content-type": "application/json", origin: "https://attacker.test" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "auth/origin-rejected", message: "Request origin was rejected." },
    });
  });

  test("rejects a missing session before database or provider work", async () => {
    const { POST } = await import("../apps/benchmark/app/api/benchmark/route");
    const response = await POST(
      new Request("https://benchmark.test/api/benchmark", {
        body: "{}",
        headers: { "content-type": "application/json", origin: "https://benchmark.test" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "auth/session-required", message: "Sign in to continue." },
    });
  });
});
