#!/usr/bin/env node
import { join } from "node:path";
import { loadDotenv } from "@howells/envy/dotenv";
import { createAI, generateText, streamText } from "./index";
import { envValue } from "./env";
import type { RuntimeEnvKey } from "./env";
import { isProviderRoute, PROVIDER_DEFINITIONS, PROVIDER_ROUTES } from "./providers/registry";
import { benchCompare } from "./bench";
import {
  compareModel,
  discountedModels,
  fetchGatewayCatalog,
  fetchOpenRouterCatalog,
  resolveCatalogId,
} from "./catalog";
import { auditAgainstCatalogs, roleDistribution, scanFleet, summariseUsage } from "./audit";
import { MODEL_DECISION_SET } from "./decisions";
import { LATENCY_CLASSES } from "./taxonomy";
import type { LatencyClass } from "./taxonomy";
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

type Command =
  | "help"
  | "models"
  | "providers"
  | "doctor"
  | "test"
  | "bench"
  | "catalog"
  | "compare"
  | "audit";

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
  /** Routes to measure in `bench`, in order. */
  routes?: readonly ProviderRoute[];
  /** Measured runs per route in `bench`. */
  runs: number;
  /** Include the per-model endpoint sweep that carries discounts. */
  discounts: boolean;
  /** Directory of repositories for `audit`. */
  root?: string;
  /** Show only discounted models in `catalog`. */
  discountedOnly: boolean;
  /** Latency class deciding which statistic ranks routes in `bench`. */
  latencyClass?: LatencyClass;
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

const LANGUAGE_PROVIDERS = PROVIDER_ROUTES;

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

function loadLocalEnv(): void {
  loadDotenv(ENV_FILES, { skipMissing: true });
}

function hasEnv(key: RuntimeEnvKey): boolean {
  return Boolean(envValue(key));
}

function envSource(key: RuntimeEnvKey): string {
  return envValue(key) ? key : "-";
}

function readFlag(args: readonly string[], name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = args.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) {
    return inline.slice(inlinePrefix.length);
  }

  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function parseProvider(value: string | undefined): ProviderRoute | undefined {
  if (!value) {
    return undefined;
  }
  if (isProviderRoute(value)) {
    return value as ProviderRoute;
  }
  throw new Error(`Unknown provider "${value}".`);
}

function parseTier(value: string | undefined): ModelTier | undefined {
  if (!value) {
    return undefined;
  }
  if ((MODEL_TIERS as readonly string[]).includes(value)) {
    return value as ModelTier;
  }
  throw new Error(`Unknown tier "${value}".`);
}

function parseTask(value: string | undefined): ModelTask | undefined {
  if (!value) {
    return undefined;
  }
  if ((LANGUAGE_MODEL_TASKS as readonly string[]).includes(value)) {
    return value as ModelTask;
  }
  throw new Error(`Unknown task "${value}".`);
}

function parseVariant(value: string | undefined): LanguageModelVariant | undefined {
  if (!value) {
    return undefined;
  }
  if ((LANGUAGE_MODEL_VARIANTS as readonly string[]).includes(value)) {
    return value as LanguageModelVariant;
  }
  throw new Error(`Unknown variant "${value}".`);
}

function parseCommand(value: string | undefined): Command {
  if (!value || value === "--help" || value === "-h") {
    return "help";
  }
  if (
    value === "models" ||
    value === "providers" ||
    value === "doctor" ||
    value === "test" ||
    value === "bench" ||
    value === "catalog" ||
    value === "compare" ||
    value === "audit"
  ) {
    return value;
  }
  throw new Error(`Unknown command "${value}".`);
}

function parseLatencyClass(value: string | undefined): LatencyClass | undefined {
  if (!value) {
    return undefined;
  }
  if ((LATENCY_CLASSES as readonly string[]).includes(value)) {
    return value as LatencyClass;
  }
  throw new Error(`Unknown latency class "${value}".`);
}

function parseRoutes(value: string | undefined): readonly ProviderRoute[] | undefined {
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      if (!isProviderRoute(entry)) {
        throw new Error(`Unknown provider "${entry}".`);
      }
      return entry as ProviderRoute;
    });
}

