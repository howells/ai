#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createAI, generateText, streamText } from "./index";
import {
  canRouteModelToProvider,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_TASKS,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_SERVICE_ENV_VARS,
  MODEL_TIERS,
  resolveProviderLanguageModelId,
  resolveProviderModelId,
} from "./models";
import type {
  LanguageModelVariant,
  ModelService,
  ModelTask,
  ModelTier,
  ProviderRoute,
} from "./types";

type Command = "help" | "models" | "providers" | "doctor" | "test" | "bench";

interface CliOptions {
  command: Command;
  json: boolean;
  schema: boolean;
  live: boolean;
  provider?: ProviderRoute;
  task?: ModelTask;
  tier?: ModelTier;
  variant?: LanguageModelVariant;
  model?: string;
  prompt: string;
  maxTokens: number;
}

interface ProviderStatus {
  provider: ProviderRoute | "voyage";
  configured: boolean;
  source: string;
}

interface ServiceStatus {
  service: ModelService;
  configured: boolean;
  source: string;
}

interface LanguageRun {
  provider: ProviderRoute;
  canonicalModelId: string;
  providerModelId: string;
  label: string;
}

interface SmokeResult {
  provider: ProviderRoute;
  model: string;
  label: string;
  ok: boolean;
  error?: string;
}

const LANGUAGE_PROVIDERS = [
  "gateway",
  "openrouter",
  "anthropic",
  "openai",
  "google",
  "deepseek",
  "xai",
  "qwen",
  "zai",
  "moonshotai",
] as const satisfies readonly ProviderRoute[];

const DEFAULT_PROMPT = "Reply with exactly OK.";

const ENV_FILES = [
  join(process.cwd(), ".env"),
  join(process.cwd(), ".env.local"),
  join(process.cwd(), "apps/benchmark/.env.local"),
];

function print(message = ""): void {
  process.stdout.write(`${message}\n`);
}

function printError(message: string): void {
  process.stderr.write(`${message}\n`);
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadLocalEnv(): void {
  for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = unquoteEnvValue(trimmed.slice(equalsIndex + 1));
      process.env[key] ??= value;
    }
  }
}

function readFlag(args: readonly string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);

  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function parseProvider(value: string | undefined): ProviderRoute | undefined {
  if (!value) return undefined;
  if ((LANGUAGE_PROVIDERS as readonly string[]).includes(value)) {
    return value as ProviderRoute;
  }
  throw new Error(`Unknown provider "${value}".`);
}

function parseTier(value: string | undefined): ModelTier | undefined {
  if (!value) return undefined;
  if ((MODEL_TIERS as readonly string[]).includes(value)) {
    return value as ModelTier;
  }
  throw new Error(`Unknown tier "${value}".`);
}

function parseTask(value: string | undefined): ModelTask | undefined {
  if (!value) return undefined;
  if ((LANGUAGE_MODEL_TASKS as readonly string[]).includes(value)) {
    return value as ModelTask;
  }
  throw new Error(`Unknown task "${value}".`);
}

function parseVariant(
  value: string | undefined,
): LanguageModelVariant | undefined {
  if (!value) return undefined;
  if ((LANGUAGE_MODEL_VARIANTS as readonly string[]).includes(value)) {
    return value as LanguageModelVariant;
  }
  throw new Error(`Unknown variant "${value}".`);
}

