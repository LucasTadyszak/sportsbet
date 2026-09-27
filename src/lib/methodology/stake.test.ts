import { test } from "node:test";
import assert from "node:assert/strict";
import { STAKING } from "@/lib/methodology/config";
import { comboStake, singleStake, type OutcomeVerdict } from "@/lib/methodology/stake";
import { kellyUnits } from "@/lib/methodology/verdict";

const verdict = (modelProb: number, tier = "GOOD_BET"): OutcomeVerdict => ({ modelProb, tier, reasons: [] });

test("at the verdict's own price, a selection gets exactly the model's stake", () => {
  for (const [p, price, tier] of [
    [0.52, 2.1, "GOOD_BET"],
    [0.61, 1.8, "HERO"],
    [0.4, 2.9, "BOSS_PICK"],
    [0.35, 3.2, "STRONG_BET"],
  ] as const) {
    assert.equal(singleStake(verdict(p, tier), price).units, kellyUnits(p, price, tier));
  }
});

test("the stake follows the price the user picked, within the tier cap", () => {
  // 50 % at 2.30: ¼ Kelly = 2.9 % of bankroll, capped at 2 u for a STRONG BET.
  const best = singleStake(verdict(0.5, "STRONG_BET"), 2.3);
  assert.equal(best.units, 2);
  assert.equal(best.blocker, null);
  assert.ok(Math.abs((best.ev ?? 0) - 0.15) < 1e-9);
  // Same verdict at a worse price elsewhere: +5 % EV → ¼ Kelly 1.14 % → 1.25 u.
  assert.equal(singleStake(verdict(0.5, "STRONG_BET"), 2.1).units, 1.25);
});

test("a price where the margin eats the edge gets nothing, and says which price would do", () => {
  const low = singleStake(verdict(0.45), 2.2);
  assert.equal(low.units, 0);
  assert.equal(low.blocker, "NEGATIVE_EV");
  assert.equal(low.minPrice, 2.25);
  assert.equal(singleStake(verdict(0.45), 2.24).blocker, "NEGATIVE_EV");
  assert.ok(singleStake(verdict(0.45), 2.25).units >= STAKING.minStakeUnits);
  // The suggested price always clears the gate itself.
  const even = singleStake(verdict(0.5), 2);
  assert.equal(even.blocker, "NEGATIVE_EV");
  assert.ok(even.minPrice !== null && singleStake(verdict(0.5), even.minPrice).units > 0);
});

test("no model, a verdict the model passes, or a longshot price: no stake", () => {
  assert.deepEqual(singleStake(null, 2.3), { units: 0, ev: null, blocker: "NO_MODEL", minPrice: null });
  const passed = singleStake(verdict(0.5, "MARGINAL"), 2.3);
  assert.equal(passed.units, 0);
  assert.equal(passed.blocker, "NOT_STAKED");
  assert.equal(singleStake(verdict(0.5, "PASS"), 2.3).blocker, "NOT_STAKED");
  const longshot = singleStake(verdict(0.3, "STRONG_BET"), STAKING.maxPrice + 0.5);
  assert.equal(longshot.units, 0);
  assert.equal(longshot.blocker, "LONGSHOT");
});

test("a combo multiplies prices and probabilities, capped by its weakest leg", () => {
  const strong = comboStake([
    { eventId: "a", verdict: verdict(0.5, "STRONG_BET"), price: 2.2 },
    { eventId: "b", verdict: verdict(0.55, "STRONG_BET"), price: 2 },
  ]);
  assert.ok(Math.abs(strong.price - 4.4) < 1e-9);
  assert.ok(Math.abs((strong.probability ?? 0) - 0.275) < 1e-9);
  assert.ok(Math.abs((strong.ev ?? 0) - 0.21) < 1e-9);
  // Full Kelly 6.2 % → ¼ = 1.54 % → 1.5 u, under the STRONG BET cap.
  assert.equal(strong.units, 1.5);
  assert.equal(strong.blocker, null);

  const withGoodBet = comboStake([
    { eventId: "a", verdict: verdict(0.5, "GOOD_BET"), price: 2.2 },
    { eventId: "b", verdict: verdict(0.55, "HERO"), price: 2 },
  ]);
  assert.equal(withGoodBet.units, STAKING.tierCapUnits.GOOD_BET);
});

test("a combo needs two legs from different matches, each worth a bet on its own", () => {
  const leg = (eventId: string, v: OutcomeVerdict | null, price = 2.2) => ({ eventId, verdict: v, price });
  assert.equal(comboStake([leg("a", verdict(0.5, "STRONG_BET"))]).blocker, "TOO_FEW_LEGS");
  const sameMatch = comboStake([leg("a", verdict(0.5, "STRONG_BET")), leg("a", verdict(0.55, "STRONG_BET"))]);
  assert.equal(sameMatch.blocker, "SAME_EVENT");
  assert.equal(sameMatch.units, 0);
  assert.equal(comboStake([leg("a", verdict(0.5, "STRONG_BET")), leg("b", verdict(0.55, "MARGINAL"))]).blocker, "LEG_NOT_STAKED");
  assert.equal(comboStake([leg("a", verdict(0.5, "STRONG_BET")), leg("b", verdict(0.5, "STRONG_BET"), 1.9)]).blocker, "LEG_NOT_STAKED");
  const unpriced = comboStake([leg("a", verdict(0.5, "STRONG_BET")), leg("b", null)]);
  assert.equal(unpriced.blocker, "LEG_NOT_STAKED");
  assert.equal(unpriced.probability, null);
});
