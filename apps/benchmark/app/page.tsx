"use client";

import {
  canRouteModelToProvider,
  DEFAULT_MODELS,
  LANGUAGE_MODEL_CATALOG,
  LANGUAGE_MODEL_VARIANTS,
  MODEL_TIERS,
  resolveProviderModelId,
} from "@howells/ai/models";
import type {
  LanguageModelVariant,
  ModelTier,
  ProviderRoute,
} from "@howells/ai";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// -- Types ------------------------------------------------------------

interface Run {
  id: string;
  model: string;
  provider: ProviderRoute;
  label?: string;
}

interface BenchmarkResult {
  model: string;
  provider: ProviderRoute;
  label: string;
  ttft: number;
  totalTime: number;
  outputTokens: number;
  inputTokens: number;
  tokensPerSecond: number;
  output: string;
  error?: string;
  region: string;
  round?: number;
  averaged?: boolean;
}

interface BenchmarkConfig {
  availableProviders: ProviderRoute[];
}

// -- Model catalogue --------------------------------------------------

interface ModelDef {
  /** Canonical package model ID */
  id: string;
  /** Display name */
  name: string;
  /** Default tier/capability slots that use this model. */
  defaultSlots: string[];
  /** First default tier, used for stable sorting. */
  defaultTier?: ModelTier;
}

const ALL_PROVIDERS: ProviderRoute[] = [
  "openrouter",
  "gateway",
  "anthropic",
  "openai",
  "google",
];

const DIRECT_PROVIDERS: ProviderRoute[] = ["anthropic", "openai", "google"];

function formatVariant(variant: LanguageModelVariant): string {
  switch (variant) {
    case "text":
      return "text";
    case "tools":
      return "tools";
    case "vision":
      return "vision";
    case "visionTools":
      return "vision+tools";
  }
}

function defaultSlotsFor(modelId: string): string[] {
  const slots: string[] = [];

  for (const tier of MODEL_TIERS) {
    for (const variant of LANGUAGE_MODEL_VARIANTS) {
      if (DEFAULT_MODELS[tier][variant] === modelId) {
        slots.push(`${tier} ${formatVariant(variant)}`);
      }
    }
  }

  return slots;
}

function defaultTierFor(modelId: string): ModelTier | undefined {
  return MODEL_TIERS.find((tier) =>
    LANGUAGE_MODEL_VARIANTS.some(
      (variant) => DEFAULT_MODELS[tier][variant] === modelId,
    ),
  );
}

const MODELS: ModelDef[] = LANGUAGE_MODEL_CATALOG.map((model) => ({
  id: model.id,
  name: model.name,
  defaultSlots: defaultSlotsFor(model.id),
  defaultTier: defaultTierFor(model.id),
})).sort((a, b) => {
  const aTier = a.defaultTier ? MODEL_TIERS.indexOf(a.defaultTier) : 99;
  const bTier = b.defaultTier ? MODEL_TIERS.indexOf(b.defaultTier) : 99;
  if (aTier !== bTier) return aTier - bTier;
  if (a.defaultSlots.length !== b.defaultSlots.length) {
    return b.defaultSlots.length - a.defaultSlots.length;
  }
  return a.name.localeCompare(b.name);
});

const MODEL_GROUPS = [
  {
    key: "defaults",
    label: "DEFAULT TIER MODELS",
    models: MODELS.filter((model) => model.defaultSlots.length > 0),
  },
  {
    key: "overrides",
    label: "SUPPORTED OVERRIDE MODELS",
    models: MODELS.filter((model) => model.defaultSlots.length === 0),
  },
] as const;

function buildMatrixRuns(
  models: readonly ModelDef[] = MODELS,
  providers: readonly ProviderRoute[] = ALL_PROVIDERS,
): Run[] {
  const runs: Run[] = [];
  for (const model of models) {
    for (const p of providers) {
      if (!canRouteModelToProvider(model.id, p)) continue;
      const providerModelId = resolveProviderModelId(model.id, p);
      runs.push({
        id: `${p}:${providerModelId}`,
        model: providerModelId,
        provider: p,
        label: model.name,
      });
    }
  }
  return runs;
}

// -- Presets -----------------------------------------------------------

const DEFAULT_MODELS_ONLY = MODELS.filter(
  (model) => model.defaultSlots.length,
);

