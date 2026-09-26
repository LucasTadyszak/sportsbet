import { prisma } from "@/lib/prisma";
import { refreshTeamStats, type TeamStatsRefreshSummary } from "@/lib/footballDataStats";
import { SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION } from "@/lib/leagueMapping";
import { trackedSportKeys } from "@/lib/refreshOdds";
import { resolveTeamStats } from "@/lib/teamNameMatch";
import { computeMatchProbabilities, leagueAverageGoalsPerGame } from "@/lib/predictions";

const PREDICTION_WINDOW_DAYS = 14;

async function refreshPredictionsForSport(sportKey: string, competitionCode: string): Promise<number> {
  const teams = await prisma.teamStats.findMany({ where: { competitionCode } });
  const leagueAvg = leagueAverageGoalsPerGame(teams);
  if (leagueAvg === null) return 0;

  const events = await prisma.event.findMany({
    where: {
      sportKey,
      commenceTime: {
        gte: new Date(),
        lte: new Date(Date.now() + PREDICTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
      },
    },
  });

  let computed = 0;
  for (const event of events) {
    const homeStats = await resolveTeamStats(event.homeTeam, competitionCode, teams);
    const awayStats = await resolveTeamStats(event.awayTeam, competitionCode, teams);
    if (!homeStats || !awayStats) continue;

    const probabilities = computeMatchProbabilities(homeStats, awayStats, leagueAvg);
    if (!probabilities) continue;

    await prisma.matchPrediction.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...probabilities },
      update: probabilities,
    });
    computed++;
  }

  return computed;
}

export type StatsRefreshSummary = {
  teamStats: TeamStatsRefreshSummary;
  predictionsComputed: { sportKey: string; computed: number }[];
};

/** Refreshes football-data.org standings, then recomputes match probabilities from them. */
export async function refreshStats(): Promise<StatsRefreshSummary> {
  const teamStats = await refreshTeamStats();

  const predictionsComputed: { sportKey: string; computed: number }[] = [];
  for (const sportKey of trackedSportKeys()) {
    const competitionCode = SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION[sportKey];
    if (!competitionCode) continue;
    const computed = await refreshPredictionsForSport(sportKey, competitionCode);
    predictionsComputed.push({ sportKey, computed });
  }

  return { teamStats, predictionsComputed };
}
