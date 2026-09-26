import type { ReactNode } from "react";
import { TIER_INFO, reasonLabel } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";

/** Internal tier name + the user-facing label it collapses to. */
export function TierBadge({ tier, compact = false }: { tier: string; compact?: boolean }) {
  const label = userLabel(tier);
  const style =
    label === "Top pick"
      ? "border-accent bg-accent text-fg"
      : label === "Petite mise"
        ? "border-accent bg-accent-dim text-accent-strong"
        : "border-border bg-bg-row text-fg-muted";
  return (
    <span
      title={TIER_INFO[tier]?.description}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 font-mono-tabular text-[11px] font-semibold uppercase tracking-wide ${style}`}
    >
      {compact ? label : `${label} · ${TIER_INFO[tier]?.name ?? tier}`}
    </span>
  );
}

const CONFIRMATION_PREFIX = "CONFIRM_";
const EDGE_REASONS = new Set(["EDGE_STRONG", "EDGE_GOOD", "EDGE_MARGINAL", "EDGE_NONE"]);

/** Reasons behind a verdict: what the edge was, what confirmed it, what held it back. */
export function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {reasons.map((reason) => {
        const positive = reason.startsWith(CONFIRMATION_PREFIX);
        const neutral = EDGE_REASONS.has(reason) || reason === "PARTIAL_DATA";
        return (
          <li key={reason} className="flex items-start gap-2">
            <span
              aria-hidden
              className={`mt-0.5 font-mono-tabular text-xs ${positive ? "text-rise" : neutral ? "text-fg-muted" : "text-fall"}`}
            >
              {positive ? "✓" : neutral ? "•" : "✕"}
            </span>
            <span className={neutral ? "text-fg-muted" : "text-fg"}>{reasonLabel(reason)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled number, for KPI rows. */
export function StatTile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "rise" | "fall" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg-elevated px-4 py-3">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className={`font-display text-2xl font-semibold ${tone === "rise" ? "text-rise" : tone === "fall" ? "text-fall" : "text-fg"}`}>
        {value}
      </span>
      {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-bg-elevated px-6 py-16 text-center">
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      <div className="mx-auto mt-2 max-w-lg text-sm text-fg-muted">{children}</div>
    </div>
  );
}
