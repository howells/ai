/**
 * Live router catalogues and cross-router price comparison.
 *
 * The tier matrix in `models.ts` is hand-maintained and drifts from the market
 * silently. This module is the corrective: it reads what the routers actually
 * serve right now — model availability, per-token price, active discounts —
 * and reconciles the same canonical model across every route.
 *
 * Nothing here is cached to disk. Callers that want a durable record should
 * persist the returned snapshot themselves.
 */

import { PROVIDER_ROUTES } from "./providers/registry";
import type { ProviderRoute } from "./types";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const GATEWAY_MODELS_URL = "https://ai-gateway.vercel.sh/v1/models";

/** Default concurrency for the per-model OpenRouter endpoint sweep. */
const ENDPOINT_FETCH_CONCURRENCY = 8;

/** Routers that publish a catalogue this module can read. */
export const CATALOG_ROUTERS = ["openrouter", "gateway"] as const;

/** A router whose catalogue can be fetched and compared. */
export type CatalogRouter = (typeof CATALOG_ROUTERS)[number];

/** Per-million-token prices, normalized across routers. */
export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
  /** USD per 1M cached-input tokens, when the router publishes one. */
  cachedInputPerMillion?: number;
}

/** One upstream provider serving a model behind OpenRouter. */
export interface OpenRouterEndpoint {
  /** Upstream provider name, e.g. "StreamLake". */
  providerName: string;
  /** Active discount as a fraction, 0 when none. */
  discount: number;
  /** Post-discount price actually charged at this endpoint. */
  price: ModelPrice;
  /** Context window this endpoint serves, which can differ per provider. */
  contextLength: number | undefined;
}

/** A model as one router currently serves it. */
export interface CatalogEntry {
  /** Router-native model ID. */
  id: string;
  /** Human-readable model name. */
  name: string;
  /** Router that serves it. */
  router: CatalogRouter;
  /** List price before any endpoint discount. */
  price: ModelPrice | undefined;
  /** Context window in tokens. */
  contextLength: number | undefined;
  /** Input modalities the router advertises. */
  inputModalities: readonly string[];
  /** Per-endpoint detail. OpenRouter only; empty for routers without one. */
  endpoints: readonly OpenRouterEndpoint[];
}

/** A router catalogue captured at one moment. */
export interface RouterCatalog {
  router: CatalogRouter;
  /** ISO timestamp of capture. */
  fetchedAt: string;
  entries: readonly CatalogEntry[];
  byId: ReadonlyMap<string, CatalogEntry>;
}

/** How one canonical model prices out across every router that serves it. */
export interface ModelComparison {
  /** Canonical (OpenRouter-style) model ID. */
  canonicalId: string;
  /** Per-router availability, resolved ID and price. */
  routes: Readonly<Record<CatalogRouter, CatalogRouteComparison | undefined>>;
  /** Router offering the lowest effective input price, undefined when unserved. */
  cheapestRouter: CatalogRouter | undefined;
  /**
   * Fractional saving of the cheapest router against the dearest, 0 at parity.
   * Computed on input price, which tracks output price closely enough to rank.
   */
  savingAgainstDearest: number;
}

/** One router's offer for a canonical model. */
export interface CatalogRouteComparison {
  /** Router-native ID this canonical model resolves to. */
  resolvedId: string;
  /** List price. */
  price: ModelPrice | undefined;
  /** Best discounted endpoint, when the router exposes discounts. */
  bestDiscount: OpenRouterEndpoint | undefined;
  /** Lowest input price actually obtainable, discount included. */
  effectiveInputPerMillion: number | undefined;
}

interface OpenRouterModelPayload {
  id: string;
  name: string;
  context_length?: number;
  architecture?: { input_modalities?: string[] };
  pricing?: Record<string, string>;
}

interface OpenRouterEndpointPayload {
  provider_name?: string;
  context_length?: number;
  pricing?: Record<string, string | number>;
}

interface GatewayModelPayload {
  id: string;
  name: string;
  type?: string;
  context_window?: number;
  modalities?: { input?: string[] };
  pricing?: Record<string, string>;
}

/**
 * Vercel Gateway namespaces some vendors differently from OpenRouter.
 * Maps an OpenRouter owner prefix to the Gateway owner prefixes to try.
 */
const GATEWAY_OWNER_ALIASES: Record<string, readonly string[]> = {
  "nex-agi": ["nex-agi"],
  "x-ai": ["xai"],
  "z-ai": ["zai"],
  qwen: ["alibaba", "qwen"],
};

function perMillion(value: string | number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const numeric = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return numeric * 1_000_000;
}

function openRouterPrice(
  pricing: Record<string, string | number> | undefined,
): ModelPrice | undefined {
  const input = perMillion(pricing?.prompt);
  const output = perMillion(pricing?.completion);
  if (input === undefined || output === undefined) {
    return undefined;
  }
  const cached = perMillion(pricing?.input_cache_read);
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    ...(cached === undefined ? {} : { cachedInputPerMillion: cached }),
  };
}

