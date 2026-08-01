"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type StatValueProps = React.ComponentProps<"div"> & {
  /** Starting font size in rem. Defaults to 1.875 (text-3xl). */
  maxRem?: number;
  /** Minimum font size in rem so values stay readable. Defaults to 0.875 (text-sm). */
  minRem?: number;
};

/**
 * Renders a stats-card value that shrinks to fit its container
 * so long currency strings do not overflow.
 */
export function StatValue({
  className,
  children,
  maxRem = 1.875,
  minRem = 0.875,
  ...props
}: StatValueProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  const fit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const parent = el.parentElement;
    if (!parent) return;

    // Reset so measurement starts from the preferred size
    el.style.fontSize = `${maxRem}rem`;

    const available = parent.clientWidth;
    if (available <= 0) return;

    // Binary search for the largest size that fits on one line
    let low = minRem;
    let high = maxRem;
    let best = minRem;

    for (let i = 0; i < 12; i++) {
      const mid = (low + high) / 2;
      el.style.fontSize = `${mid}rem`;
      if (el.scrollWidth <= available) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    el.style.fontSize = `${best}rem`;
  }, [maxRem, minRem, children]);

  React.useLayoutEffect(() => {
    fit();

    const el = ref.current;
    const parent = el?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => fit());
    observer.observe(parent);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <div
      ref={ref}
      data-slot="stat-value"
      className={cn(
        "min-w-0 max-w-full whitespace-nowrap font-bold tabular-nums tracking-tight leading-none",
        className
      )}
      title={typeof children === "string" || typeof children === "number" ? String(children) : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
