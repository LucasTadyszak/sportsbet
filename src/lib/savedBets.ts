// "Mes paris": bets saved from the slip (src/components/BetSlip.tsx) to see what they would have
// paid, as if they had been placed. Each is settled like the journal's picks, on the 90-minute
// score (src/lib/methodology/settlement.ts). They stay in the browser, like the slip
// (src/lib/myBets.ts): the server is only asked where their matches stand (src/lib/betResults.ts).
// Pure functions only: shared by server and client.
import { settleH2h, settleTotals, type Settlement } from "@/lib/methodology/settlement";
import { MAX_BANKROLL, type Selection } from "@/lib/selection";

/** A match's last word for the bets on it: its 90-minute score, or void (cancelled, abandoned: stakes refunded). */
export type FinalResult = { home: number; away: number } | "void";

/** One selection of a saved bet, at the price it had when the bet was saved. */
export type SavedLeg = {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  /** ISO kickoff when the bet was saved (MatchResult.kickoff has it if it moved since). */
  commenceTime: string;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  bookmakerKey: string;
  bookmakerTitle: string;
  /** Kept once known, so a settled match is never asked for again. */
  result: FinalResult | null;
};

export type SavedBet = {
  id: string;
  /** ISO time it was saved. */
  savedAt: string;
  /** One leg: a single bet. Several: a combo, which needs every one of them. */
  legs: SavedLeg[];
  /** In euros. */
  stake: number;
  /** What the slip advised staking on it, in units (1 u = 1 % of the bankroll); 0 when it advised against. */
  advisedUnits: number;
};

/** Where a saved bet's match stands, as the server reads it (src/lib/betResults.ts). */
export type MatchResult = {
  /**
   * upcoming; live; waiting: over (or should be) without the score bets settle on yet — extra
   * time, postponed, not reported yet; final: settle on the score; void: cancelled or abandoned.
   */
  state: "upcoming" | "live" | "waiting" | "final" | "void";
  /** The match's kickoff now (ISO): it moves when a match is rescheduled. */
  kickoff: string;
  /** From the home side's point of view: the 90-minute score once final, else the latest one known. */
  home: number | null;
  away: number | null;
  /** How the match stands in a word: "37'", "Mi-temps", "Terminé", "Après prol.", "Reporté"… */
  label: string | null;
};

/** Fresh results by event id: the ones the server was asked for and knows. */
export type MatchResults = Partial<Record<string, MatchResult>>;

/** A bet saved from the slip: its selections as they were on screen, and its stake. */
export function newSavedBet(selections: Selection[], stake: number, advisedUnits: number, now: Date, id: string): SavedBet {
  return {
    id,
    savedAt: now.toISOString(),
    legs: selections.map((s) => ({
      eventId: s.eventId,
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      commenceTime: s.commenceTime,
      marketKey: s.marketKey,
      outcomeName: s.outcomeName,
      point: s.point,
      price: s.price,
      bookmakerKey: s.bookmakerKey,
      bookmakerTitle: s.bookmakerTitle,
      result: null,
    })),
    stake,
    advisedUnits,
  };
}

/** A bet's odds: its selection's price, or for a combo the product of them all. */
export function betPrice(bet: SavedBet): number {
  return bet.legs.reduce((product, leg) => product * leg.price, 1);
}

/** What a match result settles bets on, once there is one. */
export function finalResult(result: MatchResult | undefined): FinalResult | null {
  if (result?.state === "void") return "void";
  if (result?.state === "final" && result.home !== null && result.away !== null) return { home: result.home, away: result.away };
  return null;
}

/** The leg's result: kept on the bet once final, else what the server just said. */
export function legResult(leg: SavedLeg, fresh: MatchResults): FinalResult | null {
  return leg.result ?? finalResult(fresh[leg.eventId]);
}

export type LegStatus = Settlement | "void" | "pending";

export function settleLeg(leg: SavedLeg, result: FinalResult | null): LegStatus {
  if (result === null) return "pending";
  if (result === "void") return "void";
  if (leg.marketKey === "h2h") return settleH2h(leg.outcomeName, leg.homeTeam, leg.awayTeam, result.home, result.away);
  if (leg.marketKey === "totals" && leg.point !== null && (leg.outcomeName === "Over" || leg.outcomeName === "Under")) {
    return settleTotals(leg.outcomeName, leg.point, result.home + result.away);
  }
  return "pending"; // not a market the slip offers
}

/**
 * What each euro on a settled leg turns into, stake included: a combo multiplies them. A push
 * or a void leg counts as odds of 1, a half result as half the stake settled and half refunded.
 */
function legFactor(status: Settlement | "void", price: number): number {
  switch (status) {
    case "won":
      return price;
    case "half_won":
      return (price + 1) / 2;
    case "push":
    case "void":
      return 1;
    case "half_lost":
      return 0.5;
    case "lost":
      return 0;
  }
}

export type BetStatus = Settlement | "void" | "pending";

export type BetOutcome = {
  status: BetStatus;
  legs: LegStatus[];
  /** Odds of the bet (see betPrice). */
  price: number;
  /** What the bookmaker pays back, stake included, once the bet is decided. */
  payout: number | null;
  /** payout - stake. */
  profit: number | null;
};

const cents = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Where a bet stands. A single bet settles with its match; a combo is lost as soon as one leg is,
 * and otherwise waits for all of them. A combo whose payout is below its stake without being
 * lost (a half-lost leg) reads as half lost.
 */
