import { test } from "node:test";
import assert from "node:assert/strict";
import { ANCHOR_WEIGHT, STAKING } from "@/lib/methodology/config";
import type { MarketView, OutcomeMarketView } from "@/lib/methodology/signals";
import { assessMarket, decideVerdict, kellyUnits, userLabel } from "@/lib/methodology/verdict";

function outcomeView(overrides: Partial<OutcomeMarketView> = {}): OutcomeMarketView {
  return {
    consensus: 0.4,
    sharp: 0.4,
    exchange: null,
    soft: 0.4,
    open: 0.4,
    delta: 0,
    nudge: 0,
    steam: null,
    rlm: null,
    sharpDivergence: 0,
    best: { price: 2.6, bookmakerKey: "book", flag: null, divergence: 0 },
    predictedClose: 0.4,
    predictedMove: 0,
    predictedClv: 0.04,
    ...overrides,
  };
}

const verdict = (modelBaseProb: number, view: OutcomeMarketView = outcomeView(), extra: Partial<Parameters<typeof decideVerdict>[0]> = {}) =>
  decideVerdict({ sportKey: "soccer_epl", modelBaseProb, marketProb: 0.4, view, scale: 1, offset: 0, dataQuality: "partial", ...extra });

test("tiers follow the published edge thresholds", () => {
  assert.equal(verdict(0.49).tier, "STRONG_BET");
  assert.equal(verdict(0.43).tier, "GOOD_BET");
  assert.equal(verdict(0.41).tier, "MARGINAL");
  assert.equal(verdict(0.402).tier, "PASS");
  assert.ok(verdict(0.49).reasons.includes("EDGE_STRONG"));
});

test("staked tiers need a price, a sane price and +EV at that price", () => {
  const noPrice = verdict(0.45, outcomeView({ best: null, predictedClv: null }));
  assert.equal(noPrice.tier, "MARGINAL");
  assert.ok(noPrice.reasons.includes("NO_PRICE"));

  const longshot = decideVerdict({
    sportKey: "soccer_epl",
    modelBaseProb: 0.2,
    marketProb: 0.15,
    view: outcomeView({ consensus: 0.15, best: { price: 7, bookmakerKey: "book", flag: null, divergence: 0 } }),
    scale: 1,
    offset: 0,
    dataQuality: "full",
  });
  assert.equal(longshot.tier, "PASS");
  assert.ok(longshot.reasons.includes("LONGSHOT"));

  // 3pp over the fair line, but the book's margin eats it: 0.43 × 2.3 - 1 < 1%.
  const vig = verdict(0.43, outcomeView({ best: { price: 2.3, bookmakerKey: "book", flag: null, divergence: 0 } }));
  assert.equal(vig.tier, "MARGINAL");
  assert.ok(vig.reasons.includes("NEGATIVE_EV"));
});

test("sharps disagreeing, steam against or thin data cap the verdict at MARGINAL", () => {
  assert.equal(verdict(0.49, outcomeView({ sharpDivergence: -0.02 })).tier, "MARGINAL");
  assert.ok(verdict(0.49, outcomeView({ sharpDivergence: -0.02 })).reasons.includes("SHARPS_DISAGREE"));
  assert.equal(verdict(0.49, outcomeView({ steam: { direction: -1, at: "", books: ["a", "b"] } })).tier, "MARGINAL");
  assert.equal(verdict(0.49, outcomeView({ predictedMove: -0.015 })).tier, "MARGINAL");
  assert.equal(verdict(0.49, outcomeView({ predictedClv: -0.03 })).tier, "STRONG_BET", "the margin alone isn't a contradiction");
  const thin = verdict(0.49, outcomeView(), { dataQuality: "thin" });
  assert.equal(thin.tier, "MARGINAL");
  assert.ok(thin.reasons.includes("THIN_DATA"));
});

test("market confirmation upgrades STRONG to HERO and GOOD to BOSS PICK", () => {
  const confirmed = outcomeView({
    steam: { direction: 1, at: "", books: ["a", "b"] },
    sharpDivergence: 0.02,
  });
  assert.equal(verdict(0.49, confirmed, { dataQuality: "full" }).tier, "HERO");
  assert.equal(verdict(0.49, confirmed, { dataQuality: "partial" }).tier, "STRONG_BET", "HERO needs full data");
  assert.equal(verdict(0.43, confirmed).tier, "BOSS_PICK");
  const staleOnly = outcomeView({ best: { price: 2.6, bookmakerKey: "book", flag: "stale", divergence: 0.02 } });
  assert.equal(verdict(0.43, staleOnly).tier, "GOOD_BET", "a slow book alone isn't sharp confirmation");
});

