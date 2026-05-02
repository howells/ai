"use client";

import { canRouteModelToProvider, resolveProviderModelId } from "@howells/ai/models";
import type {
  ModelService,
  ModelTask,
  ModelTier,
  ProviderRoute,
} from "@howells/ai";
import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type BenchmarkResult,
  BenchmarkTable,
  type MetricKey,
} from "../components/benchmark-table";
import {
  BenchmarkToolbar,
  type ToolbarFilters,
} from "../components/benchmark-toolbar";
import { LegendBar } from "../components/legend-bar";
import { RunQueueStrip } from "../components/run-queue-strip";
import { InfoIcon } from "../components/tooltip";
import { METRIC_META, pluralize } from "../lib/format";
import {
  ALL_PROVIDERS,
  ALL_SERVICES,
  ALL_TASKS,
  ALL_TIERS,
  MODEL_ROWS,
  type ModelRow,
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
  rounds: number;
  maxTokens: number;
  selectionKey: string;
  providerKey: string;
}

const DEFAULT_PROMPTS = [
  "Explain the concept of material authenticity in architecture in 2-3 sentences.",
  "What are the three most important factors when choosing a typeface for a digital product?",
  "Describe the difference between a specification and a standard in materials science.",
];

const DEFAULT_PROMPT = DEFAULT_PROMPTS[0] ?? "";

const INITIAL_FILTERS: ToolbarFilters = {
  search: "",
  tiers: new Set(),
  tasks: new Set(),
  services: new Set(),
  providers: new Set(),
  configuredOnly: true,
};

const INITIAL_SELECTION: RowSelectionState = (() => {
  const next: RowSelectionState = {};
  for (const row of MODEL_ROWS) {
    if (row.group === "defaults") next[row.id] = true;
  }
  return next;
})();

