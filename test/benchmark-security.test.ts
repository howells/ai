import { describe, expect, test } from "bun:test";
import {
  hashPrivateValue,
  hashSessionToken,
  secretsEqual,
} from "../apps/benchmark/lib/benchmark-crypto";
import { parseBenchmarkPolicy } from "../apps/benchmark/lib/benchmark-policy";

describe("benchmark security primitives", () => {
  test("uses domain-separated keyed hashes", () => {
    const secret = "a".repeat(32);
    expect(hashPrivateValue("prompt", secret, "prompt")).not.toBe(
      hashPrivateValue("prompt", secret, "image"),
    );
    expect(hashSessionToken("token", secret)).not.toContain("token");
  });

  test("compares shared secrets without length-dependent equality", () => {
    expect(secretsEqual("correct horse", "correct horse")).toBe(true);
    expect(secretsEqual("correct horse", "wrong")).toBe(false);
  });
});

describe("benchmark policy", () => {
  test("parses conservative defaults", () => {
    const policy = parseBenchmarkPolicy({
      BENCHMARK_HASH_SECRET: "h".repeat(32),
      BENCHMARK_SESSION_PEPPER: "p".repeat(32),
      BENCHMARK_SHARED_SECRET: "s".repeat(16),
      DATABASE_URL: "postgres://localhost/benchmark",
      NODE_ENV: "development",
    });

    expect(policy.dailyAttemptLimit).toBe(500);
    expect(policy.runAttemptLimit).toBe(50);
    expect(policy.activeRunLimit).toBe(2);
    expect(policy.sessionTtlSeconds).toBe(8 * 60 * 60);
  });

  test("rejects missing database and weak secrets", () => {
    expect(() =>
      parseBenchmarkPolicy({
        BENCHMARK_HASH_SECRET: "short",
        BENCHMARK_SESSION_PEPPER: "short",
        BENCHMARK_SHARED_SECRET: "short",
      }),
    ).toThrow();
  });
});
