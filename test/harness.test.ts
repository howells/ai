import { describe, expect, test } from "bun:test";
import { bestDiscountedEndpoint, compareModel, resolveCatalogId } from "../src/catalog";
import type { CatalogEntry, RouterCatalog } from "../src/catalog";
import { containsGrader, exactMatchGrader, jsonShapeGrader, keywordGrader } from "../src/eval";
import { MODEL_DECISION_SET, resolveDecision } from "../src/decisions";
import {
  classifyRole,
  exceedsStakesCeiling,
  preferenceForWorkload,
  rankingMetric,
  WORKLOAD_ROLES,
} from "../src/taxonomy";
import { canRouteModelToProvider, resolveProviderModelId } from "../src/models";
import { PROVIDER_ROUTES } from "../src/providers/registry";
import { auditAgainstCatalogs, roleDistribution, summariseUsage } from "../src/audit";
import type { FleetCallSite } from "../src/audit";

function entry(
  overrides: Partial<CatalogEntry> & Pick<CatalogEntry, "id" | "router">,
): CatalogEntry {
  return {
    name: overrides.id,
    price: { inputPerMillion: 1, outputPerMillion: 2 },
    contextLength: 128_000,
    inputModalities: ["text"],
    endpoints: [],
    ...overrides,
  };
}

function catalog(router: "openrouter" | "gateway", entries: CatalogEntry[]): RouterCatalog {
  return {
    router,
    fetchedAt: "2026-08-16T00:00:00.000Z",
    entries,
    byId: new Map(entries.map((item) => [item.id, item])),
  };
}

describe("resolveCatalogId", () => {
  const gateway = catalog("gateway", [
    entry({ id: "zai/glm-5.2", router: "gateway" }),
    entry({ id: "alibaba/qwen3.7-plus", router: "gateway" }),
    entry({ id: "anthropic/claude-sonnet-4.6", router: "gateway" }),
  ]);

  test("matches an identical id", () => {
    expect(resolveCatalogId("anthropic/claude-sonnet-4.6", gateway)).toBe(
      "anthropic/claude-sonnet-4.6",
    );
  });

  test("maps vendor prefixes that differ between routers", () => {
    expect(resolveCatalogId("z-ai/glm-5.2", gateway)).toBe("zai/glm-5.2");
    expect(resolveCatalogId("qwen/qwen3.7-plus", gateway)).toBe("alibaba/qwen3.7-plus");
  });

  test("treats a routing suffix as the base model", () => {
    expect(resolveCatalogId("z-ai/glm-5.2:nitro", gateway)).toBe("zai/glm-5.2");
  });

  test("returns undefined when the router does not serve the model", () => {
    expect(resolveCatalogId("anthropic/claude-fable-5", gateway)).toBeUndefined();
  });
});

describe("compareModel", () => {
  test("prefers the discounted endpoint when computing the effective price", () => {
    const openrouter = catalog("openrouter", [
      entry({
        id: "deepseek/deepseek-v4-pro",
        router: "openrouter",
        price: { inputPerMillion: 1.17, outputPerMillion: 2.34 },
        endpoints: [
          {
            providerName: "StreamLake",
            discount: 0.8,
            price: { inputPerMillion: 0.35, outputPerMillion: 0.7 },
            contextLength: 128_000,
          },
        ],
      }),
    ]);
    const gateway = catalog("gateway", [
      entry({
        id: "deepseek/deepseek-v4-pro",
        router: "gateway",
        price: { inputPerMillion: 1.74, outputPerMillion: 3.48 },
      }),
    ]);

    const comparison = compareModel("deepseek/deepseek-v4-pro", [openrouter, gateway]);
    expect(comparison.routes.openrouter?.effectiveInputPerMillion).toBe(0.35);
    expect(comparison.cheapestRouter).toBe("openrouter");
    expect(comparison.savingAgainstDearest).toBeCloseTo(1 - 0.35 / 1.74, 5);
  });

  test("reports parity when both routers price the same", () => {
    const entries = { inputPerMillion: 3, outputPerMillion: 15 };
    const comparison = compareModel("anthropic/claude-sonnet-4.6", [
      catalog("openrouter", [
        entry({ id: "anthropic/claude-sonnet-4.6", router: "openrouter", price: entries }),
      ]),
      catalog("gateway", [
        entry({ id: "anthropic/claude-sonnet-4.6", router: "gateway", price: entries }),
      ]),
    ]);
    expect(comparison.savingAgainstDearest).toBe(0);
  });
});