const DIRECT_CAPABLE_MODELS = MODELS.filter((model) =>
  DIRECT_PROVIDERS.some((provider) =>
    canRouteModelToProvider(model.id, provider),
  ),
);

const PROXY_ONLY_MODELS = MODELS.filter((model) =>
  DIRECT_PROVIDERS.every(
    (provider) => !canRouteModelToProvider(model.id, provider),
  ),
);

function buildPresets(
  providers: readonly ProviderRoute[],
): Record<string, { label: string; runs: Run[] }> {
  return {
    matrix: {
      label: "Full Matrix: Configured Routes",
      runs: buildMatrixRuns(MODELS, providers),
    },
    defaults: {
      label: "Defaults: Configured Routes",
      runs: buildMatrixRuns(DEFAULT_MODELS_ONLY, providers),
    },
    "direct-capable": {
      label: "Direct-capable Models: Configured Routes",
      runs: buildMatrixRuns(DIRECT_CAPABLE_MODELS, providers),
    },
    "proxy-only": {
      label: "Proxy-only Models: Configured Routes",
      runs: buildMatrixRuns(PROXY_ONLY_MODELS, providers),
    },
  };
}

const CONFIGURED_DEFAULT_PRESETS = buildPresets([]);

function providerListLabel(providers: readonly ProviderRoute[]): string {
  if (providers.length === 0) return "No providers configured";
  return providers.map(providerLabel).join(", ");
}

function isProviderConfigured(
  provider: ProviderRoute,
  providers: readonly ProviderRoute[],
): boolean {
  return providers.includes(provider);
}

const DEFAULT_PROMPTS = [
  "Explain the concept of material authenticity in architecture in 2-3 sentences.",
  "What are the three most important factors when choosing a typeface for a digital product?",
  "Describe the difference between a specification and a standard in materials science.",
];

const DEFAULT_PROMPT = DEFAULT_PROMPTS[0] ?? "";

// -- Helpers ----------------------------------------------------------

function providerBadgeClasses(provider: ProviderRoute): string {
  switch (provider) {
    case "openrouter":
      return "bg-purple-500/10 text-purple-400";
    case "gateway":
      return "bg-zinc-500/10 text-zinc-300";
    case "anthropic":
      return "bg-amber-500/10 text-amber-400";
    case "openai":
      return "bg-emerald-500/10 text-emerald-400";
    case "google":
      return "bg-blue-500/10 text-blue-400";
  }
}

