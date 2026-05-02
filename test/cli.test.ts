import { describe, expect, test } from "bun:test";

const decoder = new TextDecoder();

function runCli(...args: string[]) {
  const result = Bun.spawnSync({
    cmd: ["bun", "src/cli.ts", ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_GATEWAY_API_KEY: "",
      OPENROUTER_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      OPENAI_API_KEY: "",
      GOOGLE_GEMINI_API_KEY: "",
      VOYAGE_API_KEY: "",
      DEEPSEEK_API_KEY: "",
      XAI_API_KEY: "",
      QWEN_API_KEY: "",
      ZAI_API_KEY: "",
      MOONSHOT_API_KEY: "",
      VERCEL_ENV: "",
    },
  });

  return {
    exitCode: result.exitCode,
    stdout: decoder.decode(result.stdout),
    stderr: decoder.decode(result.stderr),
  };
}

describe("CLI", () => {
  test("prints help", () => {
    const result = runCli("--help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ai models");
    expect(result.stdout).toContain("ai doctor");
  });

  test("prints model matrix JSON", () => {
    const result = runCli("models", "--provider", "openrouter", "--json");

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: Array<{
        provider: string;
        task: string;
        tier: string;
        variant: string;
        resolved: string;
      }>;
    };
    const data = response.data;

    expect(response.success).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((row) => row.provider === "openrouter")).toBe(true);
    expect(data.every((row) => row.task === "general")).toBe(true);
    expect(data.some((row) => row.resolved === "deepseek/deepseek-v3.2")).toBe(
      true,
    );
  });

  test("prints task-specific model matrix JSON", () => {
    const result = runCli(
      "models",
      "--provider",
      "openrouter",
      "--task",
      "coding",
      "--json",
    );

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: Array<{
        provider: string;
        task: string;
        tier: string;
        variant: string;
        resolved: string;
      }>;
    };
    const data = response.data;

    expect(response.success).toBe(true);
    expect(data.every((row) => row.task === "coding")).toBe(true);
    expect(data.some((row) => row.resolved === "moonshotai/kimi-k2.6")).toBe(
      true,
    );
  });

  test("prints provider status JSON without requiring keys", () => {
    const result = runCli("providers", "--json");

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: {
        providers: Array<{ provider: string; configured: boolean }>;
        services: Array<{ service: string; configured: boolean }>;
        availableLanguageProviders: string[];
        availableModelServices: string[];
      };
    };
    const data = response.data;

    expect(response.success).toBe(true);
    expect(data.providers.some((provider) => provider.provider === "openai")).toBe(
      true,
    );
    expect(data.providers.some((provider) => provider.provider === "xai")).toBe(
      true,
    );
    expect(data.providers.some((provider) => provider.provider === "moonshotai")).toBe(
      true,
    );
    expect(data.services.some((service) => service.service === "moonshotai")).toBe(
      true,
    );
    expect(data.availableLanguageProviders).toEqual([]);
    expect(data.availableModelServices).toEqual([]);
  });

  test("runs static doctor without requiring keys", () => {
    const result = runCli("doctor", "--json");

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: {
        ok: boolean;
        modelRoutes: number;
      };
    };
    const data = response.data;

    expect(response.success).toBe(true);
    expect(data.ok).toBe(true);
    expect(data.modelRoutes).toBeGreaterThan(0);
  });

  test("prints command schemas for agents", () => {
    const result = runCli("models", "--schema");

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: { command: string; exitCodes: Record<string, string> };
    };

    expect(response.success).toBe(true);
    expect(response.data.command).toBe("models");
    expect(response.data.exitCodes["64"]).toBe("usage error");
    expect(JSON.stringify(response.data)).toContain("task");
  });

  test("reports live test failure when no providers are configured", () => {
    const result = runCli("test", "--json");

    expect(result.exitCode).toBe(1);
    const response = JSON.parse(result.stdout) as {
      success: boolean;
      data: { ok: boolean; failures: Array<{ error?: string }> };
    };

    expect(response.success).toBe(false);
    expect(response.data.ok).toBe(false);
    expect(response.data.failures[0]?.error).toContain(
      "no configured language providers",
    );
  });
});
