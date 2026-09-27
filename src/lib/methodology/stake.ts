// How much of their bankroll a user's own selection deserves, under the same staking
// rules as the model's picks (STAKING in config.ts): fractional Kelly on the final model
// probability, capped by the verdict's tier — but priced at the odds the user actually
// picked, which aren't necessarily the best ones on offer.
import { STAKING, isStakedTier, type Tier } from "@/lib/methodology/config";
import { kellyUnits, tierRank } from "@/lib/methodology/verdict";

/** The model's verdict on one outcome (an Edge row), computed at the best bettable price. */
export type OutcomeVerdict = { modelProb: number; tier: string; reasons: string[] };

export type StakeBlocker =
  | "NO_MODEL" // the model doesn't price this outcome
  | "NOT_STAKED" // MARGINAL or PASS: the verdict's own reasons say why
  | "LONGSHOT" // above STAKING.maxPrice
  | "NEGATIVE_EV"; // at this price the book's margin eats the edge

export type SingleStake = {
  /** Share of the bankroll to stake, in units (1 unit = 1 % of bankroll). */
  units: number;
  /** Expected return per unit staked, at the selected price. */
  ev: number | null;
  blocker: StakeBlocker | null;
  /** For NEGATIVE_EV: the lowest price (2 decimals) at which the model would stake it. */
  minPrice: number | null;
};

/** Smallest price on the 0.01 grid that clears the +EV gate at this probability. */
function minStakedPrice(probability: number): number | null {
  let price = Math.ceil(((1 + STAKING.minEv) / probability) * 100) / 100;
  if (probability * price - 1 < STAKING.minEv) price = (Math.round(price * 100) + 1) / 100;
  return price <= STAKING.maxPrice ? price : null;
}

/** A single bet: the verdict's gates re-run at the selected price, then its Kelly stake. */
export function singleStake(verdict: OutcomeVerdict | null, price: number): SingleStake {
  if (!verdict) return { units: 0, ev: null, blocker: "NO_MODEL", minPrice: null };
  const ev = verdict.modelProb * price - 1;
  if (!isStakedTier(verdict.tier)) return { units: 0, ev, blocker: "NOT_STAKED", minPrice: null };
  if (price > STAKING.maxPrice) return { units: 0, ev, blocker: "LONGSHOT", minPrice: null };
  if (ev < STAKING.minEv) return { units: 0, ev, blocker: "NEGATIVE_EV", minPrice: minStakedPrice(verdict.modelProb) };
  return { units: kellyUnits(verdict.modelProb, price, verdict.tier as Tier), ev, blocker: null, minPrice: null };
}

export type ComboLeg = { eventId: string; verdict: OutcomeVerdict | null; price: number };

export type ComboBlocker =
  | "TOO_FEW_LEGS"
  | "SAME_EVENT" // two legs of one match aren't independent (and books refuse them)
  | "LEG_NOT_STAKED"; // a leg the model wouldn't stake on its own

export type ComboStake = {
  /** Combined odds: the product of every leg's price. */
  price: number;
  /** The model's probability that every leg wins, legs taken as independent. */
  probability: number | null;
  ev: number | null;
  units: number;
  blocker: ComboBlocker | null;
};

/**
 * A combo ("combiné") is staked only when every leg would be staked on its own, each from a
 * different match. Fractional Kelly on the joint probability, capped by the weakest leg's
 * tier. The longshot gate stays per leg: a combo's own price is high by construction.
 */
export function comboStake(legs: ComboLeg[]): ComboStake {
  const price = legs.reduce((product, leg) => product * leg.price, 1);
  const verdicts = legs.map((leg) => leg.verdict).filter((v): v is OutcomeVerdict => v !== null);
  const probability = verdicts.length === legs.length ? verdicts.reduce((product, v) => product * v.modelProb, 1) : null;
  const ev = probability !== null ? probability * price - 1 : null;
  const result = { price, probability, ev, units: 0 };

  if (legs.length < 2) return { ...result, blocker: "TOO_FEW_LEGS" };
  if (new Set(legs.map((leg) => leg.eventId)).size < legs.length) return { ...result, blocker: "SAME_EVENT" };
  if (probability === null || legs.some((leg) => singleStake(leg.verdict, leg.price).units === 0)) {
    return { ...result, blocker: "LEG_NOT_STAKED" };
  }
  const weakestTier = verdicts.map((v) => v.tier).sort((a, b) => tierRank(b) - tierRank(a))[0] as Tier;
  return { ...result, units: kellyUnits(probability, price, weakestTier), blocker: null };
}
