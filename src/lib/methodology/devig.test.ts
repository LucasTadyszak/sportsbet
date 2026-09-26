import { test } from "node:test";
import assert from "node:assert/strict";
import { devigMultiplicative, devigPower, devigPrices, devigShin, overround, weightedConsensus } from "@/lib/methodology/devig";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("every method returns probabilities that sum to 1", () => {
  const prices = [1.55, 4.2, 6.5];
  for (const probs of [devigMultiplicative(prices), devigPower(prices), devigShin(prices)]) {
    assert.ok(Math.abs(sum(probs) - 1) < 1e-9);
    assert.ok(probs.every((p) => p > 0 && p < 1));
  }
});

test("a symmetric two-way market de-vigs to 50/50 whatever the method", () => {
  for (const method of ["multiplicative", "power", "shin"] as const) {
    const probs = devigPrices([1.91, 1.91], method)!;
    assert.ok(Math.abs(probs[0] - 0.5) < 1e-9);
  }
});

test("Shin and power load more of the margin onto the longshot than proportional scaling", () => {
  const prices = [1.3, 5.5, 11];
  const mult = devigMultiplicative(prices);
  const shin = devigShin(prices);
  const power = devigPower(prices);
  assert.ok(shin[2] < mult[2], "longshot gets less probability under Shin");
  assert.ok(power[2] < mult[2], "longshot gets less probability under power");
  assert.ok(shin[0] > mult[0], "favourite gets more probability under Shin");
});

test("a market without overround is only normalised", () => {
  const probs = devigShin([2.1, 2.1]);
  assert.ok(Math.abs(probs[0] - 0.5) < 1e-9);
});

test("unusable prices are rejected", () => {
  assert.equal(devigPrices([1.0, 3]), null);
  assert.equal(devigPrices([2]), null);
  assert.equal(devigPrices([Number.NaN, 2]), null);
});

test("overround is the sum of implied probabilities minus one", () => {
  assert.ok(Math.abs(overround([1.9, 1.9]) - (2 / 1.9 - 1)) < 1e-12);
});

test("consensus weights books and skips incomplete ones", () => {
  const consensus = weightedConsensus(
    [
      { weight: 2, fair: { A: 0.6, B: 0.4 } }, // Pinnacle, counted twice
      { weight: 1, fair: { A: 0.3, B: 0.7 } },
      { weight: 1, fair: { A: 0.9 } }, // incomplete → ignored
    ],
    ["A", "B"]
  )!;
  assert.ok(Math.abs(consensus.A - 0.5) < 1e-12);
  assert.ok(Math.abs(consensus.B - 0.5) < 1e-12);
  assert.equal(weightedConsensus([], ["A", "B"]), null);
});
