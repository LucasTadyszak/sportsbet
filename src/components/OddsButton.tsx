"use client";

import { useEffect } from "react";
import { betSlip, useBetSlip } from "@/lib/betSlip";
import { formatOdds, outcomeLabel } from "@/lib/labels";
import { isSameOffer, type Selection } from "@/lib/selection";
import { Icon } from "@/components/Icon";

/**
 * A price the user can click into their bet slip: a match block's 1/N/2 block, a bookmaker's
 * cell in an odds table, or a pick's price. Orange says it matters: an orange outline and an
 * orange price for the one the model would take, an orange fill once that exact offer is in the
 * slip. Disabled once the match has kicked off, when its pre-match price can't be taken any more.
 */
export function OddsButton({
  selection,
  variant,
  label,
  isPick = false,
  isBest = false,
  hint,
  oddsError,
  disabled = false,
  className = "",
}: {
  selection: Selection;
  variant: "tile" | "cell" | "pick";
  /** In a tile, what the price is for ("1 · 50 %"): shown next to it. */
  label?: string;
  /** The price the model would take. */
  isPick?: boolean;
  /** The best price of its column, in an odds table. */
  isBest?: boolean;
  hint?: string;
  /** What the flame says when the rest of the market shows this price to be an odds error (src/lib/board.ts). */
  oddsError?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { selections } = useBetSlip();
  const held = disabled ? undefined : selections.find((s) => isSameOffer(s, selection));
  const selected = held !== undefined;

  // An offer already in the slip picks up the fresher price and verdict shown here.
  useEffect(() => {
    if (held) betSlip.refresh(selection);
  }, [held, selection]);

  const offer = `${outcomeLabel(selection.marketKey, selection.outcomeName, selection.point, selection.homeTeam, selection.awayTeam)} à ${formatOdds(selection.price)} (${selection.bookmakerTitle})`;
  const buttonProps = {
    type: "button" as const,
    "aria-pressed": selected,
    "aria-label": `Ma sélection : ${offer}${oddsError ? " — erreur de cote" : ""}`,
    title: disabled
      ? "Match commencé : cette cote n'est plus proposée"
      : [hint, oddsError, selected ? "Retirer de ma sélection" : "Ajouter à ma sélection"].filter(Boolean).join(" — "),
    disabled,
    onClick: () => betSlip.toggle(selection),
  };
  const price = formatOdds(selection.price);
  // On an orange fill the flame takes the fill's ink, or it would melt into it.
  const flame = oddsError ? <Icon name="flame" className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-on-accent" : "text-flame"}`} /> : null;

  if (variant === "tile") {
    return (
      <button
        {...buttonProps}
        className={`relative flex min-h-14 w-full flex-col items-start justify-center gap-1 border-2 px-3 pt-3 pb-2 transition-colors duration-200 sm:flex-row sm:py-2 sm:items-center sm:justify-between sm:gap-2 ${
          selected
            ? "border-accent bg-accent text-on-accent enabled:hover:bg-accent/90"
            : isPick
              ? "border-accent bg-bg-row enabled:hover:bg-accent-dim"
              : "border-transparent bg-bg-row enabled:hover:border-fg-muted"
        } ${className}`}
      >
        {isPick ? (
          <span
            className={`absolute -top-2.5 right-2 flex h-5 -skew-x-12 items-center px-2 ${selected ? "bg-on-accent text-accent" : "bg-accent text-on-accent"}`}
          >
            <span className="inline-flex skew-x-12 items-center gap-1 font-cond text-xs font-extrabold uppercase leading-none tracking-wider">
              <Icon name="star" className="h-2.5 w-2.5" />
              Pick
            </span>
          </span>
        ) : null}
        <span
          className={`flex min-w-0 max-w-full items-center gap-1 font-cond text-[13px] font-bold uppercase tracking-wide ${
            selected ? "" : "text-fg-muted"
          }`}
        >
          {selected ? <Icon name="check" className="h-3.5 w-3.5 shrink-0" /> : null}
          {flame}
          <span className="truncate">{label}</span>
        </span>
        <span className={`font-display text-[28px] leading-none tracking-wide ${selected ? "" : isPick ? "text-accent" : "text-fg"}`}>{price}</span>
      </button>
    );
  }

  if (variant === "cell") {
    return (
      <button
        {...buttonProps}
        className={`figures inline-flex items-center gap-1 border-2 px-2.5 py-0.5 text-base transition-colors duration-200 ${
          selected
            ? "border-accent bg-accent font-bold text-on-accent enabled:hover:bg-accent/90"
            : isPick
              ? "border-accent font-bold text-accent-strong enabled:hover:bg-accent-dim"
              : isBest
                ? "border-transparent bg-bg-row font-bold text-fg enabled:hover:border-fg-muted"
                : "border-transparent font-semibold text-fg enabled:hover:border-border enabled:hover:bg-bg-row"
        } ${className}`}
      >
        {selected ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
        {flame}
        {price}
      </button>
    );
  }

  return (
    <button
      {...buttonProps}
      className={`flex flex-col items-end gap-1 border-2 px-3.5 py-2 transition-colors duration-200 ${
        selected ? "border-accent bg-accent text-on-accent enabled:hover:bg-accent/90" : "border-accent enabled:hover:bg-accent-dim"
      } ${className}`}
    >
      <span className={`font-display text-4xl leading-none tracking-wide ${selected ? "" : "text-accent"}`}>{price}</span>
      {disabled ? null : (
        <span className={`inline-flex items-center gap-1 font-cond text-xs font-bold uppercase tracking-wider ${selected ? "" : "text-accent-strong"}`}>
          <Icon name={selected ? "check" : "plus"} className="h-3 w-3" />
          {selected ? "Dans ma sélection" : "Ma sélection"}
        </span>
      )}
    </button>
  );
}