describe("bestDiscountedEndpoint", () => {
  test("returns the deepest discount and ignores undiscounted endpoints", () => {
    const withEndpoints = entry({
      id: "z-ai/glm-5.2",
      router: "openrouter",
      endpoints: [
        {
          providerName: "Full price",
          discount: 0,
          price: { inputPerMillion: 1.4, outputPerMillion: 4.4 },
          contextLength: 128_000,
        },
        {
          providerName: "StreamLake",
          discount: 0.78,
          price: { inputPerMillion: 0.31, outputPerMillion: 0.97 },
          contextLength: 128_000,
        },
      ],
    });
    expect(bestDiscountedEndpoint(withEndpoints)?.providerName).toBe("StreamLake");
    expect(bestDiscountedEndpoint(entry({ id: "x", router: "openrouter" }))).toBeUndefined();
  });
});

describe("eval graders", () => {
  test("exact match ignores case and surrounding space", () => {
    expect(exactMatchGrader("  Concrete  ", "concrete")).toBe(1);
    expect(exactMatchGrader("concrete slab", "concrete")).toBe(0);
  });

  test("contains looks anywhere in the output", () => {
    expect(containsGrader("The answer is concrete.", "concrete")).toBe(1);
  });

  test("keyword grader awards partial credit", () => {
    expect(keywordGrader("oak and steel", ["oak", "steel", "glass"])).toBeCloseTo(2 / 3, 5);
  });

  test("json shape grader reads fenced output and checks keys", () => {
    const output = '```json\n{"material":"oak","finish":"matte"}\n```';
    expect(jsonShapeGrader(output, { material: "oak", finish: null })).toBe(1);
    expect(jsonShapeGrader(output, { material: "steel", finish: null })).toBe(0.5);
    expect(jsonShapeGrader("not json", { material: "oak" })).toBe(0);
  });
});