test("probabilities above the demote ceiling drop one rung, and the clamp caps them", () => {
  const heavy = decideVerdict({
    sportKey: "soccer_epl",
    modelBaseProb: 0.83,
    marketProb: 0.74,
    view: outcomeView({ consensus: 0.74, best: { price: 1.45, bookmakerKey: "book", flag: null, divergence: 0 } }),
    scale: 1,
    offset: 0,
    dataQuality: "full",
  });
  assert.equal(heavy.tier, "GOOD_BET");
  assert.ok(heavy.reasons.includes("TOO_CONFIDENT"));

  const clamped = decideVerdict({
    sportKey: "soccer_epl",
    modelBaseProb: 0.97,
    marketProb: 0.9,
    view: outcomeView({ consensus: 0.9, best: { price: 1.12, bookmakerKey: "book", flag: null, divergence: 0 } }),
    scale: 1,
    offset: 0,
    dataQuality: "full",
  });
  assert.equal(clamped.modelProb, 0.85);
  assert.ok(clamped.reasons.includes("CLAMPED"));
  assert.equal(clamped.tier, "PASS");
});

test("calibration scales the disagreement then shifts it", () => {
  const scaled = verdict(0.5, outcomeView(), { scale: 0.5, offset: -0.01 });
  assert.ok(Math.abs(scaled.modelProbPreOffset - 0.45) < 1e-12);
  assert.ok(Math.abs(scaled.modelProb - 0.44) < 1e-12);
  assert.equal(scaled.tier, "GOOD_BET");
});

test("quarter Kelly stakes, capped per tier, in quarter units", () => {
  // Full Kelly at p=.5, odds 2.5: (1.25 - 1) / 1.5 = 16.7% → quarter = 4.17 units → capped.
  assert.equal(kellyUnits(0.5, 2.5, "GOOD_BET"), STAKING.tierCapUnits.GOOD_BET);
  assert.equal(kellyUnits(0.5, 2.5, "HERO"), STAKING.tierCapUnits.HERO);
  // (0.42 × 2.5 - 1) / 1.5 = 3.3% full Kelly → 0.83 units → rounded to 0.75.
  assert.equal(kellyUnits(0.42, 2.5, "GOOD_BET"), 0.75);
  assert.equal(kellyUnits(0.405, 2.5, "GOOD_BET"), STAKING.minStakeUnits);
  assert.equal(kellyUnits(0.5, 2.5, "MARGINAL"), 0);
  assert.equal(kellyUnits(0.3, 2.5, "GOOD_BET"), 0);
  assert.equal(userLabel("BOSS_PICK"), "Petite mise");
  assert.equal(userLabel("HERO"), "Top pick");
  assert.equal(userLabel("MARGINAL"), "Pas de pari");
});

test("assessMarket anchors, nudges, renormalises and recommends the best side", () => {
  const view: MarketView = {
    marketKey: "h2h",
    point: null,
    outcomes: ["A", "Draw", "B"],
    capturedAt: new Date().toISOString(),
    openAt: null,
    bookCount: 5,
    hasSharp: true,
    hasExchange: true,
    consensus: { A: 0.45, Draw: 0.28, B: 0.27 },
    exchange: { A: 0.45, Draw: 0.28, B: 0.27 },
    byOutcome: {
      A: outcomeView({ consensus: 0.45, nudge: 0.01, best: { price: 2.3, bookmakerKey: "x", flag: null, divergence: 0 } }),
      Draw: outcomeView({ consensus: 0.28, best: { price: 3.6, bookmakerKey: "x", flag: null, divergence: 0 } }),
      B: outcomeView({ consensus: 0.27, best: { price: 3.9, bookmakerKey: "x", flag: null, divergence: 0 } }),
    },
    books: [],
  };
  const result = assessMarket({
    sportKey: "soccer_epl",
    rawModel: { A: 0.55, Draw: 0.25, B: 0.2 },
    view,
    calibration: { scale: 1, offset: 0 },
    dataQuality: "partial",
  });
  const base = Object.fromEntries(result.outcomes.map((o) => [o.outcome, o.baseProb]));
  assert.ok(Math.abs(base.A + base.Draw + base.B - 1) < 1e-12);
  const anchoredA = (1 - ANCHOR_WEIGHT) * 0.55 + ANCHOR_WEIGHT * 0.45 + 0.01;
  const anchoredDraw = (1 - ANCHOR_WEIGHT) * 0.25 + ANCHOR_WEIGHT * 0.28;
  const anchoredB = (1 - ANCHOR_WEIGHT) * 0.2 + ANCHOR_WEIGHT * 0.27;
  assert.ok(Math.abs(base.A - anchoredA / (anchoredA + anchoredDraw + anchoredB)) < 1e-12);
  assert.equal(result.recommended, "A");
  assert.equal(result.outcomes.find((o) => o.outcome === "A")!.verdict.tier, "STRONG_BET");
});