function gatewayPrice(pricing: Record<string, string> | undefined): ModelPrice | undefined {
  const input = perMillion(pricing?.input);
  const output = perMillion(pricing?.output);
  if (input === undefined || output === undefined) {
    return undefined;
  }
  const cached = perMillion(pricing?.input_cache_read);
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    ...(cached === undefined ? {} : { cachedInputPerMillion: cached }),
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal | undefined): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

function toCatalog(router: CatalogRouter, entries: readonly CatalogEntry[]): RouterCatalog {
  return {
    router,
    fetchedAt: new Date().toISOString(),
    entries,
    byId: new Map(entries.map((entry) => [entry.id, entry])),
  };
}

/** Options shared by catalogue fetches. */
export interface CatalogFetchOptions {
  signal?: AbortSignal;
}

/** Options for the OpenRouter catalogue fetch. */
export interface OpenRouterCatalogOptions extends CatalogFetchOptions {
  /**
   * Also sweep `/models/{slug}/endpoints` to populate per-provider pricing and
   * discounts. This is the only place OpenRouter serves the discount field, and
   * it costs one request per model — slow, so it is opt-in.
   */
  includeEndpoints?: boolean;
  /** Restrict the endpoint sweep to these model IDs. */
  onlyModelIds?: readonly string[];
  /** Parallel requests during the endpoint sweep. */
  concurrency?: number;
}

async function mapWithConcurrency<Input, Output>(
  items: readonly Input[],
  limit: number,
  worker: (item: Input) => Promise<Output>,
): Promise<Output[]> {
  const results = Array.from({ length: items.length }) as Output[];
  let cursor = 0;

  async function drain(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      results[index] = await worker(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, drain));
  return results;
}

