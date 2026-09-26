import { test } from "node:test";
import assert from "node:assert/strict";
import { ELO, ELO_BLEND_WEIGHT } from "@/lib/methodology/config";
import { rawMatchModel } from "@/lib/methodology/model";

const league = { homeAdvantage: 60, drawBase: 0.27, drawWidth: 450 };
const side = (elo: number, matches = 20) => ({ elo, matches, formScore: 0, restDays: 7 });

test("the raw model blends Elo and the goals model", () => {
  const model = rawMatchModel({
    home: side(1600),
    away: side(1500),
    league,
    goals: { lambdaHome: 1.7, lambdaAway: 1.0, rho: -0.05, fitted: true },
  })!;
  const { home, draw, away } = model.probabilities;
  assert.ok(Math.abs(home + draw + away - 1) < 1e-12);
  assert.ok(Math.abs(home - (ELO_BLEND_WEIGHT * model.elo!.home + (1 - ELO_BLEND_WEIGHT) * model.goals!.home)) < 1e-12);
  assert.equal(model.dataQuality, "full");
  assert.equal(model.elo!.diff, 160);
});

test("data quality reflects how many rated matches each side has", () => {
  const partial = rawMatchModel({ home: side(1500, 7), away: side(1500), league, goals: { lambdaHome: 1.4, lambdaAway: 1.1, rho: 0, fitted: true } })!;
  assert.equal(partial.dataQuality, "partial");
  const thin = rawMatchModel({ home: side(1500, ELO.thinMatches - 1), away: side(1500), league, goals: null })!;
  assert.equal(thin.dataQuality, "thin");
  const standingsOnly = rawMatchModel({ home: null, away: null, league, goals: { lambdaHome: 1.4, lambdaAway: 1.1, rho: 0, fitted: false } })!;
  assert.equal(standingsOnly.dataQuality, "thin");
  assert.equal(rawMatchModel({ home: null, away: null, league, goals: null }), null);
});

test("form and short rest shift the Elo gap", () => {
  const rested = rawMatchModel({ home: { ...side(1500), restDays: 7 }, away: { ...side(1500), restDays: 3 }, league, goals: null })!;
  const hot = rawMatchModel({ home: { ...side(1500), formScore: 0.3 }, away: side(1500), league, goals: null })!;
  assert.ok(rested.elo!.rest > 0);
  assert.ok(hot.elo!.formHome > 0);
  assert.ok(hot.probabilities.home > rawMatchModel({ home: side(1500), away: side(1500), league, goals: null })!.probabilities.home);
});
