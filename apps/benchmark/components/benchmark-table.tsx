"use client";

import type { ProviderRoute } from "@howells/ai";
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
import { Fragment, useMemo, useState } from "react";
import { formatMs, formatTpsWithUnit, METRIC_META, type MetricKey } from "../lib/format";
import {
  GROUP_LABELS,
  GROUPS,
  type ModelGroup,
  type ModelRow,
  providerLabel,
  routeCellFor,
  SLOT_LEGEND,
} from "../lib/models";
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
  metric: MetricKey;
  rowSelection: RowSelectionState;
  onRowSelectionChange: (next: RowSelectionState) => void;
  density: "comfortable" | "compact";
  rounds: number;
  runningKey: string | null;
  stale: boolean;
}

export function BenchmarkTable({
  rows,
  visibleProviders,
  configuredProviders,
  results,
  metric,
  rowSelection,
  onRowSelectionChange,
  density,
  rounds,
  runningKey,
  stale,
}: BenchmarkTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const metricMeta = METRIC_META[metric];

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
      base.push({
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
        cell: ({ row }) => (
          <ProviderCell
            row={row.original}
            provider={provider}
            results={results}
            metric={metric}
            rounds={rounds}
            running={runningKey === `${provider}::${row.original.name}`}
            configuredProviders={configuredProviders}
            stale={stale}
          />
        ),
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
    density,
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
  const grouped = useMemo(() => {
    const map: Record<ModelGroup, typeof sortedRows> = {
      defaults: [],
      "task-optimized": [],
      catalog: [],
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
        <thead>
          <tr>
            {table.getHeaderGroups()[0]?.headers.map((header, idx) => {
              const isSticky = idx <= 1;
              return (
                <th
                  key={header.id}
                  scope="col"
                  className={`group/th sticky top-0 z-20 h-9 border-[var(--color-border)] border-b bg-[var(--color-canvas)] px-4 text-left align-middle text-[var(--color-text-subtle)] ${
                    isSticky ? "z-30" : ""
                  }`}
                  style={{
                    minWidth: header.column.columnDef.size,
                    left: idx === 0 ? 0 : idx === 1 ? 36 : undefined,
                    position: isSticky ? "sticky" : undefined,
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

        <tbody>
          {GROUPS.map((groupKey) => {
            const groupRows = grouped[groupKey];
            if (groupRows.length === 0) return null;
            return (
              <Fragment key={groupKey}>
                <tr>
                  <td
                    colSpan={columns.length}
                    className="sticky top-9 z-10 border-b border-[var(--color-border)] bg-[var(--color-canvas)] pt-5 pr-4 pb-2 pl-[60px]"
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
                {groupRows.map((row) => {
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
                        return (
                          <td
                            key={cell.id}
                            className={`border-[var(--color-border)] border-b px-4 ${cellPaddingY} ${
                              idx === 0 ? "" : "align-top"
                            } ${
                              isSticky
                                ? `z-10 ${rowBg} group-hover:bg-[var(--color-row-hover)]`
                                : ""
                            }`}
                            style={{
                              position: isSticky ? "sticky" : undefined,
                              left: idx === 0 ? 0 : idx === 1 ? 36 : undefined,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}

          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-12 text-center text-sm text-[var(--color-text-faint)]"
              >
                No models match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function getResultCell(
  results: BenchmarkResult[],
  modelName: string,
  provider: ProviderRoute,
  metric: MetricKey,
): number | undefined {
  const cell = results.find(
    (r) => r.label === modelName && r.provider === provider,
  );
  if (!cell || cell.error) return undefined;
  return cell[metric];
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
    .filter((r) => r.label === modelName && !r.error)
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
  const [expanded, setExpanded] = useState(false);

  const allSlots = [
    ...row.defaultSlots.map((s) => ({ kind: "default" as const, label: s })),
    ...row.taskSlots.map((s) => ({ kind: "task" as const, label: s })),
  ];
  const visibleCount = expanded ? allSlots.length : 2;
  const visibleSlots = allSlots.slice(0, visibleCount);
  const hiddenCount = allSlots.length - visibleCount;

  if (density === "compact") {
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
            <span className="block text-[var(--color-text-muted)]">
              {allSlots.map((s) => s.label).join(" · ")}
            </span>
          </>
        }
        side="bottom"
        align="start"
        width={280}
      >
        <div className="flex items-baseline gap-2">
          <span className="truncate text-xs font-medium text-[var(--color-text)]">
            {row.name}
          </span>
          <span className="data ml-auto truncate text-[10px] text-[var(--color-text-faint)]">
            {row.id}
          </span>
        </div>
      </Tooltip>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-medium text-[var(--color-text)]">
          {row.name}
        </span>
        <span className="data truncate text-[10px] text-[var(--color-text-faint)]">
          {row.id}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pt-1">
        {visibleSlots.map((slot, i) => (
          <Tooltip
            key={`${slot.kind}-${slot.label}`}
            content={SLOT_LEGEND}
            width={260}
          >
            <span className="flex items-center gap-1.5">
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="text-[var(--color-text-faint)]"
                >
                  ·
                </span>
              )}
              <span
                className={`data text-[10px] ${
                  slot.kind === "task"
                    ? "text-[var(--color-text-muted)]"
                    : "text-[var(--color-text-faint)]"
                }`}
              >
                {slot.label}
              </span>
            </span>
          </Tooltip>
        ))}
        {hiddenCount > 0 && (
          <>
            <span aria-hidden="true" className="text-[var(--color-text-faint)]">
              ·
            </span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="data cursor-pointer text-[10px] text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text-muted)]"
            >
              +{hiddenCount}
            </button>
          </>
        )}
        {expanded && allSlots.length > 2 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="ml-2 data cursor-pointer text-[10px] text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text-muted)]"
          >
            less
          </button>
        )}
      </div>
    </div>
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
}: {
  row: ModelRow;
  provider: ProviderRoute;
  results: BenchmarkResult[];
  metric: MetricKey;
  rounds: number;
  running: boolean;
  configuredProviders: readonly ProviderRoute[];
  stale: boolean;
}) {
  const route = routeCellFor(row, provider, configuredProviders);
  const result = results.find(
    (r) => r.label === row.name && r.provider === provider,
  );

  void rounds;

  if (route.status === "no-route") {
    return (
      <span
        title={`${row.name} cannot route through ${providerLabel(provider)}`}
        className="block text-right text-xs text-[var(--color-text-faint)]"
      >
        —
      </span>
    );
  }

  if (running && !result) {
    return (
      <span className="data flex items-center justify-end gap-1.5 text-right text-xs text-[var(--color-text-muted)]">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent-strong)]"
        />
        running
      </span>
    );
  }

  if (result?.error) {
    return (
      <span
        className="pill pill--error block text-right"
        title={result.error}
      >
        error
      </span>
    );
  }

  if (result) {
    const best = isBestInRow(results, row.name, provider, metric);
    const value =
      metric === "tokensPerSecond"
        ? formatTpsWithUnit(result.tokensPerSecond)
        : formatMs(result[metric]);

    if (best) {
      return (
        <div
          className={`flex items-center justify-end ${stale ? "opacity-50" : ""}`}
          title={stale ? "Stale — inputs changed since this run" : undefined}
        >
          <span
            className={`pill pill--best data tabular-nums ${
              stale ? "line-through decoration-1" : ""
            }`}
            aria-label="Best in row"
          >
            {value}
          </span>
        </div>
      );
    }

    return (
      <div
        className={`flex items-center justify-end ${stale ? "opacity-50" : ""}`}
        title={stale ? "Stale — inputs changed since this run" : undefined}
      >
        <span
          className={`data text-xs text-[var(--color-text-muted)] ${
            stale ? "line-through decoration-1" : ""
          }`}
        >
          {value}
        </span>
      </div>
    );
  }

  if (route.status === "missing-key") {
    return (
      <span
        title={`Set ${envFor(provider)} to enable this route`}
        className="pill pill--warn flex justify-end"
      >
        <KeyIcon />
        no key
      </span>
    );
  }

  // Pre-run: truly blank. The dot is reserved for the running state.
  return <span aria-hidden="true" className="block" />;
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
