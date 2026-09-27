// The goals model — football's equivalent of LE's structural features, and the only
// part of the model that can price totals (Elo knows who wins, not by how much).
//
// Dixon & Coles (1997): home goals ~ Poisson(base·homeAdv·attack_home·defense_away),
// away goals ~ Poisson(base·attack_away·defense_home), with a correction ρ for the
// low scores (0-0, 1-0, 0-1, 1-1) independent Poissons get wrong, and recent matches
// weighted more (exponential time decay). Strengths are shrunk toward league average
// with a few pseudo-games so that five early-season matches aren't taken at face value.
import { GOALS } from "@/lib/methodology/config";
import { breakEvenProbability, totalsLineProbabilities } from "@/lib/methodology/settlement";
import type { OutcomeProbs } from "@/lib/methodology/elo";

export type GoalsFixture = { homeId: number; awayId: number; homeGoals: number; awayGoals: number; date: Date };

export type TeamStrength = { attack: number; defense: number; games: number };

export type GoalsModel = {
  base: number;
  homeAdv: number;
  rho: number;
  teams: Record<string, TeamStrength>;
  matches: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function dixonColesTau(homeGoals: number, awayGoals: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export function fitGoalsModel(fixtures: GoalsFixture[], asOf: Date): GoalsModel | null {
  const past = fixtures.filter((f) => f.date.getTime() <= asOf.getTime());
  if (past.length < GOALS.minMatches) return null;

  const rows = past.map((f) => ({
    ...f,
    w: Math.exp(-GOALS.decayPerDay * ((asOf.getTime() - f.date.getTime()) / DAY_MS)),
  }));

  const ids = Array.from(new Set(rows.flatMap((r) => [r.homeId, r.awayId])));
  const attack = new Map<number, number>(ids.map((id) => [id, 1]));
  const defense = new Map<number, number>(ids.map((id) => [id, 1]));
  const games = new Map<number, number>(ids.map((id) => [id, 0]));
  for (const r of rows) {
    games.set(r.homeId, (games.get(r.homeId) ?? 0) + 1);
    games.set(r.awayId, (games.get(r.awayId) ?? 0) + 1);
  }

  const weightSum = rows.reduce((s, r) => s + r.w, 0);
  const homeAvg = rows.reduce((s, r) => s + r.w * r.homeGoals, 0) / weightSum;
  const awayAvg = rows.reduce((s, r) => s + r.w * r.awayGoals, 0) / weightSum;
  if (homeAvg <= 0 || awayAvg <= 0) return null;
  const meanGoals = (homeAvg + awayAvg) / 2;
  const prior = GOALS.priorGames * meanGoals;

  let base = awayAvg;
  let homeAdv = homeAvg / awayAvg;
  const a = (id: number) => attack.get(id) ?? 1;
  const d = (id: number) => defense.get(id) ?? 1;

  // Coordinate-wise weighted Poisson maximum likelihood (each update is the exact
  // conditional optimum), with the pseudo-game prior on every team strength.
  for (let iter = 0; iter < GOALS.iterations; iter++) {
    const scored = new Map<number, number>();
    const scoredExp = new Map<number, number>();
    for (const r of rows) {
      scored.set(r.homeId, (scored.get(r.homeId) ?? 0) + r.w * r.homeGoals);
      scored.set(r.awayId, (scored.get(r.awayId) ?? 0) + r.w * r.awayGoals);
      scoredExp.set(r.homeId, (scoredExp.get(r.homeId) ?? 0) + r.w * base * homeAdv * d(r.awayId));
      scoredExp.set(r.awayId, (scoredExp.get(r.awayId) ?? 0) + r.w * base * d(r.homeId));
    }
    for (const id of ids) attack.set(id, ((scored.get(id) ?? 0) + prior) / ((scoredExp.get(id) ?? 0) + prior));

    const conceded = new Map<number, number>();
    const concededExp = new Map<number, number>();
    for (const r of rows) {
      conceded.set(r.homeId, (conceded.get(r.homeId) ?? 0) + r.w * r.awayGoals);
      conceded.set(r.awayId, (conceded.get(r.awayId) ?? 0) + r.w * r.homeGoals);
      concededExp.set(r.homeId, (concededExp.get(r.homeId) ?? 0) + r.w * base * a(r.awayId));
      concededExp.set(r.awayId, (concededExp.get(r.awayId) ?? 0) + r.w * base * homeAdv * a(r.homeId));
    }
    for (const id of ids) defense.set(id, ((conceded.get(id) ?? 0) + prior) / ((concededExp.get(id) ?? 0) + prior));

    const homeGoalsSum = rows.reduce((s, r) => s + r.w * r.homeGoals, 0);
    const homeExp = rows.reduce((s, r) => s + r.w * base * a(r.homeId) * d(r.awayId), 0);
    homeAdv = homeGoalsSum / homeExp;

    const goalsSum = rows.reduce((s, r) => s + r.w * (r.homeGoals + r.awayGoals), 0);
    const goalsExp = rows.reduce((s, r) => s + r.w * (homeAdv * a(r.homeId) * d(r.awayId) + a(r.awayId) * d(r.homeId)), 0);
    base = goalsSum / goalsExp;

    // Identifiability: average team has attack = defense = 1; the scale lives in base.
    const meanAttack = ids.reduce((s, id) => s + a(id), 0) / ids.length;
    const meanDefense = ids.reduce((s, id) => s + d(id), 0) / ids.length;
    for (const id of ids) {
      attack.set(id, a(id) / meanAttack);
      defense.set(id, d(id) / meanDefense);
    }
    base *= meanAttack * meanDefense;
  }

  // ρ only enters the likelihood through the four low-score τ terms.
  let rho = 0;
  let bestLogLik = -Infinity;
  for (let step = -20; step <= 20; step++) {
    const candidate = step / 100;
    let logLik = 0;
    let valid = true;
    for (const r of rows) {
      if (r.homeGoals > 1 || r.awayGoals > 1) continue;
      const lambdaHome = base * homeAdv * a(r.homeId) * d(r.awayId);
      const lambdaAway = base * a(r.awayId) * d(r.homeId);
      const tau = dixonColesTau(r.homeGoals, r.awayGoals, lambdaHome, lambdaAway, candidate);
      if (tau <= 0) {
        valid = false;
        break;
      }
      logLik += r.w * Math.log(tau);
    }
    if (valid && logLik > bestLogLik) {
      bestLogLik = logLik;
      rho = candidate;
    }
  }

  const teams: Record<string, TeamStrength> = {};
  for (const id of ids) teams[String(id)] = { attack: a(id), defense: d(id), games: games.get(id) ?? 0 };
  return { base, homeAdv, rho, teams, matches: rows.length };
}

export function expectedGoals(model: GoalsModel, homeId: number, awayId: number): { home: number; away: number } | null {
  const home = model.teams[String(homeId)];
  const away = model.teams[String(awayId)];
  if (!home || !away || home.games < GOALS.minTeamGames || away.games < GOALS.minTeamGames) return null;
  return {
    home: model.base * model.homeAdv * home.attack * away.defense,
    away: model.base * away.attack * home.defense,
  };
}

function poissonPmf(lambda: number, k: number): number {
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

/** grid[h][a] = P(home scores h, away scores a), Dixon-Coles corrected and renormalised. */
export function scoreGrid(lambdaHome: number, lambdaAway: number, rho: number, maxGoals: number = GOALS.maxGoals): number[][] {
  const grid: number[][] = [];
  let total = 0;
  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = Math.max(0, poissonPmf(lambdaHome, h) * poissonPmf(lambdaAway, a) * dixonColesTau(h, a, lambdaHome, lambdaAway, rho));
      row.push(p);
      total += p;
    }
    grid.push(row);
  }
  return grid.map((row) => row.map((p) => p / total));
}

export type ScoreProbability = { home: number; away: number; probability: number };

/** Every score of the grid, most likely first (ties: fewer goals first, then the home side ahead). */
export function rankedScores(grid: number[][]): ScoreProbability[] {
  return grid
    .flatMap((row, home) => row.map((probability, away) => ({ home, away, probability })))
    .sort((a, b) => b.probability - a.probability || a.home + a.away - (b.home + b.away) || b.home - a.home);
}

export function gridOutcomes(grid: number[][]): OutcomeProbs {
  let home = 0;
  let draw = 0;
  let away = 0;
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    })
  );
  return { home, draw, away };
}

/** P(total goals = t) for t = 0..2·maxGoals. */
export function totalGoalsDistribution(grid: number[][]): number[] {
  const dist: number[] = [];
  grid.forEach((row, h) =>
    row.forEach((p, a) => {
      dist[h + a] = (dist[h + a] ?? 0) + p;
    })
  );
  return Array.from(dist, (p) => p ?? 0);
}

/** Break-even probability of Over/Under `line` under the model (pushes and quarter lines handled). */
export function totalsProbability(
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
  side: "Over" | "Under",
  line: number
): number | null {
  const dist = totalGoalsDistribution(scoreGrid(lambdaHome, lambdaAway, rho));
  return breakEvenProbability(totalsLineProbabilities(dist, side, line));
}
