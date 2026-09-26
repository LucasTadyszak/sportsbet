// From probabilities to a verdict: edge, tier, overconfidence guards, stake.
//
// Order of operations for one market:
//   raw model → market anchor (5%) → line-movement nudge (±1.5pp)      = "base"
//   base → calibration scale → calibration offsets → hard clamp        = "final"
//   edge = final - de-vigged consensus → tier → gates / upgrades / demotions → stake
import {
  ANCHOR_WEIGHT,
  EDGE_THRESHOLDS,
  SIGNALS,
  STAKING,
  TIERS,
  isStakedTier,
  sportProfile,
  type Tier,
} from "@/lib/methodology/config";
import type { DataQuality } from "@/lib/methodology/model";
import type { MarketView, OutcomeMarketView } from "@/lib/methodology/signals";

export type ReasonCode =
  | "EDGE_STRONG"
  | "EDGE_GOOD"
  | "EDGE_MARGINAL"
  | "EDGE_NONE"
  | "NO_PRICE"
  | "LONGSHOT"
  | "NEGATIVE_EV"
  | "CLAMPED"
  | "TOO_CONFIDENT"
  | "THIN_DATA"
  | "PARTIAL_DATA"
  | "STEAM_AGAINST"
  | "RLM_AGAINST"
  | "SHARPS_DISAGREE"
  | "PREDICTED_MOVE_AGAINST"
  | "CONFIRM_STEAM"
  | "CONFIRM_RLM"
  | "CONFIRM_SHARPS"
  | "CONFIRM_STALE";

// Signals that come from the sharp side of the market (not just a slow book).
const SHARP_CONFIRMATIONS: ReasonCode[] = ["CONFIRM_STEAM", "CONFIRM_RLM", "CONFIRM_SHARPS"];

// [LE] demotion drops one rung (HERO → STRONG BET, STRONG BET → GOOD BET…).
const DEMOTE: Partial<Record<Tier, Tier>> = {
  HERO: "STRONG_BET",
  STRONG_BET: "GOOD_BET",
  BOSS_PICK: "GOOD_BET",
  GOOD_BET: "MARGINAL",
};

export type Verdict = {
  tier: Tier;
  reasons: ReasonCode[];
  confirmations: ReasonCode[];
  contradictions: ReasonCode[];
  modelProbPreOffset: number;
  modelProb: number;
  edge: number;
  ev: number | null;
  stakeUnits: number;
};

/** [LE] user-facing surfaces collapse the six tiers into three labels. */
export function userLabel(tier: string): "Top pick" | "Petite mise" | "Pas de pari" {
  if (tier === "HERO" || tier === "STRONG_BET") return "Top pick";
  if (tier === "BOSS_PICK" || tier === "GOOD_BET") return "Petite mise";
  return "Pas de pari";
}

export function tierRank(tier: string): number {
  const index = (TIERS as readonly string[]).indexOf(tier);
  return index === -1 ? TIERS.length : index;
}

/** Fractional Kelly in units (1 unit = 1% of bankroll), capped per tier. */
export function kellyUnits(probability: number, price: number, tier: Tier): number {
  if (!isStakedTier(tier) || price <= 1) return 0;
  const fraction = (probability * price - 1) / (price - 1);
  if (fraction <= 0) return 0;
  const units = Math.min(STAKING.tierCapUnits[tier] ?? 0, STAKING.kellyFraction * fraction * 100);
  return Math.max(STAKING.minStakeUnits, Math.round(units * 4) / 4);
}

