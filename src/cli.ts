#!/usr/bin/env node
/**
 * `howells-ai`: print the picks, or measure a model's latency across the
 * upstream providers OpenRouter routes it through.
 */

import { argv, stderr, stdout } from "node:process";

import { benchCompare, DEFAULT_BENCH_PROMPT, DEFAULT_ROUTE } from "./bench.ts";
import type { BenchCompareOptions, BenchComparison, BenchMetric } from "./bench.ts";
import { openRouterApiKey } from "./env.ts";
import { models, settings } from "./index.ts";
import type { Job, RequestSettings } from "./index.ts";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;

const isJob = (value: string): value is Job => Object.hasOwn(models, value);

const jobs = Object.keys(models).filter(isJob);

const HELP = `howells-ai - the best model for each job

Usage:
  howells-ai models [--json]
  howells-ai bench [--job <job> | --model <id>] [--routes a,b,c] [--runs N]
                   [--max-tokens N] [--metric total|ttft] [--prompt "..."] [--json]

Commands:
  models   Print each job's model and its request settings.
  bench    Measure streaming latency on OpenRouter. --routes pins one upstream
           provider per route, named by OpenRouter's provider slug; without it,
           one route through OpenRouter's own routing. --job sends that job's
           settings and defaults to agent.

Jobs: ${jobs.join(", ")}
Reads OPENROUTER_API_KEY from the environment, .env or .env.local.
Exit codes: 0 success, 1 measurement failed, 64 usage error, 70 internal error.
`;

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

interface ModelRow {
  job: Job;
  model: string;
  settings: string;
}

const print = (text = ""): void => {
  stdout.write(`${text}\n`);
};

const envelope = (data: readonly ModelRow[] | BenchComparison, success: boolean): string =>
  JSON.stringify({ data, metadata: { timestamp: new Date().toISOString() }, success }, null, 2);

const flag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${name} needs a value`);
  }
  return value;
};

const positiveInteger = (args: readonly string[], name: string): number | undefined => {
  const raw = flag(args, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new UsageError(`${name} must be a positive whole number`);
  }
  return value;
};

const table = (rows: readonly Record<string, string | number>[]): string => {
  const [first] = rows;
  if (first === undefined) {
    return "";
  }
  const columns = Object.keys(first);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    line(columns),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map((row) => line(columns.map((column) => String(row[column] ?? "")))),
  ].join("\n");
};

const commandModels = (json: boolean): number => {
  const rows: ModelRow[] = jobs.map((job) => ({
    job,
    model: models[job],
    settings: JSON.stringify(settings[job]),
  }));
  print(json ? envelope(rows, true) : table(rows.map((row) => ({ ...row }))));
  return EXIT_OK;
};

const parseMetric = (value: string | undefined): BenchMetric | undefined => {
  if (value === undefined || value === "total" || value === "ttft") {
    return value;
  }
  throw new UsageError("--metric must be total or ttft");
};

/** The model a bench run measures, and the settings its job carries. */
interface BenchTarget {
  modelId: string;
  settings?: RequestSettings;
}

const benchTarget = (args: readonly string[]): BenchTarget => {
  const job = flag(args, "--job");
  const model = flag(args, "--model");
  if (job !== undefined && model !== undefined) {
    throw new UsageError("Pass --job or --model, not both");
  }
  if (model !== undefined) {
    return { modelId: model };
  }
  const chosen = job ?? "agent";
  if (!isJob(chosen)) {
    throw new UsageError(`Unknown job ${chosen}. Jobs: ${jobs.join(", ")}`);
  }
  if (chosen === "embed") {
    throw new UsageError("bench measures chat models; embed has no streamed reply to time");
  }
  return { modelId: models[chosen], settings: settings[chosen] };
};

const benchOptions = (
  args: readonly string[],
  target: BenchTarget,
  apiKey: string,
): BenchCompareOptions => {
  const options: BenchCompareOptions = {
    ...target,
    apiKey,
    prompt: flag(args, "--prompt") ?? DEFAULT_BENCH_PROMPT,
    routes: flag(args, "--routes")
      ?.split(",")
      .map((route) => route.trim())
      .filter((route) => route !== "") ?? [DEFAULT_ROUTE],
  };
  const runs = positiveInteger(args, "--runs");
  if (runs !== undefined) {
    options.runs = runs;
  }
  const maxOutputTokens = positiveInteger(args, "--max-tokens");
  if (maxOutputTokens !== undefined) {
    options.maxOutputTokens = maxOutputTokens;
  }
  const metric = parseMetric(flag(args, "--metric"));
  if (metric !== undefined) {
    options.metric = metric;
  }
  return options;
};

const printComparison = (comparison: BenchComparison): void => {
  print(`model: ${comparison.modelId}`);
  print(
    table(
      comparison.results.map((result) => ({
        error: result.errors[0]?.slice(0, 60) ?? "",
        "iqr ms": result.statistics?.iqrTtftMs ?? "-",
        route: result.route,
        runs: result.statistics?.sampleCount ?? 0,
        served: result.samples[0]?.provider ?? "-",
        "tok/s": result.statistics?.medianOutputTokensPerSecond ?? "-",
        "total ms": result.statistics?.medianTotalMs ?? "-",
        "ttft ms": result.statistics?.medianTtftMs ?? "-",
      })),
    ),
  );
  if (comparison.results.length > 1) {
    const metric = comparison.metric === "ttft" ? "first token" : "total time";
    print();
    print(`fastest by ${metric}: ${comparison.fastest ?? "none"}`);
    if (comparison.metricDisagrees) {
      print("First token and total time disagree here, so the metric chose the winner.");
    }
  }
};

const commandBench = async (args: readonly string[], json: boolean): Promise<number> => {
  const target = benchTarget(args);
  const apiKey = openRouterApiKey();
  if (apiKey === undefined) {
    throw new UsageError("OPENROUTER_API_KEY is not set");
  }
  const comparison = await benchCompare(benchOptions(args, target, apiKey));
  const measured = comparison.results.some((result) => result.statistics !== undefined);
  if (json) {
    print(envelope(comparison, measured));
  } else {
    printComparison(comparison);
  }
  return measured ? EXIT_OK : EXIT_FAILED;
};

const main = async (args: readonly string[]): Promise<number> => {
  const json = args.includes("--json");
  const [command] = args;
  if (command === undefined || command === "help" || args.includes("--help")) {
    print(HELP);
    return EXIT_OK;
  }
  if (command === "models") {
    return commandModels(json);
  }
  if (command === "bench") {
    return await commandBench(args.slice(1), json);
  }
  throw new UsageError(`Unknown command ${command}. Run howells-ai --help.`);
};

const args = argv.slice(2);
try {
  process.exitCode = await main(args);
} catch (error) {
  const text = error instanceof Error ? error.message : String(error);
  const usage = error instanceof UsageError;
  const report = args.includes("--json")
    ? JSON.stringify(
        {
          error: { code: usage ? "usage_error" : "internal_error", message: text },
          success: false,
        },
        null,
        2,
      )
    : text;
  stderr.write(`${report}\n`);
  process.exitCode = usage ? EXIT_USAGE : EXIT_INTERNAL;
}