function providerLabel(p: ProviderRoute): string {
  switch (p) {
    case "openrouter":
      return "OpenRouter";
    case "gateway":
      return "Gateway";
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "google":
      return "Google";
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// -- Matrix cell lookup -----------------------------------------------

type MetricKey = "ttft" | "tokensPerSecond" | "totalTime";

function getCell(
  results: BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
): BenchmarkResult | undefined {
  return results.find((r) => r.label === modelName && r.provider === provider);
}

function isBestInRow(
  results: BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
  metric: MetricKey,
): boolean {
  const cell = getCell(results, modelName, provider);
  if (!cell || cell.error) return false;

  const rowResults = results.filter((r) => r.label === modelName && !r.error);
  if (rowResults.length < 2) return false;

  const val = cell[metric];
  if (metric === "tokensPerSecond") {
    return val >= Math.max(...rowResults.map((r) => r[metric]));
  }
  return val <= Math.min(...rowResults.map((r) => r[metric]));
}

// -- Component --------------------------------------------------------

/** Interactive benchmark runner for comparing provider/model latency. */
export default function BenchmarkPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [rounds, setRounds] = useState(3);
  const [maxTokens, setMaxTokens] = useState(200);
  const [selectedPreset, setSelectedPreset] = useState("matrix");
  const [customRuns, setCustomRuns] = useState<Run[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [metric, setMetric] = useState<MetricKey>("ttft");
  const [availableProviders, setAvailableProviders] = useState<
    ProviderRoute[]
  >([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const presets = useMemo(
    () =>
      configLoaded ? buildPresets(availableProviders) : CONFIGURED_DEFAULT_PRESETS,
    [availableProviders, configLoaded],
  );
  const activeRuns =
    customRuns.length > 0 ? customRuns : (presets[selectedPreset]?.runs ?? []);
  const isMatrix = selectedPreset === "matrix" && customRuns.length === 0;

  // For display, only show averaged results when multi-round
  const displayResults =
    rounds > 1 ? results.filter((r) => r.averaged) : results;
  const totalExpected = activeRuns.length * rounds;

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const response = await fetch("/api/benchmark");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = (await response.json()) as BenchmarkConfig;
        if (!cancelled) {
          setAvailableProviders(config.availableProviders);
        }
      } catch (err) {
        console.error("Failed to load benchmark config:", err);
      } finally {
        if (!cancelled) {
          setConfigLoaded(true);
        }
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const runBenchmark = useCallback(async () => {
    if (running) {
      abortRef.current?.abort();
      setRunning(false);
      return;
    }

    setResults([]);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rounds > 1 ? DEFAULT_PROMPTS.slice(0, rounds) : prompt,
          runs: activeRuns,
          maxTokens,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const result = JSON.parse(data) as BenchmarkResult;
            setResults((prev) => [...prev, result]);
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Benchmark failed:", err);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [prompt, rounds, activeRuns, maxTokens, running]);

  // -- Custom run management ------------------------------------------

  const addCustomRun = () => {
    setCustomRuns((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        model: "",
        provider: "openrouter",
        label: "",
      },
    ]);
  };

  const updateCustomRun = (index: number, updates: Partial<Run>) => {
    setCustomRuns((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...updates } : r)),
    );
  };

  const removeCustomRun = (index: number) => {
    setCustomRuns((prev) => prev.filter((_, i) => i !== index));
  };

  // -- Determine which providers have results -------------------------

  const displayProviders = ALL_PROVIDERS;

  // -- Render ---------------------------------------------------------

  return (
    <div className="min-h-svh bg-zinc-950">
      {/* Header */}
      <header className="border-zinc-800 border-b">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/howells/ai"
              className="font-semibold text-sm text-zinc-100 transition-colors hover:text-white"
            >
              Howells AI
            </a>
            <span className="text-zinc-700">/</span>
            <span className="label text-zinc-400">Benchmark</span>
          </div>
          {displayResults.length > 0 && displayResults[0] && (
            <span className="label-sm text-zinc-600">{results[0].region}</span>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Config */}
        <div className="space-y-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            placeholder="Enter your test prompt..."
          />

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <span className="label block text-zinc-500">Preset</span>
                <span className="label-sm truncate text-zinc-600">
                  {configLoaded
                    ? providerListLabel(availableProviders)
                    : "Loading providers"}
                </span>
              </div>
              <select
                value={customRuns.length > 0 ? "__custom" : selectedPreset}
                onChange={(e) => {
                  if (e.target.value === "__custom") return;
                  setSelectedPreset(e.target.value);
                  setCustomRuns([]);
                }}
                className="h-9 w-full cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 text-sm text-zinc-200 focus:border-zinc-600 focus:outline-none"
              >
                {Object.entries(presets).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.label} ({preset.runs.length} runs)
                  </option>
                ))}
                {customRuns.length > 0 && (
                  <option value="__custom">Custom</option>
                )}
              </select>
            </div>

            <div className="w-20">
              <span className="label mb-1.5 block text-zinc-500">Rounds</span>
              <input
                type="number"
                value={rounds}
                onChange={(e) =>
                  setRounds(Math.max(1, Math.min(5, Number(e.target.value))))
                }
                min={1}
                max={5}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 text-sm tabular-nums text-zinc-200 focus:border-zinc-600 focus:outline-none"
              />
            </div>

            <div className="w-24">
              <span className="label mb-1.5 block text-zinc-500">Tokens</span>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value))}
                min={50}
                max={4000}
                className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-900/50 px-2.5 text-sm tabular-nums text-zinc-200 focus:border-zinc-600 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={runBenchmark}
              disabled={!configLoaded || activeRuns.length === 0}
              className={`h-9 cursor-pointer rounded-md px-5 text-sm font-medium transition-colors ${
                running
                  ? "border border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                  : "bg-zinc-100 text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
              }`}
            >
              {running
                ? `${results.filter((r) => !r.averaged).length}/${totalExpected}`
                : rounds > 1
                  ? `Run x${rounds}`
                  : "Run"}
            </button>
          </div>

          {/* Custom runs editor */}
          {customRuns.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {customRuns.map((r, i) => (
                <div key={r.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={r.model}
                    onChange={(e) =>
                      updateCustomRun(i, { model: e.target.value })
                    }
                    placeholder="model ID"
                    className="h-7 w-44 rounded border border-zinc-800 bg-zinc-900/50 px-2 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  />
                  <select
                    value={r.provider}
                    onChange={(e) =>
                      updateCustomRun(i, {
                        provider: e.target.value as ProviderRoute,
                      })
                    }
                    className="h-7 cursor-pointer rounded border border-zinc-800 bg-zinc-900/50 px-1.5 font-mono text-[11px] text-zinc-200 focus:border-zinc-600 focus:outline-none"
                  >
                    <option value="openrouter">openrouter</option>
                    <option value="gateway">gateway</option>
                    <option value="anthropic">anthropic</option>
                    <option value="openai">openai</option>
                    <option value="google">google</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeCustomRun(i)}
                    className="cursor-pointer text-zinc-700 transition-colors hover:text-zinc-400"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <title>Remove</title>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addCustomRun}
                className="cursor-pointer rounded-md border border-dashed border-zinc-800 px-2 py-1 font-mono text-[10px] text-zinc-600 transition-colors hover:border-zinc-600 hover:text-zinc-400"
              >
                + add
              </button>
            </div>
          )}
        </div>

        {/* Results - Matrix View */}
        {(displayResults.length > 0 || running) && isMatrix && (
          <div className="mt-8">
            {/* Metric toggle */}
            <div className="mb-4 flex items-center gap-1">
              {(
                [
                  ["ttft", "TTFT"],
                  ["tokensPerSecond", "TOK/S"],
                  ["totalTime", "TOTAL"],
                ] as const
              ).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMetric(key)}
                  className={`cursor-pointer rounded-md px-2.5 py-1 label-sm transition-colors ${
                    metric === key
                      ? "bg-zinc-800 text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            {/* Matrix table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-zinc-700 border-b-2">
                    <th className="label pb-2 pr-4 text-left text-zinc-500">
                      MODEL
                    </th>
                    {displayProviders.map((p) => (
                      <th
                        key={p}
                        className="label pb-2 text-right text-zinc-500"
                        style={{ minWidth: 90 }}
                      >
                        <span className={providerBadgeClasses(p)}>
                          {providerLabel(p)}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODEL_GROUPS.map((group) => {
                    if (group.models.length === 0) return null;

                    return (
                      <Fragment key={group.key}>
                        {/* Model group separator */}
                        <tr>
                          <td
                            colSpan={displayProviders.length + 1}
                            className="label-sm pt-4 pb-1 text-zinc-600"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.models.map((model) => (
                          <tr
                            key={model.id}
                            className="border-zinc-800/50 border-b transition-colors hover:bg-zinc-900/30"
                          >
                            <td className="py-2.5 pr-4 text-xs text-zinc-200">
                              <div>{model.name}</div>
                              <div className="mt-1 truncate font-mono text-[10px] text-zinc-600">
                                {model.id}
                              </div>
                              {model.defaultSlots.length > 0 && (
                                <div className="mt-1 flex max-w-md flex-wrap gap-1">
                                  {model.defaultSlots.map((slot) => (
                                    <span
                                      key={slot}
                                      className="rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500"
                                    >
                                      {slot}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            {displayProviders.map((p) => {
                              const canServe = canRouteModelToProvider(
                                model.id,
                                p,
                              );
                              const configured = isProviderConfigured(
                                p,
                                availableProviders,
                              );

                              if (!canServe) {
                                return (
                                  <td key={p} className="py-2.5 text-right">
                                    <span className="text-zinc-800">-</span>
                                  </td>
                                );
                              }

                              if (!configured) {
                                return (
                                  <td
                                    key={p}
                                    className="py-2.5 text-right"
                                    title={`${providerLabel(p)} is not configured in this process`}
                                  >
                                    <span className="data text-[10px] text-zinc-800">
                                      key
                                    </span>
                                  </td>
                                );
                              }

                              const cell = getCell(
                                displayResults,
                                model.name,
                                p,
                              );
                              const isBest = isBestInRow(
                                displayResults,
                                model.name,
                                p,
                                metric,
                              );

                              if (!cell) {
                                return (
                                  <td key={p} className="py-2.5 text-right">
                                    {running ? (
                                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-700 border-t-zinc-500" />
                                    ) : (
                                      <span className="text-zinc-800">.</span>
                                    )}
                                  </td>
                                );
                              }

                              if (cell.error) {
                                return (
                                  <td
                                    key={p}
                                    className="py-2.5 text-right"
                                    title={cell.error}
                                  >
                                    <span className="data text-[11px] text-red-500/60">
                                      err
                                    </span>
                                  </td>
                                );
                              }

                              let displayVal: string;
                              if (metric === "ttft")
                                displayVal = formatMs(cell.ttft);
                              else if (metric === "tokensPerSecond")
                                displayVal = `${cell.tokensPerSecond}`;
                              else displayVal = formatMs(cell.totalTime);

                              return (
                                <td key={p} className="py-2.5 text-right">
                                  <span
                                    className={`data text-[11px] ${
                                      isBest
                                        ? "font-bold text-emerald-400"
                                        : "text-zinc-400"
                                    }`}
                                  >
                                    {displayVal}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Progress */}
            {running && (
              <div className="mt-4 flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                <span className="data text-[11px] text-zinc-500">
                  {results.filter((r) => !r.averaged).length} / {totalExpected}{" "}
                  complete
                </span>
              </div>
            )}
          </div>
        )}

        {/* Results - List View (non-matrix presets) */}
        {(displayResults.length > 0 || running) && !isMatrix && (
          <div className="mt-8">
            <div
              className="grid gap-2 border-zinc-700 border-b-2 pb-2"
              style={{
                gridTemplateColumns: "1fr 80px 80px 64px 72px",
              }}
            >
              <span className="label text-zinc-500">MODEL</span>
              <span className="label text-right text-zinc-500">TTFT</span>
              <span className="label text-right text-zinc-500">TOTAL</span>
              <span className="label text-right text-zinc-500">TOK/S</span>
              <span className="label text-right text-zinc-500">TOKENS</span>
            </div>

            {running && displayResults.length === 0 && (
              <div className="flex items-center gap-2 border-zinc-800/50 border-b py-3">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                <span className="text-sm text-zinc-500">
                  Firing requests...
                </span>
              </div>
            )}

            {[...displayResults]
              .sort((a, b) => {
                if (a.error && !b.error) return 1;
                if (!a.error && b.error) return -1;
                return a.ttft - b.ttft;
              })
              .map((r) => {
                const allValid = displayResults.filter((x) => !x.error);
                const bestTtft = allValid.length
                  ? Math.min(...allValid.map((x) => x.ttft))
                  : 0;
                const bestTps = allValid.length
                  ? Math.max(...allValid.map((x) => x.tokensPerSecond))
                  : 0;

                return (
                  <div
                    key={`${r.provider}-${r.model}`}
                    className={`grid gap-2 border-zinc-800/50 border-b py-3 ${r.error ? "opacity-40" : ""}`}
                    style={{
                      gridTemplateColumns: "1fr 80px 80px 64px 72px",
                    }}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span
                        className={`label-sm shrink-0 rounded px-1.5 py-0.5 ${providerBadgeClasses(r.provider)}`}
                      >
                        {r.provider}
                      </span>
                      <span className="truncate text-xs text-zinc-100">
                        {r.label}
                      </span>
                    </div>
                    <span
                      className={`data text-right text-[11px] ${
                        !r.error && r.ttft === bestTtft
                          ? "font-bold text-emerald-400"
                          : "text-zinc-300"
                      }`}
                    >
                      {r.error ? "-" : formatMs(r.ttft)}
                    </span>
                    <span className="data text-right text-[11px] text-zinc-400">
                      {r.error ? "-" : formatMs(r.totalTime)}
                    </span>
                    <span
                      className={`data text-right text-[11px] ${
                        !r.error && r.tokensPerSecond === bestTps
                          ? "font-bold text-emerald-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {r.error ? "-" : r.tokensPerSecond}
                    </span>
                    <span className="data text-right text-[11px] text-zinc-600">
                      {r.error ? "-" : `${r.inputTokens}->${r.outputTokens}`}
                    </span>
                  </div>
                );
              })}

            {running && displayResults.length > 0 && (
              <div className="flex items-center gap-2 py-3">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
                <span className="data text-[11px] text-zinc-500">
                  {results.filter((r) => !r.averaged).length} / {totalExpected}{" "}
                  complete
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
