"use client";

import { canRouteModelToProvider, resolveProviderModelId } from "@howells/ai/models";
import type { ModelService, ModelTask, ModelTier, ProviderRoute } from "@howells/ai";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BenchmarkTable } from "../components/benchmark-table";
import type { BenchmarkResult, MetricKey } from "../components/benchmark-table";
import { BenchmarkToolbar } from "../components/benchmark-toolbar";
import type { ToolbarFilters } from "../components/benchmark-toolbar";
import { LegendBar } from "../components/legend-bar";
import { RunQueueStrip } from "../components/run-queue-strip";
import { InfoIcon } from "../components/tooltip";
import { METRIC_META, pluralize } from "../lib/format";
import type { BenchmarkHistoryResponse, HistoricalProviderSummary } from "../lib/history-types";
import {
  DEFAULT_ADVANCED_OPTIONS,
  OPENROUTER_VARIANTS,
  PRIVACY_OPTIONS,
  QUANTIZATION_OPTIONS,
  ROUTE_PREFERENCES,
  SERVICE_TIERS,
  formatList,
  parseList,
  setMembership,
} from "../lib/benchmark-options";
import type {
  BenchmarkAdvancedOptions,
  BenchmarkCacheMode,
  BenchmarkLogprobsMode,
  BenchmarkOpenRouterVariant,
  BenchmarkReasoningMode,
  BenchmarkServiceTier,
  BenchmarkWebSearchMode,
} from "../lib/benchmark-options";
import {
  bestProviderComparison,
  getProviderComparisons,
  isBetterMetric,
  resultMetricValue,
} from "../lib/result-insights";
import {
  ALL_PROVIDERS,
  ALL_SERVICES,
  ALL_TASKS,
  ALL_TIERS,
  MODEL_ROWS,
  providerLabel,
  tiersForRow,
} from "../lib/models";

interface Run {
  id: string;
  model: string;
  provider: ProviderRoute;
  label: string;
}

interface BenchmarkConfig {
  availableProviders: ProviderRoute[];
  availableServices?: ModelService[];
}

interface RunSnapshot {
  prompt: string;
  imageInputs: string;
  rounds: number;
  maxTokens: number;
  optionsKey: string;
  selectionKey: string;
  providerKey: string;
}

const DEFAULT_PROMPTS = [
  "Explain the concept of material authenticity in architecture in 2-3 sentences.",
  "What are the three most important factors when choosing a typeface for a digital product?",
  "Describe the difference between a specification and a standard in materials science.",
];

const DEFAULT_PROMPT = DEFAULT_PROMPTS[0] ?? "";

