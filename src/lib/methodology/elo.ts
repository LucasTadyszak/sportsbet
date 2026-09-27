// The rating spine ([LE] "sport-specific Elo, K factors and home-field constants tuned
// per league, blended with a last-10 form score"), for club football.
//
// One rating per team (football-data.org team id), shared across every tracked
// competition so Champions League matches connect the domestic leagues. Ratings are
// replayed from scratch over the stored results on every refresh — cheap (a few
// thousand matches) and deterministic, so retuning a constant never leaves stale state.
// National teams (who never meet a club) are replayed on their own, over every
// international since 1872, in one season: no regression toward the mean.
import { ELO } from "@/lib/methodology/config";

export type EloFixture = {
  id: number;
  date: Date;
  competitionCode: string;
  season: number;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  /** Played on neutral ground (a tournament finals match): no home advantage. */
  neutral?: boolean;
};

export type EloLeagueParams = { kFactor: number; homeAdvantage: number };

export type EloTeam = {
  id: number;
  name: string;
  elo: number;
  matches: number;
  lastSeason: number | null;
  lastDate: Date | null;
  /** (actual - expected) from this team's side, most recent last, at most ELO.formWindow long. */
  residuals: number[];
};

export type EloPrediction = {
  fixtureId: number;
  competitionCode: string;
  /** Home rating + home advantage - away rating, before the match. */
  diff: number;
  expected: number;
  actual: number;
  result: "H" | "D" | "A";
  homeMatchesBefore: number;
  awayMatchesBefore: number;
};

// Cup-style competitions whose newcomers aren't promoted sides of a known league.
const NON_LEAGUE_COMPETITIONS = new Set(["CL", "EC", "WC", "CLI"]);

export function expectedScore(diff: number): number {
  return 1 / (1 + 10 ** (-diff / 400));
}

/** World Football Elo's goal-difference multiplier: bigger wins move ratings more, with diminishing returns. */
export function marginMultiplier(goalDiff: number): number {
  const gd = Math.abs(goalDiff);
  if (gd <= 1) return 1;
  if (gd === 2) return 1.5;
  return (11 + gd) / 8;
}

function matchScore(homeGoals: number, awayGoals: number): number {
  if (homeGoals > awayGoals) return 1;
  if (homeGoals === awayGoals) return 0.5;
  return 0;
}

function resultOf(homeGoals: number, awayGoals: number): "H" | "D" | "A" {
  if (homeGoals > awayGoals) return "H";
  if (homeGoals === awayGoals) return "D";
  return "A";
}

export function replayElo(
  fixtures: EloFixture[],
  paramsFor: (competitionCode: string) => EloLeagueParams
): { teams: Map<number, EloTeam>; predictions: EloPrediction[] } {
  const sorted = [...fixtures].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id - b.id);

  const firstSeason = new Map<string, number>();
  for (const f of sorted) {
    const current = firstSeason.get(f.competitionCode);
    if (current === undefined || f.season < current) firstSeason.set(f.competitionCode, f.season);
  }

  const teams = new Map<number, EloTeam>();
  const teamsByCompetition = new Map<string, Set<number>>();
  const predictions: EloPrediction[] = [];

  const ensureTeam = (id: number, name: string, fixture: EloFixture): EloTeam => {
    const existing = teams.get(id);
    if (existing) return existing;

    let elo: number = ELO.initial;
    const known = teamsByCompetition.get(fixture.competitionCode);
    const isPromoted =
      !NON_LEAGUE_COMPETITIONS.has(fixture.competitionCode) &&
      fixture.season > (firstSeason.get(fixture.competitionCode) ?? fixture.season) &&
      known !== undefined &&
      known.size > 0;
    if (isPromoted) {
      const ratings = Array.from(known, (teamId) => teams.get(teamId)?.elo ?? ELO.initial);
      elo = ratings.reduce((a, b) => a + b, 0) / ratings.length - ELO.promotedDiscount;
    }

    const team: EloTeam = { id, name, elo, matches: 0, lastSeason: null, lastDate: null, residuals: [] };
    teams.set(id, team);
    return team;
  };

  const startSeason = (team: EloTeam, season: number) => {
    if (team.lastSeason !== null && season > team.lastSeason) {
      team.elo = ELO.initial + (1 - ELO.seasonRegression) * (team.elo - ELO.initial);
    }
  };

  for (const f of sorted) {
    const home = ensureTeam(f.homeId, f.homeName, f);
    const away = ensureTeam(f.awayId, f.awayName, f);
    startSeason(home, f.season);
    startSeason(away, f.season);

    const params = paramsFor(f.competitionCode);
    const diff = home.elo + (f.neutral ? 0 : params.homeAdvantage) - away.elo;
    const expected = expectedScore(diff);
    const actual = matchScore(f.homeGoals, f.awayGoals);

    predictions.push({
      fixtureId: f.id,
      competitionCode: f.competitionCode,
      diff,
      expected,
      actual,
      result: resultOf(f.homeGoals, f.awayGoals),
      homeMatchesBefore: home.matches,
      awayMatchesBefore: away.matches,
    });

    const delta = params.kFactor * marginMultiplier(f.homeGoals - f.awayGoals) * (actual - expected);
    home.elo += delta;
    away.elo -= delta;

    for (const [team, residual] of [
      [home, actual - expected],
      [away, expected - actual],
    ] as const) {
      team.residuals.push(residual);
      if (team.residuals.length > ELO.formWindow) team.residuals.shift();
      team.matches += 1;
      team.lastDate = f.date;
      team.lastSeason = f.season;
    }

    const members = teamsByCompetition.get(f.competitionCode) ?? new Set<number>();
    members.add(home.id);
    members.add(away.id);
    teamsByCompetition.set(f.competitionCode, members);
  }

  return { teams, predictions };
}

