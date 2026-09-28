// The slanted shapes of the « Stade » design system (src/app/globals.css): a tab or tag leans
// back 12°, and its label is set straight again inside it.
import type { ReactNode } from "react";

/**
 * A slanted tab (navigation, days, filters): the page, day or filter you're on is filled with
 * steel, never orange.
 */
export function slantTabClass(active: boolean, size: "md" | "sm" = "md"): string {
  return `inline-flex shrink-0 -skew-x-12 items-center font-cond font-bold uppercase tracking-wide transition-colors duration-200 ${
    size === "md" ? "min-h-10 px-3.5 text-[15px]" : "min-h-9 px-3 text-sm"
  } ${active ? "bg-inverse text-on-inverse" : "text-fg-muted hover:bg-bg-row hover:text-fg"}`;
}

/** The label inside a slanted box, set straight again. */
export function Straight({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex skew-x-12 items-center gap-1.5 ${className}`}>{children}</span>;
}
