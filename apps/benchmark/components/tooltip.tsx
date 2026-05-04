"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  width?: number;
}

/**
 * Lightweight tooltip. Rendered into document.body via portal so it isn't
 * clipped by `overflow` ancestors (table scroll containers, sticky headers).
 * Reveals on hover or focus of the trigger.
 */
export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  width = 220,
}: TooltipProps) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 6;
    const top =
      side === "top" ? rect.top - margin : rect.bottom + margin;
    let left: number;
    if (align === "start") left = rect.left;
    else if (align === "end") left = rect.right - width;
    else left = rect.left + rect.width / 2 - width / 2;
    // Clamp to viewport so the tooltip stays visible.
    const viewportPad = 8;
    const maxLeft = window.innerWidth - width - viewportPad;
    if (left < viewportPad) left = viewportPad;
    if (left > maxLeft) left = maxLeft;
    setCoords({ top, left });
  }, [align, side, width]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handle = () => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open, updatePosition]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className="pointer-events-none fixed z-[1000] whitespace-normal rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--color-text)] shadow-lg shadow-black/10"
              style={{
                top: coords.top,
                left: coords.left,
                width,
                transform: side === "top" ? "translateY(-100%)" : undefined,
              }}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
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
