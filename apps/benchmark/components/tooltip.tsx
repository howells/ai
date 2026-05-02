"use client";

import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  width?: number;
}

/**
 * Lightweight CSS-only tooltip. Hover or focus the trigger to reveal.
 * Use sparingly — for vocabulary explanations and disabled-state reasons.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  width = 220,
}: TooltipProps) {
  const sideClass =
    side === "top"
      ? "bottom-full mb-1.5"
      : "top-full mt-1.5";
  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${sideClass} ${alignClass} hidden whitespace-normal rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--color-text)] shadow-lg shadow-black/10 group-hover/tip:block group-focus-within/tip:block`}
        style={{ width }}
      >
        {content}
      </span>
    </span>
  );
}

interface InfoIconProps {
  content: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  width?: number;
  className?: string;
}

/** Small ⓘ icon with a tooltip. Use after a label that needs explanation. */
export function InfoIcon({
  content,
  side = "top",
  align = "center",
  width,
  className = "",
}: InfoIconProps) {
  return (
    <Tooltip content={content} side={side} align={align} width={width}>
      <button
        type="button"
        tabIndex={0}
        aria-label="More info"
        className={`inline-flex h-3 w-3 cursor-help items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[8px] leading-none text-[var(--color-text-faint)] transition-colors hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] focus:outline-none focus-visible:border-[var(--color-text-muted)] ${className}`}
      >
        i
      </button>
    </Tooltip>
  );
}