export default function BenchmarkPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [rounds, setRounds] = useState(1);
  const [maxTokens, setMaxTokens] = useState(200);
  const [metric, setMetric] = useState<MetricKey>("ttft");
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("benchmark.settingsOpen");
    if (saved === "1") setSettingsOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "benchmark.settingsOpen",
      settingsOpen ? "1" : "0",
    );
  }, [settingsOpen]);

  const [filters, setFilters] = useState<ToolbarFilters>(INITIAL_FILTERS);
  const [rowSelection, setRowSelection] =
    useState<RowSelectionState>(INITIAL_SELECTION);

  const [availableProviders, setAvailableProviders] = useState<ProviderRoute[]>(
    [],
  );
  const [configLoaded, setConfigLoaded] = useState(false);
  const [region, setRegion] = useState<string | null>(null);

  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [running, setRunning] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<RunSnapshot | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Load config ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/benchmark");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const config = (await response.json()) as BenchmarkConfig;
        if (cancelled) return;
        setAvailableProviders(config.availableProviders);
      } catch (err) {
        console.error("Failed to load benchmark config:", err);
      } finally {
        if (!cancelled) setConfigLoaded(true);
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
        if (!haystack.includes(search)) return false;
      }
      if (filters.services.size > 0 && !filters.services.has(row.service)) {
        return false;
      }
      if (filters.tiers.size > 0) {
        const rowTiers = tiersForRow(row);
        if (!rowTiers.some((tier) => filters.tiers.has(tier))) return false;
      }
      if (filters.tasks.size > 0) {
        if (!row.tasks.some((task) => filters.tasks.has(task))) return false;
      }
      return true;
    });
  }, [filters]);

  const visibleProviders = useMemo<ProviderRoute[]>(() => {
    return ALL_PROVIDERS.filter((provider) => {
      if (filters.providers.size > 0 && !filters.providers.has(provider)) {
        return false;
      }
      if (filters.configuredOnly && !availableProviders.includes(provider)) {
        return false;
      }
      return true;
    });
  }, [filters.providers, filters.configuredOnly, availableProviders]);

  // ── Facet counts ───────────────────────────────────────────────────
  const tierCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ALL_TIERS.map((t) => [t, 0]),
    ) as Record<ModelTier, number>;
    for (const row of MODEL_ROWS) {
      for (const tier of tiersForRow(row)) counts[tier]++;
    }
    return counts;
  }, []);

  const taskCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ALL_TASKS.map((t) => [t, 0]),
    ) as Record<ModelTask, number>;
    for (const row of MODEL_ROWS) {
      for (const task of row.tasks) counts[task]++;
    }
    return counts;
  }, []);

  const serviceCounts = useMemo(() => {
    const counts = Object.fromEntries(
      ALL_SERVICES.map((s) => [s, 0]),
    ) as Record<ModelService, number>;
    for (const row of MODEL_ROWS) counts[row.service]++;
    return counts;
  }, []);

  // ── Runs derived from selection × visible providers ────────────────
  const runs = useMemo<Run[]>(() => {
    const out: Run[] = [];
    for (const row of filteredRows) {
      if (!rowSelection[row.id]) continue;
      for (const provider of visibleProviders) {
        if (!canRouteModelToProvider(row.id, provider)) continue;
        if (!availableProviders.includes(provider)) continue;
        out.push({
          id: `${provider}:${row.id}`,
          model: resolveProviderModelId(row.id, provider),
          provider,
          label: row.name,
        });
      }
    }
    return out;
  }, [filteredRows, rowSelection, visibleProviders, availableProviders]);

  const selectedModelCount = useMemo(
    () => filteredRows.filter((row) => rowSelection[row.id]).length,
    [filteredRows, rowSelection],
  );

  const eligibleProviderCount = useMemo(
    () =>
      visibleProviders.filter((p) => availableProviders.includes(p)).length,
    [visibleProviders, availableProviders],
  );

  const totalRequests = runs.length * rounds;
  const completed = useMemo(
    () => results.filter((r) => !r.averaged).length,
    [results],
  );
  const displayResults =
    rounds > 1 ? results.filter((r) => r.averaged) : results;

  const errorCount = useMemo(
    () => results.filter((r) => !r.averaged && r.error).length,
    [results],
  );
  const fastestTtft = useMemo<number | null>(() => {
    const ttfts = results
      .filter((r) => !r.error && (rounds > 1 ? r.averaged : !r.averaged))
      .map((r) => r.ttft)
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ttfts.length === 0) return null;
    return Math.min(...ttfts);
  }, [results, rounds]);

  // ── Stale detection ─────────────────────────────────────────────────
  const currentSnapshot = useMemo<RunSnapshot>(
    () => ({
      prompt,
      rounds,
      maxTokens,
      selectionKey: Object.keys(rowSelection)
        .filter((k) => rowSelection[k])
        .sort()
        .join("|"),
      providerKey: visibleProviders.join("|"),
    }),
    [prompt, rounds, maxTokens, rowSelection, visibleProviders],
  );

  const isStale = useMemo(() => {
    if (!lastSnapshot) return false;
    if (results.length === 0) return false;
    return (
      lastSnapshot.prompt !== currentSnapshot.prompt ||
      lastSnapshot.rounds !== currentSnapshot.rounds ||
      lastSnapshot.maxTokens !== currentSnapshot.maxTokens
    );
  }, [lastSnapshot, currentSnapshot, results.length]);

  // ── Disabled-Run reason ─────────────────────────────────────────────
  let disabledReason: string | undefined;
  if (!configLoaded) disabledReason = "Loading configuration…";
  else if (selectedModelCount === 0)
    disabledReason = "Select at least one model";
  else if (eligibleProviderCount === 0)
    disabledReason = "No configured provider matches the selection";
  else if (runs.length === 0)
    disabledReason = "Selected models have no compatible provider routes";

  // ── Run benchmark ──────────────────────────────────────────────────
  const runBenchmark = useCallback(async () => {
    if (running) {
      abortRef.current?.abort();
      setRunning(false);
      return;
    }

    if (runs.length === 0) return;

    setResults([]);
    setRunning(true);
    setLastSnapshot(currentSnapshot);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: rounds > 1 ? DEFAULT_PROMPTS.slice(0, rounds) : prompt,
          runs,
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
            if (!region && result.region) setRegion(result.region);
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
  }, [running, runs, prompt, rounds, maxTokens, region, currentSnapshot]);

  // ── Bulk selection helpers ─────────────────────────────────────────
  function selectAllFiltered() {
    setRowSelection((prev) => {
      const next: RowSelectionState = { ...prev };
      for (const row of filteredRows) next[row.id] = true;
      return next;
    });
  }
  function clearSelection() {
    setRowSelection({});
  }

  return (
    <div className="flex h-svh flex-col bg-[var(--color-canvas)] text-[var(--color-text)]">
      {/* App header — V7 dot-bullet eyebrow, sentence-case throughout. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-[var(--color-border)] border-b bg-[var(--color-surface)] px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text)]"
          />
          <a
            href="https://github.com/howells/ai"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-sm text-[var(--color-text)] transition-colors hover:text-[var(--color-text-muted)]"
          >
            Howells AI
          </a>
          <span className="text-[var(--color-text-faint)]">·</span>
          <span className="text-sm text-[var(--color-text-muted)]">
            Benchmark
          </span>
          <span className="ml-2 hidden text-[12px] text-[var(--color-text-subtle)] md:inline">
            Compare provider routes for{" "}
            <span className="data text-[var(--color-text-muted)]">
              @howells/ai
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Settings panel — collapsible */}
      <section
        className={`shrink-0 border-[var(--color-border)] border-b bg-[var(--color-surface)] transition-[max-height,padding] duration-200 ease-out ${
          settingsOpen
            ? "max-h-72 px-6 py-3"
            : "max-h-9 overflow-hidden px-6 py-1.5"
        }`}
      >
        {settingsOpen ? (
          <SettingsPanelOpen
            prompt={prompt}
            onPromptChange={setPrompt}
            rounds={rounds}
            onRoundsChange={setRounds}
            maxTokens={maxTokens}
            onMaxTokensChange={setMaxTokens}
            metric={metric}
            onMetricChange={setMetric}
            density={density}
            onDensityChange={setDensity}
            onCollapse={() => setSettingsOpen(false)}
          />
        ) : (
          <SettingsPanelCollapsed
            prompt={prompt}
            rounds={rounds}
            maxTokens={maxTokens}
            metric={metric}
            density={density}
            onExpand={() => setSettingsOpen(true)}
          />
        )}
      </section>

      {/* Filter toolbar */}
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

      {/* Run-queue strip */}
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
        hasResults={displayResults.length > 0}
        onRun={runBenchmark}
      />

      {/* Table fills remaining viewport */}
      <main className="min-h-0 flex-1">
        {configLoaded ? (
          <BenchmarkTable
            rows={filteredRows}
            visibleProviders={visibleProviders}
            configuredProviders={availableProviders}
            results={displayResults}
            metric={metric}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            density={density}
            rounds={rounds}
            runningKey={null}
            stale={isStale}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-faint)]">
            Loading benchmark configuration…
          </div>
        )}
      </main>

      {/* Status bar */}
      <LegendBar
        metric={metric}
        configuredCount={availableProviders.length}
        totalProviders={ALL_PROVIDERS.length}
        region={region}
        stale={isStale}
      />
    </div>
  );
}

