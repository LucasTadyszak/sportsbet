import { test } from "node:test";
import assert from "node:assert/strict";
import { CALIBRATION } from "@/lib/methodology/config";
import {
  bucketStats,
  calibrationLookup,
  computeJournalCalibration,
  fitEdgeScale,
  shrunkOffset,
  type JournalRow,
} from "@/lib/methodology/calibration";
import { seededRandom } from "@/lib/methodology/testUtils";

function rows(n: number, predicted: number, hitRate: number, extra: Partial<JournalRow> = {}): JournalRow[] {
  const hits = Math.round(n * hitRate);
  return Array.from({ length: n }, (_, i) => ({
    sportKey: "soccer_epl",
    marketKey: "h2h",
    tier: "GOOD_BET",
    predicted,
    value: i < hits ? 1 : 0,
    weight: 1,
    ...extra,
  }));
}

test("the calibration gap is hit rate minus average predicted probability", () => {
  const stats = bucketStats(rows(200, 0.56, 0.45))!;
  assert.equal(stats.n, 200);
  assert.ok(Math.abs(stats.gap + 0.11) < 1e-12, "LE's example: favourites 11 points hot");
  assert.equal(bucketStats([]), null);
});

test("offsets are shrunk and capped by sample size", () => {
  assert.equal(shrunkOffset(-0.3, CALIBRATION.minSample - 1, 1), 0, "below the minimum sample: no correction");
  // LE's example: a 200-pick gap of -11pp is (almost) fully applied…
  assert.ok(Math.abs(shrunkOffset(-0.11, 200, 0.15) - (-0.11 * 200) / 230) < 1e-12);
  // …while a noisy 20-pick gap of -33pp only propagates a fraction.
  const small = shrunkOffset(-0.33, 20, CALIBRATION.sportOffsetCap(20));
  assert.equal(small, -0.06);
});

test("journal calibration: sport offset plus a capped (sport, market) residual", () => {
  const journal = [...rows(20, 0.55, 0.22), ...rows(20, 0.55, 0.55, { marketKey: "totals", tier: "STRONG_BET" })];
  const table = computeJournalCalibration(journal);
  const sport = table.sport.soccer_epl;
  assert.equal(sport.n, 40);
  assert.ok(sport.offset < 0 && sport.offset >= -CALIBRATION.sportOffsetCap(40));
  const h2h = table.sportMarket["soccer_epl|h2h"];
  const totals = table.sportMarket["soccer_epl|totals"];
  assert.ok(h2h.offset < 0, "h2h is worse than the sport average");
  assert.ok(totals.offset > 0, "totals were fine: the residual gives back the sport-level correction");
  assert.ok(Math.abs(h2h.offset) <= CALIBRATION.sportMarketOffsetCap(20));
  assert.equal(table.tier.STRONG_BET.n, 20);
});

test("only the most recent picks of a bucket count", () => {
  const newestFirst = [...rows(CALIBRATION.journalWindow, 0.5, 0.5), ...rows(500, 0.5, 0)];
  const table = computeJournalCalibration(newestFirst);
  assert.equal(table.sport.soccer_epl.n, CALIBRATION.journalWindow);
  assert.ok(Math.abs(table.sport.soccer_epl.gap) < 1e-12);
});

test("edge scale: ~1 when the model's disagreements are real, ~0 when they are noise", () => {
  const random = seededRandom(5);
  const informative = [];
  const noisy = [];
  for (let i = 0; i < 20000; i++) {
    const truth = 0.2 + 0.6 * random();
    const market = Math.min(0.95, Math.max(0.05, truth + (random() - 0.5) * 0.1));
    const y = random() < truth ? 1 : 0;
    informative.push({ p: truth, m: market, y });
    noisy.push({ p: Math.min(0.95, Math.max(0.05, market + (random() - 0.5) * 0.1)), m: market, y });
  }
  const good = fitEdgeScale(informative);
  const bad = fitEdgeScale(noisy);
  assert.ok(good.scale > 0.8, `informative scale ${good.scale}`);
  assert.ok(bad.scale < 0.3, `noise scale ${bad.scale}`);
  assert.equal(fitEdgeScale([]).scale, CALIBRATION.edgeScalePrior, "no data: the prior");
});

test("lookup combines the stored sport and (sport, market) offsets", () => {
  const lookup = calibrationLookup([
    { scope: "sport", sportKey: "soccer_epl", marketKey: "", applied: -0.02 },
    { scope: "sport_market", sportKey: "soccer_epl", marketKey: "h2h", applied: -0.01 },
    { scope: "edge_scale", sportKey: "soccer_epl", marketKey: "h2h", applied: 0.4 },
  ]);
  assert.ok(Math.abs(lookup.offset("soccer_epl", "h2h") + 0.03) < 1e-12);
  assert.ok(Math.abs(lookup.offset("soccer_epl", "totals") + 0.02) < 1e-12);
  assert.equal(lookup.offset("soccer_france_ligue_one", "h2h"), 0);
  assert.equal(lookup.scale("soccer_epl", "h2h"), 0.4);
  assert.equal(lookup.scale("soccer_epl", "totals"), CALIBRATION.edgeScalePrior);
});
