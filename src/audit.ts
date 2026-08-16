/**
 * Fleet model-usage audit.
 *
 * The tier matrix claims to be "chosen from actual usage across 40+ projects".
 * Nothing verified that claim, because nothing could see the fleet. This module
 * walks a directory of repositories, finds every place a model ID is pinned,
 * infers what job it is doing, and reconciles the result against the live
 * router catalogues.
 *
 * The output is a taxonomy: which models do which work, on which route, in
 * which project — and where that disagrees with what the market now offers.
 */

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { bestDiscountedEndpoint, compareModel, resolveCatalogId } from "./catalog";
import type { CatalogRouter, ModelComparison, RouterCatalog } from "./catalog";
import { classifyRole, WORKLOAD_ROLE_NAMES, WORKLOAD_ROLES } from "./taxonomy";
import type { WorkloadRole } from "./taxonomy";

/** Directory names never worth walking. */
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);

/** File extensions that can carry a pinned model ID. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".py"]);

/**
 * Models that are not language models. They never appear in a router's
 * language catalogue, so a lookup miss says nothing about their health.
 */
const NON_LANGUAGE_MODEL_PATTERN =
  /embedding|\bemb\b|rerank|whisper|-tts\b|tts-|voxtral|orpheus|kokoro/i;

/** Vendor prefixes that mark a string as a model ID rather than a package path. */
const MODEL_OWNERS = [
  "ai21",
  "alibaba",
  "amazon",
  "anthropic",
  "baidu",
  "cohere",
  "deepseek",
  "google",
  "inception",
  "meta-llama",
  "minimax",
  "mistralai",
  "moonshotai",
  "nex-agi",
  "nvidia",
  "openai",
  "perplexity",
  "qwen",
  "stepfun",
  "tencent",
  "x-ai",
  "xai",
  "xiaomi",
  "z-ai",
  "zai",
] as const;

/**
 * Package paths that share a vendor prefix with a model ID and must not be
 * mistaken for one. `google/protobuf` is not a model.
 */
const NOT_MODEL_IDS = new Set([
  "google/genai",
  "google/generative-ai",
  "google/go",
  "google/go-cmp",
  "google/go-github",
  "google/protobuf",
  "google/rpc",
  "google/snappy",
  "google/uuid",
  "openai/agents",
  "openai/v1",
  "microsoft/api-extractor",
]);

const MODEL_ID_PATTERN = new RegExp(
  `^(${MODEL_OWNERS.join("|")})/[a-zA-Z0-9][a-zA-Z0-9._-]{1,60}(?::[a-z-]+)?$`,
);

/** Loose scan used only to decide whether a file is worth parsing line by line. */
const MODEL_ID_HINT = new RegExp(`(${MODEL_OWNERS.join("|")})/`);

/** Quoted string literals, single, double or backtick, without interpolation. */
const QUOTED_STRING_PATTERN = /(["'`])([^"'`\\\n]{3,120})\1/g;

/** Tails that prove a `vendor/tail` string is a path or a version, not a model. */
const NON_MODEL_TAIL_PATTERN =
  /^(?:v?\d+\.\d+|dist|src|lib|types|build|node_modules)$|\.(?:json|js|ts|md|py|ya?ml|lock|txt|html)$/i;

/**
 * Decide whether a quoted string is a model ID.
 *
 * Model IDs are written as complete string literals. Package paths, file paths
 * and version directories share the `vendor/name` shape but never appear as a
 * whole quoted string on their own, so requiring a full-string match removes
 * almost all of them; the tail check removes the rest.
 */
function isModelId(candidate: string): boolean {
  if (!MODEL_ID_PATTERN.test(candidate) || NOT_MODEL_IDS.has(candidate)) {
    return false;
  }
  const tail = candidate.slice(candidate.indexOf("/") + 1);
  return !NON_MODEL_TAIL_PATTERN.test(tail);
}

/** Route a call site uses, inferred from the surrounding module. */
export type InferredRoute = CatalogRouter | "direct" | "cerebras" | "unknown";

/** One place in the fleet where a model ID is pinned. */
export interface FleetCallSite {
  /** Repository directory name. */
  project: string;
  /** Path relative to the scan root. */
  file: string;
  /** 1-indexed line number. */
  line: number;
  /** The model ID as written. */
  modelId: string;
  /**
   * Workload role inferred from file path and surrounding code, or undefined
   * when nothing in the source names the job. An undefined role is a finding
   * in itself: it marks a call site whose purpose is not written down.
   */
  role: WorkloadRole | undefined;
  /** Route inferred from the module's imports and environment reads. */
  route: InferredRoute;
  /** The source line, trimmed — evidence for the classification. */
  evidence: string;
}

/** Options for a fleet scan. */
export interface FleetScanOptions {
  /** Directory containing the repositories to scan. */
  root: string;
  /** Repository directory names to skip. */
  skipProjects?: readonly string[];
  /** Maximum bytes to read from any one file. */
  maxFileBytes?: number;
}

function classifyRoute(fileContent: string): InferredRoute {
  if (/cerebras/i.test(fileContent)) {
    return "cerebras";
  }
  if (/@openrouter\/ai-sdk-provider|openrouter\.ai\/api|OPENROUTER_API_KEY/.test(fileContent)) {
    return "openrouter";
  }
  if (
    /@ai-sdk\/gateway|ai-gateway\.vercel\.sh|AI_GATEWAY_API_KEY|createGateway/.test(fileContent)
  ) {
    return "gateway";
  }
  if (
    /@ai-sdk\/(anthropic|openai|google)|@anthropic-ai\/sdk|@google\/gen(ai|erative-ai)|api\.(anthropic|openai)\.com/.test(
      fileContent,
    )
  ) {
    return "direct";
  }
  return "unknown";
}

async function* walk(directory: string): AsyncGenerator<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) {
        continue;
      }
      yield* walk(full);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      yield full;
    }
  }
}

