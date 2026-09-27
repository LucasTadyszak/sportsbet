import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dixonColesTau,
  expectedGoals,
  fitGoalsModel,
  gridOutcomes,
  rankedScores,
  scoreGrid,
  totalGoalsDistribution,
  totalsProbability,
} from "@/lib/methodology/goals";
import { simulateLeague } from "@/lib/methodology/testUtils";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test("the Dixon-Coles correction keeps the score grid a probability distribution", () => {
  for (const rho of [-0.15, 0, 0.1]) {
    const grid = scoreGrid(1.6, 1.1, rho);
    assert.ok(Math.abs(sum(grid.flat()) - 1) < 1e-9);
    const outcomes = gridOutcomes(grid);
    assert.ok(Math.abs(outcomes.home + outcomes.draw + outcomes.away - 1) < 1e-9);
  }
  // Negative rho inflates 0-0 and 1-1 (more draws), the classic Dixon-Coles finding.
  assert.ok(dixonColesTau(0, 0, 1.5, 1.2, -0.1) > 1);
  assert.ok(dixonColesTau(1, 1, 1.5, 1.2, -0.1) > 1);
  assert.equal(dixonColesTau(2, 1, 1.5, 1.2, -0.1), 1);
  assert.ok(gridOutcomes(scoreGrid(1.3, 1.3, -0.1)).draw > gridOutcomes(scoreGrid(1.3, 1.3, 0)).draw);
});

test("scores are ranked most likely first, with deterministic ties", () => {
  const grid = scoreGrid(2.4, 0.6, -0.05);
  const ranked = rankedScores(grid);
  assert.equal(ranked.length, grid.length * grid[0].length);
  assert.ok(Math.abs(sum(ranked.map((s) => s.probability)) - 1) < 1e-9);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].probability >= ranked[i].probability);
  assert.equal(ranked[0].probability, Math.max(...grid.flat()));
  assert.equal(ranked[0].probability, grid[ranked[0].home][ranked[0].away]);
  assert.ok(ranked[0].home > ranked[0].away, "a much stronger home side's likeliest score is a home win");

  // Equal probabilities: fewer goals first, then the home side ahead.
  const tiedOnGoals = rankedScores([
    [0.25, 0.15],
    [0.35, 0.25],
  ]);
  assert.deepEqual(tiedOnGoals.map((s) => `${s.home}-${s.away}`), ["1-0", "0-0", "1-1", "0-1"]);
  const tiedOnSide = rankedScores([
    [0.1, 0.2],
    [0.2, 0.5],
  ]);
  assert.deepEqual(tiedOnSide.map((s) => `${s.home}-${s.away}`), ["1-1", "1-0", "0-1", "0-0"]);
});

test("totals probabilities are complementary on half, whole and quarter lines", () => {
  for (const line of [2.5, 2, 2.25, 2.75, 3]) {
    const over = totalsProbability(1.5, 1.2, -0.05, "Over", line)!;
    const under = totalsProbability(1.5, 1.2, -0.05, "Under", line)!;
    assert.ok(Math.abs(over + under - 1) < 1e-9, `line ${line}`);
  }
  const dist = totalGoalsDistribution(scoreGrid(1.5, 1.2, 0));
  const pOver25 = sum(dist.slice(3));
  assert.ok(Math.abs(totalsProbability(1.5, 1.2, 0, "Over", 2.5)! - pOver25) < 1e-9);
  // Over 2: a total of exactly 2 is a push, so it's P(>2) / (P(>2) + P(<2)).
  const pOver2 = sum(dist.slice(3)) / (sum(dist.slice(3)) + dist[0] + dist[1]);
  assert.ok(Math.abs(totalsProbability(1.5, 1.2, 0, "Over", 2)! - pOver2) < 1e-9);
});

test("the fitted goals model recovers the simulated strengths", () => {
  const attack = [1.7, 1.4, 1.2, 1.1, 1.0, 0.95, 0.9, 0.85, 0.8, 0.75];
  const defense = [0.6, 0.75, 0.85, 0.95, 1.0, 1.05, 1.1, 1.2, 1.3, 1.4];
  const fixtures = simulateLeague({ seed: 11, seasons: 3, attack, defense, base: 1.15, homeAdv: 1.3 });
  const asOf = new Date(fixtures[fixtures.length - 1].date.getTime() + 1000);
  const model = fitGoalsModel(fixtures, asOf)!;
  assert.ok(model);
  assert.ok(Math.abs(model.homeAdv - 1.3) < 0.12, `home advantage ${model.homeAdv}`);
  assert.ok(model.rho >= -0.2 && model.rho <= 0.2);
  assert.ok(model.teams["1"].attack > model.teams["10"].attack);
  assert.ok(model.teams["1"].defense < model.teams["10"].defense);

  const strongVsWeak = expectedGoals(model, 1, 10)!;
  const weakVsStrong = expectedGoals(model, 10, 1)!;
  assert.ok(strongVsWeak.home > weakVsStrong.home);
  assert.ok(strongVsWeak.away < weakVsStrong.away);
  assert.equal(expectedGoals(model, 1, 999), null);
});

test("neutral-ground matches neither get nor teach the home multiplier", () => {
  // Six equal teams; every pairing is played once at home (3-2) and once on neutral ground (2-2).
  const fixtures = [];
  let day = 0;
  for (let home = 1; home <= 6; home++) {
    for (let away = 1; away <= 6; away++) {
      if (home === away) continue;
      const date = (offset: number) => new Date(Date.UTC(2026, 0, 1) + (day + offset) * 24 * 60 * 60 * 1000);
      fixtures.push({ homeId: home, awayId: away, homeGoals: 3, awayGoals: 2, date: date(0) });
      fixtures.push({ homeId: home, awayId: away, homeGoals: 2, awayGoals: 2, date: date(0.5), neutral: true });
      day++;
    }
  }
  const asOf = new Date(Date.UTC(2026, 3, 1));

  const model = fitGoalsModel(fixtures, asOf)!;
  assert.ok(Math.abs(model.homeAdv - 1.5) < 1e-6, `home advantage ${model.homeAdv}`);
  assert.ok(Math.abs(model.base - 2) < 1e-6, `base ${model.base}`);
  const blind = fitGoalsModel(fixtures.map((f) => ({ ...f, neutral: false })), asOf)!;
  assert.ok(Math.abs(blind.homeAdv - 1.25) < 0.01, `treating every match as a home game dilutes it: ${blind.homeAdv}`);

  const atHome = expectedGoals(model, 1, 6)!;
  const onNeutral = expectedGoals(model, 1, 6, { neutral: true })!;
  assert.ok(Math.abs(atHome.home / onNeutral.home - model.homeAdv) < 1e-9);
  assert.equal(atHome.away, onNeutral.away);
});

test("too little history means no goals model rather than a wild one", () => {
  const fixtures = simulateLeague({ seed: 3, seasons: 1, attack: [1, 1, 1, 1], defense: [1, 1, 1, 1] });
  assert.equal(fitGoalsModel(fixtures, new Date("2030-01-01")), null);
});
