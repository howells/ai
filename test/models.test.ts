import { describe, expect, test } from "vitest";
import { z } from "zod";

import { models, settings } from "../src/index.ts";
import type { RequestSettings } from "../src/index.ts";

const jobs = ["agent", "embed", "extract", "judge", "reason", "triage", "vision", "write"];

// The AI SDK's provider-options value type. Settings must stay assignable to
// it, or `providerOptions: { openrouter: settings.agent }` stops compiling.
type JSONValue = null | string | number | boolean | JSONObject | JSONValue[];
interface JSONObject {
  [key: string]: JSONValue | undefined;
}
const asProviderOptions = (value: RequestSettings): JSONObject => value;

describe("the model lookup", () => {
  test("names exactly the eight jobs", () => {
    expect(Object.keys(models).toSorted()).toStrictEqual(jobs);
  });

  test("holds plain OpenRouter IDs with no routing prefix", () => {
    for (const id of Object.values(models)) {
      expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/u);
      expect(id.startsWith("openrouter/")).toBe(false);
    }
  });

  test("is frozen", () => {
    expect(Object.isFrozen(models)).toBe(true);
  });
});

describe("the request settings", () => {
  test("has an entry for every job and no others", () => {
    expect(Object.keys(settings).toSorted()).toStrictEqual(jobs);
  });

  test("is plain JSON data", () => {
    expect(z.json().safeParse(settings).success).toBe(true);
    expect(asProviderOptions(settings.vision)).toMatchObject({ reasoning: { effort: "low" } });
  });

  test("is frozen all the way down", () => {
    expect(Object.isFrozen(settings)).toBe(true);
    for (const value of Object.values(settings)) {
      expect(Object.isFrozen(value)).toBe(true);
      expect(value.reasoning === undefined || Object.isFrozen(value.reasoning)).toBe(true);
    }
  });

  test("keeps measured reasoning and pins language jobs to origin providers", () => {
    expect(settings.extract.reasoning).toStrictEqual({ enabled: false });
    expect(settings.vision.reasoning).toStrictEqual({ effort: "low" });
    expect(settings.embed).toStrictEqual({});
    for (const [job, value] of Object.entries(settings)) {
      if (job === "embed") {
        continue;
      }
      expect(value.provider).toStrictEqual({
        allow_fallbacks: false,
        only: ["openai", "anthropic"],
      });
      expect(Object.isFrozen(value.provider)).toBe(true);
      expect(Object.isFrozen(value.provider?.only)).toBe(true);
    }
  });
});