function parseCliOptions(argv: readonly string[]): CliOptions {
  const command = parseCommand(argv[0]);
  const maxTokens = Number(readFlag(argv, "--max-tokens") ?? "256");
  if (!Number.isFinite(maxTokens) || maxTokens < 1) {
    throw new Error("--max-tokens must be a positive number.");
  }
  const runs = Number(readFlag(argv, "--runs") ?? "3");
  if (!Number.isFinite(runs) || runs < 1) {
    throw new Error("--runs must be a positive number.");
  }

  return {
    command,
    discounts: hasFlag(argv, "--discounts"),
    discountedOnly: hasFlag(argv, "--discounted"),
    json: hasFlag(argv, "--json"),
    live: hasFlag(argv, "--live"),
    maxTokens,
    model: readFlag(argv, "--model"),
    prompt: readFlag(argv, "--prompt") ?? DEFAULT_PROMPT,
    provider: parseProvider(readFlag(argv, "--provider")),
    latencyClass: parseLatencyClass(readFlag(argv, "--latency")),
    root: readFlag(argv, "--root"),
    routes: parseRoutes(readFlag(argv, "--routes")),
    runs,
    schema: hasFlag(argv, "--schema"),
    task: parseTask(readFlag(argv, "--task")),
    tier: parseTier(readFlag(argv, "--tier")),
    variant: parseVariant(readFlag(argv, "--variant")),
  };
}

function table(rows: readonly object[]): string {
  if (rows.length === 0) {
    return "";
  }

  const columns = Object.keys(rows[0] ?? {});
  const valueFor = (row: object, column: string) =>
    Object.entries(row).find(([key]) => key === column)?.[1];
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(valueFor(row, column) ?? "").length)),
  );
  const line = columns
    .map((column, index) => column.padEnd(widths[index] ?? column.length))
    .join("  ");
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows
    .map((row) =>
      columns
        .map((column, index) =>
          String(valueFor(row, column) ?? "").padEnd(widths[index] ?? column.length),
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
        data,
        metadata: {
          timestamp: new Date().toISOString(),
        },
        success,
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
        error: { code, message },
        metadata: {
          timestamp: new Date().toISOString(),
        },
        success: false,
      },
      null,
      2,
    ),
  );
}