function parseCommand(value: string | undefined): Command {
  if (!value || value === "--help" || value === "-h") return "help";
  if (
    value === "models" ||
    value === "providers" ||
    value === "doctor" ||
    value === "test" ||
    value === "bench"
  ) {
    return value;
  }
  throw new Error(`Unknown command "${value}".`);
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const command = parseCommand(argv[0]);
  const maxTokens = Number(readFlag(argv, "--max-tokens") ?? "256");
  if (!Number.isFinite(maxTokens) || maxTokens < 1) {
    throw new Error("--max-tokens must be a positive number.");
  }

  return {
    command,
    json: hasFlag(argv, "--json"),
    schema: hasFlag(argv, "--schema"),
    live: hasFlag(argv, "--live"),
    provider: parseProvider(readFlag(argv, "--provider")),
    task: parseTask(readFlag(argv, "--task")),
    tier: parseTier(readFlag(argv, "--tier")),
    variant: parseVariant(readFlag(argv, "--variant")),
    model: readFlag(argv, "--model"),
    prompt: readFlag(argv, "--prompt") ?? DEFAULT_PROMPT,
    maxTokens,
  };
}

function table(rows: readonly object[]): string {
  if (rows.length === 0) return "";

  const columns = Object.keys(rows[0] ?? {});
  const valueFor = (row: object, column: string) =>
    Object.entries(row).find(([key]) => key === column)?.[1];
  const widths = columns.map((column) =>
    Math.max(
      column.length,
      ...rows.map((row) => String(valueFor(row, column) ?? "").length),
    ),
  );
  const line = columns
    .map((column, index) => column.padEnd(widths[index] ?? column.length))
    .join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows
    .map((row) =>
      columns
        .map((column, index) =>
          String(valueFor(row, column) ?? "").padEnd(
            widths[index] ?? column.length,
          ),
        )
        .join("  "),
    )
    .join("\n");

  return `${line}\n${divider}\n${body}`;
}

