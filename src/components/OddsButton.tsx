"use client";

import { useContext, useEffect } from "react";
import { betSlip, useBetSlip } from "@/lib/betSlip";
import { formatOdds, outcomeLabel } from "@/lib/labels";
import { isSameOffer, selectionKey, type Selection } from "@/lib/selection";
import { Icon } from "@/components/Icon";
import { SlipPreviewContext } from "@/components/SlipPreview";

/**
 * A price the user can click into their bet slip: a 1/X/2 box, a match block's tile, a
 * bookmaker's cell in an odds table, or a pick's price. Orange says it matters: outlined
 * (tinted) for the price the model would take, filled once that exact offer is in the slip.
 * Disabled once the match has kicked off, when its pre-match price can't be taken any more.
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
  variant: "box" | "tile" | "cell" | "pick";
  /** "1" / "X" / "2" in a box, the outcome ("Arsenal", "Match nul") in a tile: shown above the price. */
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
  const preview = useContext(SlipPreviewContext);
  const { selections } = useBetSlip();
  const held = disabled || preview ? undefined : selections.find((s) => isSameOffer(s, selection));
  const selected = preview ? preview.has(selectionKey(selection)) : held !== undefined;

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
    onClick: preview ? undefined : () => betSlip.toggle(selection),
  };
  const price = formatOdds(selection.price);
  // On an orange fill the flame takes the fill's ink, or it would melt into it.
  const flame = oddsError ? <Icon name="flame" className={`h-3 w-3 shrink-0 ${selected ? "text-on-accent" : "text-flame"}`} /> : null;
  const ink = selected ? "text-on-accent" : isPick ? "text-accent-strong" : null;

  if (variant === "box") {
    return (
      <button
        {...buttonProps}
        className={`relative flex flex-col items-center rounded-lg border px-2 transition-colors duration-200 ${
          selected
            ? "border-accent bg-accent enabled:hover:bg-accent/90"
            : isPick
              ? "border-accent bg-accent-dim enabled:hover:border-accent-strong"
              : "border-border bg-bg-elevated enabled:hover:border-fg-muted"
        } ${className}`}
      >
        <span className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase ${ink ?? "text-fg-muted"}`}>
          {selected ? <Icon name="check" className="h-2.5 w-2.5" /> : null}
          {label}
        </span>
        {flame ? <span className="absolute right-1 top-1">{flame}</span> : null}
        <span className={`font-mono-tabular text-sm font-semibold ${ink ?? "text-fg"}`}>{price}</span>
      </button>
    );
  }

  if (variant === "tile") {
    return (
      <button
        {...buttonProps}
        className={`relative flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-2 py-1.5 transition-[border-color,background-color,box-shadow] duration-200 ${
          selected
            ? "border-accent bg-accent shadow-card enabled:hover:bg-accent/90"
            : isPick
              ? "border-accent bg-accent-dim enabled:hover:border-accent-strong"
              : "border-border bg-bg-elevated shadow-card enabled:hover:border-fg-muted enabled:hover:shadow-md"
        } ${className}`}
      >
        {isPick ? (
          <span
            className={`absolute -top-2 right-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] font-bold uppercase leading-4 ${
              selected ? "bg-on-accent text-accent" : "bg-accent text-on-accent"
            }`}
          >
            <Icon name="star" className="h-2.5 w-2.5" />
            Pick
          </span>
        ) : null}
        {flame ? <span className="absolute left-1.5 top-1.5">{flame}</span> : null}
        <span className={`flex max-w-full items-center gap-0.5 text-[11px] font-medium leading-4 ${ink ?? "text-fg-muted"}`}>
          {selected ? <Icon name="check" className="h-3 w-3" /> : null}
          <span className="truncate">{label}</span>
        </span>
        <span className={`font-display text-lg font-extrabold leading-6 tabular ${ink ?? "text-fg"}`}>{price}</span>
      </button>
    );
  }

  if (variant === "cell") {
    return (
      <button
        {...buttonProps}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono-tabular transition-colors duration-200 ${
          selected
            ? "border-accent bg-accent font-semibold text-on-accent enabled:hover:bg-accent/90"
            : isPick
              ? "border-accent bg-accent-dim font-semibold text-accent-strong enabled:hover:border-accent-strong"
              : isBest
                ? "border-transparent bg-bg-row font-bold text-fg enabled:hover:border-fg-muted"
                : "border-transparent text-fg enabled:hover:border-border enabled:hover:bg-bg-row"
        } ${className}`}
      >
        {selected ? <Icon name="check" className="h-3 w-3" /> : null}
        {flame}
        {price}
      </button>
    );
  }

  return (
    <button
      {...buttonProps}
      className={`flex flex-col items-end rounded-lg border px-3 py-1.5 transition-colors duration-200 ${
        selected ? "border-accent bg-accent enabled:hover:bg-accent/90" : "border-accent/60 bg-bg-elevated enabled:hover:border-accent enabled:hover:bg-accent-dim"
      } ${className}`}
    >
      <span className={`font-mono-tabular text-2xl font-bold leading-tight ${selected ? "text-on-accent" : "text-accent-strong"}`}>{price}</span>
      {disabled ? null : (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${selected ? "text-on-accent" : "text-accent-strong"}`}>
          <Icon name={selected ? "check" : "plus"} className="h-3 w-3" />
          {selected ? "Dans ma sélection" : "Ma sélection"}
        </span>
      )}
    </button>
  );
}