/**
 * [LE] last-10 form score: mean over-/under-performance against the Elo expectation.
 * Games not yet played count as 0, so a 3-game streak weighs less than a 10-game one.
 */
export function formScore(residuals: number[]): number {
  return residuals.reduce((a, b) => a + b, 0) / ELO.formWindow;
}

/** The form score in Elo points, scaled by the share of a season that 10 games represent. */
export function formAdjustment(score: number): number {
  const points = Math.max(-ELO.formEloCap, Math.min(ELO.formEloCap, score * ELO.formEloScale));
  return points * ELO.formBlend;
}

/** Structural nudge: the more rested side gets a few Elo points when either side is on short rest. */
export function restAdjustment(restHomeDays: number | null, restAwayDays: number | null): number {
  if (restHomeDays === null || restAwayDays === null) return 0;
  if (restHomeDays > ELO.restMaxDays || restAwayDays > ELO.restMaxDays) return 0;
  if (Math.min(restHomeDays, restAwayDays) > ELO.restShortDays) return 0;
  const points = (restHomeDays - restAwayDays) * ELO.restEloPerDay;
  return Math.max(-ELO.restEloCap, Math.min(ELO.restEloCap, points));
}

export type OutcomeProbs = { home: number; draw: number; away: number };

/**
 * Elo only gives an expected score (win = 1, draw = ½). Football needs a draw
 * probability too: it peaks between equal teams (drawBase) and decays with the rating
 * gap; the remaining expected score is then split into home and away wins.
 */
export function eloOutcomeProbabilities(diff: number, drawBase: number, drawWidth: number): OutcomeProbs {
  const expected = expectedScore(diff);
  const draw = drawBase * Math.exp(-((diff / drawWidth) ** 2));
  const home = Math.max(0.005, expected - draw / 2);
  const away = Math.max(0.005, 1 - expected - draw / 2);
  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}

function isBurnedIn(p: EloPrediction): boolean {
  return p.homeMatchesBefore >= ELO.thinMatches && p.awayMatchesBefore >= ELO.thinMatches;
}

export type TunedLeague = {
  params: EloLeagueParams;
  drawBase: number;
  drawWidth: number;
  tuned: boolean;
  matches: number;
};

/**
 * [LE] "K factors and home-field constants tuned per league": a grid search per
 * competition (others held fixed) on the Brier score of the Elo expectation, then the
 * draw model on the 3-way log-loss. Leagues with too little history keep the defaults.
 */
export function tuneLeagues(fixtures: EloFixture[]): Map<string, TunedLeague> {
  const codes = Array.from(new Set(fixtures.map((f) => f.competitionCode)));
  const counts = new Map<string, number>();
  for (const f of fixtures) counts.set(f.competitionCode, (counts.get(f.competitionCode) ?? 0) + 1);

  const params = new Map<string, EloLeagueParams>(
    codes.map((code) => [code, { kFactor: ELO.kFactor, homeAdvantage: ELO.homeAdvantage }])
  );
  const paramsFor = (code: string) => params.get(code) ?? { kFactor: ELO.kFactor, homeAdvantage: ELO.homeAdvantage };

  const tunable = codes.filter((code) => (counts.get(code) ?? 0) >= ELO.tuneMinMatches);
  for (const code of tunable) {
    let best = { loss: Infinity, params: paramsFor(code) };
    for (const kFactor of ELO.kGrid) {
      for (const homeAdvantage of ELO.homeAdvantageGrid) {
        const candidate = { kFactor, homeAdvantage };
        const { predictions } = replayElo(fixtures, (c) => (c === code ? candidate : paramsFor(c)));
        const scored = predictions.filter((p) => p.competitionCode === code && isBurnedIn(p));
        if (scored.length === 0) continue;
        const loss = scored.reduce((sum, p) => sum + (p.actual - p.expected) ** 2, 0) / scored.length;
        if (loss < best.loss) best = { loss, params: candidate };
      }
    }
    params.set(code, best.params);
  }

  const { predictions } = replayElo(fixtures, paramsFor);
  const result = new Map<string, TunedLeague>();
  for (const code of codes) {
    const isTunable = tunable.includes(code);
    let drawBase: number = ELO.drawBase;
    let drawWidth: number = ELO.drawWidth;
    if (isTunable) {
      const scored = predictions.filter((p) => p.competitionCode === code && isBurnedIn(p));
      let bestLoss = Infinity;
      for (const base of ELO.drawBaseGrid) {
        for (const width of ELO.drawWidthGrid) {
          let loss = 0;
          for (const p of scored) {
            const probs = eloOutcomeProbabilities(p.diff, base, width);
            const pActual = p.result === "H" ? probs.home : p.result === "D" ? probs.draw : probs.away;
            loss -= Math.log(Math.max(pActual, 1e-9));
          }
          if (scored.length > 0 && loss < bestLoss) {
            bestLoss = loss;
            drawBase = base;
            drawWidth = width;
          }
        }
      }
    }
    result.set(code, {
      params: paramsFor(code),
      drawBase,
      drawWidth,
      tuned: isTunable,
      matches: counts.get(code) ?? 0,
    });
  }
  return result;
}
