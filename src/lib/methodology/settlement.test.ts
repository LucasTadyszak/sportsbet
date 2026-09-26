import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breakEvenProbability,
  calibrationHit,
  closingLineValue,
  profitUnits,
  settleH2h,
  settleTotals,
  totalsLineProbabilities,
} from "@/lib/methodology/settlement";

test("1X2 settles on the 90-minute score", () => {
  assert.equal(settleH2h("Arsenal", "Arsenal", "Chelsea", 2, 1), "won");
  assert.equal(settleH2h("Draw", "Arsenal", "Chelsea", 1, 1), "won");
  assert.equal(settleH2h("Chelsea", "Arsenal", "Chelsea", 1, 1), "lost");
});

test("totals: half, whole and quarter lines", () => {
  assert.equal(settleTotals("Over", 2.5, 3), "won");
  assert.equal(settleTotals("Over", 2.5, 2), "lost");
  assert.equal(settleTotals("Under", 2, 2), "push");
  assert.equal(settleTotals("Over", 2.25, 2), "half_lost");
  assert.equal(settleTotals("Under", 2.25, 2), "half_won");
  assert.equal(settleTotals("Over", 2.75, 3), "half_won");
  assert.equal(settleTotals("Under", 2.75, 3), "half_lost");
  assert.equal(settleTotals("Over", 2.75, 4), "won");
  assert.equal(settleTotals("Under", 2.25, 1), "won");
});

test("profit in units", () => {
  assert.equal(profitUnits("won", 2.5, 2), 3);
  assert.equal(profitUnits("half_won", 2, 2), 1);
  assert.equal(profitUnits("push", 2, 2), 0);
  assert.equal(profitUnits("half_lost", 2, 2), -1);
  assert.equal(profitUnits("lost", 2, 2), -2);
});

test("calibration treats half results as half an observation and ignores pushes", () => {
  assert.deepEqual(calibrationHit("won"), { value: 1, weight: 1 });
  assert.deepEqual(calibrationHit("half_lost"), { value: 0, weight: 0.5 });
  assert.equal(calibrationHit("push"), null);
  assert.equal(calibrationHit("void"), null);
});

test("closing line value is the EV of our price against the closing fair line", () => {
  assert.ok(Math.abs(closingLineValue(2.1, 0.5) - 0.05) < 1e-12);
  assert.ok(closingLineValue(1.9, 0.5) < 0);
});

test("break-even probability on a quarter line accounts for the half loss", () => {
  // Totals distribution: P(0)=.1 P(1)=.2 P(2)=.3 P(3+)=.4 (as P(3)).
  const probs = totalsLineProbabilities([0.1, 0.2, 0.3, 0.4], "Over", 2.25);
  assert.ok(Math.abs(probs.won - 0.4) < 1e-12);
  assert.ok(Math.abs(probs.half_lost - 0.3) < 1e-12);
  assert.ok(Math.abs(probs.lost - 0.3) < 1e-12);
  // Break-even odds o: 0.4(o-1) = 0.15 + 0.3 → o = 2.125.
  assert.ok(Math.abs(breakEvenProbability(probs)! - 1 / 2.125) < 1e-12);
});
