import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshTeamStats, type TeamStatsRefreshSummary } from "@/lib/footballDataStats";
import { syncFixtures, type FixtureSyncSummary } from "@/lib/footballDataMatches";
import { SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION, trackedCompetitionCodes } from "@/lib/leagueMapping";
import { trackedSportKeys } from "@/lib/refreshOdds";
import { resolveTeamStats } from "@/lib/teamNameMatch";
import { computeMatchProbabilities, leagueAverageGoalsPerGame } from "@/lib/predictions";
import { recomputeRatings, type RatingsSummary } from "@/lib/ratings";
import { ELO, MODEL_VERSION } from "@/lib/methodology/config";
import { expectedGoals, type GoalsModel, type TeamStrength } from "@/lib/methodology/goals";
import { rawMatchModel, type EloSide, type GoalsInput } from "@/lib/methodology/model";

/** The raw model only prices matches kicking off within this many days. */
export const PREDICTION_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// A fixture this close to kickoff is the match itself (the two APIs' kickoff times can differ slightly).
const SAME_MATCH_MS = 6 * 60 * 60 * 1000;

/** Days since the team's previous match in any tracked competition (played or scheduled), if recent. */
async function restDays(teamId: number, kickoff: Date): Promise<number | null> {
  const previous = await prisma.fixture.findFirst({
    where: {
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      utcDate: { lt: new Date(kickoff.getTime() - SAME_MATCH_MS), gte: new Date(kickoff.getTime() - 30 * DAY_MS) },
      status: { notIn: ["POSTPONED", "CANCELLED", "SUSPENDED"] },
    },
    orderBy: { utcDate: "desc" },
  });
  return previous ? (kickoff.getTime() - previous.utcDate.getTime()) / DAY_MS : null;
}

async function eloSide(teamId: number, kickoff: Date): Promise<EloSide | null> {
  const rating = await prisma.teamRating.findUnique({ where: { teamId } });
  if (!rating) return null;
  return { elo: rating.elo, matches: rating.matchesRated, formScore: rating.formScore, restDays: await restDays(teamId, kickoff) };
}

async function refreshPredictionsForSport(sportKey: string, competitionCode: string, now: Date): Promise<number> {
  const teams = await prisma.teamStats.findMany({ where: { competitionCode } });
  const leagueAvg = leagueAverageGoalsPerGame(teams);
  const competition = await prisma.competitionModel.findUnique({ where: { competitionCode } });

  const goalsModel: GoalsModel | null =
    competition?.goalsBase != null && competition.goalsHomeAdv != null && competition.teamStrengths
      ? {
          base: competition.goalsBase,
          homeAdv: competition.goalsHomeAdv,
          rho: competition.rho,
          teams: competition.teamStrengths as Record<string, TeamStrength>,
          matches: competition.matchesUsed,
        }
      : null;
  const league = {
    homeAdvantage: competition?.homeAdvantage ?? ELO.homeAdvantage,
    drawBase: competition?.drawBase ?? ELO.drawBase,
    drawWidth: competition?.drawWidth ?? ELO.drawWidth,
  };

  const events = await prisma.event.findMany({
    where: { sportKey, commenceTime: { gte: now, lte: new Date(now.getTime() + PREDICTION_WINDOW_DAYS * DAY_MS) } },
  });

  let computed = 0;
  for (const event of events) {
    const homeStats = await resolveTeamStats(event.homeTeam, competitionCode, teams);
    const awayStats = await resolveTeamStats(event.awayTeam, competitionCode, teams);
    if (!homeStats || !awayStats) continue;

    // Goals side: the fitted Dixon-Coles model, else the plain standings-based Poisson.
    let goals: GoalsInput | null = null;
    const fitted = goalsModel ? expectedGoals(goalsModel, homeStats.teamId, awayStats.teamId) : null;
    if (fitted && goalsModel) {
      goals = { lambdaHome: fitted.home, lambdaAway: fitted.away, rho: goalsModel.rho, fitted: true };
    } else if (leagueAvg !== null) {
      const fallback = computeMatchProbabilities(homeStats, awayStats, leagueAvg);
      if (fallback) goals = { lambdaHome: fallback.expectedHomeGoals, lambdaAway: fallback.expectedAwayGoals, rho: 0, fitted: false };
    }

    const home = await eloSide(homeStats.teamId, event.commenceTime);
    const away = await eloSide(awayStats.teamId, event.commenceTime);
    const model = rawMatchModel({ home, away, league, goals });
    if (!model) continue;

    const data = {
      homeWinProbability: model.probabilities.home,
      drawProbability: model.probabilities.draw,
      awayWinProbability: model.probabilities.away,
      expectedHomeGoals: goals?.lambdaHome ?? null,
      expectedAwayGoals: goals?.lambdaAway ?? null,
      rho: goals?.rho ?? 0,
      eloHomeRating: home?.elo ?? null,
      eloAwayRating: away?.elo ?? null,
      eloHomeWin: model.elo?.home ?? null,
      eloDraw: model.elo?.draw ?? null,
      eloAwayWin: model.elo?.away ?? null,
      goalsHomeWin: model.goals?.home ?? null,
      goalsDraw: model.goals?.draw ?? null,
      goalsAwayWin: model.goals?.away ?? null,
      dataQuality: model.dataQuality,
      components: {
        competitionCode,
        homeTeamId: homeStats.teamId,
        awayTeamId: awayStats.teamId,
        homeMatches: home?.matches ?? 0,
        awayMatches: away?.matches ?? 0,
        eloDiff: model.elo?.diff ?? null,
        formHome: model.elo?.formHome ?? null,
        formAway: model.elo?.formAway ?? null,
        rest: model.elo?.rest ?? null,
        restDaysHome: home?.restDays ?? null,
        restDaysAway: away?.restDays ?? null,
        goalsFitted: goals?.fitted ?? false,
        league: { ...league, eloTuned: competition?.eloTuned ?? false },
      } satisfies Prisma.InputJsonValue,
      modelVersion: MODEL_VERSION,
      computedAt: new Date(),
    };
    await prisma.matchPrediction.upsert({ where: { eventId: event.id }, create: { eventId: event.id, ...data }, update: data });
    computed++;
  }

  return computed;
}

export type StatsRefreshSummary = {
  teamStats: TeamStatsRefreshSummary;
  fixtures: FixtureSyncSummary;
  ratings: RatingsSummary;
  predictionsComputed: { sportKey: string; computed: number }[];
};

/**
 * Refreshes football-data.org standings and results, rebuilds the ratings and goals
 * models from the stored results, then recomputes match probabilities from them.
 */
export async function refreshStats(): Promise<StatsRefreshSummary> {
  const teamStats = await refreshTeamStats();
  const fixtures = await syncFixtures(trackedCompetitionCodes(trackedSportKeys()));
  const ratings = await recomputeRatings();
  const predictionsComputed = await refreshPredictions();
  return { teamStats, fixtures, ratings, predictionsComputed };
}

/** Recomputes the raw model of every upcoming match from what's stored (no API call). */
export async function refreshPredictions(now = new Date()): Promise<{ sportKey: string; computed: number }[]> {
  const predictionsComputed: { sportKey: string; computed: number }[] = [];
  for (const sportKey of trackedSportKeys()) {
    const competitionCode = SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION[sportKey];
    if (!competitionCode) continue;
    const computed = await refreshPredictionsForSport(sportKey, competitionCode, now);
    predictionsComputed.push({ sportKey, computed });
  }
  return predictionsComputed;
}