function help(): void {
  print(`@howells/ai CLI

Usage:
  ai models [--provider ${PROVIDER_ROUTES.join("|")}] [--task general|coding|agentic|chat|bulk|vision|reasoning|longContext|creative] [--json]
  ai providers [--json]
  ai doctor [--live] [--json]
  ai test [--provider <provider>] [--model <id>] [--json]
  ai bench [--provider <provider>] [--routes a,b,c] [--runs N] [--latency interactive|background|batch] [--task <task>] [--model <id>] [--prompt "..."] [--json]
  ai catalog [--discounted] [--json]
  ai compare [--model <id>] [--discounts] [--json]
  ai audit [--root <dir>] [--json]
  ai <command> --schema

Commands:
  models     Print the provider-aware tier and capability matrix.
  providers  Show configured provider routes without revealing secrets.
  doctor     Validate local configuration; add --live for smoke calls.
  test       Run live smoke tests against configured provider/model routes.
  bench      Measure streaming latency. With --routes, compare routes on one model.
  catalog    Fetch live router catalogues; --discounted lists active discounts.
  compare    Price the model catalogue across every router, discounts included.
  audit      Scan a directory of repos for pinned models and reconcile with the market.

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
    json: { description: "Emit a stable JSON envelope.", type: "boolean" },
    schema: { description: "Emit command schema.", type: "boolean" },
  };

  const providerEnum = [...LANGUAGE_PROVIDERS];

  return {
    command,
    exitCodes: {
      0: "success",
      1: "check failed",
      64: "usage error",
      70: "internal error",
    },
    input: {
      properties: {
        ...sharedFlags,
        live: { type: "boolean" },
        maxTokens: { minimum: 1, type: "number" },
        model: { type: "string" },
        prompt: { type: "string" },
        provider: { enum: providerEnum },
        task: { enum: [...LANGUAGE_MODEL_TASKS] },
        tier: { enum: [...MODEL_TIERS] },
        variant: { enum: [...LANGUAGE_MODEL_VARIANTS] },
      },
      type: "object",
    },
    output: {
      properties: {
        data: { type: "object" },
        metadata: {
          properties: { timestamp: { format: "date-time", type: "string" } },
          type: "object",
        },
        success: { type: "boolean" },
      },
      required: ["success", "data", "metadata"],
      type: "object",
    },
  };
}

/**
 * Provider configuration status, derived from the registry.
 *
 * Deriving rather than listing is deliberate: this file previously carried a
 * hand-written array that silently omitted any newly added route, which is the
 * same failure mode as a hand-maintained availability list.
 */
function providerStatuses(): ProviderStatus[] {
  const routes = PROVIDER_DEFINITIONS.map((definition): ProviderStatus => {
    const key = definition.environmentVariable as RuntimeEnvKey;
    // Gateway also authenticates via OIDC when running on Vercel.
    if (definition.id === "gateway") {
      return {
        configured: hasEnv(key) || hasEnv("VERCEL_ENV"),
        provider: "gateway",
        source: hasEnv(key) ? key : hasEnv("VERCEL_ENV") ? "VERCEL_ENV" : "-",
      };
    }
    return {
      configured: hasEnv(key),
      provider: definition.id as ProviderRoute,
      source: envSource(key),
    };
  });

  // Voyage serves embeddings and reranking only, so it is not a language route.
  return [
    ...routes,
    {
      configured: hasEnv("VOYAGE_API_KEY"),
      provider: "voyage",
      source: envSource("VOYAGE_API_KEY"),
    },
  ];
}

function serviceStatuses(): ServiceStatus[] {
  return Object.entries(MODEL_SERVICE_ENV_VARS).map(([service, envVar]) => ({
    configured: hasEnv(envVar as RuntimeEnvKey),
    service: service as ModelService,
    source: envSource(envVar as RuntimeEnvKey),
  }));
}

function configuredLanguageProviders(): ProviderRoute[] {
  const ai = createAI();
  return ai.availableProviders.filter((provider) => LANGUAGE_PROVIDERS.includes(provider));
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
          canonical,
          provider,
          resolved: resolveProviderModelId(selected, provider),
          selected,
          task,
          tier,
          variant,
        };
      }),
    ),
  );
}

function languageRuns(options: CliOptions): LanguageRun[] {
  const providers = options.provider ? [options.provider] : configuredLanguageProviders();
  const runs: LanguageRun[] = [];

  for (const model of LANGUAGE_MODEL_CATALOG) {
    if (options.model && model.id !== options.model) {
      continue;
    }

    for (const provider of providers) {
      if (!canRouteModelToProvider(model.id, provider)) {
        continue;
      }

      runs.push({
        canonicalModelId: model.id,
        label: model.name,
        provider,
        providerModelId: resolveProviderModelId(model.id, provider),
      });
    }
  }

  if (options.model && runs.length === 0) {
    const provider = options.provider ?? "gateway";
    runs.push({
      canonicalModelId: options.model,
      label: options.model,
      provider,
      providerModelId: resolveProviderModelId(options.model, provider),
    });
  }

  return runs;
}

function needsExplicitReasoning(modelId: string): boolean {
  return modelId === "openai/gpt-5-nano";
}

async function runSmoke(run: LanguageRun, prompt: string, maxTokens: number): Promise<SmokeResult> {
  const ai = createAI({
    app: { name: "Howells AI CLI", url: "https://github.com/howells/ai" },
  });

  try {
    const result = await generateText({
      model: ai.modelById(run.providerModelId, { provider: run.provider }),
      prompt,
      ...ai.generationOptions({
        maxOutputTokens: maxTokens,
        modelId: run.canonicalModelId,
        provider: run.provider,
        temperature: null,
        tools: "none",
        ...(needsExplicitReasoning(run.canonicalModelId) ? { reasoning: "minimal" } : {}),
      }),
    });

    const text = result.text.trim();
    return text
      ? {
          label: run.label,
          model: run.providerModelId,
          ok: true,
          provider: run.provider,
        }
      : {
          error: "empty response",
          label: run.label,
          model: run.providerModelId,
          ok: false,
          provider: run.provider,
        };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      label: run.label,
      model: run.providerModelId,
      ok: false,
      provider: run.provider,
    };
  }
}

async function runLiveTests(options: CliOptions): Promise<SmokeResult[]> {
  const runs = languageRuns(options);
  if (runs.length === 0) {
    return [
      {
        error: "no configured language providers or routable models",
        label: "No configured provider/model routes",
        model: options.model ?? "-",
        ok: false,
        provider: options.provider ?? "gateway",
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
      availableLanguageProviders: availableProviders,
      availableModelServices,
      providers: statuses,
      services,
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
      availableLanguageProviders: availableProviders,
      failures: staticFailures,
      modelRoutes: staticRows.length,
      ok: staticFailures.length === 0,
      providerStatuses: providerStatuses(),
    };
    if (options.json) {
      json(data, data.ok);
    } else {
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
    availableLanguageProviders: availableProviders,
    failures,
    liveResults: results,
    ok: staticFailures.length === 0 && failures.length === 0,
    staticFailures,
  };

  if (options.json) {
    json(data, data.ok);
  } else {
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
    json({ failures, ok, results }, ok);
  } else {
    print(table(results));
    print();
    print(failures.length === 0 ? "test: ok" : `test: ${failures.length} failed`);
  }

  return failures.length === 0 ? 0 : 1;
}

async function loadCatalogs(options: CliOptions) {
  const [openrouter, gateway] = await Promise.all([
    fetchOpenRouterCatalog({ includeEndpoints: options.discounts }),
    fetchGatewayCatalog(),
  ]);
  return { catalogs: [openrouter, gateway], gateway, openrouter };
}

function priceCell(
  price: { inputPerMillion: number; outputPerMillion: number } | undefined,
): string {
  return price ? `${price.inputPerMillion.toFixed(2)}/${price.outputPerMillion.toFixed(2)}` : "-";
}

async function commandCatalog(options: CliOptions): Promise<number> {
  const { catalogs, gateway, openrouter } = await loadCatalogs({ ...options, discounts: true });

  if (options.discountedOnly) {
    const rows = discountedModels(openrouter).map(({ endpoint, entry }) => ({
      model: entry.id,
      discount: `${Math.round(endpoint.discount * 100)}%`,
      upstream: endpoint.providerName,
      "usd/1M in/out": priceCell(endpoint.price),
      list: priceCell(entry.price),
      gateway: resolveCatalogId(entry.id, gateway) ? "yes" : "no",
    }));
    if (options.json) {
      json({ discounted: rows, fetchedAt: openrouter.fetchedAt });
    } else {
      print(table(rows));
      print();
      print(`catalog: ${rows.length} models discounted on OpenRouter`);
    }
    return 0;
  }

  const summary = catalogs.map((catalog) => ({
    router: catalog.router,
    models: catalog.entries.length,
    priced: catalog.entries.filter((entry) => entry.price).length,
    fetchedAt: catalog.fetchedAt,
  }));

  if (options.json) {
    json({ catalogs: summary });
  } else {
    print(table(summary));
  }
  return 0;
}

async function commandCompare(options: CliOptions): Promise<number> {
  const { catalogs } = await loadCatalogs(options);
  const modelIds = options.model
    ? [options.model]
    : LANGUAGE_MODEL_CATALOG.filter(
        (entry) => !("service" in entry && entry.service === "ollama"),
      ).map((entry) => entry.id);

  const comparisons = modelIds.map((modelId) => compareModel(modelId, catalogs));
  const rows = comparisons.map((comparison) => {
    const or = comparison.routes.openrouter;
    const gw = comparison.routes.gateway;
    return {
      model: comparison.canonicalId,
      openrouter: priceCell(or?.price),
      discount: or?.bestDiscount ? `${Math.round(or.bestDiscount.discount * 100)}%` : "",
      gateway: gw ? priceCell(gw.price) : "ABSENT",
      cheapest: comparison.cheapestRouter ?? "-",
      saving:
        comparison.savingAgainstDearest > 0.005
          ? `${Math.round(comparison.savingAgainstDearest * 100)}%`
          : "parity",
    };
  });

  if (options.json) {
    json({ comparisons, decisionSet: MODEL_DECISION_SET });
  } else {
    print(table(rows));
  }
  return 0;
}

async function commandAudit(options: CliOptions): Promise<number> {
  const root = options.root ?? join(process.cwd(), "..");
  const sites = await scanFleet({ root });
  const summaries = summariseUsage(sites);
  const { catalogs } = await loadCatalogs({ ...options, discounts: true });
  const findings = auditAgainstCatalogs(summaries, catalogs);
  const roles = roleDistribution(sites);

  if (options.json) {
    json({ findings, roles, root, sites: sites.length, summaries });
    return findings.length === 0 ? 0 : 1;
  }

  print("Model usage across the fleet");
  print(
    table(
      summaries.slice(0, 30).map((summary) => ({
        model: summary.modelId,
        sites: summary.siteCount,
        projects: summary.projects.length,
        roles: summary.roles
          .slice(0, 3)
          .map((entry) => `${entry.role}:${entry.count}`)
          .join(" "),
        routes: summary.routes.map((entry) => `${entry.route}:${entry.count}`).join(" "),
      })),
    ),
  );
  print();
  print("Workload roles");
  print(
    table(
      roles.map((row) => ({
        role: row.role,
        sites: row.count,
        models: row.models.length,
        modality: row.profile?.modality ?? "-",
        contract: row.profile?.contract ?? "-",
        latency: row.profile?.latency ?? "-",
        stakes: row.profile?.stakes ?? "-",
      })),
    ),
  );
  print();
  print("Findings");
  print(
    table(
      findings.map((finding) => ({
        model: finding.modelId,
        kind: finding.kind,
        sites: finding.siteCount,
        projects: finding.projects.slice(0, 4).join(","),
        detail: finding.detail,
      })),
    ),
  );
  print();
  print(
    `audit: ${sites.length} call sites, ${summaries.length} models, ${findings.length} findings`,
  );
  return findings.length === 0 ? 0 : 1;
}

async function commandBenchCompare(options: CliOptions, routes: readonly ProviderRoute[]) {
  const ai = createAI({
    app: { name: "Howells AI CLI", url: "https://github.com/howells/ai" },
  });
  const canonicalModelId =
    options.model ??
    resolveProviderLanguageModelId(
      ai.matrix,
      options.tier ?? "fast",
      options.variant ?? "text",
      routes[0] ?? "gateway",
      options.task ?? "general",
      ai.taskMatrix,
    );

  const comparison = await benchCompare({
    ai,
    maxOutputTokens: options.maxTokens,
    modelId: canonicalModelId,
    routes,
    runs: options.runs,
    ...(options.latencyClass ? { latencyClass: options.latencyClass } : {}),
    ...(options.prompt === DEFAULT_PROMPT ? {} : { prompt: options.prompt }),
  });

  if (options.json) {
    json(
      comparison,
      comparison.results.some((result) => result.statistics),
    );
  } else {
    print(
      table(
        comparison.results.map((result) => ({
          route: result.route,
          model: result.resolvedModelId,
          "total ms": result.statistics?.medianTotalMs ?? "-",
          "ttft ms": result.statistics?.medianTtftMs ?? "-",
          "iqr ms": result.statistics?.iqrTtftMs ?? "-",
          "tok/s": result.statistics?.medianOutputTokensPerSecond ?? "-",
          runs: result.statistics?.sampleCount ?? 0,
          error: result.errors[0]?.slice(0, 60) ?? "",
        })),
      ),
    );
    print();
    print(
      `ranked on:           ${comparison.metric === "ttft" ? "time to first token" : "total completion time"}`,
    );
    print(`recommended route:   ${comparison.fastest ?? "none"}`);
    print(`fastest first token: ${comparison.fastestByTtft ?? "none"}`);
    print(`fastest total time:  ${comparison.fastestByTotal ?? "none"}`);
    print(`fastest throughput:  ${comparison.fastestByThroughput ?? "none"}`);
    if (comparison.metricDisagrees) {
      print();
      print("note: TTFT and total time disagree here, so the metric chose the winner.");
    }
  }

  return comparison.results.some((result) => result.statistics) ? 0 : 1;
}

async function commandBench(options: CliOptions): Promise<number> {
  if (options.routes && options.routes.length > 0) {
    return await commandBenchCompare(options, options.routes);
  }

  const ai = createAI({
    app: { name: "Howells AI CLI", url: "https://github.com/howells/ai" },
  });
  const provider = options.provider ?? configuredLanguageProviders()[0] ?? "gateway";
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
      maxOutputTokens: options.maxTokens,
      modelId: canonicalModelId,
      provider,
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
    inputTokens: usage.inputTokens ?? 0,
    model: providerModelId,
    output: output.trim(),
    outputTokens,
    provider,
    tokensPerSecond: totalTime > 0 ? Math.round((outputTokens / (totalTime / 1000)) * 10) / 10 : 0,
    totalMs: Math.round(totalTime),
    ttftMs: Math.round(ttft ?? totalTime),
  };

  if (options.json) {
    json(data);
  } else {
    print(table([data]));
  }

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
    case "help": {
      help();
      return 0;
    }
    case "models": {
      return await commandModels(options);
    }
    case "providers": {
      return await commandProviders(options);
    }
    case "doctor": {
      return await commandDoctor(options);
    }
    case "test": {
      return await commandTest(options);
    }
    case "bench": {
      return await commandBench(options);
    }
    case "catalog": {
      return await commandCatalog(options);
    }
    case "compare": {
      return await commandCompare(options);
    }
    case "audit": {
      return await commandAudit(options);
    }
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const isUsageError = message.startsWith("Unknown ") || message.startsWith("--max-tokens");
    if (process.argv.includes("--json")) {
      errorJson(message, isUsageError ? "usage_error" : "internal_error");
    } else {
      printError(message);
    }
    process.exitCode = isUsageError ? 64 : 70;
  });
