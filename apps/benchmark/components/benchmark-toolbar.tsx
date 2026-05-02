"use client";

import type { ModelService, ModelTask, ModelTier, ProviderRoute } from "@howells/ai";
import { FacetMenu } from "./facet-menu";
import {
  ALL_TASKS,
  ALL_TIERS,
  providerLabel,
  serviceLabel,
  TASK_DESCRIPTIONS,
  taskLabel,
  TIER_DESCRIPTIONS,
} from "../lib/models";

export interface ToolbarFilters {
  search: string;
  tiers: Set<ModelTier>;
  tasks: Set<ModelTask>;
  services: Set<ModelService>;
  providers: Set<ProviderRoute>;
  configuredOnly: boolean;
}

interface BenchmarkToolbarProps {
  filters: ToolbarFilters;
  onFiltersChange: (next: ToolbarFilters) => void;
  availableProviders: readonly ProviderRoute[];
  allProviders: readonly ProviderRoute[];
  allServices: readonly ModelService[];
  tierCounts: Record<ModelTier, number>;
  taskCounts: Record<ModelTask, number>;
  serviceCounts: Record<ModelService, number>;
  modelCount: number;
  filteredCount: number;
  selectedModelCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function BenchmarkToolbar({
  filters,
  onFiltersChange,
  availableProviders,
  allProviders,
  allServices,
  tierCounts,
  taskCounts,
  serviceCounts,
  modelCount,
  filteredCount,
  selectedModelCount,
  onSelectAll,
  onClearSelection,
}: BenchmarkToolbarProps) {
  function update<K extends keyof ToolbarFilters>(
    key: K,
    value: ToolbarFilters[K],
  ) {
    onFiltersChange({ ...filters, [key]: value });
  }

  const hasActiveFilters =
    filters.search.length > 0 ||
    filters.tiers.size > 0 ||
    filters.tasks.size > 0 ||
    filters.services.size > 0 ||
    filters.providers.size > 0 ||
    !filters.configuredOnly;

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-[var(--color-border)] border-b bg-[var(--color-surface)] px-6">
      <div className="relative">
        <svg
          aria-hidden="true"
          className="-translate-y-1/2 absolute top-1/2 left-3 h-3.5 w-3.5 text-[var(--color-text-faint)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <title>Search</title>
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          value={filters.search}
          onChange={(event) => update("search", event.target.value)}
          placeholder="Filter"
          className="h-8 w-44 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] pr-3 pl-8 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] transition-colors focus:border-[var(--color-border-strong)]"
        />
      </div>

      <FacetMenu<ModelTier>
        label="Tier"
        selected={filters.tiers}
        onChange={(next) => update("tiers", next)}
        options={ALL_TIERS.map((tier) => ({
          value: tier,
          label: tier,
          count: tierCounts[tier],
          description: TIER_DESCRIPTIONS[tier],
        }))}
        width={300}
      />

      <FacetMenu<ModelTask>
        label="Task"
        selected={filters.tasks}
        onChange={(next) => update("tasks", next)}
        options={ALL_TASKS.map((task) => ({
          value: task,
          label: taskLabel(task),
          count: taskCounts[task],
          description: TASK_DESCRIPTIONS[task],
        }))}
        width={320}
      />

      <FacetMenu<ModelService>
        label="Family"
        selected={filters.services}
        onChange={(next) => update("services", next)}
        options={allServices.map((service) => ({
          value: service,
          label: serviceLabel(service),
          count: serviceCounts[service],
        }))}
      />

      <FacetMenu<ProviderRoute>
        label="Provider"
        selected={filters.providers}
        onChange={(next) => update("providers", next)}
        options={allProviders.map((provider) => ({
          value: provider,
          label: providerLabel(provider),
          disabled:
            filters.configuredOnly && !availableProviders.includes(provider),
        }))}
        width={220}
      />

      <ConfiguredToggle
        active={filters.configuredOnly}
        onToggle={() => update("configuredOnly", !filters.configuredOnly)}
      />

      <span className="ml-auto hidden whitespace-nowrap text-[12px] text-[var(--color-text-muted)] lg:inline">
        <span className="data tabular-nums text-[var(--color-text)]">
          {filteredCount}
        </span>
        <span className="text-[var(--color-text-faint)]">/{modelCount}</span>
        <span className="mx-1 text-[var(--color-text-faint)]">·</span>
        <span className="data tabular-nums text-[var(--color-text)]">
          {selectedModelCount}
        </span>{" "}
        selected
      </span>

      {/*
       * Bulk-action buttons live above 1280px only — narrow viewports rely on
       * the row checkboxes and the "Configured" toggle, keeping the toolbar
       * to a single calm line.
       */}
      <button
        type="button"
        onClick={onSelectAll}
        className="hidden xl:inline-flex cursor-pointer whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text)]"
      >
        Select visible
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        disabled={selectedModelCount === 0}
        className="hidden xl:inline-flex cursor-pointer whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Clear
      </button>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() =>
            onFiltersChange({
              search: "",
              tiers: new Set(),
              tasks: new Set(),
              services: new Set(),
              providers: new Set(),
              configuredOnly: true,
            })
          }
          className="cursor-pointer whitespace-nowrap rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text)]"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/*
 * Plain pill toggle: "Configured" when active, "All providers" when inactive.
 * No checkbox icon and no overflow badge — the label states the world.
 */
function ConfiguredToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={
        active
          ? "Showing only providers with API keys configured"
          : "Showing all providers, including those without keys"
      }
      className={`h-8 cursor-pointer whitespace-nowrap rounded-[var(--radius-pill)] border px-3 text-[12px] transition-colors ${
        active
          ? "border-transparent bg-[var(--color-cta)] text-[var(--color-cta-fg)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      }`}
    >
      {active ? "Configured" : "All providers"}
    </button>
  );
}
