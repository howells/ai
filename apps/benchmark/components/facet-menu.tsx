"use client";

import { useEffect, useRef, useState } from "react";

interface FacetOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  disabled?: boolean;
  description?: string;
}

interface FacetMenuProps<T extends string> {
  label: string;
  options: readonly FacetOption<T>[];
  selected: ReadonlySet<T>;
  onChange: (next: Set<T>) => void;
  /** When true, an empty selection means "all" (so showing "All" instead of count). */
  emptyMeansAll?: boolean;
  align?: "left" | "right";
  width?: number;
}

export function FacetMenu<T extends string>({
  label,
  options,
  selected,
  onChange,
  emptyMeansAll = true,
  align = "left",
  width = 240,
}: FacetMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function toggle(value: T) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  function clear() {
    onChange(new Set());
  }

  function selectAll() {
    onChange(new Set(options.filter((o) => !o.disabled).map((o) => o.value)));
  }

  /*
   * Trigger summary follows V7 product idiom:
   *   - Empty selection (the default) renders no value at all — the trigger
   *     just reads "Tier" with a chevron. Absence is the signal.
   *   - 1 selection renders the value's label so users can see what's filtered
   *     without opening the menu.
   *   - 2+ selections collapse to a count to avoid wrapping.
   */
  const summary =
    selected.size === 0
      ? null
      : selected.size === 1
        ? options.find((o) => selected.has(o.value))?.label ?? null
        : String(selected.size);

  // Reserve "emptyMeansAll = false" for callers that need a different empty
  // state copy in the future. Today it's purely a no-op.
  void emptyMeansAll;

  const isFiltered = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 text-[12px] transition-colors ${
          open || isFiltered
            ? "border-[var(--color-border-strong)] bg-[var(--color-surface)] text-[var(--color-text)]"
            : "border-transparent bg-transparent text-[var(--color-text-faint)] hover:border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-muted)]"
        }`}
      >
        <span>{label}</span>
        {summary !== null && (
          <>
            <span aria-hidden="true" className="text-[var(--color-text-faint)]">
              ·
            </span>
            <span className="text-[var(--color-text)]">{summary}</span>
          </>
        )}
        <svg
          className={`h-2.5 w-2.5 text-[var(--color-text-faint)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <title>Open</title>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-2 flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{ width }}
        >
          <div className="flex items-center justify-between gap-1 px-2 pt-1 pb-2">
            <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <span
                aria-hidden="true"
                className="h-1 w-1 rounded-full bg-[var(--color-text-muted)]"
              />
              {label}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={selectAll}
                className="cursor-pointer rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text)]"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clear}
                disabled={selected.size === 0}
                className="cursor-pointer rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-raised)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            className="overflow-y-auto scrollbar-thin"
            style={{ maxHeight: "min(420px, calc(100vh - 220px))" }}
          >
            {options.map((option) => {
              const isSelected = selected.has(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => toggle(option.value)}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isSelected
                      ? "bg-[var(--color-raised)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="flex min-w-0 items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={`mt-[2px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors ${
                        isSelected
                          ? "border-[var(--color-cta)] bg-[var(--color-cta)]"
                          : "border-[var(--color-border-strong)]"
                      }`}
                    >
                      {isSelected && (
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
                      )}
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="text-[11px] leading-snug text-[var(--color-text-faint)]">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </span>
                  {option.count !== undefined && (
                    <span className="data shrink-0 text-[11px] text-[var(--color-text-faint)]">
                      {option.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
