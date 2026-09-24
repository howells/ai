import { describe, expect, test } from "vitest";
import { z } from "zod";

import { models } from "../src/index.ts";

const catalogueSchema = z.object({
  data: z.array(z.object({ expiration_date: z.string().nullish(), id: z.string() })),
});

const catalogue = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  const body: unknown = await response.json();
  return catalogueSchema.parse(body).data;
};

// Live: a pick OpenRouter has dropped, or has scheduled to drop, fails here
// before it fails in a consuming repo.
describe("every pick on OpenRouter", () => {
  test("is listed and has no expiration date", async () => {
    const [chat, embeddings] = await Promise.all([
      catalogue("https://openrouter.ai/api/v1/models"),
      catalogue("https://openrouter.ai/api/v1/embeddings/models"),
    ]);
    const byId = new Map([...chat, ...embeddings].map((entry) => [entry.id, entry]));
    const problems = Object.entries(models).flatMap(([job, id]) => {
      const entry = byId.get(id);
      if (entry === undefined) {
        return [`${job}: ${id} is not listed`];
      }
      if (entry.expiration_date !== null && entry.expiration_date !== undefined) {
        return [`${job}: ${id} expires ${entry.expiration_date}`];
      }
      return [];
    });
    expect(problems).toStrictEqual([]);
  }, 30_000);
});
