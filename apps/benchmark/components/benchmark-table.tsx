"use client";

import type { ProviderRoute } from "@howells/ai";
import type { Row } from "@tanstack/react-table";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
  formatMs,
  formatTpsWithUnit,
  formatUsd,
  METRIC_META,
  type MetricKey,
} from "../lib/format";
import type { HistoricalProviderSummary } from "../lib/history-types";
import {
  GROUP_LABELS,
  GROUPS,
  type ModelGroup,
  type ModelRow,
  providerLabel,
  routeCellFor,
} from "../lib/models";
import {
  bestProviderComparison,
  formatProviderScore,
  getProviderComparisons,
  isBetterMetric,
  resultMetricValue,
  type ProviderComparisons,
} from "../lib/result-insights";
import { Tooltip } from "./tooltip";

export type { MetricKey };

export interface BenchmarkResult {
  model: string;
  provider: ProviderRoute;
  label: string;
  ttft: number;
  totalTime: number;
  outputTokens: number;
  inputTokens: number;
  tokensPerSecond: number;
  costUsd?: number;
  output: string;
  error?: string;
  region: string;
  round?: number;
  averaged?: boolean;
}

interface BenchmarkTableProps {
  rows: ModelRow[];
  visibleProviders: readonly ProviderRoute[];
  configuredProviders: readonly ProviderRoute[];
  results: BenchmarkResult[];
  historicalProviders?: readonly HistoricalProviderSummary[];
  metric: MetricKey;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (next: RowSelectionState) => void;
  density: "comfortable" | "compact";
  grouped: boolean;
  rounds: number;
  runningKey: string | null;
  stale: boolean;
  openRouterVariant?: string;
}

