import { spawnSync } from "node:child_process";

import { describe, expect, test } from "vitest";
import { z } from "zod";

import { models } from "../src/index.ts";

const cli = (...args: string[]) =>
  spawnSync("node", ["src/cli.ts", ...args], { encoding: "utf-8" });

const modelsEnvelope = z.object({
  data: z.array(z.object({ job: z.string(), model: z.string(), settings: z.string() })),
  success: z.literal(true),
});

describe("howells-ai", () => {
  test("models --json prints every pick", () => {
    const result = cli("models", "--json");
    expect(result.status).toBe(0);
    const { data } = modelsEnvelope.parse(JSON.parse(result.stdout));
    expect(Object.fromEntries(data.map((row) => [row.job, row.model]))).toStrictEqual({
      ...models,
    });
  });

  test("bench refuses the embed job before reading a key", () => {
    const result = cli("bench", "--job", "embed");
    expect(result.status).toBe(64);
    expect(result.stderr).toContain("embed");
  });
});
