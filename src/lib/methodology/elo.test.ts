import { test } from "node:test";
import assert from "node:assert/strict";
import { ELO } from "@/lib/methodology/config";
import {
  eloOutcomeProbabilities,
  expectedScore,
  formAdjustment,
  formScore,
  marginMultiplier,
  replayElo,
  restAdjustment,
  tuneLeagues,
  type EloFixture,
} from "@/lib/methodology/elo";
import { simulateLeague } from "@/lib/methodology/testUtils";

const params = () => ({ kFactor: 20, homeAdvantage: 60 });

function fixture(partial: Partial<EloFixture> & Pick<EloFixture, "id" | "homeId" | "awayId" | "homeGoals" | "awayGoals">): EloFixture {
  return {
    date: new Date(Date.UTC(2025, 7, partial.id)),
    competitionCode: "PL",
    season: 2025,
    homeName: `T${partial.homeId}`,
    awayName: `T${partial.awayId}`,
    ...partial,
  };
}

test("expected score is the logistic Elo curve", () => {
  assert.equal(expectedScore(0), 0.5);
  assert.ok(Math.abs(expectedScore(400) - 10 / 11) < 1e-12);
  assert.ok(Math.abs(expectedScore(-200) + expectedScore(200) - 1) < 1e-12);
});

test("bigger margins move ratings more, with diminishing returns", () => {
  assert.equal(marginMultiplier(0), 1);
  assert.equal(marginMultiplier(-1), 1);
  assert.equal(marginMultiplier(2), 1.5);
  assert.equal(marginMultiplier(3), 1.75);
  assert.equal(marginMultiplier(5), 2);
});

test("replay is zero-sum and rewards the winner", () => {
  const { teams, predictions } = replayElo([fixture({ id: 1, homeId: 1, awayId: 2, homeGoals: 3, awayGoals: 0 })], params);
  const home = teams.get(1)!;
  const away = teams.get(2)!;
  assert.ok(home.elo > ELO.initial);
  assert.ok(Math.abs(home.elo + away.elo - 2 * ELO.initial) < 1e-9);
  // 20 · 1.75 (3-goal margin) · (1 - E(60))
  assert.ok(Math.abs(home.elo - ELO.initial - 20 * 1.75 * (1 - expectedScore(60))) < 1e-9);
  assert.equal(predictions[0].result, "H");
  assert.equal(predictions[0].homeMatchesBefore, 0);
  assert.equal(home.residuals.length, 1);
  assert.ok(Math.abs(home.residuals[0] + away.residuals[0]) < 1e-12);
});

test("ratings regress toward the mean when a new season starts", () => {
  const { teams } = replayElo(
    [
      fixture({ id: 1, homeId: 1, awayId: 2, homeGoals: 4, awayGoals: 0 }),
      fixture({ id: 2, homeId: 1, awayId: 2, homeGoals: 0, awayGoals: 0, season: 2026, date: new Date(Date.UTC(2026, 7, 10)) }),
    ],
    () => ({ kFactor: 0.0001, homeAdvantage: 0 })
  );
  const after = teams.get(1)!.elo;
  assert.ok(Math.abs(after - ELO.initial) < 1e-3, "tiny K: the season-one gain is ~0, regression keeps it ~0");

  const { teams: withGain } = replayElo(
    [
      fixture({ id: 1, homeId: 1, awayId: 2, homeGoals: 4, awayGoals: 0 }),
      fixture({ id: 2, homeId: 3, awayId: 4, homeGoals: 0, awayGoals: 0, season: 2026, date: new Date(Date.UTC(2026, 7, 10)) }),
      fixture({ id: 3, homeId: 1, awayId: 3, homeGoals: 0, awayGoals: 0, season: 2026, date: new Date(Date.UTC(2026, 7, 12)) }),
    ],
    () => ({ kFactor: 20, homeAdvantage: 0 })
  );
  assert.ok(withGain.get(1)!.elo > ELO.initial);
});

test("a team first seen in a later season of a known league starts below average (promoted)", () => {
  const { teams } = replayElo(
    [
      fixture({ id: 1, homeId: 1, awayId: 2, homeGoals: 1, awayGoals: 1 }),
      fixture({ id: 2, homeId: 3, awayId: 1, homeGoals: 1, awayGoals: 1, season: 2026, date: new Date(Date.UTC(2026, 7, 10)) }),
    ],
    () => ({ kFactor: 0.0001, homeAdvantage: 0 })
  );
  assert.ok(Math.abs(teams.get(3)!.elo - (ELO.initial - ELO.promotedDiscount)) < 0.1);
});

test("Elo 1X2 probabilities sum to 1, peak the draw between equal teams and are symmetric", () => {
  const even = eloOutcomeProbabilities(0, 0.27, 450);
  assert.ok(Math.abs(even.home + even.draw + even.away - 1) < 1e-12);
  assert.ok(Math.abs(even.home - even.away) < 1e-12);
  const lopsided = eloOutcomeProbabilities(300, 0.27, 450);
  assert.ok(lopsided.draw < even.draw);
  assert.ok(lopsided.home > 0.7);
  const mirrored = eloOutcomeProbabilities(-300, 0.27, 450);
  assert.ok(Math.abs(mirrored.away - lopsided.home) < 1e-12);
  const extreme = eloOutcomeProbabilities(-1500, 0.27, 450);
  assert.ok(extreme.home > 0 && extreme.draw >= 0);
});

test("form counts unplayed games as zero and is capped", () => {
  assert.equal(formScore([]), 0);
  assert.ok(Math.abs(formScore([0.5, 0.5]) - 0.1) < 1e-12);
  const hot = formAdjustment(formScore(Array(10).fill(1)));
  assert.ok(Math.abs(hot - ELO.formEloCap * ELO.formBlend) < 1e-9);
  assert.ok(formAdjustment(-1) < 0);
});

test("rest only matters when a side is on short rest", () => {
  assert.equal(restAdjustment(7, 7), 0);
  assert.equal(restAdjustment(3, 7), -ELO.restEloCap);
  assert.equal(restAdjustment(6, 3), 12);
  assert.equal(restAdjustment(3, 4), -ELO.restEloPerDay);
  assert.equal(restAdjustment(null, 3), 0);
  assert.equal(restAdjustment(40, 3), 0);
});

test("league tuning recovers a strong home advantage from simulated results", () => {
  const strength = [1.6, 1.4, 1.25, 1.1, 1.0, 1.0, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65];
  const fixtures = simulateLeague({
    seed: 7,
    seasons: 3,
    attack: strength,
    defense: strength.map((s) => 1 / s),
    homeAdv: 1.5,
    competitionCode: "HOME",
  });
  assert.ok(fixtures.length >= ELO.tuneMinMatches);
  const tuned = tuneLeagues(fixtures).get("HOME")!;
  assert.equal(tuned.tuned, true);
  assert.ok(tuned.params.homeAdvantage >= 75, `home advantage ${tuned.params.homeAdvantage}`);
  assert.ok(tuned.drawBase > 0 && tuned.drawWidth > 0);

  const small = tuneLeagues(fixtures.slice(0, 50)).get("HOME")!;
  assert.equal(small.tuned, false);
  assert.equal(small.params.homeAdvantage, ELO.homeAdvantage);
});