/** Walk a directory of repositories and collect every pinned model ID. */
export async function scanFleet(options: FleetScanOptions): Promise<readonly FleetCallSite[]> {
  const skip = new Set(options.skipProjects);
  const maxBytes = options.maxFileBytes ?? 512_000;
  const projects = await readdir(options.root, { withFileTypes: true });
  const sites: FleetCallSite[] = [];

  for (const project of projects) {
    if (!project.isDirectory() || skip.has(project.name) || SKIP_DIRECTORIES.has(project.name)) {
      continue;
    }

    const projectRoot = join(options.root, project.name);
    for await (const file of walk(projectRoot)) {
      let content: string;
      try {
        content = await readFile(file, "utf-8");
      } catch {
        continue;
      }
      if (content.length > maxBytes) {
        continue;
      }
      if (!MODEL_ID_HINT.test(content)) {
        continue;
      }

      const route = classifyRoute(content);
      const relativeFile = relative(options.root, file);
      const lines = content.split("\n");

      for (const [index, lineText] of lines.entries()) {
        for (const match of lineText.matchAll(QUOTED_STRING_PATTERN)) {
          const modelId = match[2];
          if (!modelId || !isModelId(modelId)) {
            continue;
          }

          sites.push({
            project: project.name,
            file: relativeFile,
            line: index + 1,
            modelId,
            role: classifyRole(`${relativeFile.split(sep).join(" ")} ${lineText}`),
            route,
            evidence: lineText.trim().slice(0, 200),
          });
        }
      }
    }
  }

  return sites;
}

/** Aggregated view of one model's role across the fleet. */
export interface ModelUsageSummary {
  modelId: string;
  /** Number of pinned call sites. */
  siteCount: number;
  /** Projects pinning it, alphabetical. */
  projects: readonly string[];
  /** Workload roles it serves, most frequent first. */
  roles: readonly { role: WorkloadRole | "unnamed"; count: number }[];
  /** Routes it is reached through, most frequent first. */
  routes: readonly { route: InferredRoute; count: number }[];
}

