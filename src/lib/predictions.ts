// Simplified Poisson goals model: turns league standings (from football-data.org)
// into home/draw/away win probabilities for an upcoming match.
//
// Method (a common lightweight variant of the classic football Poisson model):
//   1. attack/defense "strength" of a team = its goals-for/against per game,
//      relative to the competition's average goals per game.
//   2. expected goals for each side = league average * attacker's attack strength
//      * opponent's defense strength, adjusted by a fixed home-advantage factor.
//   3. treat home/away goals as independent Poisson variables with those means,
//      and sum the score-grid probabilities into win/draw/loss.
// This is informational only — it ignores injuries, lineups, and score-line
// correlation (e.g. Dixon-Coles low-score adjustment) that a fuller model would add.

const MAX_GOALS = 9; // truncate the score grid here; remaining tail probability is negligible
const HOME_ADVANTAGE = 1.35; // home teams score ~35% more than the league-average team; standard rule-of-thumb

export type TeamStatsLike = {
  playedGames: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type MatchProbabilities = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
};

function poissonPmf(lambda: number, k: number): number {
  let logPmf = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logPmf -= Math.log(i);
  return Math.exp(logPmf);
}

/** Mean goals-for-per-game across a set of teams, used as the competition baseline. */
export function leagueAverageGoalsPerGame(teams: TeamStatsLike[]): number | null {
  const withGames = teams.filter((t) => t.playedGames > 0);
  if (withGames.length === 0) return null;
  const total = withGames.reduce((sum, t) => sum + t.goalsFor / t.playedGames, 0);
  return total / withGames.length;
}

export function computeMatchProbabilities(
  home: TeamStatsLike,
  away: TeamStatsLike,
  leagueAvgGoalsPerGame: number
): MatchProbabilities | null {
  if (home.playedGames === 0 || away.playedGames === 0 || leagueAvgGoalsPerGame <= 0) return null;

  const homeAttack = home.goalsFor / home.playedGames / leagueAvgGoalsPerGame;
  const homeDefense = home.goalsAgainst / home.playedGames / leagueAvgGoalsPerGame;
  const awayAttack = away.goalsFor / away.playedGames / leagueAvgGoalsPerGame;
  const awayDefense = away.goalsAgainst / away.playedGames / leagueAvgGoalsPerGame;

  const homeAdvantageSplit = Math.sqrt(HOME_ADVANTAGE);
  const expectedHomeGoals = leagueAvgGoalsPerGame * homeAttack * awayDefense * homeAdvantageSplit;
  const expectedAwayGoals = (leagueAvgGoalsPerGame * awayAttack * homeDefense) / homeAdvantageSplit;

  const homeGoalProbs = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(expectedHomeGoals, k));
  const awayGoalProbs = Array.from({ length: MAX_GOALS + 1 }, (_, k) => poissonPmf(expectedAwayGoals, k));

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = homeGoalProbs[h] * awayGoalProbs[a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  // The truncated grid can miss a sliver of probability mass; renormalize to 1.
  const total = homeWin + draw + awayWin;
  return {
    homeWinProbability: homeWin / total,
    drawProbability: draw / total,
    awayWinProbability: awayWin / total,
    expectedHomeGoals,
    expectedAwayGoals,
  };
}
