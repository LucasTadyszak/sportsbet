// The raw model for one match: [LE] Elo spine + last-10 form + structural nudges,
// blended with the goals model. No market information here — the market anchor,
// line-movement nudge and calibration are applied later, in verdict.ts.
import { ELO, ELO_BLEND_WEIGHT } from "@/lib/methodology/config";
import { eloOutcomeProbabilities, formAdjustment, restAdjustment, type OutcomeProbs } from "@/lib/methodology/elo";
import { gridOutcomes, scoreGrid } from "@/lib/methodology/goals";

export type DataQuality = "full" | "partial" | "thin";

export type EloSide = { elo: number; matches: number; formScore: number; restDays: number | null };

export type LeagueEloParams = { homeAdvantage: number; drawBase: number; drawWidth: number };

export type GoalsInput = { lambdaHome: number; lambdaAway: number; rho: number; fitted: boolean };

export type RawModel = {
  probabilities: OutcomeProbs;
  elo: (OutcomeProbs & { diff: number; formHome: number; formAway: number; rest: number }) | null;
  goals: (OutcomeProbs & GoalsInput) | null;
  dataQuality: DataQuality;
  minRatedMatches: number;
};

export function rawMatchModel(input: {
  home: EloSide | null;
  away: EloSide | null;
  league: LeagueEloParams;
  goals: GoalsInput | null;
}): RawModel | null {
  let elo: RawModel["elo"] = null;
  if (input.home && input.away) {
    const formHome = formAdjustment(input.home.formScore);
    const formAway = formAdjustment(input.away.formScore);
    const rest = restAdjustment(input.home.restDays, input.away.restDays);
    const diff = input.home.elo + input.league.homeAdvantage - input.away.elo + formHome - formAway + rest;
    elo = { ...eloOutcomeProbabilities(diff, input.league.drawBase, input.league.drawWidth), diff, formHome, formAway, rest };
  }

  let goals: RawModel["goals"] = null;
  if (input.goals) {
    const grid = scoreGrid(input.goals.lambdaHome, input.goals.lambdaAway, input.goals.rho);
    goals = { ...gridOutcomes(grid), ...input.goals };
  }

  if (!elo && !goals) return null;

  let probabilities: OutcomeProbs;
  if (elo && goals) {
    const w = ELO_BLEND_WEIGHT;
    probabilities = {
      home: w * elo.home + (1 - w) * goals.home,
      draw: w * elo.draw + (1 - w) * goals.draw,
      away: w * elo.away + (1 - w) * goals.away,
    };
  } else {
    const only = (elo ?? goals) as OutcomeProbs;
    probabilities = { home: only.home, draw: only.draw, away: only.away };
  }

  const minRatedMatches = input.home && input.away ? Math.min(input.home.matches, input.away.matches) : 0;
  const dataQuality: DataQuality =
    minRatedMatches < ELO.thinMatches
      ? "thin"
      : minRatedMatches >= ELO.fullMatches && goals?.fitted
        ? "full"
        : "partial";

  return { probabilities, elo, goals, dataQuality, minRatedMatches };
}
