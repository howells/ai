import { z } from "zod";

const integerFromEnvironment = (defaultValue: number, minimum: number, maximum: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : Number.parseInt(value, 10)))
    .pipe(z.number().int().min(minimum).max(maximum));

const EnvironmentSchema = z
  .object({
    BENCHMARK_ACTIVE_RUN_LIMIT: integerFromEnvironment(2, 1, 2),
    BENCHMARK_CANONICAL_ORIGIN: z.string().url().optional(),
    BENCHMARK_DAILY_ATTEMPT_LIMIT: integerFromEnvironment(500, 1, 100_000),
    BENCHMARK_HASH_KEY_VERSION: integerFromEnvironment(1, 1, 1000),
    BENCHMARK_HASH_SECRET: z.string().min(32),
    BENCHMARK_RUN_ATTEMPT_LIMIT: integerFromEnvironment(50, 1, 50),
    BENCHMARK_SESSION_PEPPER: z.string().min(32),
    BENCHMARK_SESSION_TTL_SECONDS: integerFromEnvironment(8 * 60 * 60, 300, 86_400),
    BENCHMARK_SHARED_SECRET: z.string().min(16),
    DATABASE_URL: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    POSTGRES_URL: z.string().url().optional(),
    VERCEL_ENV: z.string().optional(),
  })
  .passthrough()
  .refine((environment) => Boolean(environment.POSTGRES_URL ?? environment.DATABASE_URL), {
    message: "DATABASE_URL or POSTGRES_URL is required for the hosted benchmark",
  })
  .refine(
    (environment) =>
      (!environment.VERCEL_ENV && environment.NODE_ENV !== "production") ||
      Boolean(environment.BENCHMARK_CANONICAL_ORIGIN),
    {
      message: "BENCHMARK_CANONICAL_ORIGIN is required in hosted environments",
    },
  );

export interface BenchmarkPolicy {
  activeRunLimit: number;
  canonicalOrigin: string;
  dailyAttemptLimit: number;
  databaseUrl: string;
  hashKeyVersion: number;
  hashSecret: string;
  runAttemptLimit: number;
  secureCookies: boolean;
  sessionPepper: string;
  sessionTtlSeconds: number;
  sharedSecret: string;
}

export function parseBenchmarkPolicy(
  environment: Record<string, string | undefined>,
): BenchmarkPolicy {
  const parsed = EnvironmentSchema.parse(environment);
  const databaseUrl = parsed.POSTGRES_URL ?? parsed.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Benchmark database URL is required");
  }
  const hosted = Boolean(parsed.VERCEL_ENV) || parsed.NODE_ENV === "production";
  return {
    activeRunLimit: parsed.BENCHMARK_ACTIVE_RUN_LIMIT,
    canonicalOrigin: parsed.BENCHMARK_CANONICAL_ORIGIN ?? (hosted ? "" : "http://localhost:23010"),
    dailyAttemptLimit: parsed.BENCHMARK_DAILY_ATTEMPT_LIMIT,
    databaseUrl,
    hashKeyVersion: parsed.BENCHMARK_HASH_KEY_VERSION,
    hashSecret: parsed.BENCHMARK_HASH_SECRET,
    runAttemptLimit: parsed.BENCHMARK_RUN_ATTEMPT_LIMIT,
    secureCookies: hosted,
    sessionPepper: parsed.BENCHMARK_SESSION_PEPPER,
    sessionTtlSeconds: parsed.BENCHMARK_SESSION_TTL_SECONDS,
    sharedSecret: parsed.BENCHMARK_SHARED_SECRET,
  };
}

let cachedPolicy: BenchmarkPolicy | undefined;

/** Parse the server-only benchmark policy once after dotenv loading. */
export function getBenchmarkPolicy(): BenchmarkPolicy {
  cachedPolicy ??= parseBenchmarkPolicy(process.env);
  return cachedPolicy;
}