function parseImageInputs(value: string): string[] {
  return value
    .split(/\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const INITIAL_FILTERS: ToolbarFilters = {
  configuredOnly: true,
  providers: new Set(),
  search: "",
  services: new Set(),
  tasks: new Set(),
  tiers: new Set(),
};

const INITIAL_SELECTION: RowSelectionState = (() => {
  const next: RowSelectionState = {};
  for (const row of MODEL_ROWS) {
    if (row.group === "defaults") {
      next[row.id] = true;
    }
  }
  return next;
})();

/** Main benchmark dashboard for matrix-style provider and model comparison. */
export default function BenchmarkPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [imageInputs, setImageInputs] = useState("");
  const [rounds, setRounds] = useState(1);
  const [maxTokens, setMaxTokens] = useState(200);
  const [advancedOptions, setAdvancedOptions] =
    useState<BenchmarkAdvancedOptions>(DEFAULT_ADVANCED_OPTIONS);
  const [metric, setMetric] = useState<MetricKey>("ttft");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [groupRows, setGroupRows] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const saved = window.localStorage.getItem("benchmark.settingsOpen");
    if (saved === "1") {
      setSettingsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("benchmark.settingsOpen", settingsOpen ? "1" : "0");
  }, [settingsOpen]);

  const [filters, setFilters] = useState<ToolbarFilters>(INITIAL_FILTERS);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(INITIAL_SELECTION);

  const [availableProviders, setAvailableProviders] = useState<ProviderRoute[]>([]);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [region, setRegion] = useState<string | null>(null);

  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<RunSnapshot | null>(null);
  const [historySummaries, setHistorySummaries] = useState<HistoricalProviderSummary[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const activeOpenRouterVariant =
    advancedOptions.openRouterVariant === "off" ? undefined : advancedOptions.openRouterVariant;

  // ── Load config ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/benchmark");
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const config = (await response.json()) as BenchmarkConfig;
        if (cancelled) {
          return;
        }
        setAvailableProviders(config.availableProviders);
      } catch (error) {
        console.error("Failed to load benchmark config:", error);
      } finally {
        if (!cancelled) {
          setConfigLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Filtered rows (page-level filtering, search, tier/task/family) ─
  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return MODEL_ROWS.filter((row) => {
      if (search) {
        const haystack = `${row.name} ${row.id} ${row.service}`.toLowerCase();
        if (!haystack.includes(search)) {
          return false;
        }
      }
      if (filters.services.size > 0 && !filters.services.has(row.service)) {
        return false;
      }
      if (filters.tiers.size > 0) {
        const rowTiers = tiersForRow(row);
        if (!rowTiers.some((tier) => filters.tiers.has(tier))) {
          return false;
        }
      }
      if (filters.tasks.size > 0) {
        if (!row.tasks.some((task) => filters.tasks.has(task))) {
          return false;
        }
      }
      return true;
    });
  }, [filters]);

  const visibleProviders = useMemo<ProviderRoute[]>(
    () =>
      ALL_PROVIDERS.filter((provider) => {
        if (filters.providers.size > 0 && !filters.providers.has(provider)) {
          return false;
        }
        if (filters.configuredOnly && !availableProviders.includes(provider)) {
          return false;
        }
        return true;
      }),
    [filters.providers, filters.configuredOnly, availableProviders],
  );

  // ── Facet counts ───────────────────────────────────────────────────
  const tierCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_TIERS.map((t) => [t, 0])) as Record<ModelTier, number>;
    for (const row of MODEL_ROWS) {
      for (const tier of tiersForRow(row)) {
        counts[tier]++;
      }
    }
    return counts;
  }, []);

  const taskCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_TASKS.map((t) => [t, 0])) as Record<ModelTask, number>;
    for (const row of MODEL_ROWS) {
      for (const task of row.tasks) {
        counts[task]++;
      }
    }
    return counts;
  }, []);

  const serviceCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_SERVICES.map((s) => [s, 0])) as Record<
      ModelService,
      number
    >;
    for (const row of MODEL_ROWS) {
      counts[row.service]++;
    }
    return counts;
  }, []);

  // ── Runs derived from selection × visible providers ────────────────
  const runs = useMemo<Run[]>(() => {
    const out: Run[] = [];
    for (const row of filteredRows) {
      if (!rowSelection[row.id]) {
        continue;
      }
      for (const provider of visibleProviders) {
        if (!canRouteModelToProvider(row.id, provider)) {
          continue;
        }
        if (!availableProviders.includes(provider)) {
          continue;
        }
        out.push({
          id: `${provider}:${row.id}`,
          label:
            provider === "openrouter" && activeOpenRouterVariant
              ? `${row.name} :${activeOpenRouterVariant}`
              : row.name,
          model: resolveProviderModelId(row.id, provider),
          provider,
        });
      }
    }
    return out;
  }, [filteredRows, rowSelection, visibleProviders, availableProviders, activeOpenRouterVariant]);

  const selectedModelCount = useMemo(
    () => filteredRows.filter((row) => rowSelection[row.id]).length,
    [filteredRows, rowSelection],
  );

  const selectedHistoryModelLabels = useMemo(
    () =>
      filteredRows
        .filter((row) => rowSelection[row.id])
        .map((row) => row.name)
        .sort(),
    [filteredRows, rowSelection],
  );

  const eligibleProviderCount = useMemo(
    () => visibleProviders.filter((p) => availableProviders.includes(p)).length,
    [visibleProviders, availableProviders],
  );

  const totalRequests = runs.length * rounds;
  const completed = useMemo(() => results.filter((r) => !r.averaged).length, [results]);
  const displayResults = rounds > 1 ? results.filter((r) => r.averaged) : results;
  const resultInsights = useMemo(
    () => getRunInsights(displayResults, metric),
    [displayResults, metric],
  );
  const historicalProviderInsight = useMemo(
    () => getHistoricalProviderInsight(historySummaries, metric),
    [historySummaries, metric],
  );
  const totalCostUsd = useMemo(() => {
    const source = rounds > 1 ? displayResults : results.filter((r) => !r.averaged);
    const total = source.reduce((sum, result) => sum + (result.costUsd ?? 0), 0);
    return total > 0 ? total : undefined;
  }, [displayResults, results, rounds]);

  const errorCount = useMemo(() => results.filter((r) => !r.averaged && r.error).length, [results]);
  const fastestTtft = useMemo<number | null>(() => {
    const ttfts = results
      .filter((r) => !r.error && (rounds > 1 ? r.averaged : !r.averaged))
      .map((r) => r.ttft)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ttfts.length === 0) {
      return null;
    }
    return Math.min(...ttfts);
  }, [results, rounds]);

  useEffect(() => {
    if (!configLoaded || running) {
      return;
    }
    if (selectedHistoryModelLabels.length === 0 || visibleProviders.length === 0) {
      setHistorySummaries([]);
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      models: selectedHistoryModelLabels.join(","),
      providers: visibleProviders.join(","),
    });

    void (async () => {
      try {
        const response = await fetch(`/api/benchmark/history?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const history = (await response.json()) as BenchmarkHistoryResponse;
        if (!controller.signal.aborted) {
          setHistorySummaries(history.available ? history.providers : []);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.warn("Failed to load benchmark history:", error);
          setHistorySummaries([]);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    configLoaded,
    running,
    results.length,
    selectedHistoryModelLabels,
    visibleProviders,
    advancedOptions.openRouterVariant,
  ]);

  // ── Stale detection ─────────────────────────────────────────────────
  const currentSnapshot = useMemo<RunSnapshot>(
    () => ({
      imageInputs,
      maxTokens,
      optionsKey: JSON.stringify(advancedOptions),
      prompt,
      providerKey: visibleProviders.join("|"),
      rounds,
      selectionKey: Object.keys(rowSelection)
        .filter((k) => rowSelection[k])
        .toSorted()
        .join("|"),
    }),
    [prompt, imageInputs, rounds, maxTokens, advancedOptions, rowSelection, visibleProviders],
  );

  const isStale = useMemo(() => {
    if (!lastSnapshot) {
      return false;
    }
    if (results.length === 0) {
      return false;
    }
    return (
      lastSnapshot.prompt !== currentSnapshot.prompt ||
      lastSnapshot.imageInputs !== currentSnapshot.imageInputs ||
      lastSnapshot.rounds !== currentSnapshot.rounds ||
      lastSnapshot.maxTokens !== currentSnapshot.maxTokens ||
      lastSnapshot.optionsKey !== currentSnapshot.optionsKey
    );
  }, [lastSnapshot, currentSnapshot, results.length]);

  // ── Disabled-Run reason ─────────────────────────────────────────────
  let disabledReason: string | undefined;
  if (!configLoaded) {
    disabledReason = "Loading configuration…";
  } else if (selectedModelCount === 0) {
    disabledReason = "Select at least one model";
  } else if (eligibleProviderCount === 0) {
    disabledReason = "No configured provider matches the selection";
  } else if (runs.length === 0) {
    disabledReason = "Selected models have no compatible provider routes";
  }

  // ── Run benchmark ──────────────────────────────────────────────────
  const runBenchmark = useCallback(async () => {
    if (running) {
      abortRef.current?.abort();
      setRunning(false);
      return;
    }

    if (runs.length === 0) {
      return;
    }

    setResults([]);
    setRunning(true);
    setLastSnapshot(currentSnapshot);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/benchmark", {
        body: JSON.stringify({
          images: parseImageInputs(imageInputs),
          maxTokens,
          options: advancedOptions,
          prompt: rounds > 1 ? DEFAULT_PROMPTS.slice(0, rounds) : prompt,
          runs,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            continue;
          }
          const data = line.slice(6);
          if (data === "[DONE]") {
            continue;
          }
          try {
            const result = JSON.parse(data) as BenchmarkResult;
            setResults((prev) => [...prev, result]);
            if (!region && result.region) {
              setRegion(result.region);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Benchmark failed:", error);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [
    running,
    runs,
    prompt,
    imageInputs,
    rounds,
    maxTokens,
    advancedOptions,
    region,
    currentSnapshot,
  ]);

  // ── Bulk selection helpers ─────────────────────────────────────────
  function selectAllFiltered() {
    setRowSelection((prev) => {
      const next: RowSelectionState = { ...prev };
      for (const row of filteredRows) {
        next[row.id] = true;
      }
      return next;
    });
  }
  function clearSelection() {
    setRowSelection({});
  }

  const sidebarSummary = `${rounds}r · ${maxTokens}t · ${METRIC_META[metric].short}`;

  return (
    <div className="flex h-svh flex-col bg-[var(--color-canvas)] text-[var(--color-text)]">
      {/* App header — V7 dot-bullet eyebrow, sentence-case throughout. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-[var(--color-border)] border-b bg-[var(--color-surface)] px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-text)]" />
          <a
            href="https://github.com/howells/ai"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sm text-[var(--color-text)] transition-colors hover:text-[var(--color-text-muted)]"
          >
            Howells AI
          </a>
          <span className="text-[var(--color-text-faint)]">·</span>
          <span className="text-sm text-[var(--color-text-muted)]">Benchmark</span>
          <span className="ml-2 hidden text-[12px] text-[var(--color-text-subtle)] md:inline">
            Compare provider routes for{" "}
            <span className="data text-[var(--color-text-muted)]">@howells/ai</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen((open) => !open);
            }}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            {settingsOpen ? "Hide settings" : "Settings"}
          </button>
          <span className="data text-[11px] text-[var(--color-text-faint)]">
            {availableProviders.length}/{ALL_PROVIDERS.length}{" "}
            {pluralize(availableProviders.length, "key")} configured
          </span>
          <a
            href="https://github.com/howells/ai#readme"
            target="_blank"
            rel="noreferrer"
            className="rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
          >
            Docs
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          data-state={settingsOpen ? "expanded" : "collapsed"}
          className={`min-h-0 shrink-0 border-[var(--color-border)] border-r bg-[var(--color-surface)] transition-[width] duration-200 ease-out ${
            settingsOpen ? "w-[25rem]" : "w-12"
          }`}
        >
          {settingsOpen ? (
            <SettingsPanelOpen
              prompt={prompt}
              onPromptChange={setPrompt}
              imageInputs={imageInputs}
              onImageInputsChange={setImageInputs}
              rounds={rounds}
              onRoundsChange={setRounds}
              maxTokens={maxTokens}
              onMaxTokensChange={setMaxTokens}
              advancedOptions={advancedOptions}
              onAdvancedOptionsChange={setAdvancedOptions}
              metric={metric}
              onMetricChange={setMetric}
              density={density}
              onDensityChange={setDensity}
              groupRows={groupRows}
              onGroupRowsChange={setGroupRows}
              onCollapse={() => {
                setSettingsOpen(false);
              }}
            />
          ) : (
            <SettingsRail
              summary={sidebarSummary}
              onExpand={() => {
                setSettingsOpen(true);
              }}
            />
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <BenchmarkToolbar
            filters={filters}
            onFiltersChange={setFilters}
            availableProviders={availableProviders}
            allProviders={ALL_PROVIDERS}
            allServices={ALL_SERVICES}
            tierCounts={tierCounts}
            taskCounts={taskCounts}
            serviceCounts={serviceCounts}
            modelCount={MODEL_ROWS.length}
            filteredCount={filteredRows.length}
            selectedModelCount={selectedModelCount}
            onSelectAll={selectAllFiltered}
            onClearSelection={clearSelection}
          />

          <RunQueueStrip
            runs={runs.length}
            models={selectedModelCount}
            providers={eligibleProviderCount}
            rounds={rounds}
            totalRequests={totalRequests}
            completed={completed}
            running={running}
            disabled={!configLoaded || runs.length === 0}
            disabledReason={disabledReason}
            errors={errorCount}
            fastestTtft={fastestTtft}
            fastestModel={resultInsights.fastestModel}
            fastestModelProvider={resultInsights.fastestModelProvider}
            fastestModelValue={resultInsights.fastestModelValue}
            fastestProvider={resultInsights.fastestProvider}
            fastestProviderScore={resultInsights.fastestProviderScore}
            fastestProviderMatchedModels={resultInsights.fastestProviderMatchedModels}
            historicalProvider={historicalProviderInsight?.provider}
            historicalProviderScore={historicalProviderInsight?.score}
            historicalProviderMatchedModels={historicalProviderInsight?.matchedModels}
            metric={metric}
            totalCostUsd={totalCostUsd}
            hasResults={displayResults.length > 0}
            stale={isStale}
            onRun={runBenchmark}
          />

          <main className="min-h-0 flex-1">
            {configLoaded ? (
              <BenchmarkTable
                rows={filteredRows}
                visibleProviders={visibleProviders}
                configuredProviders={availableProviders}
                results={displayResults}
                historicalProviders={historySummaries}
                metric={metric}
                rowSelection={rowSelection}
                onRowSelectionChange={setRowSelection}
                density={density}
                grouped={groupRows}
                rounds={rounds}
                runningKey={null}
                stale={isStale}
                openRouterVariant={activeOpenRouterVariant}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
                Loading benchmark configuration…
              </div>
            )}
          </main>

          <LegendBar
            metric={metric}
            configuredCount={availableProviders.length}
            totalProviders={ALL_PROVIDERS.length}
            region={region}
            stale={isStale}
          />
        </section>
      </div>
    </div>
  );
}

interface RunInsights {
  fastestModel?: string;
  fastestModelProvider?: string;
  fastestModelValue?: number;
  fastestProvider?: string;
  fastestProviderScore?: number;
  fastestProviderMatchedModels?: number;
}

interface HistoricalProviderInsight {
  provider: string;
  score: number;
  matchedModels: number;
}

function getRunInsights(results: readonly BenchmarkResult[], metric: MetricKey): RunInsights {
  const successful = results.filter(
    (result) => !result.error && Number.isFinite(resultMetricValue(result, metric)),
  );

  let fastestModel: string | undefined;
  let fastestModelProvider: string | undefined;
  let fastestModelValue: number | undefined;
  for (const result of successful) {
    const value = resultMetricValue(result, metric);
    if (fastestModelValue === undefined || isBetterMetric(value, fastestModelValue, metric)) {
      fastestModelValue = value;
      fastestModel = result.label;
      fastestModelProvider = providerLabel(result.provider);
    }
  }

  let fastestProvider: string | undefined;
  let fastestProviderScore: number | undefined;
  let fastestProviderMatchedModels: number | undefined;
  const fastestProviderComparison = bestProviderComparison(
    getProviderComparisons(successful, metric),
  );
  if (fastestProviderComparison) {
    fastestProvider = providerLabel(fastestProviderComparison.provider);
    fastestProviderScore = fastestProviderComparison.score;
    fastestProviderMatchedModels = fastestProviderComparison.matchedModels;
  }

  return {
    fastestModel,
    fastestModelProvider,
    fastestModelValue,
    fastestProvider,
    fastestProviderMatchedModels,
    fastestProviderScore,
  };
}

function getHistoricalProviderInsight(
  summaries: readonly HistoricalProviderSummary[],
  metric: MetricKey,
): HistoricalProviderInsight | undefined {
  let best: HistoricalProviderInsight | undefined;
  for (const summary of summaries) {
    const score = summary.scores[metric];
    if (!score || score.matchedModels < 2) {
      continue;
    }
    if (
      !best ||
      score.score < best.score ||
      (score.score === best.score && score.matchedModels > best.matchedModels)
    ) {
      best = {
        matchedModels: score.matchedModels,
        provider: providerLabel(summary.provider),
        score: score.score,
      };
    }
  }
  return best;
}

// ── Settings panel ──────────────────────────────────────────────────

interface SettingsOpenProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  imageInputs: string;
  onImageInputsChange: (next: string) => void;
  rounds: number;
  onRoundsChange: (next: number) => void;
  maxTokens: number;
  onMaxTokensChange: (next: number) => void;
  advancedOptions: BenchmarkAdvancedOptions;
  onAdvancedOptionsChange: (next: BenchmarkAdvancedOptions) => void;
  metric: MetricKey;
  onMetricChange: (next: MetricKey) => void;
  density: "comfortable" | "compact";
  onDensityChange: (next: "comfortable" | "compact") => void;
  groupRows: boolean;
  onGroupRowsChange: (next: boolean) => void;
  onCollapse: () => void;
}

function SettingsPanelOpen({
  prompt,
  onPromptChange,
  imageInputs,
  onImageInputsChange,
  rounds,
  onRoundsChange,
  maxTokens,
  onMaxTokensChange,
  advancedOptions,
  onAdvancedOptionsChange,
  metric,
  onMetricChange,
  density,
  onDensityChange,
  groupRows,
  onGroupRowsChange,
  onCollapse,
}: SettingsOpenProps) {
  const meta = METRIC_META[metric];

  return (
    <div className="scrollbar-thin flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]"
          />
          <span className="text-[13px] font-medium text-[var(--color-text)]">Prompt</span>
          <span className="text-[11px] text-[var(--color-text-faint)]">
            {rounds > 1 ? `cycles through ${rounds} prompts` : `${prompt.length} characters`}
          </span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="shrink-0 cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        >
          Collapse
        </button>
      </div>
      <textarea
        aria-label="Benchmark prompt"
        value={prompt}
        onChange={(e) => {
          onPromptChange(e.target.value);
        }}
        rows={2}
        className="min-h-[4.25rem] w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-border-strong)]"
        placeholder="Enter your test prompt…"
      />
      <textarea
        aria-label="Image inputs"
        value={imageInputs}
        onChange={(e) => {
          onImageInputsChange(e.target.value);
        }}
        rows={2}
        className="min-h-[4.25rem] w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-border-strong)]"
        placeholder="Optional image URLs or data URLs, one per line…"
      />

      <div className="grid grid-cols-2 gap-3">
        <FieldNumber
          label="Rounds"
          tooltip="Number of independent prompts/runs per cell. With rounds > 1 the table shows the average of the rounds."
          value={rounds}
          min={1}
          max={5}
          onChange={onRoundsChange}
          width={72}
        />
        <FieldNumber
          label="Tokens"
          tooltip="Max output tokens per request. Lower caps speed up benchmarks and reduce cost."
          value={maxTokens}
          min={50}
          max={4000}
          step={50}
          onChange={onMaxTokensChange}
          width={88}
        />

        <FieldGroup
          label="Metric"
          tooltip={
            <>
              <strong className="block pb-1 text-[var(--color-text)]">{meta.full}</strong>
              {meta.description}
            </>
          }
        >
          <SegmentedControl
            value={metric}
            onChange={(value) => {
              onMetricChange(value);
            }}
            options={[
              { label: "TTFT", value: "ttft" },
              { label: "TPS", value: "tokensPerSecond" },
              { label: "TOTAL", value: "totalTime" },
            ]}
          />
        </FieldGroup>

        <FieldGroup label="Density">
          <SegmentedControl
            value={density}
            onChange={(v) => {
              onDensityChange(v);
            }}
            options={[
              { label: "Cozy", value: "comfortable" },
              { label: "Compact", value: "compact" },
            ]}
          />
        </FieldGroup>

        <FieldGroup label="Rows">
          <SegmentedControl
            value={groupRows ? "grouped" : "flat"}
            onChange={(value) => {
              onGroupRowsChange(value === "grouped");
            }}
            options={[
              { label: "Flat", value: "flat" },
              { label: "Grouped", value: "grouped" },
            ]}
          />
        </FieldGroup>
      </div>

      <AdvancedProviderControls options={advancedOptions} onChange={onAdvancedOptionsChange} />
    </div>
  );
}

interface SettingsRailProps {
  summary: string;
  onExpand: () => void;
}

function SettingsRail({ summary, onExpand }: SettingsRailProps) {
  return (
    <div className="flex h-full flex-col items-center gap-3 py-3">
      <button
        type="button"
        onClick={onExpand}
        className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[16px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        aria-label="Open settings"
      >
        →
      </button>
      <div className="data max-h-[20rem] rotate-180 [writing-mode:vertical-rl] text-[10px] text-[var(--color-text-faint)]">
        {summary}
      </div>
    </div>
  );
}

function AdvancedProviderControls({
  options,
  onChange,
}: {
  options: BenchmarkAdvancedOptions;
  onChange: (next: BenchmarkAdvancedOptions) => void;
}) {
  function update<K extends keyof BenchmarkAdvancedOptions>(
    key: K,
    value: BenchmarkAdvancedOptions[K],
  ) {
    onChange({ ...options, [key]: value });
  }

  function updateNumber(
    key: "maxPromptCost" | "maxCompletionCost" | "maxRequestCost" | "reasoningTokens",
    value: string,
  ) {
    const trimmed = value.trim();
    update(key, trimmed === "" ? undefined : Number(trimmed));
  }

  return (
    <div className="mt-1 border-[var(--color-border)] border-t pt-3">
      <div className="mb-2 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-text-faint)]"
          />
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[var(--color-text)]">
              Provider behavior
            </div>
            <div className="text-[11px] text-[var(--color-text-faint)]">
              Normalized controls; unsupported providers ignore unsupported fields
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(DEFAULT_ADVANCED_OPTIONS);
          }}
          className="w-fit cursor-pointer rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] text-[var(--color-text-faint)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text-muted)]"
        >
          Reset behavior
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--color-text-muted)]">Routing</span>
            <span className="data text-[10px] text-[var(--color-text-faint)]">
              Gateway + OpenRouter
            </span>
          </div>
          <SegmentedControl
            value={options.routePreference}
            onChange={(value) => {
              update("routePreference", value);
            }}
            options={ROUTE_PREFERENCES}
          />
          <div className="mt-2">
            <TinySelect
              label="OpenRouter variant"
              value={options.openRouterVariant}
              tooltip={
                OPENROUTER_VARIANTS.find((option) => option.value === options.openRouterVariant)
                  ?.description
              }
              onChange={(value) => {
                update("openRouterVariant", value);
              }}
              options={OPENROUTER_VARIANTS.map((option) => [option.value, option.label])}
            />
          </div>
          <div className="mt-2">
            <TinySelect
              label="Service tier"
              value={options.serviceTier}
              tooltip={
                SERVICE_TIERS.find((option) => option.value === options.serviceTier)?.description
              }
              onChange={(value) => {
                update("serviceTier", value);
              }}
              options={SERVICE_TIERS.map((option) => [option.value, option.label])}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRIVACY_OPTIONS.map((option) => (
              <TogglePill
                key={option.value}
                active={options.privacy.includes(option.value)}
                onToggle={(active) => {
                  update("privacy", setMembership(options.privacy, option.value, active));
                }}
              >
                {option.label}
              </TogglePill>
            ))}
            <TogglePill
              active={!options.fallbacks}
              onToggle={(active) => {
                update("fallbacks", !active);
              }}
            >
              Disable fallback
            </TogglePill>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2">
            <TinyTextField
              label="Allow"
              value={formatList(options.allowProviders)}
              placeholder="anthropic"
              onChange={(value) => {
                update("allowProviders", parseList(value));
              }}
            />
            <TinyTextField
              label="Deny"
              value={formatList(options.denyProviders)}
              placeholder="openai"
              onChange={(value) => {
                update("denyProviders", parseList(value));
              }}
            />
            <TinyTextField
              label="Order"
              value={formatList(options.providerOrder)}
              placeholder="anthropic, google"
              onChange={(value) => {
                update("providerOrder", parseList(value));
              }}
            />
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--color-text-muted)]">Budgets</span>
            <span className="data text-[10px] text-[var(--color-text-faint)]">Cost + thought</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <TinyNumberField
              label="Prompt $/M"
              value={options.maxPromptCost}
              onChange={(value) => {
                updateNumber("maxPromptCost", value);
              }}
            />
            <TinyNumberField
              label="Output $/M"
              value={options.maxCompletionCost}
              onChange={(value) => {
                updateNumber("maxCompletionCost", value);
              }}
            />
            <TinyNumberField
              label="Request $"
              value={options.maxRequestCost}
              step="0.01"
              onChange={(value) => {
                updateNumber("maxRequestCost", value);
              }}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TinySelect
              label="Reasoning"
              value={options.reasoning}
              onChange={(value) => {
                update("reasoning", value);
              }}
              options={[
                ["default", "Default"],
                ["off", "Off"],
                ["minimal", "Minimal"],
                ["low", "Low"],
                ["medium", "Medium"],
                ["high", "High"],
                ["max", "Max"],
              ]}
            />
            <TinyNumberField
              label="Reasoning tokens"
              value={options.reasoningTokens}
              onChange={(value) => {
                updateNumber("reasoningTokens", value);
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUANTIZATION_OPTIONS.map((quantization) => (
              <TogglePill
                key={quantization}
                active={options.quantizations.includes(quantization)}
                onToggle={(active) => {
                  update(
                    "quantizations",
                    setMembership(options.quantizations, quantization, active),
                  );
                }}
              >
                {quantization}
              </TogglePill>
            ))}
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-medium text-[var(--color-text-muted)]">
              Diagnostics
            </span>
            <span className="data text-[10px] text-[var(--color-text-faint)]">
              Mostly OpenRouter
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <TinySelect
              label="Cache"
              value={options.cache}
              onChange={(value) => {
                update("cache", value);
              }}
              options={[
                ["off", "Off"],
                ["ephemeral", "Ephemeral"],
                ["ephemeral-5m", "5m"],
                ["ephemeral-1h", "1h"],
              ]}
            />
            <TinySelect
              label="Search"
              value={options.webSearch}
              onChange={(value) => {
                update("webSearch", value);
              }}
              options={[
                ["off", "Off"],
                ["auto", "Auto"],
                ["native", "Native"],
                ["exa", "Exa"],
              ]}
            />
            <TinySelect
              label="Logprobs"
              value={options.logprobs}
              onChange={(value) => {
                update("logprobs", value);
              }}
              options={[
                ["off", "Off"],
                ["basic", "Basic"],
                ["top5", "Top 5"],
              ]}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TogglePill
              active={options.responseHealing}
              onToggle={(active) => {
                update("responseHealing", active);
              }}
            >
              Response healing
            </TogglePill>
            <TogglePill
              active={options.includeCost}
              onToggle={(active) => {
                update("includeCost", active);
              }}
            >
              Include cost
            </TogglePill>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TinyTextField
              label="Fallback models"
              value={formatList(options.fallbackModels)}
              placeholder="anthropic/claude-haiku-4.5"
              onChange={(value) => {
                update("fallbackModels", parseList(value));
              }}
            />
            <TinyTextField
              label="Tags"
              value={formatList(options.tags)}
              placeholder="bench:routing"
              onChange={(value) => {
                update("tags", parseList(value));
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Form primitives ──────────────────────────────────────────────────

function FieldGroup({
  label,
  tooltip,
  children,
}: {
  label: string;
  tooltip?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1 text-[12px] font-medium text-[var(--color-text-muted)]">
        {label}
        {tooltip && <InfoIcon content={tooltip} width={240} />}
      </span>
      {children}
    </div>
  );
}

function FieldNumber({
  label,
  tooltip,
  value,
  onChange,
  min,
  max,
  step,
  width,
}: {
  label: string;
  tooltip?: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  width: number;
}) {
  return (
    <FieldGroup label={label} tooltip={tooltip}>
      <input
        aria-label={label}
        type="number"
        value={value}
        onChange={(e) => {
          onChange(Math.max(min, Math.min(max, Number(e.target.value))));
        }}
        min={min}
        max={max}
        step={step}
        style={{ width }}
        className="data h-8 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] transition-colors focus:border-[var(--color-border-strong)]"
      />
    </FieldGroup>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: string }[];
}) {
  return (
    <div className="flex h-8 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => {
            onChange(option.value);
          }}
          className={`cursor-pointer rounded-[var(--radius-pill)] px-3 text-[12px] font-medium transition-colors ${
            value === option.value
              ? "bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TogglePill({
  active,
  onToggle,
  children,
}: {
  active: boolean;
  onToggle: (active: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        onToggle(!active);
      }}
      className={`h-6 cursor-pointer rounded-[var(--radius-pill)] border px-2 text-[11px] transition-colors ${
        active
          ? "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)]"
          : "border-[var(--color-border)] bg-transparent text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

function TinyTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-faint)]">{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        className="h-7 min-w-0 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 data text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-border-strong)]"
      />
    </label>
  );
}

function TinyNumberField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number | undefined;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-faint)]">{label}</span>
      <input
        aria-label={label}
        type="number"
        min={0}
        step={step ?? "1"}
        value={value ?? ""}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="h-7 min-w-0 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 data text-[11px] text-[var(--color-text)] focus:border-[var(--color-border-strong)]"
      />
    </label>
  );
}

function TinySelect<T extends string>({
  label,
  value,
  options,
  tooltip,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  tooltip?: string;
  onChange: (value: T) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] text-[var(--color-text-faint)]" title={tooltip}>
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => {
          onChange(event.target.value as T);
        }}
        className="h-7 min-w-0 cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-[11px] text-[var(--color-text)] focus:border-[var(--color-border-strong)]"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
    </label>
  );
}
