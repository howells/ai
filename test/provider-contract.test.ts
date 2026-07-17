import { describe, expect, test } from "bun:test";
import { createAI, PROVIDER_DEFINITIONS, PROVIDER_ROUTES } from "../src";
import { createAIServer } from "../src/server";

describe("provider registry", () => {
  test("derives the public route order from provider definitions", () => {
    expect(PROVIDER_ROUTES).toEqual(PROVIDER_DEFINITIONS.map(({ id }) => id));
    expect(new Set(PROVIDER_ROUTES).size).toBe(PROVIDER_ROUTES.length);
  });

  test("does not infer Ollama from localhost", () => {
    const previous = process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_BASE_URL;
    try {
      const ai = createAI();
      expect(ai.availableProviders).not.toContain("ollama");
      expect(() => ai.modelById("qwen3", { provider: "ollama" })).toThrow("OLLAMA_BASE_URL");
    } finally {
      if (previous === undefined) {
        delete process.env.OLLAMA_BASE_URL;
      } else {
        process.env.OLLAMA_BASE_URL = previous;
      }
    }
  });
});

describe("model descriptor and connection", () => {
  test("descriptor is configuration-independent and serializes no credentials", () => {
    const descriptor = createAI({ openAIKey: "super-secret" }).modelDescriptor("openai/gpt-5.4", {
      provider: "openai",
    });

    expect(descriptor.provider).toBe("openai");
    expect(descriptor.canonicalId).toBe("openai/gpt-5.4");
    expect(descriptor.providerModelId).toBe("gpt-5.4");
    expect(descriptor.requiredEnvironmentVariables).toContain("OPENAI_API_KEY");
    expect(JSON.stringify(descriptor)).not.toContain("super-secret");
  });

  test("connection keeps credentials in an explicit nested object", () => {
    const ai = createAIServer({ openaiKey: "super-secret" });
    const connection = ai.modelConnection("openai/gpt-5.4", { provider: "openai" });

    expect(connection.credentials.apiKey).toBe("super-secret");
    expect(connection.providerModelId).toBe("gpt-5.4");
  });
});
