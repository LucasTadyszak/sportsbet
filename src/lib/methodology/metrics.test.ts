import { test } from "node:test";
import assert from "node:assert/strict";
import { binaryBrier, brier1x2, calibrationBand, logLoss1x2, reliabilityBins, rps1x2 } from "@/lib/methodology/metrics";

test("1X2 scoring rules", () => {
  const sure = { home: 1, draw: 0, away: 0 };
  assert.equal(brier1x2(sure, "H"), 0);
  assert.equal(brier1x2(sure, "A"), 2);
  assert.equal(rps1x2(sure, "H"), 0);
  // RPS punishes predicting a home win more when the away side wins than when it's a draw.
  assert.ok(rps1x2(sure, "A") > rps1x2(sure, "D"));
  const uniform = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  assert.ok(Math.abs(brier1x2(uniform, "D") - 2 / 3) < 1e-12);
  assert.ok(Math.abs(logLoss1x2(uniform, "D") - Math.log(3)) < 1e-12);
});

test("binary Brier has a 0.25 coin-flip baseline", () => {
  assert.equal(binaryBrier([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }]), 0.25);
  assert.equal(binaryBrier([]), null);
});

test("reliability bins average predictions and outcomes per bin", () => {
  const bins = reliabilityBins([
    { p: 0.12, y: 0 },
    { p: 0.18, y: 1 },
    { p: 0.55, y: 1 },
    { p: 1, y: 1 },
  ]);
  assert.equal(bins.length, 3);
  assert.equal(bins[0].n, 2);
  assert.ok(Math.abs(bins[0].avgPredicted - 0.15) < 1e-12);
  assert.equal(bins[0].observed, 0.5);
  assert.equal(bins[2].hi, 1);
});

test("calibration bands follow LE's ±2pt / ±10pt thresholds", () => {
  assert.equal(calibrationBand(0.015), "good");
  assert.equal(calibrationBand(-0.05), "warning");
  assert.equal(calibrationBand(-0.11), "critical");
});