describe("decisions", () => {
  test("carries a version and a review date", () => {
    expect(MODEL_DECISION_SET.version).toMatch(/^\d{4}\.\d{2}\.\d{2}(?:-\d+)?$/);
    expect(MODEL_DECISION_SET.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("layers task defaults over tier defaults", () => {
    const general = resolveDecision("standard", "text", "general");
    const coding = resolveDecision("standard", "text", "coding");
    expect(coding.modelId).not.toBe(general.modelId);
    expect(coding.decisionSet.version).toBe(MODEL_DECISION_SET.version);
  });
});

describe("fleet audit", () => {
  const sites: FleetCallSite[] = [
    {
      project: "alpha",
      file: "alpha/src/classify.ts",
      line: 4,
      modelId: "deepseek/deepseek-v4-flash",
      role: "extraction",
      route: "openrouter",
      evidence: 'const MODEL = "deepseek/deepseek-v4-flash";',
    },
    {
      project: "beta",
      file: "beta/src/classify.ts",
      line: 9,
      modelId: "deepseek/deepseek-v4-flash",
      role: "extraction",
      route: "openrouter",
      evidence: 'model: "deepseek/deepseek-v4-flash",',
    },
    {
      project: "beta",
      file: "beta/src/made-up.ts",
      line: 2,
      modelId: "google/gemini-imaginary",
      role: undefined,
      route: "unknown",
      evidence: 'model: "google/gemini-imaginary",',
    },
  ];

  test("groups call sites by model across projects", () => {
    const summaries = summariseUsage(sites);
    expect(summaries[0]?.modelId).toBe("deepseek/deepseek-v4-flash");
    expect(summaries[0]?.siteCount).toBe(2);
    expect(summaries[0]?.projects).toEqual(["alpha", "beta"]);
  });

  test("flags discounts and models no router serves", () => {
    const openrouter = catalog("openrouter", [
      entry({
        id: "deepseek/deepseek-v4-flash",
        router: "openrouter",
        endpoints: [
          {
            providerName: "StreamLake",
            discount: 0.56,
            price: { inputPerMillion: 0.06, outputPerMillion: 0.12 },
            contextLength: 128_000,
          },
        ],
      }),
    ]);

    const findings = auditAgainstCatalogs(summariseUsage(sites), [openrouter]);
    const kinds = findings.map((finding) => finding.kind);
    expect(kinds).toContain("discount-available");
    expect(kinds).toContain("unknown-model");
  });

  test("does not flag embedding models as missing", () => {
    const embedding: FleetCallSite = {
      project: "gamma",
      file: "gamma/src/embed.ts",
      line: 1,
      modelId: "openai/text-embedding-3-small",
      role: "embed",
      route: "openrouter",
      evidence: 'embed: "openai/text-embedding-3-small",',
    };
    const findings = auditAgainstCatalogs(summariseUsage([embedding]), [catalog("openrouter", [])]);
    expect(findings).toHaveLength(0);
  });
});

describe("workload taxonomy", () => {
  test("ranks interactive work on first token and everything else on total time", () => {
    expect(rankingMetric("interactive")).toBe("ttft");
    expect(rankingMetric("background")).toBe("total");
    expect(rankingMetric("batch")).toBe("total");
  });

  test("classifies roles from real fleet identifiers", () => {
    expect(classifyRole("packages/mastra/src/mcp/VISION_TRIAGE_OPENROUTER_MODEL")).toBe("triage");
    expect(classifyRole("packages/warehouse/src/normalise/measurement-extraction.ts")).toBe(
      "extraction",
    );
    expect(classifyRole("packages/mastra/src/scorers/canon-groundedness.ts")).toBe("judge");
    expect(classifyRole("packages/core/src/embed.ts")).toBe("embed");
    expect(classifyRole("apps/web/src/render-image-model.ts")).toBe("render");
    expect(classifyRole("server/src/tilde/cloud_tts.py")).toBe("speech");
    expect(classifyRole("nothing in particular here")).toBeUndefined();
  });

  test("every role carries a complete profile", () => {
    for (const [role, profile] of Object.entries(WORKLOAD_ROLES)) {
      expect(profile.modality, role).toBeTruthy();
      expect(profile.contract, role).toBeTruthy();
      expect(profile.latency, role).toBeTruthy();
      expect(profile.stakes, role).toBeTruthy();
    }
  });

  test("role distribution surfaces unnamed call sites as their own bucket", () => {
    const rows = roleDistribution([
      {
        project: "alpha",
        file: "alpha/src/embed.ts",
        line: 1,
        modelId: "openai/text-embedding-3-small",
        role: "embed",
        route: "openrouter",
        evidence: "",
      },
      {
        project: "alpha",
        file: "alpha/src/mystery.ts",
        line: 2,
        modelId: "google/gemini-3.5-flash",
        role: undefined,
        route: "gateway",
        evidence: "",
      },
    ]);
    expect(rows.map((row) => row.role)).toContain("unnamed");
    expect(rows.find((row) => row.role === "embed")?.profile?.modality).toBe("embed");
    expect(rows.find((row) => row.role === "unnamed")?.profile).toBeUndefined();
  });
});

describe("cerebras route", () => {
  test("is a first-class provider route", () => {
    expect(PROVIDER_ROUTES).toContain("cerebras");
  });

  test("maps canonical open-weight IDs onto Cerebras-native names", () => {
    expect(resolveProviderModelId("openai/gpt-oss-120b", "cerebras")).toBe("gpt-oss-120b");
    expect(resolveProviderModelId("qwen/qwen3-235b-a22b-2507", "cerebras")).toBe(
      "qwen-3-235b-a22b-instruct",
    );
    expect(canRouteModelToProvider("openai/gpt-oss-120b", "cerebras")).toBe(true);
  });

  test("does not claim models Cerebras cannot serve", () => {
    expect(canRouteModelToProvider("anthropic/claude-opus-4.8", "cerebras")).toBe(false);
  });
});

describe("route stakes ceiling", () => {
  test("flags open-weight-only routes for work that ships unreviewed", () => {
    expect(exceedsStakesCeiling("cerebras", "shipped")).toBe(true);
    expect(exceedsStakesCeiling("groq", "shipped")).toBe(true);
    expect(exceedsStakesCeiling("cerebras", "checked")).toBe(false);
    expect(exceedsStakesCeiling("cerebras", "draft")).toBe(false);
  });

  test("does not cap routes that carry frontier models", () => {
    expect(exceedsStakesCeiling("gateway", "shipped")).toBe(false);
    expect(exceedsStakesCeiling("openrouter", "shipped")).toBe(false);
    expect(exceedsStakesCeiling("anthropic", "shipped")).toBe(false);
  });
});

describe("routing preference", () => {
  test("prefers the cheapest upstream for batch work, where discounts live", () => {
    expect(preferenceForWorkload(WORKLOAD_ROLES.embed)).toBe("cheapest");
    expect(preferenceForWorkload(WORKLOAD_ROLES.triage)).toBe("cheapest");
  });

  test("prefers speed when a human is waiting", () => {
    expect(preferenceForWorkload(WORKLOAD_ROLES.converse)).toBe("fastest");
    expect(preferenceForWorkload(WORKLOAD_ROLES.decompose)).toBe("fastest");
  });

  test("leaves background work on the default route", () => {
    expect(preferenceForWorkload(WORKLOAD_ROLES.extraction)).toBe("auto");
    expect(preferenceForWorkload(WORKLOAD_ROLES.editorial)).toBe("auto");
  });
});