export function decideVerdict(input: {
  sportKey: string;
  modelBaseProb: number;
  marketProb: number;
  view: OutcomeMarketView;
  scale: number;
  offset: number;
  dataQuality: DataQuality;
}): Verdict {
  const { view, marketProb, dataQuality } = input;
  const profile = sportProfile(input.sportKey);
  const reasons: ReasonCode[] = [];

  const modelProbPreOffset = marketProb + input.scale * (input.modelBaseProb - marketProb);
  let modelProb = modelProbPreOffset + input.offset;
  if (modelProb > profile.probClamp) {
    modelProb = profile.probClamp;
    reasons.push("CLAMPED");
  }
  modelProb = Math.max(profile.probFloor, modelProb);

  const edge = modelProb - marketProb;
  const price = view.best?.price ?? null;
  const ev = price !== null ? modelProb * price - 1 : null;

  let tier: Tier;
  if (edge >= EDGE_THRESHOLDS.strong) {
    tier = "STRONG_BET";
    reasons.push("EDGE_STRONG");
  } else if (edge >= EDGE_THRESHOLDS.good) {
    tier = "GOOD_BET";
    reasons.push("EDGE_GOOD");
  } else if (edge >= EDGE_THRESHOLDS.marginal) {
    tier = "MARGINAL";
    reasons.push("EDGE_MARGINAL");
  } else {
    tier = "PASS";
    reasons.push("EDGE_NONE");
  }

  const confirmations: ReasonCode[] = [];
  if (view.steam?.direction === 1) confirmations.push("CONFIRM_STEAM");
  if (view.rlm?.sharpSide === 1) confirmations.push("CONFIRM_RLM");
  if (view.sharpDivergence !== null && view.sharpDivergence >= SIGNALS.sharpDivergence) confirmations.push("CONFIRM_SHARPS");
  if (view.best?.flag === "stale") confirmations.push("CONFIRM_STALE");

  const contradictions: ReasonCode[] = [];
  if (view.steam?.direction === -1) contradictions.push("STEAM_AGAINST");
  if (view.rlm?.sharpSide === -1) contradictions.push("RLM_AGAINST");
  if (view.sharpDivergence !== null && view.sharpDivergence <= -SIGNALS.sharpDivergence) contradictions.push("SHARPS_DISAGREE");
  if (view.predictedMove !== null && view.predictedMove <= -SIGNALS.predictedMoveAgainst) contradictions.push("PREDICTED_MOVE_AGAINST");

  // Gates: a staked tier needs a price, a sane price, +EV at that price, no sharp
  // money against it and enough data about the teams.
  if (price === null) {
    if (isStakedTier(tier)) tier = "MARGINAL";
    reasons.push("NO_PRICE");
  } else if (price > STAKING.maxPrice) {
    if (tier !== "PASS") reasons.push("LONGSHOT");
    tier = "PASS";
  } else if (isStakedTier(tier) && (ev ?? -1) < STAKING.minEv) {
    tier = "MARGINAL";
    reasons.push("NEGATIVE_EV");
  }
  if (isStakedTier(tier) && contradictions.length > 0) {
    tier = "MARGINAL";
    reasons.push(...contradictions);
  }
  if (isStakedTier(tier) && dataQuality === "thin") {
    tier = "MARGINAL";
    reasons.push("THIN_DATA");
  }

  // Upgrades: the market confirming the model's side.
  if (tier === "STRONG_BET" && confirmations.length >= 2 && dataQuality === "full") tier = "HERO";
  if (tier === "GOOD_BET" && confirmations.some((c) => SHARP_CONFIRMATIONS.includes(c))) tier = "BOSS_PICK";
  if (isStakedTier(tier)) {
    reasons.push(...confirmations);
    if (dataQuality === "partial") reasons.push("PARTIAL_DATA");
  }

  // [LE] verdict-demote ceiling: lopsided probabilities are where models are most overconfident.
  if (isStakedTier(tier) && modelProb > profile.demoteCeiling) {
    tier = DEMOTE[tier] ?? tier;
    reasons.push("TOO_CONFIDENT");
  }

  return {
    tier,
    reasons,
    confirmations,
    contradictions,
    modelProbPreOffset,
    modelProb,
    edge,
    ev,
    stakeUnits: price !== null ? kellyUnits(modelProb, price, tier) : 0,
  };
}

export type OutcomeAssessment = {
  outcome: string;
  rawProb: number;
  baseProb: number;
  view: OutcomeMarketView;
  verdict: Verdict;
};

export type MarketAssessment = { outcomes: OutcomeAssessment[]; recommended: string | null };

/** Runs the whole chain for every outcome of one market and picks the side the model would take. */
export function assessMarket(input: {
  sportKey: string;
  rawModel: Record<string, number>;
  view: MarketView;
  calibration: { scale: number; offset: number };
  dataQuality: DataQuality;
}): MarketAssessment {
  const { view } = input;
  const profile = sportProfile(input.sportKey);

  // [LE] ~5% real-money anchor, then the capped line-movement nudge; renormalised.
  const base: Record<string, number> = {};
  for (const outcome of view.outcomes) {
    const raw = input.rawModel[outcome];
    const anchor = view.exchange?.[outcome];
    const anchored = anchor !== undefined ? (1 - ANCHOR_WEIGHT) * raw + ANCHOR_WEIGHT * anchor : raw;
    base[outcome] = Math.max(profile.probFloor, anchored + view.byOutcome[outcome].nudge);
  }
  const total = view.outcomes.reduce((s, o) => s + base[o], 0);
  for (const outcome of view.outcomes) base[outcome] /= total;

  const outcomes = view.outcomes.map((outcome) => ({
    outcome,
    rawProb: input.rawModel[outcome],
    baseProb: base[outcome],
    view: view.byOutcome[outcome],
    verdict: decideVerdict({
      sportKey: input.sportKey,
      modelBaseProb: base[outcome],
      marketProb: view.consensus[outcome],
      view: view.byOutcome[outcome],
      scale: input.calibration.scale,
      offset: input.calibration.offset,
      dataQuality: input.dataQuality,
    }),
  }));

  const ranked = [...outcomes].sort(
    (a, b) =>
      tierRank(a.verdict.tier) - tierRank(b.verdict.tier) ||
      (b.verdict.ev ?? -Infinity) - (a.verdict.ev ?? -Infinity) ||
      b.verdict.edge - a.verdict.edge
  );
  return { outcomes, recommended: ranked[0]?.outcome ?? null };
}
