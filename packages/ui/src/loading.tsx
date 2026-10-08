import type { ComponentProps } from "react";
import { cn } from "./lib/cn";

/** An activity indicator: eight ticks turning in steps, like the system one
 * on iOS and macOS. Pass `label` when it stands alone, so screen readers
 * announce it; leave it out inside a button that already says "Applying…". */
export function Spinner({ size = 16, label, className }: { size?: number; label?: string; className?: string }) {
  const ticks = Array.from({ length: 8 }, (_, index) => index);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("ps-spinner shrink-0", className)}
    >
      {ticks.map((index) => (
        <line
          key={index}
          x1="8"
          y1="2"
          x2="8"
          y2="4.5"
          opacity={(index + 1) / ticks.length}
          transform={`rotate(${index * 45} 8 8)`}
        />
      ))}
    </svg>
  );
}

/** A placeholder block for content that is still loading. Size and shape
 * come from the caller (width, height, corner); the shimmer comes from here. */
export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return <span aria-hidden="true" {...props} className={cn("ps-skeleton block rounded-mark", className)} />;
}
