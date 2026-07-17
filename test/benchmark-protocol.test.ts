import { describe, expect, test } from "bun:test";
import {
  BenchmarkRunSpecSchema,
  BenchmarkStreamEventSchema,
} from "../apps/benchmark/lib/benchmark-contracts";
import { expandBenchmarkRun } from "../apps/benchmark/lib/benchmark-run";
import { createSseDecoder } from "../apps/benchmark/lib/sse";

const routes = [
  { id: "gateway-fast", model: "openai/gpt-5.4-mini", provider: "gateway" as const },
  { id: "openai-fast", model: "openai/gpt-5.4-mini", provider: "openai" as const },
  { id: "openrouter-fast", model: "openai/gpt-5.4-mini", provider: "openrouter" as const },
];

describe("BenchmarkRunSpec", () => {
  test("rejects unknown input and over-limit rigorous routes", () => {
    expect(() =>
      BenchmarkRunSpecSchema.parse({
        maxOutputTokens: 200,
        mode: "rigorous",
        requestKey: crypto.randomUUID(),
        routes: [...routes, { ...routes[0], id: "fourth" }],
        samples: 5,
        seed: 42,
        version: 1,
        unknown: true,
      }),
    ).toThrow();
  });

  test("expands rigorous runs into one warmup plus paired measured blocks", () => {
    const spec = BenchmarkRunSpecSchema.parse({
      maxOutputTokens: 200,
      mode: "rigorous",
      requestKey: crypto.randomUUID(),
      routes,
      samples: 5,
      seed: 42,
      version: 1,
    });
    const plan = expandBenchmarkRun(spec);

    expect(plan.jobs).toHaveLength(48);
    expect(plan.jobs.filter((job) => job.phase === "warmup")).toHaveLength(3);
    expect(plan.reservedAttempts).toBe(48);
    expect(expandBenchmarkRun(spec).jobs.map(({ id }) => id)).toEqual(
      plan.jobs.map(({ id }) => id),
    );
  });

  test("charges Explore fallback capacity conservatively", () => {
    const spec = BenchmarkRunSpecSchema.parse({
      maxOutputTokens: 100,
      mode: "explore",
      options: { fallbackModels: ["openai/gpt-5.4-mini", "google/gemini-3-flash"] },
      prompt: "Compare these routes",
      requestKey: crypto.randomUUID(),
      routes: routes.slice(0, 2),
      seed: 1,
      version: 1,
    });

    expect(expandBenchmarkRun(spec).reservedAttempts).toBe(6);
  });

  test("rejects duplicate routes and fallback models before quota expansion", () => {
    expect(() =>
      BenchmarkRunSpecSchema.parse({
        maxOutputTokens: 100,
        mode: "explore",
        options: { fallbackModels: ["openai/gpt-5.4-mini", "openai/gpt-5.4-mini"] },
        prompt: "Compare these routes",
        requestKey: crypto.randomUUID(),
        routes: [routes[0], { ...routes[0], id: "duplicate" }],
        seed: 1,
        version: 1,
      }),
    ).toThrow("Benchmark routes must be unique");
  });
});

describe("versioned benchmark stream", () => {
  test("carries requested model identity on provider errors", () => {
    const event = BenchmarkStreamEventSchema.parse({
      code: "provider/generation-failed",
      completedJobs: 1,
      phase: "measured",
      promptCaseId: "explore",
      provider: "openrouter",
      requestedModelId: "openai/gpt-5.4-mini",
      runId: crypto.randomUUID(),
      sampleId: "measured:explore:0:route-2",
      sampleIndex: 0,
      sequence: 2,
      type: "sample-error",
      version: 1,
    });

    expect(event.requestedModelId).toBe("openai/gpt-5.4-mini");
  });

  test("decodes fragmented validated events", () => {
    const decoder = createSseDecoder();
    const event = BenchmarkStreamEventSchema.parse({
      cohortHash: "a".repeat(64),
      runId: crypto.randomUUID(),
      sequence: 1,
      totalJobs: 2,
      type: "started",
      version: 1,
    });
    const encoded = `data: ${JSON.stringify(event)}\n\n`;

    expect(decoder.push(encoded.slice(0, 12))).toEqual([]);
    expect(decoder.push(encoded.slice(12))).toEqual([event]);
    expect(decoder.finish()).toEqual([]);
  });

  test("surfaces malformed protocol events", () => {
    const decoder = createSseDecoder();
    expect(() => decoder.push('data: {"type":"started"}\n\n')).toThrow(
      "Invalid benchmark stream event",
    );
  });
});