async function fetchOpenRouterEndpoints(
  modelId: string,
  signal: AbortSignal | undefined,
): Promise<readonly OpenRouterEndpoint[]> {
  const payload = await fetchJson<{ data?: { endpoints?: OpenRouterEndpointPayload[] } }>(
    `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
    signal,
  );

  const endpoints = payload.data?.endpoints ?? [];
  return endpoints.flatMap((endpoint) => {
    const price = openRouterPrice(endpoint.pricing);
    if (!price) {
      return [];
    }
    const rawDiscount = endpoint.pricing?.discount;
    const discount = typeof rawDiscount === "number" ? rawDiscount : 0;
    return [
      {
        providerName: endpoint.provider_name ?? "unknown",
        discount,
        price,
        contextLength: endpoint.context_length,
      },
    ];
  });
}

/**
 * Fetch the live OpenRouter catalogue.
 *
 * With `includeEndpoints`, also sweeps every model's endpoint list so that
 * per-provider prices and active discounts are populated. That sweep is one
 * HTTP request per model.
 */
export async function fetchOpenRouterCatalog(
  options: OpenRouterCatalogOptions = {},
): Promise<RouterCatalog> {
  const payload = await fetchJson<{ data: OpenRouterModelPayload[] }>(
    OPENROUTER_MODELS_URL,
    options.signal,
  );

  const base = payload.data.map(
    (model): CatalogEntry => ({
      id: model.id,
      name: model.name,
      router: "openrouter",
      price: openRouterPrice(model.pricing),
      contextLength: model.context_length,
      inputModalities: model.architecture?.input_modalities ?? [],
      endpoints: [],
    }),
  );

  if (!options.includeEndpoints) {
    return toCatalog("openrouter", base);
  }

  const wanted = options.onlyModelIds ? new Set(options.onlyModelIds) : undefined;
  const targets = base.filter((entry) => !wanted || wanted.has(entry.id));
  const endpointLists = await mapWithConcurrency(
    targets,
    options.concurrency ?? ENDPOINT_FETCH_CONCURRENCY,
    async (entry) => {
      try {
        return await fetchOpenRouterEndpoints(entry.id, options.signal);
      } catch {
        // A single unreachable model must not void the whole catalogue.
        return [];
      }
    },
  );

  const endpointsById = new Map(
    targets.map((entry, index) => [entry.id, endpointLists[index] ?? []]),
  );
  const entries = base.map((entry) => ({
    ...entry,
    endpoints: endpointsById.get(entry.id) ?? entry.endpoints,
  }));

  return toCatalog("openrouter", entries);
}

/** Fetch the live Vercel AI Gateway catalogue. Language models only. */
export async function fetchGatewayCatalog(
  options: CatalogFetchOptions = {},
): Promise<RouterCatalog> {
  const payload = await fetchJson<{ data: GatewayModelPayload[] }>(
    GATEWAY_MODELS_URL,
    options.signal,
  );

  const entries = payload.data
    .filter((model) => model.type === undefined || model.type === "language")
    .map(
      (model): CatalogEntry => ({
        id: model.id,
        name: model.name,
        router: "gateway",
        price: gatewayPrice(model.pricing),
        contextLength: model.context_window,
        inputModalities: model.modalities?.input ?? [],
        endpoints: [],
      }),
    );

  return toCatalog("gateway", entries);
}

/**
 * Resolve a canonical model ID to the ID a router actually serves.
 *
 * Returns undefined when the router has no matching model, which is itself a
 * finding — it is how a stale hand-maintained availability list gets caught.
 */
export function resolveCatalogId(canonicalId: string, catalog: RouterCatalog): string | undefined {
  if (catalog.byId.has(canonicalId)) {
    return canonicalId;
  }

  // ":nitro", ":free", ":exacto" and friends select a routing policy, not a
  // different model. Resolve them against the base model.
  const colon = canonicalId.lastIndexOf(":");
  if (colon > 0) {
    const base = canonicalId.slice(0, colon);
    const resolved = resolveCatalogId(base, catalog);
    if (resolved) {
      return resolved;
    }
  }

  if (catalog.router === "openrouter") {
    return undefined;
  }

  const slash = canonicalId.indexOf("/");
  if (slash === -1) {
    return undefined;
  }

  const owner = canonicalId.slice(0, slash);
  const rest = canonicalId.slice(slash + 1);
  const owners = GATEWAY_OWNER_ALIASES[owner] ?? [owner];
  const normalized = rest.replaceAll(".", "-").toLowerCase();

  for (const candidate of owners) {
    if (catalog.byId.has(`${candidate}/${rest}`)) {
      return `${candidate}/${rest}`;
    }
  }

  for (const entry of catalog.entries) {
    const entrySlash = entry.id.indexOf("/");
    if (entrySlash === -1) {
      continue;
    }
    const entryOwner = entry.id.slice(0, entrySlash);
    const entryRest = entry.id.slice(entrySlash + 1);
    if (
      owners.includes(entryOwner) &&
      entryRest.replaceAll(".", "-").toLowerCase() === normalized
    ) {
      return entry.id;
    }
  }

  return undefined;
}

/** Pick the endpoint with the deepest active discount, if any. */
export function bestDiscountedEndpoint(entry: CatalogEntry): OpenRouterEndpoint | undefined {
  let best: OpenRouterEndpoint | undefined;
  for (const endpoint of entry.endpoints) {
    if (endpoint.discount > 0 && (!best || endpoint.discount > best.discount)) {
      best = endpoint;
    }
  }
  return best;
}

/** Compare one canonical model across a set of router catalogues. */
export function compareModel(
  canonicalId: string,
  catalogs: readonly RouterCatalog[],
): ModelComparison {
  const routes: Partial<Record<CatalogRouter, CatalogRouteComparison>> = {};

  for (const catalog of catalogs) {
    const resolvedId = resolveCatalogId(canonicalId, catalog);
    if (!resolvedId) {
      continue;
    }
    const entry = catalog.byId.get(resolvedId);
    if (!entry) {
      continue;
    }

    const bestDiscount = bestDiscountedEndpoint(entry);
    const listInput = entry.price?.inputPerMillion;
    const discountInput = bestDiscount?.price.inputPerMillion;
    const effectiveInputPerMillion =
      listInput === undefined
        ? discountInput
        : discountInput === undefined
          ? listInput
          : Math.min(listInput, discountInput);

    routes[catalog.router] = {
      resolvedId,
      price: entry.price,
      bestDiscount,
      effectiveInputPerMillion,
    };
  }

  const priced = Object.entries(routes).flatMap(([router, route]) =>
    route?.effectiveInputPerMillion === undefined
      ? []
      : [{ router: router as CatalogRouter, price: route.effectiveInputPerMillion }],
  );

  if (priced.length === 0) {
    return {
      canonicalId,
      routes: routes as ModelComparison["routes"],
      cheapestRouter: undefined,
      savingAgainstDearest: 0,
    };
  }

  let cheapest = priced[0] as { router: CatalogRouter; price: number };
  let dearest = cheapest;
  for (const candidate of priced) {
    if (candidate.price < cheapest.price) {
      cheapest = candidate;
    }
    if (candidate.price > dearest.price) {
      dearest = candidate;
    }
  }

  return {
    canonicalId,
    routes: routes as ModelComparison["routes"],
    cheapestRouter: cheapest.router,
    savingAgainstDearest: dearest.price > 0 ? 1 - cheapest.price / dearest.price : 0,
  };
}

/** Every model with an active discount, deepest first. */
export function discountedModels(
  catalog: RouterCatalog,
): readonly { entry: CatalogEntry; endpoint: OpenRouterEndpoint }[] {
  return catalog.entries
    .flatMap((entry) => {
      const endpoint = bestDiscountedEndpoint(entry);
      return endpoint ? [{ entry, endpoint }] : [];
    })
    .sort((a, b) => b.endpoint.discount - a.endpoint.discount);
}

/** True when the provider route has a fetchable catalogue. */
export function isCatalogRouter(route: ProviderRoute | string): route is CatalogRouter {
  return (CATALOG_ROUTERS as readonly string[]).includes(route);
}

/** Provider routes that carry no public catalogue and must be priced directly. */
export const DIRECT_ONLY_ROUTES = PROVIDER_ROUTES.filter((route) => !isCatalogRouter(route));