function tally<Key extends string>(values: readonly Key[]): { key: Key; count: number }[] {
  const counts = new Map<Key, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

/** Collapse call sites into a per-model taxonomy. */
export function summariseUsage(sites: readonly FleetCallSite[]): readonly ModelUsageSummary[] {
  const byModel = new Map<string, FleetCallSite[]>();
  for (const site of sites) {
    const existing = byModel.get(site.modelId);
    if (existing) {
      existing.push(site);
    } else {
      byModel.set(site.modelId, [site]);
    }
  }

  return [...byModel.entries()]
    .map(([modelId, modelSites]) => ({
      modelId,
      siteCount: modelSites.length,
      projects: [...new Set(modelSites.map((site) => site.project))].sort(),
      roles: tally(modelSites.map((site) => site.role ?? ("unnamed" as const))).map(
        ({ key, count }) => ({ role: key, count }),
      ),
      routes: tally(modelSites.map((site) => site.route)).map(({ key, count }) => ({
        route: key,
        count,
      })),
    }))
    .sort((a, b) => b.siteCount - a.siteCount);
}

/** A concrete, actionable disagreement between fleet usage and the live market. */
export interface AuditFinding {
  modelId: string;
  kind: "unknown-model" | "discount-available" | "cheaper-route" | "route-unavailable";
  /** One-line statement of the finding. */
  detail: string;
  /** Projects affected. */
  projects: readonly string[];
  /** Call sites affected. */
  siteCount: number;
}

/**
 * Reconcile fleet usage against live router catalogues.
 *
 * Every finding names a model the fleet actually pins, so the output is a
 * work list rather than a market report.
 */
export function auditAgainstCatalogs(
  summaries: readonly ModelUsageSummary[],
  catalogs: readonly RouterCatalog[],
): readonly AuditFinding[] {
  const findings: AuditFinding[] = [];
  const openRouter = catalogs.find((catalog) => catalog.router === "openrouter");

  for (const summary of summaries) {
    const comparison: ModelComparison = compareModel(summary.modelId, catalogs);
    const served = Object.values(comparison.routes).filter(Boolean).length;

    if (served === 0) {
      // Embedding and speech models are absent from the language-model
      // catalogues by design, so their absence is not a finding.
      if (NON_LANGUAGE_MODEL_PATTERN.test(summary.modelId)) {
        continue;
      }
      findings.push({
        modelId: summary.modelId,
        kind: "unknown-model",
        detail: "Pinned in code but served by no router catalogue — renamed, retired, or a typo.",
        projects: summary.projects,
        siteCount: summary.siteCount,
      });
      continue;
    }

    const openRouterEntry = openRouter
      ? openRouter.byId.get(resolveCatalogId(summary.modelId, openRouter) ?? "")
      : undefined;
    const discount = openRouterEntry ? bestDiscountedEndpoint(openRouterEntry) : undefined;
    if (discount) {
      findings.push({
        modelId: summary.modelId,
        kind: "discount-available",
        detail: `${Math.round(discount.discount * 100)}% off via ${discount.providerName} — $${discount.price.inputPerMillion.toFixed(2)}/$${discount.price.outputPerMillion.toFixed(2)} per 1M.`,
        projects: summary.projects,
        siteCount: summary.siteCount,
      });
    }

    const dominantRoute = summary.routes[0]?.route;
    if (
      comparison.cheapestRouter &&
      dominantRoute &&
      dominantRoute !== comparison.cheapestRouter &&
      (dominantRoute === "openrouter" || dominantRoute === "gateway") &&
      comparison.savingAgainstDearest > 0.05
    ) {
      findings.push({
        modelId: summary.modelId,
        kind: "cheaper-route",
        detail: `Pinned to ${dominantRoute}; ${comparison.cheapestRouter} is ${Math.round(comparison.savingAgainstDearest * 100)}% cheaper on input tokens.`,
        projects: summary.projects,
        siteCount: summary.siteCount,
      });
    }

    if (dominantRoute === "gateway" && !comparison.routes.gateway) {
      findings.push({
        modelId: summary.modelId,
        kind: "route-unavailable",
        detail: "Routed through Gateway but absent from the Gateway catalogue.",
        projects: summary.projects,
        siteCount: summary.siteCount,
      });
    }
  }

  return findings;
}

/** One workload role as the fleet actually exercises it. */
export interface RoleDistributionRow {
  role: WorkloadRole | "unnamed";
  count: number;
  models: readonly string[];
  /** Modality, contract, latency class and stakes; undefined for "unnamed". */
  profile: (typeof WORKLOAD_ROLES)[WorkloadRole] | undefined;
}

/**
 * Workload distribution across the fleet, for taxonomy design.
 *
 * Includes an "unnamed" bucket. A large unnamed count means the source does
 * not say what its model calls are for, which is worth fixing before any
 * routing decision is made on top of it.
 */
export function roleDistribution(sites: readonly FleetCallSite[]): readonly RoleDistributionRow[] {
  const keys = [...WORKLOAD_ROLE_NAMES, "unnamed" as const];
  return keys
    .map((role) => {
      const matching = sites.filter((site) => (site.role ?? "unnamed") === role);
      return {
        role,
        count: matching.length,
        models: [...new Set(matching.map((site) => site.modelId))].sort(),
        profile: role === "unnamed" ? undefined : WORKLOAD_ROLES[role],
      };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}