export function settleBet(bet: SavedBet, fresh: MatchResults = {}): BetOutcome {
  const legs = bet.legs.map((leg) => settleLeg(leg, legResult(leg, fresh)));
  const price = betPrice(bet);
  if (legs.includes("lost")) return { status: "lost", legs, price, payout: 0, profit: -bet.stake };
  if (legs.includes("pending")) return { status: "pending", legs, price, payout: null, profit: null };

  const settled = legs as (Settlement | "void")[];
  const payout = cents(bet.stake * settled.reduce((factor, status, i) => factor * legFactor(status, bet.legs[i].price), 1));
  const profit = cents(payout - bet.stake);
  let status: BetStatus;
  if (settled.length === 1) status = settled[0];
  else if (settled.every((s) => s === "void")) status = "void";
  else status = profit > 0 ? "won" : profit < 0 ? "half_lost" : "push";
  return { status, legs, price, payout, profit };
}

/** The legs' results that just became final, written into the bets; null when none did. */
export function withResults(bets: SavedBet[], fresh: MatchResults): SavedBet[] | null {
  let changed = false;
  const next = bets.map((bet) => {
    if (bet.legs.every((leg) => leg.result !== null || finalResult(fresh[leg.eventId]) === null)) return bet;
    changed = true;
    return { ...bet, legs: bet.legs.map((leg) => (leg.result !== null ? leg : { ...leg, result: finalResult(fresh[leg.eventId]) })) };
  });
  return changed ? next : null;
}

/** The matches whose result is still to come, one id each, sorted. */
export function unsettledEventIds(bets: SavedBet[]): string[] {
  const ids = new Set(bets.flatMap((bet) => bet.legs.filter((leg) => leg.result === null).map((leg) => leg.eventId)));
  return Array.from(ids).sort();
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Whether results are worth reading again in a minute: a match is on, or has kicked off or is
 * about to within the time a match lasts. Later than that, a missing result (extra time, a
 * postponed match) only comes with the next visit.
 */
export function matchesInPlay(fresh: MatchResults, now: Date): boolean {
  return Object.values(fresh).some((result) => {
    if (!result) return false;
    if (result.state === "live") return true;
    if (result.state !== "upcoming" && result.state !== "waiting") return false;
    const sinceKickoff = now.getTime() - new Date(result.kickoff).getTime();
    return sinceKickoff >= -10 * 60 * 1000 && sinceKickoff <= 4 * HOUR_MS;
  });
}

export type BetsSummary = {
  pending: number;
  /** Stakes on the bets still undecided. */
  pendingStake: number;
  /** Won or half won. */
  wins: number;
  /** Lost or half lost. */
  losses: number;
  pushes: number;
  voids: number;
  /** Stakes on the decided bets (not the void ones: refunded, they count for nothing). */
  staked: number;
  profit: number;
  roi: number | null;
};

const WINS: BetStatus[] = ["won", "half_won"];
const LOSSES: BetStatus[] = ["lost", "half_lost"];

export function summarizeBets(bets: { bet: SavedBet; outcome: BetOutcome }[]): BetsSummary {
  const decided = bets.filter(({ outcome }) => outcome.status !== "pending" && outcome.status !== "void");
  const pending = bets.filter(({ outcome }) => outcome.status === "pending");
  const staked = cents(decided.reduce((sum, { bet }) => sum + bet.stake, 0));
  const profit = cents(decided.reduce((sum, { outcome }) => sum + (outcome.profit ?? 0), 0));
  return {
    pending: pending.length,
    pendingStake: cents(pending.reduce((sum, { bet }) => sum + bet.stake, 0)),
    wins: bets.filter(({ outcome }) => WINS.includes(outcome.status)).length,
    losses: bets.filter(({ outcome }) => LOSSES.includes(outcome.status)).length,
    pushes: bets.filter(({ outcome }) => outcome.status === "push").length,
    voids: bets.filter(({ outcome }) => outcome.status === "void").length,
    staked,
    profit,
    roi: staked > 0 ? profit / staked : null,
  };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const isGoals = (x: unknown) => typeof x === "number" && Number.isInteger(x) && x >= 0;

function isFinalResult(x: unknown): x is FinalResult {
  return x === "void" || (isObject(x) && isGoals(x.home) && isGoals(x.away));
}

function isSavedLeg(x: unknown): x is SavedLeg {
  if (!isObject(x)) return false;
  const strings = ["eventId", "homeTeam", "awayTeam", "commenceTime", "marketKey", "outcomeName", "bookmakerKey", "bookmakerTitle"];
  return (
    strings.every((key) => typeof x[key] === "string") &&
    (x.point === null || typeof x.point === "number") &&
    typeof x.price === "number" &&
    x.price > 1 &&
    (x.result === null || isFinalResult(x.result))
  );
}

function isSavedBet(x: unknown): x is SavedBet {
  return (
    isObject(x) &&
    typeof x.id === "string" &&
    typeof x.savedAt === "string" &&
    Array.isArray(x.legs) &&
    x.legs.length > 0 &&
    x.legs.every(isSavedLeg) &&
    typeof x.stake === "number" &&
    x.stake > 0 &&
    x.stake <= MAX_BANKROLL &&
    typeof x.advisedUnits === "number" &&
    x.advisedUnits >= 0
  );
}

/** What the browser kept, minus anything malformed. */
export function parseSavedBets(raw: string | null): SavedBet[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  return isObject(data) && Array.isArray(data.bets) ? data.bets.filter(isSavedBet) : [];
}
