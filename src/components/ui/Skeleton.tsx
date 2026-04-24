import type { CSSProperties } from "react";

type Variant = "rect" | "bar" | "circle";

interface SkeletonProps {
  variant?: Variant;
  className?: string;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties;
}

/**
 * Animated placeholder block. Prefer over "Loading…" text for async content:
 * users get a visual hint of the shape that's about to appear, not a generic
 * text blink.
 *
 * - `bar`: short horizontal bar. Default height: 14px.
 * - `circle`: square with full border-radius. Use for avatars. Default: 32×32.
 * - `rect`: full rectangle. Default: 100% width, 80px height.
 */
export function Skeleton({ variant = "rect", className = "", width, height, style }: SkeletonProps) {
  const shape =
    variant === "circle" ? "rounded-full" :
    variant === "bar"    ? "rounded h-3.5"   :
    "rounded";

  const defaults: CSSProperties = {};
  if (variant === "circle") {
    defaults.width = width ?? 32;
    defaults.height = height ?? 32;
  } else if (variant === "bar") {
    defaults.width = width ?? "70%";
  } else {
    defaults.width = width ?? "100%";
    defaults.height = height ?? 80;
  }

  return (
    <div
      aria-hidden="true"
      className={`bg-gray-200 animate-pulse ${shape} ${className}`}
      style={{ ...defaults, ...style }}
    />
  );
}

/**
 * Group a few skeletons into a row with a screen-reader label so the whole
 * loading region is announced as a single "Loading…" rather than each bar
 * firing its own aria event.
 */
export function SkeletonRow({ children, label = "Loading" }: { children: React.ReactNode; label?: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