function json(data: unknown, success = true): void {
  print(
    JSON.stringify(
      {
        success,
        data,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

function errorJson(message: string, code: string): void {
  printError(
    JSON.stringify(
      {
        success: false,
        error: { code, message },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
  );
}

function help(): void {
  print(`@howells/ai CLI

Usage:
  ai models [--provider gateway|openrouter|anthropic|openai|google] [--task general|coding|agentic|chat|bulk|vision|reasoning|longContext|creative] [--json]
  ai providers [--json]
  ai doctor [--live] [--json]
  ai test [--provider <provider>] [--model <id>] [--json]
  ai bench [--provider <provider>] [--task <task>] [--model <id>] [--prompt "..."] [--json]
  ai <command> --schema

Commands:
  models     Print the provider-aware tier and capability matrix.
  providers  Show configured provider routes without revealing secrets.
  doctor     Validate local configuration; add --live for smoke calls.
  test       Run live smoke tests against configured provider/model routes.
  bench      Measure one streaming generation call with TTFT and throughput.

Agent surface:
  --json      Stable JSON envelope: { success, data, metadata }.
  --schema    Print command input/output schema as JSON.
  exit codes  0 success, 1 check failed, 64 usage error, 70 internal error.

Aliases:
  howells-ai is also installed as the same CLI.
`);
}

function commandSchema(command: Command): object {
  const sharedFlags = {
    json: { type: "boolean", description: "Emit a stable JSON envelope." },
    schema: { type: "boolean", description: "Emit command schema." },
  };

  const providerEnum = [...LANGUAGE_PROVIDERS];

  return {
    command,
    input: {
      type: "object",
      properties: {
        ...sharedFlags,
        provider: { enum: providerEnum },
        task: { enum: [...LANGUAGE_MODEL_TASKS] },
        tier: { enum: [...MODEL_TIERS] },
        variant: { enum: [...LANGUAGE_MODEL_VARIANTS] },
        model: { type: "string" },
        prompt: { type: "string" },
        maxTokens: { type: "number", minimum: 1 },
        live: { type: "boolean" },
      },
    },
    output: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        data: { type: "object" },
        metadata: {
          type: "object",
          properties: { timestamp: { type: "string", format: "date-time" } },
        },
      },
      required: ["success", "data", "metadata"],
    },
    exitCodes: {
      0: "success",
      1: "check failed",
      64: "usage error",
      70: "internal error",
    },
  };
}

function providerStatuses(): ProviderStatus[] {
  return [
    {
      provider: "gateway",
      configured: Boolean(process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_ENV),
      source: process.env.AI_GATEWAY_API_KEY
        ? "AI_GATEWAY_API_KEY"
        : process.env.VERCEL_ENV
          ? "VERCEL_ENV"
          : "-",
    },
    {
      provider: "openrouter",
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      source: process.env.OPENROUTER_API_KEY ? "OPENROUTER_API_KEY" : "-",
    },
    {
      provider: "anthropic",
      configured: Boolean(process.env.ANTHROPIC_API_KEY),
      source: process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "-",
    },
    {
      provider: "openai",
      configured: Boolean(process.env.OPENAI_API_KEY),
      source: process.env.OPENAI_API_KEY ? "OPENAI_API_KEY" : "-",
    },
    {
      provider: "google",
      configured: Boolean(process.env.GOOGLE_GEMINI_API_KEY),
      source: process.env.GOOGLE_GEMINI_API_KEY ? "GOOGLE_GEMINI_API_KEY" : "-",
    },
    {
      provider: "deepseek",
      configured: Boolean(process.env.DEEPSEEK_API_KEY),
      source: process.env.DEEPSEEK_API_KEY ? "DEEPSEEK_API_KEY" : "-",
    },
    {
      provider: "xai",
      configured: Boolean(process.env.XAI_API_KEY),
      source: process.env.XAI_API_KEY ? "XAI_API_KEY" : "-",
    },
    {
      provider: "qwen",
      configured: Boolean(process.env.QWEN_API_KEY),
      source: process.env.QWEN_API_KEY ? "QWEN_API_KEY" : "-",
    },
    {
      provider: "zai",
      configured: Boolean(process.env.ZAI_API_KEY),
      source: process.env.ZAI_API_KEY ? "ZAI_API_KEY" : "-",
    },
    {
      provider: "moonshotai",
      configured: Boolean(process.env.MOONSHOT_API_KEY),
      source: process.env.MOONSHOT_API_KEY ? "MOONSHOT_API_KEY" : "-",
    },
    {
      provider: "voyage",
      configured: Boolean(process.env.VOYAGE_API_KEY),
      source: process.env.VOYAGE_API_KEY ? "VOYAGE_API_KEY" : "-",
    },
  ];
}

function serviceStatuses(): ServiceStatus[] {
  return (Object.keys(MODEL_SERVICE_ENV_VARS) as ModelService[]).map(
    (service) => {
      const envVar = MODEL_SERVICE_ENV_VARS[service];
      return {
        service,
        configured: Boolean(process.env[envVar]),
        source: process.env[envVar] ? envVar : "-",
      };
    },
  );
}

function configuredLanguageProviders(): ProviderRoute[] {
  const ai = createAI();
  return ai.availableProviders.filter((provider) =>
    LANGUAGE_PROVIDERS.includes(provider),
  );
}

function configuredModelServices(): ModelService[] {
  return createAI().availableServices as ModelService[];
}

function modelRows(options: CliOptions) {
  const ai = createAI();
  const providers = options.provider ? [options.provider] : LANGUAGE_PROVIDERS;
  const task = options.task ?? "general";
  const tiers = options.tier ? [options.tier] : MODEL_TIERS;
  const variants = options.variant ? [options.variant] : LANGUAGE_MODEL_VARIANTS;

  return providers.flatMap((provider) =>
    tiers.flatMap((tier) =>
      variants.map((variant) => {
        const canonical = ai.matrix[tier][variant];
        const selected = resolveProviderLanguageModelId(
          ai.matrix,
          tier,
          variant,
          provider,
          task,
          ai.taskMatrix,
        );
        return {
          provider,
          task,
          tier,
          variant,
          canonical,
          selected,
          resolved: resolveProviderModelId(selected, provider),
        };
      }),
    ),
  );
}

function languageRuns(options: CliOptions): LanguageRun[] {
  const providers = options.provider
    ? [options.provider]
    : configuredLanguageProviders();
  const runs: LanguageRun[] = [];

  for (const model of LANGUAGE_MODEL_CATALOG) {
    if (options.model && model.id !== options.model) continue;

    for (const provider of providers) {
      if (!canRouteModelToProvider(model.id, provider)) continue;

      runs.push({
        provider,
        canonicalModelId: model.id,
        providerModelId: resolveProviderModelId(model.id, provider),
        label: model.name,
      });
    }
  }

  if (options.model && runs.length === 0) {
    const provider = options.provider ?? "gateway";
    runs.push({
      provider,
      canonicalModelId: options.model,
      providerModelId: resolveProviderModelId(options.model, provider),
      label: options.model,
    });
  }

  return runs;
}

function needsExplicitReasoning(modelId: string): boolean {
  return modelId === "openai/gpt-5-nano";
}

async function runSmoke(
  run: LanguageRun,
  prompt: string,
  maxTokens: number,
): Promise<SmokeResult> {
  const ai = createAI({
    app: { name: "Howells AI CLI", url: "https://github.com/howells/ai" },
  });

  try {
    const result = await generateText({
      model: ai.modelById(run.providerModelId, { provider: run.provider }),
      prompt,
      ...ai.generationOptions({
        provider: run.provider,
        modelId: run.canonicalModelId,
        maxOutputTokens: maxTokens,
        temperature: null,
        tools: "none",
        ...(needsExplicitReasoning(run.canonicalModelId)
          ? { reasoning: "minimal" }
          : {}),
      }),
    });

    const text = result.text.trim();
    return text
      ? {
          provider: run.provider,
          model: run.providerModelId,
          label: run.label,
          ok: true,
        }
      : {
          provider: run.provider,
          model: run.providerModelId,
          label: run.label,
          ok: false,
          error: "empty response",
        };
  } catch (error) {
    return {
      provider: run.provider,
      model: run.providerModelId,
      label: run.label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runLiveTests(options: CliOptions): Promise<SmokeResult[]> {
  const runs = languageRuns(options);
  if (runs.length === 0) {
    return [
      {
        provider: options.provider ?? "gateway",
        model: options.model ?? "-",
        label: "No configured provider/model routes",
        ok: false,
        error: "no configured language providers or routable models",
      },
    ];
  }

  const results: SmokeResult[] = [];

  for (const run of runs) {
    results.push(await runSmoke(run, options.prompt, options.maxTokens));
  }

  return results;
}

async function commandModels(options: CliOptions): Promise<number> {
  const rows = modelRows(options);
  if (options.json) {
    json(rows);
    return 0;
  }
  print(table(rows));
  return 0;
}

async function commandProviders(options: CliOptions): Promise<number> {
  const statuses = providerStatuses();
  const services = serviceStatuses();
  const availableProviders = configuredLanguageProviders();
  const availableModelServices = configuredModelServices();
  if (options.json) {
    json({
      providers: statuses,
      services,
      availableLanguageProviders: availableProviders,
      availableModelServices,
    });
    return 0;
  }
  print(table(statuses));
  print();
  print(table(services));
  print();
  print(
    `available language providers: ${
      availableProviders.length ? availableProviders.join(", ") : "none"
    }`,
  );
  print(
    `available model services: ${
      availableModelServices.length ? availableModelServices.join(", ") : "none"
    }`,
  );
  return 0;
}

async function commandDoctor(options: CliOptions): Promise<number> {
  const staticRows = modelRows(options);
  const staticFailures = staticRows.filter((row) => !row.resolved);
  const availableProviders = configuredLanguageProviders();

  if (!options.live) {
    const data = {
      ok: staticFailures.length === 0,
      availableLanguageProviders: availableProviders,
      providerStatuses: providerStatuses(),
      modelRoutes: staticRows.length,
      failures: staticFailures,
    };
    if (options.json) json(data, data.ok);
    else {
      print(data.ok ? "doctor: ok" : "doctor: failed");
      print(`model routes checked: ${data.modelRoutes}`);
      print(
        `available language providers: ${
          availableProviders.length ? availableProviders.join(", ") : "none"
        }`,
      );
    }
    return data.ok ? 0 : 1;
  }

  const results = await runLiveTests(options);
  const failures = results.filter((result) => !result.ok);
  const data = {
    ok: staticFailures.length === 0 && failures.length === 0,
    availableLanguageProviders: availableProviders,
    staticFailures,
    liveResults: results,
    failures,
  };

  if (options.json) json(data, data.ok);
  else {
    print(data.ok ? "doctor --live: ok" : "doctor --live: failed");
    print(table(results));
  }

  return data.ok ? 0 : 1;
}

async function commandTest(options: CliOptions): Promise<number> {
  const results = await runLiveTests(options);
  const failures = results.filter((result) => !result.ok);

  if (options.json) {
    const ok = failures.length === 0;
    json({ ok, results, failures }, ok);
  } else {
    print(table(results));
    print();
    print(failures.length === 0 ? "test: ok" : `test: ${failures.length} failed`);
  }

  return failures.length === 0 ? 0 : 1;
}

async function commandBench(options: CliOptions): Promise<number> {
  const ai = createAI({
    app: { name: "Howells AI CLI", url: "https://github.com/howells/ai" },
  });
  const provider =
    options.provider ?? configuredLanguageProviders()[0] ?? "gateway";
  const canonicalModelId =
    options.model ??
    resolveProviderLanguageModelId(
      ai.matrix,
      options.tier ?? "fast",
      options.variant ?? "text",
      provider,
      options.task ?? "general",
      ai.taskMatrix,
    );
  const providerModelId = resolveProviderModelId(canonicalModelId, provider);
  const start = performance.now();
  let ttft: number | undefined;
  let output = "";

  const result = streamText({
    model: ai.modelById(providerModelId, { provider }),
    prompt: options.prompt,
    ...ai.generationOptions({
      provider,
      modelId: canonicalModelId,
      maxOutputTokens: options.maxTokens,
      temperature: null,
      tools: "none",
      ...(needsExplicitReasoning(canonicalModelId) ? { reasoning: "minimal" } : {}),
    }),
  });

  for await (const delta of result.textStream) {
    ttft ??= performance.now() - start;
    output += delta;
  }

  const totalTime = performance.now() - start;
  const usage = await result.usage;
  const outputTokens = usage.outputTokens ?? 0;
  const data = {
    provider,
    model: providerModelId,
    ttftMs: Math.round(ttft ?? totalTime),
    totalMs: Math.round(totalTime),
    inputTokens: usage.inputTokens ?? 0,
    outputTokens,
    tokensPerSecond:
      totalTime > 0
        ? Math.round((outputTokens / (totalTime / 1000)) * 10) / 10
        : 0,
    output: output.trim(),
  };

  if (options.json) json(data);
  else print(table([data]));

  return output.trim() ? 0 : 1;
}

async function main(): Promise<number> {
  loadLocalEnv();
  const options = parseCliOptions(process.argv.slice(2));

  if (options.schema) {
    json(commandSchema(options.command));
    return 0;
  }

  switch (options.command) {
    case "help":
      help();
      return 0;
    case "models":
      return commandModels(options);
    case "providers":
      return commandProviders(options);
    case "doctor":
      return commandDoctor(options);
    case "test":
      return commandTest(options);
    case "bench":
      return commandBench(options);
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const isUsageError =
      message.startsWith("Unknown ") || message.startsWith("--max-tokens");
    if (process.argv.includes("--json")) {
      errorJson(message, isUsageError ? "usage_error" : "internal_error");
    } else {
      printError(message);
    }
    process.exitCode = isUsageError ? 64 : 70;
  });
