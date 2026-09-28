import type { ReactNode } from "react";
import { TIER_INFO, reasonLabel } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";
import { Icon, type IconName } from "@/components/Icon";

/** Internal tier name + the user-facing label it collapses to, as a slanted tag: orange when it's worth a stake. */
export function TierBadge({ tier, compact = false }: { tier: string; compact?: boolean }) {
  const label = userLabel(tier);
  const style =
    label === "Top pick"
      ? "border-accent bg-accent text-on-accent"
      : label === "Petite mise"
        ? "border-accent text-accent-strong"
        : "border-border text-fg-muted";
  const icon: IconName = label === "Top pick" ? "star" : label === "Petite mise" ? "target" : "minus";
  return (
    <span title={TIER_INFO[tier]?.description} className={`inline-flex shrink-0 -skew-x-12 items-center border-2 px-2 py-px ${style}`}>
      <span className="inline-flex skew-x-12 items-center gap-1 whitespace-nowrap font-cond text-[13px] font-extrabold uppercase tracking-wider">
        <Icon name={icon} className="h-3 w-3" />
        {compact ? label : `${label} · ${TIER_INFO[tier]?.name ?? tier}`}
      </span>
    </span>
  );
}

const CONFIRMATION_PREFIX = "CONFIRM_";
const EDGE_REASONS = new Set(["EDGE_STRONG", "EDGE_GOOD", "EDGE_MARGINAL", "EDGE_NONE"]);

/** Reasons behind a verdict: what the edge was, what confirmed it, what held it back. */
export function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {reasons.map((reason) => {
        const positive = reason.startsWith(CONFIRMATION_PREFIX);
        const neutral = EDGE_REASONS.has(reason) || reason === "PARTIAL_DATA";
        return (
          <li key={reason} className="flex items-start gap-2">
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${
                positive ? "bg-rise text-on-rise" : neutral ? "bg-bg-row text-fg-muted" : "bg-fall text-on-rise"
              }`}
            >
              <Icon name={positive ? "check" : neutral ? "dot" : "x"} className="h-3 w-3" />
            </span>
            <span className={neutral ? "text-fg-muted" : "text-fg"}>{reasonLabel(reason)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A labelled figure, for KPI rows: a slate bar on its left, the value in big condensed figures. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rise" | "fall";
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col gap-1 border-l-[5px] border-slate bg-bg-elevated px-4 py-3">
      <span className="flex items-center gap-1.5 font-cond text-[13px] font-bold uppercase tracking-wider text-fg-muted">
        {icon ? <Icon name={icon} className="h-3.5 w-3.5" /> : null}
        {label}
      </span>
      <span className={`font-display text-3xl leading-tight tracking-wide ${tone === "rise" ? "text-rise" : tone === "fall" ? "text-fall" : "text-fg"}`}>
        {value}
      </span>
      {hint ? <span className="text-xs text-fg-muted">{hint}</span> : null}
    </div>
  );
}

export function EmptyState({ title, children, icon = "inbox" }: { title: string; children: ReactNode; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center border-2 border-dashed border-border bg-bg-elevated px-6 py-14 text-center">
      <span className="flex h-12 w-12 -skew-x-12 items-center justify-center bg-bg-row text-fg-muted">
        <Icon name={icon} className="h-5 w-5 skew-x-12" />
      </span>
      <p className="mt-4 font-display text-2xl uppercase tracking-wide text-fg">{title}</p>
      <div className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-fg-muted">{children}</div>
    </div>
  );
}

/** A panel lifted off the page, used for every content block. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-bg-elevated shadow-hard ${className}`}>{children}</div>;
}
