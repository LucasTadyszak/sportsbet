// The user's bet slip ("ma sélection"): prices picked from the board, a match page or the
// picks, each carrying the model's verdict on its outcome so the slip can size it
// (src/lib/methodology/stake.ts). Built on the server from the odds on screen, kept in
// the browser (src/lib/betSlip.ts). Pure functions only: shared by server and client.
import { hasKickedOff } from "@/lib/dates";
import type { OutcomeVerdict } from "@/lib/methodology/stake";

export type Selection = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO kickoff: a selection is dropped once its match has started. */
  commenceTime: string;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  bookmakerKey: string;
  bookmakerTitle: string;
  verdict: OutcomeVerdict | null;
  /** ISO time of the data behind it (price capture or verdict, whichever is later). */
  asOf: string;
};

export type SlipMode = "simple" | "combo";

export type StoredSlip = { bankroll: number | null; selections: Selection[]; mode: SlipMode };

/** One outcome of one market: the slip holds at most one price per outcome. */
export function selectionKey(s: Pick<Selection, "eventId" | "marketKey" | "outcomeName" | "point">): string {
  return `${s.eventId}|${s.marketKey}|${s.outcomeName}|${s.point ?? ""}`;
}

/** Same outcome at the same book, i.e. the price button that put it in the slip. */
export function isSameOffer(a: Selection, b: Selection): boolean {
  return selectionKey(a) === selectionKey(b) && a.bookmakerKey === b.bookmakerKey;
}

/**
 * Clicking a price adds it, removes it if that exact offer is already in the slip, or
 * replaces the slip's price for that outcome when it came from another book.
 */
export function toggleSelection(selections: Selection[], picked: Selection): Selection[] {
  const existing = selections.find((s) => selectionKey(s) === selectionKey(picked));
  if (!existing) return [...selections, picked];
  if (existing.bookmakerKey === picked.bookmakerKey) return selections.filter((s) => s !== existing);
  return selections.map((s) => (s === existing ? picked : s));
}

/** Drops selections whose match has kicked off: their pre-match prices can't be taken any more. */
export function upcomingOnly(selections: Selection[], now: Date): Selection[] {
  return selections.filter((s) => !hasKickedOff(new Date(s.commenceTime), now));
}

/**
 * The same offer seen again in fresher data (a later sync): its price and verdict move with
 * it. Only strictly newer data replaces what the slip holds, so two open tabs showing
 * different syncs can't overwrite each other back and forth. Null when nothing changes.
 */
export function refreshSelection(selections: Selection[], seen: Selection): Selection[] | null {
  const index = selections.findIndex((s) => isSameOffer(s, seen));
  if (index === -1 || seen.asOf <= selections[index].asOf) return null;
  return selections.map((s, i) => (i === index ? seen : s));
}

/** Edge fields the slip needs (src/lib/refreshEdges.ts writes one row per outcome). */
export type OutcomeEdge = OutcomeVerdict & {
  marketKey: string;
  outcomeName: string;
  point: number | null;
  computedAt: Date;
};

export type Offer = {
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  bookmakerKey: string;
  bookmakerTitle: string;
  capturedAt: Date;
};

/** A price on screen, as a slip selection carrying the model's verdict on that outcome. */
export function selectionFor(
  event: { id: string; homeTeam: string; awayTeam: string; commenceTime: Date },
  offer: Offer,
  edges: OutcomeEdge[]
): Selection {
  const edge = edges.find((e) => e.marketKey === offer.marketKey && e.outcomeName === offer.outcomeName && e.point === offer.point);
  const asOf = edge && edge.computedAt > offer.capturedAt ? edge.computedAt : offer.capturedAt;
  return {
    eventId: event.id,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    commenceTime: event.commenceTime.toISOString(),
    marketKey: offer.marketKey,
    outcomeName: offer.outcomeName,
    point: offer.point,
    price: offer.price,
    bookmakerKey: offer.bookmakerKey,
    bookmakerTitle: offer.bookmakerTitle,
    verdict: edge ? { modelProb: edge.modelProb, tier: edge.tier, reasons: edge.reasons } : null,
    asOf: asOf.toISOString(),
  };
}

export const MAX_BANKROLL = 100_000_000;

/** "1 250,50 €" → 1250.5. Null unless it's a positive amount (cents are kept, no more). */
export function parseBankroll(input: string): number | null {
  const cleaned = input.replace(/[\s  €]/g, "").replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(cleaned)) return null;
  const amount = Math.round(Number(cleaned) * 100) / 100;
  return amount > 0 && amount <= MAX_BANKROLL ? amount : null;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;

function isVerdict(x: unknown): x is OutcomeVerdict {
  return isObject(x) && typeof x.modelProb === "number" && typeof x.tier === "string" && Array.isArray(x.reasons);
}

function isSelection(x: unknown): x is Selection {
  if (!isObject(x)) return false;
  const strings = ["eventId", "homeTeam", "awayTeam", "commenceTime", "marketKey", "outcomeName", "bookmakerKey", "bookmakerTitle", "asOf"];
  return (
    strings.every((key) => typeof x[key] === "string") &&
    (x.point === null || typeof x.point === "number") &&
    typeof x.price === "number" &&
    x.price > 1 &&
    (x.verdict === null || isVerdict(x.verdict))
  );
}

export const EMPTY_SLIP: StoredSlip = { bankroll: null, selections: [], mode: "simple" };

/** What the browser kept, minus anything malformed and any match that has already started. */
export function parseStoredSlip(raw: string | null, now: Date): StoredSlip {
  if (!raw) return EMPTY_SLIP;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_SLIP;
  }
  if (!isObject(data)) return EMPTY_SLIP;
  const bankroll = typeof data.bankroll === "number" && data.bankroll > 0 && data.bankroll <= MAX_BANKROLL ? data.bankroll : null;
  const selections = upcomingOnly((Array.isArray(data.selections) ? data.selections : []).filter(isSelection), now);
  return { bankroll, selections, mode: data.mode === "combo" ? "combo" : "simple" };
}