// ── Settings panel ──────────────────────────────────────────────────

interface SettingsOpenProps {
  prompt: string;
  onPromptChange: (next: string) => void;
  rounds: number;
  onRoundsChange: (next: number) => void;
  maxTokens: number;
  onMaxTokensChange: (next: number) => void;
  metric: MetricKey;
  onMetricChange: (next: MetricKey) => void;
  density: "comfortable" | "compact";
  onDensityChange: (next: "comfortable" | "compact") => void;
  onCollapse: () => void;
}

function SettingsPanelOpen({
  prompt,
  onPromptChange,
  rounds,
  onRoundsChange,
  maxTokens,
  onMaxTokensChange,
  metric,
  onMetricChange,
  density,
  onDensityChange,
  onCollapse,
}: SettingsOpenProps) {
  const meta = METRIC_META[metric];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-text-muted)]"
          />
          <span className="text-[13px] font-medium text-[var(--color-text)]">
            Prompt
          </span>
          <span className="text-[11px] text-[var(--color-text-faint)]">
            {rounds > 1
              ? `cycles through ${rounds} prompts`
              : `${prompt.length} characters`}
          </span>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
        >
          Collapse
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={2}
        className="w-full resize-none rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-border-strong)]"
        placeholder="Enter your test prompt…"
      />

      <div className="flex flex-wrap items-end gap-3">
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
              <strong className="block pb-1 text-[var(--color-text)]">
                {meta.full}
              </strong>
              {meta.description}
            </>
          }
        >
          <SegmentedControl
            value={metric}
            onChange={(value) => onMetricChange(value as MetricKey)}
            options={[
              { value: "ttft", label: "TTFT" },
              { value: "tokensPerSecond", label: "TPS" },
              { value: "totalTime", label: "TOTAL" },
            ]}
          />
        </FieldGroup>

        <FieldGroup label="Density">
          <SegmentedControl
            value={density}
            onChange={(v) => onDensityChange(v as "comfortable" | "compact")}
            options={[
              { value: "comfortable", label: "Cozy" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

interface SettingsCollapsedProps {
  prompt: string;
  rounds: number;
  maxTokens: number;
  metric: MetricKey;
  density: "comfortable" | "compact";
  onExpand: () => void;
}

function SettingsPanelCollapsed({
  prompt,
  rounds,
  maxTokens,
  metric,
  density,
  onExpand,
}: SettingsCollapsedProps) {
  const meta = METRIC_META[metric];
  return (
    <div className="flex h-6 items-center gap-2.5 text-[12px] text-[var(--color-text-muted)]">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-text-muted)]"
      />
      <span className="font-medium text-[var(--color-text)]">Prompt</span>
      <span className="truncate text-[var(--color-text-muted)]">
        {prompt}
      </span>
      <span className="data ml-2 shrink-0 tabular-nums text-[11px] text-[var(--color-text-faint)]">
        {rounds}r · {maxTokens}t · {meta.short} · {density}
      </span>
      <button
        type="button"
        onClick={onExpand}
        className="ml-auto cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-0.5 text-[12px] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      >
        Expand
      </button>
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
        type="number"
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max, Number(e.target.value))))
        }
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
          onClick={() => onChange(option.value)}
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
