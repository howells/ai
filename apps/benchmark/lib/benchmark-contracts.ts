import { isProviderRoute } from "@howells/ai";
import type { ProviderRoute } from "@howells/ai";
import { z } from "zod";

export const BENCHMARK_PROTOCOL_VERSION = 1 as const;

export type BenchmarkRunState =
  | "idle"
  | "reserving"
  | "running"
  | "cancelling"
  | "complete"
  | "partial"
  | "failed"
  | "cancelled"
  | "quota-blocked";

export type BenchmarkJobState =
  | "queued"
  | "warming"
  | "measuring"
  | "success"
  | "error"
  | "cancelled";

const ProviderRouteSchema = z.custom<ProviderRoute>(isProviderRoute, {
  message: "Unknown provider route",
});

const RouteSchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:-]+$/),
  label: z.string().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(200),
  provider: ProviderRouteSchema,
  reasoning: z.enum(["off", "low", "medium", "high"]).optional(),
  routeProvider: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .optional(),
});

const OptionsSchema = z.strictObject({
  cache: z.boolean().optional(),
  fallbackModels: z.array(z.string().trim().min(1).max(200)).max(2).optional(),
  responseHealing: z.boolean().optional(),
  serviceTier: z.enum(["auto", "standard", "flex", "priority"]).optional(),
  webSearch: z.boolean().optional(),
});

const common = {
  images: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(20 * 1024 * 1024),
    )
    .max(4)
    .optional(),
  maxOutputTokens: z.number().int().min(1).max(4096),
  requestKey: z.string().uuid(),
  retrySampleIds: z.array(z.string().min(1).max(300)).max(50).optional(),
  seed: z.number().int().min(0).max(2_147_483_647),
  version: z.literal(BENCHMARK_PROTOCOL_VERSION),
};

const RigorousRunSpecSchema = z.strictObject({
  ...common,
  mode: z.literal("rigorous"),
  routes: z.array(RouteSchema).min(1).max(3),
  samples: z.number().int().min(3).max(10),
});

const ExploreRunSpecSchema = z.strictObject({
  ...common,
  mode: z.literal("explore"),
  options: OptionsSchema.optional(),
  prompt: z.string().trim().min(1).max(32_768),
  routes: z.array(RouteSchema).min(1).max(4),
});

export const BenchmarkRunSpecSchema = z
  .discriminatedUnion("mode", [RigorousRunSpecSchema, ExploreRunSpecSchema])
  .superRefine((spec, context) => {
    const routeIds = new Set<string>();
    const routeSignatures = new Set<string>();
    for (const [index, route] of spec.routes.entries()) {
      const signature = JSON.stringify([
        route.provider,
        route.model,
        route.reasoning,
        route.routeProvider,
      ]);
      if (routeIds.has(route.id) || routeSignatures.has(signature)) {
        context.addIssue({
          code: "custom",
          message: "Benchmark routes must be unique",
          path: ["routes", index],
        });
      }
      routeIds.add(route.id);
      routeSignatures.add(signature);
    }
    if (spec.mode === "explore") {
      const fallbacks = spec.options?.fallbackModels ?? [];
      if (new Set(fallbacks).size !== fallbacks.length) {
        context.addIssue({
          code: "custom",
          message: "Fallback models must be unique",
          path: ["options", "fallbackModels"],
        });
      }
    }
  });

export type BenchmarkRunSpec = z.infer<typeof BenchmarkRunSpecSchema>;
export type BenchmarkRouteSpec = z.infer<typeof RouteSchema>;

const eventBase = {
  runId: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  version: z.literal(BENCHMARK_PROTOCOL_VERSION),
};

const sampleIdentity = {
  sampleId: z.string().min(1).max(300),
};

export const BenchmarkStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...eventBase,
    cohortHash: z.string().regex(/^[a-f0-9]{64}$/),
    totalJobs: z.number().int().positive(),
    type: z.literal("started"),
  }),
  z.strictObject({
    ...eventBase,
    ...sampleIdentity,
    completedJobs: z.number().int().nonnegative(),
    costMicros: z.number().int().nonnegative().optional(),
    generationDurationMs: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    output: z.string(),
    outputTokens: z.number().int().nonnegative(),
    phase: z.enum(["warmup", "measured"]),
    promptCaseId: z.string().min(1).max(120),
    provider: ProviderRouteSchema,
    providerModelId: z.string(),
    requestedModelId: z.string().min(1).max(200),
    sampleIndex: z.number().int().nonnegative(),
    totalDurationMs: z.number().int().nonnegative(),
    ttftMs: z.number().int().nonnegative(),
    type: z.literal("sample-result"),
  }),
  z.strictObject({
    ...eventBase,
    ...sampleIdentity,
    code: z.string().min(1).max(100),
    completedJobs: z.number().int().nonnegative(),
    phase: z.enum(["warmup", "measured"]),
    promptCaseId: z.string().min(1).max(120),
    provider: ProviderRouteSchema,
    requestedModelId: z.string().min(1).max(200),
    sampleIndex: z.number().int().nonnegative(),
    type: z.literal("sample-error"),
  }),
  z.strictObject({
    ...eventBase,
    completedJobs: z.number().int().nonnegative(),
    type: z.literal("heartbeat"),
  }),
  z.strictObject({
    ...eventBase,
    attemptedJobs: z.number().int().nonnegative(),
    type: z.literal("cancelled"),
  }),
  z.strictObject({
    ...eventBase,
    attemptedJobs: z.number().int().nonnegative(),
    failedJobs: z.number().int().nonnegative(),
    successfulJobs: z.number().int().nonnegative(),
    type: z.literal("completed"),
  }),
]);

export type BenchmarkStreamEvent = z.infer<typeof BenchmarkStreamEventSchema>;
export type BenchmarkStreamEventPayload = BenchmarkStreamEvent extends infer Event
  ? Event extends BenchmarkStreamEvent
    ? Omit<Event, "runId" | "sequence" | "version">
    : never
  : never;

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
    message: z.string().min(1),
  }),
});