export function BenchmarkTable({
  rows,
  visibleProviders,
  configuredProviders,
  results,
  historicalProviders = [],
  metric,
  rowSelection,
  onRowSelectionChange,
  density,
  grouped: showGroups,
  rounds,
  runningKey,
  stale,
  openRouterVariant,
}: BenchmarkTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const metricMeta = METRIC_META[metric];
  const resultHighlights = useMemo(
    () => getResultHighlights(rows, visibleProviders, results, metric),
    [rows, visibleProviders, results, metric],
  );
  const historicalProviderMap = useMemo(
    () =>
      Object.fromEntries(
        historicalProviders.map((summary) => [summary.provider, summary]),
      ) as Partial<Record<ProviderRoute, HistoricalProviderSummary>>,
    [historicalProviders],
  );

  const columns = useMemo<ColumnDef<ModelRow>[]>(() => {
    const base: ColumnDef<ModelRow>[] = [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllRowsSelected()}
            indeterminate={table.getIsSomeRowsSelected()}
            onChange={(value) => table.toggleAllRowsSelected(value)}
            aria-label="Select all rows"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onChange={(value) => row.toggleSelected(value)}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        enableSorting: false,
        size: 36,
      },
      {
        id: "model",
        accessorKey: "name",
        header: () => null,
        cell: ({ row }) => <ModelCell row={row.original} density={density} />,
        size: 260,
      },
    ];

    for (const provider of visibleProviders) {
      const providerComparison = resultHighlights.providerComparisons[provider];
      const historicalComparison = historicalProviderMap[provider]?.scores[metric];
      const tooltipComparison =
        providerComparison && !stale ? providerComparison : historicalComparison;
      const tooltipComparisonLabel =
        providerComparison && !stale
          ? "Current matched route score"
          : historicalComparison
            ? "Historical matched route score"
            : undefined;
      const isFastestProvider = resultHighlights.fastestProvider === provider;
      base.push(      {
        id: provider,
        accessorFn: (row) => {
          const cell = getResultCell(results, row.name, provider, metric);
          return cell ?? Number.POSITIVE_INFINITY;
        },
        header: () => (
          <Tooltip
            content={
              <>
                <strong className="block pb-1 text-[var(--color-text)]">
                  {providerLabel(provider)}
                </strong>
                Cells show {metricMeta.full.toLowerCase()} ·{" "}
                {metricMeta.direction === "lower" ? "lower wins" : "higher wins"}.
                {tooltipComparison && tooltipComparisonLabel && (
                  <span className="mt-1 block text-[var(--color-text-muted)]">
                    {tooltipComparisonLabel}:{" "}
                    {formatProviderScore(tooltipComparison.score)} across{" "}
                    {tooltipComparison.matchedModels} matched{" "}
                    {tooltipComparison.matchedModels === 1 ? "model" : "models"}
                    {isFastestProvider ? " · fastest" : ""}
                  </span>
                )}
              </>
            }
            side="bottom"
            align="end"
          >
            <span className="text-[12px] font-medium text-[var(--color-text)]">
              {providerLabel(provider)}
            </span>
          </Tooltip>
        ),
        cell: ({ row }) => {
          const key = resultKey(row.original.name, provider);
          return (
            <ProviderCell
              row={row.original}
              provider={provider}
              results={results}
              metric={metric}
              rounds={rounds}
              running={runningKey === `${provider}::${row.original.name}`}
              configuredProviders={configuredProviders}
              stale={stale}
              isFastestModel={resultHighlights.fastestModelKey === key}
              openRouterVariant={openRouterVariant}
            />
          );
        },
        sortingFn: (a, b) => {
          const av = getResultCell(results, a.original.name, provider, metric);
          const bv = getResultCell(results, b.original.name, provider, metric);
          if (av === undefined && bv === undefined) return 0;
          if (av === undefined) return 1;
          if (bv === undefined) return -1;
          return av - bv;
        },
        size: 110,
      });
    }

    return base;
  }, [
    visibleProviders,
    results,
    metric,
    rounds,
    runningKey,
    configuredProviders,
    metricMeta,
    stale,
    openRouterVariant,
    density,
    resultHighlights,
    historicalProviderMap,
  ]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { rowSelection, sorting, columnVisibility },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      onRowSelectionChange(next);
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: true,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sortedRows = table.getRowModel().rows;
  const groupedRows = useMemo(() => {
    const map: Record<ModelGroup, typeof sortedRows> = {
      defaults: [],
      "task-optimized": [],
      "provider-optimized": [],
    };
    for (const row of sortedRows) {
      map[row.original.group].push(row);
    }
    return map;
  }, [sortedRows]);

  const cellPaddingY = density === "compact" ? "py-1" : "py-2.5";

  return (
    <div className="scroll-shadow-x scrollbar-thin h-full overflow-auto">
      <table className="w-full border-separate border-spacing-0">
        {/*
         * Sticky lives on the <tr> so the entire header band moves as one
         * layer — eliminates the per-cell paint race that bled body rows
         * above the header during vertical scroll. The hard 1px bottom
         * border doubles as a crisp seam between fixed and scrolling content.
         */}
        <thead className="sticky top-0 z-30">
          <tr className="sticky top-0 z-30">
            {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
              const isCorner = idx <= 1;
              const isModelCol = idx === 1;
              const isProviderCol = idx > 1;
              const sizeStyle = isProviderCol
                ? {
                    width: header.column.columnDef.size,
                    minWidth: header.column.columnDef.size,
                    maxWidth: header.column.columnDef.size,
                  }
                : { minWidth: header.column.columnDef.size };
              return (
                <th
                  key={header.id}
                  scope="col"
                  className={`group/th h-9 border-[var(--color-border)] border-b bg-[var(--color-canvas)] px-4 text-left align-middle text-[var(--color-text-subtle)] ${
                    isCorner ? "sticky top-0 z-30" : ""
                  } ${isModelCol ? "border-[var(--color-border)] border-r" : ""}`}
                  style={{
                    ...sizeStyle,
                    left: idx === 0 ? 0 : idx === 1 ? 36 : undefined,
                  }}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() &&
                    idx > 1 ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex w-full cursor-pointer items-center justify-end gap-1 text-inherit"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      <SortIndicator direction={header.column.getIsSorted()} />
                    </button>
                  ) : (
                    <div className="flex w-full items-center justify-between">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        {showGroups
          ? GROUPS.map((groupKey) => {
              const groupRows = groupedRows[groupKey];
              if (groupRows.length === 0) return null;
              return (
                <tbody key={groupKey}>
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="sticky top-9 z-20 border-b border-[var(--color-border)] bg-[var(--color-canvas)] pt-5 pr-4 pb-2 pl-[60px]"
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="text-[11px] font-medium text-[var(--color-text-muted)]">
                          {GROUP_LABELS[groupKey]}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-faint)]">
                          {groupRows.length}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {groupRows.map((row) => (
                    <BenchmarkTableRow
                      key={row.id}
                      row={row}
                      cellPaddingY={cellPaddingY}
                    />
                  ))}
                </tbody>
              );
            })
          : (
              <tbody>
                {sortedRows.map((row) => (
                  <BenchmarkTableRow
                    key={row.id}
                    row={row}
                    cellPaddingY={cellPaddingY}
                  />
                ))}
              </tbody>
            )}

        {table.getRowModel().rows.length === 0 && (
          <tbody>
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-12 text-center text-sm text-[var(--color-text-faint)]"
              >
                No models match the current filters.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}

function BenchmarkTableRow({
  row,
  cellPaddingY,
}: {
  row: Row<ModelRow>;
  cellPaddingY: string;
}) {
  const isSelected = row.getIsSelected();
  const rowBg = isSelected
    ? "bg-[var(--color-row-selected)]"
    : "bg-[var(--color-surface)]";

  return (
    <tr
      key={row.id}
      className={`group ${rowBg} transition-colors hover:bg-[var(--color-row-hover)]`}
    >
      {row.getVisibleCells().map((cell, idx) => {
        const isSticky = idx <= 1;
        const isModelCol = idx === 1;
        return (
          <td
            key={cell.id}
            className={`border-[var(--color-border)] border-b px-4 ${cellPaddingY} ${
              idx === 0 ? "" : "align-middle"
            } ${
              isSticky
                ? `z-10 ${rowBg} group-hover:bg-[var(--color-row-hover)]`
                : ""
            } ${isModelCol ? "border-[var(--color-border)] border-r" : ""}`}
            style={{
              position: isSticky ? "sticky" : undefined,
              left: idx === 0 ? 0 : idx === 1 ? 36 : undefined,
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );
}

function getResultCell(
  results: BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
  metric: MetricKey,
): number | undefined {
  const cell = findResult(results, modelName, provider);
  if (!cell || cell.error) return undefined;
  return cell[metric];
}

function findResult(
  results: readonly BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
): BenchmarkResult | undefined {
  const cell = results.find(
    (r) =>
      r.provider === provider &&
      (r.label === modelName || r.label.startsWith(`${modelName} :`)),
  );
  return cell;
}

function resultKey(modelName: string, provider: ProviderRoute): string {
  return `${provider}::${modelName}`;
}

function formatMetricValue(value: number, metric: MetricKey): string {
  return metric === "tokensPerSecond"
    ? formatTpsWithUnit(value)
    : formatMs(value);
}

function getResultHighlights(
  rows: readonly ModelRow[],
  visibleProviders: readonly ProviderRoute[],
  results: readonly BenchmarkResult[],
  metric: MetricKey,
): {
  fastestModelKey: string | null;
  fastestProvider: ProviderRoute | null;
  providerComparisons: ProviderComparisons;
} {
  const rowNames = new Set(rows.map((row) => row.name));
  const providerSet = new Set(visibleProviders);
  const visibleResults = results.filter(
    (result) =>
      !result.error &&
      rowNames.has(baseResultLabel(result.label)) &&
      providerSet.has(result.provider) &&
      Number.isFinite(resultMetricValue(result, metric)),
  );

  let fastestModelKey: string | null = null;
  let fastestModelValue: number | null = null;
  for (const result of visibleResults) {
    const value = resultMetricValue(result, metric);
    if (
      fastestModelValue === null ||
      isBetterMetric(value, fastestModelValue, metric)
    ) {
      fastestModelValue = value;
      fastestModelKey = resultKey(baseResultLabel(result.label), result.provider);
    }
  }

  const providerComparisons = getProviderComparisons(
    visibleResults,
    metric,
    visibleProviders,
  );
  const fastestProvider =
    bestProviderComparison(providerComparisons, visibleProviders)?.provider ??
    null;

  return {
    fastestModelKey,
    fastestProvider,
    providerComparisons,
  };
}

function isBestInRow(
  results: BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
  metric: MetricKey,
): boolean {
  const here = getResultCell(results, modelName, provider, metric);
  if (here === undefined) return false;

  const rowValues = results
    .filter((r) => baseResultLabel(r.label) === modelName && !r.error)
    .map((r) => r[metric]);
  if (rowValues.length < 2) return false;

  return metric === "tokensPerSecond"
    ? here >= Math.max(...rowValues)
    : here <= Math.min(...rowValues);
}

function ModelCell({
  row,
  density,
}: {
  row: ModelRow;
  density: "comfortable" | "compact";
}) {
  const allSlots = [
    ...row.defaultSlots.map((s) => ({ kind: "default" as const, label: s })),
    ...row.taskSlots.map((s) => ({ kind: "task" as const, label: s })),
  ];
  const SLOT_CAP = 6;
  const visibleSlots = allSlots.slice(0, SLOT_CAP);
  const hiddenCount = Math.max(0, allSlots.length - visibleSlots.length);
  const nameSize = density === "compact" ? "text-xs" : "text-[13px]";

  return (
    <Tooltip
      content={
        <>
          <strong className="block pb-1 text-[var(--color-text)]">
            {row.name}
          </strong>
          <span className="block pb-1 text-[var(--color-text-faint)]">
            {row.id}
          </span>
          {visibleSlots.length > 0 && (
            <span className="block text-[var(--color-text-muted)]">
              {visibleSlots.map((s) => s.label).join(" · ")}
              {hiddenCount > 0 && ` · +${hiddenCount} more`}
            </span>
          )}
        </>
      }
      side="bottom"
      align="start"
      width={280}
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate font-medium text-[var(--color-text)] ${nameSize}`}>
          {row.name}
        </span>
        <span className="data ml-auto min-w-0 truncate text-[10px] text-[var(--color-text-faint)]">
          {row.id}
        </span>
      </div>
    </Tooltip>
  );
}

function ProviderCell({
  row,
  provider,
  results,
  metric,
  rounds,
  running,
  configuredProviders,
  stale,
  isFastestModel,
  openRouterVariant,
}: {
  row: ModelRow;
  provider: ProviderRoute;
  results: BenchmarkResult[];
  metric: MetricKey;
  rounds: number;
  running: boolean;
  configuredProviders: readonly ProviderRoute[];
  stale: boolean;
  isFastestModel: boolean;
  openRouterVariant?: string;
}) {
  const route = routeCellFor(row, provider, configuredProviders);
  const result = findResult(results, row.name, provider);
  const providerModelId =
    provider === "openrouter" && openRouterVariant && route.providerModelId
      ? `${route.providerModelId.replace(/:(nitro|exacto|floor)$/, "")}:${openRouterVariant}`
      : route.providerModelId;

  void rounds;

  if (route.status === "no-route") {
    // Permanent fact about the model/provider pair — render dim and quiet.
    // Distinct from the missing-key state below, which uses a warn pill.
    return (
      <CellShell>
        <span
          title={`${row.name} cannot route through ${providerLabel(provider)}`}
          className="block text-right text-xs text-[var(--color-text-faint)]"
        >
          —
        </span>
      </CellShell>
    );
  }

  if (running && !result) {
    return (
      <CellShell>
        <span className="pill pill--ghost data">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent-strong)]"
          />
          running
        </span>
      </CellShell>
    );
  }

  if (result?.error) {
    return (
      <CellShell>
        <span className="pill pill--error" title={result.error}>
          error
        </span>
      </CellShell>
    );
  }

  if (result) {
    const best = isBestInRow(results, row.name, provider, metric);
    const value = formatMetricValue(result[metric], metric);
    const cost =
      result.costUsd !== undefined ? formatUsd(result.costUsd) : undefined;
    const highlight = best || isFastestModel;
    const ariaLabel = isFastestModel
      ? "Fastest model"
      : best
        ? "Best in row"
        : undefined;

    return (
      <CellShell
        cost={cost}
        stale={stale}
        title={
          stale
            ? "Stale — inputs changed since this run"
            : result.model || providerModelId
        }
      >
        {highlight ? (
          <span
            className={`pill pill--best data tabular-nums ${
              stale ? "line-through decoration-1" : ""
            }`}
            aria-label={ariaLabel}
          >
            {value}
          </span>
        ) : (
          <span
            className={`pill pill--ghost data tabular-nums ${
              stale ? "line-through decoration-1" : ""
            }`}
          >
            {value}
          </span>
        )}
      </CellShell>
    );
  }

  if (route.status === "missing-key") {
    return (
      <CellShell>
        <span
          title={`Set ${envFor(provider)} to enable this route`}
          className="pill pill--warn"
        >
          <KeyIcon />
          no key
        </span>
      </CellShell>
    );
  }

  // Pre-run: blank cell shell so row geometry stays constant.
  return <CellShell route={providerModelId} />;
}

function baseResultLabel(label: string): string {
  return label.replace(/ :(nitro|exacto|floor)$/, "");
}

/*
 * Single cell scaffolding — pins the primary value to vertical center and
 * always reserves a 12px subline below it for cost (or a transparent
 * placeholder). Keeps row sweep flat regardless of which states (cost,
 * pill, em-dash, no-key chip) coexist in a row.
 */
function CellShell({
  children,
  cost,
  route,
  stale,
  title,
}: {
  children?: React.ReactNode;
  cost?: string;
  route?: string;
  stale?: boolean;
  title?: string;
}) {
  return (
    <div
      className={`flex flex-col items-end gap-0.5 ${stale ? "opacity-50" : ""}`}
      title={title}
    >
      <div className="flex h-5 items-center justify-end">{children}</div>
      <div className="flex h-3 items-center justify-end">
        {cost ? (
          <span
            className={`data text-[10px] text-[var(--color-text-faint)] ${
              stale ? "line-through decoration-1" : ""
            }`}
          >
            {cost}
          </span>
        ) : route ? (
          <span className="data max-w-[96px] truncate text-[10px] text-[var(--color-text-faint)]">
            {route}
          </span>
        ) : (
          <span aria-hidden="true" className="text-[10px] opacity-0">
            $0.0000
          </span>
        )}
      </div>
    </div>
  );
}

function envFor(provider: ProviderRoute): string {
  switch (provider) {
    case "openrouter":
      return "OPENROUTER_API_KEY";
    case "gateway":
      return "AI_GATEWAY_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
    case "deepseek":
      return "DEEPSEEK_API_KEY";
    case "xai":
      return "XAI_API_KEY";
    case "qwen":
      return "DASHSCOPE_API_KEY";
    case "zai":
      return "ZAI_API_KEY";
    case "moonshotai":
      return "MOONSHOT_API_KEY";
    case "groq":
      return "GROQ_API_KEY";
  }
}

function Checkbox({
  checked,
  indeterminate,
  onChange,
  ...rest
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (value: boolean) => void;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={() => onChange(!checked)}
      className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded-[3px] border transition-colors ${
        checked || indeterminate
          ? "border-[var(--color-cta)] bg-[var(--color-cta)]"
          : "border-[var(--color-border-strong)] bg-transparent hover:border-[var(--color-text-faint)]"
      }`}
      {...rest}
    >
      {indeterminate ? (
        <span className="h-0.5 w-2 rounded bg-[var(--color-cta-fg)]" />
      ) : checked ? (
        <svg
          className="h-2.5 w-2.5 text-[var(--color-cta-fg)]"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <title>Selected</title>
          <path d="M2 6.5L5 9.5L10 3.5" />
        </svg>
      ) : null}
    </button>
  );
}

function SortIndicator({ direction }: { direction: false | "asc" | "desc" }) {
  if (!direction) {
    return (
      <svg
        aria-hidden="true"
        className="h-3 w-3 text-[var(--color-text-faint)] opacity-0 transition-opacity group-hover/th:opacity-100"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <title>Sort</title>
        <path d="M3 5l3-3 3 3M3 7l3 3 3-3" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className="h-3 w-3 text-[var(--color-text)]"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>{direction === "asc" ? "Ascending" : "Descending"}</title>
      <path d={direction === "asc" ? "M3 7l3-3 3 3" : "M3 5l3 3 3-3"} />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-2.5 w-2.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <title>Missing key</title>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15L19 4M18 5l3 3M15 8l3 3" />
    </svg>
  );
}
