"use client";

import { useEffect } from "react";
import { betSlip, useBetSlip } from "@/lib/betSlip";
import { formatOdds, outcomeLabel } from "@/lib/labels";
import { isSameOffer, type Selection } from "@/lib/selection";
import { Icon } from "@/components/Icon";

/**
 * A price the user can click into their bet slip: a 1/X/2 box, a bookmaker's cell in an
 * odds table, or a pick's price. Pressed while that exact offer is in the slip.
 */
export function OddsButton({
  selection,
  variant,
  label,
  isPick = false,
  isBest = false,
  hint,
  className = "",
}: {
  selection: Selection;
  variant: "box" | "cell" | "pick";
  /** "1" / "X" / "2", shown above the price in a box. */
  label?: string;
  /** The price the model would take. */
  isPick?: boolean;
  /** The best price of its column, in an odds table. */
  isBest?: boolean;
  hint?: string;
  className?: string;
}) {
  const { selections } = useBetSlip();
  const held = selections.find((s) => isSameOffer(s, selection));
  const selected = held !== undefined;

  // An offer already in the slip picks up the fresher price and verdict shown here.
  useEffect(() => {
    if (held) betSlip.refresh(selection);
  }, [held, selection]);

  const offer = `${outcomeLabel(selection.marketKey, selection.outcomeName, selection.point, selection.homeTeam, selection.awayTeam)} à ${formatOdds(selection.price)} (${selection.bookmakerTitle})`;
  const buttonProps = {
    type: "button" as const,
    "aria-pressed": selected,
    "aria-label": `Ma sélection : ${offer}`,
    title: [hint, selected ? "Retirer de ma sélection" : "Ajouter à ma sélection"].filter(Boolean).join(" — "),
    onClick: () => betSlip.toggle(selection),
  };
  const price = formatOdds(selection.price);

  if (variant === "box") {
    return (
      <button
        {...buttonProps}
        className={`flex flex-col items-center rounded-lg border px-2 transition-colors duration-200 ${
          selected
            ? "border-fg bg-fg hover:bg-fg/90"
            : isPick
              ? "border-accent bg-accent-dim hover:border-accent-strong"
              : "border-border bg-bg-elevated hover:border-accent"
        } ${className}`}
      >
        <span
          className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase ${
            selected ? (isPick ? "text-accent" : "text-white/75") : isPick ? "text-accent-strong" : "text-fg-muted"
          }`}
        >
          {selected ? <Icon name="check" className="h-2.5 w-2.5" /> : null}
          {label}
        </span>
        <span className={`font-mono-tabular text-sm font-semibold ${selected ? "text-white" : isPick ? "text-accent-strong" : "text-fg"}`}>
          {price}
        </span>
      </button>
    );
  }

  if (variant === "cell") {
    const tone = isBest ? "font-semibold text-accent-strong" : "text-fg";
    return (
      <button
        {...buttonProps}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono-tabular transition-colors duration-200 ${
          selected
            ? "border-fg bg-fg font-semibold text-white hover:bg-fg/90"
            : isPick
              ? `border-accent bg-accent-dim hover:border-accent-strong ${tone}`
              : `border-transparent hover:border-accent hover:bg-accent-dim/50 ${tone}`
        } ${className}`}
      >
        {selected ? <Icon name="check" className="h-3 w-3" /> : null}
        {price}
      </button>
    );
  }

  return (
    <button
      {...buttonProps}
      className={`flex flex-col items-end rounded-lg border px-3 py-1.5 transition-colors duration-200 ${
        selected ? "border-fg bg-fg hover:bg-fg/90" : "border-accent/50 bg-bg-elevated hover:border-accent hover:bg-accent-dim"
      } ${className}`}
    >
      <span className={`font-mono-tabular text-2xl font-bold leading-tight ${selected ? "text-white" : "text-accent-strong"}`}>{price}</span>
      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${selected ? "text-white/80" : "text-accent-strong"}`}>
        <Icon name={selected ? "check" : "plus"} className="h-3 w-3" />
        {selected ? "Dans ma sélection" : "Ma sélection"}
      </span>
    </button>
  );
}
