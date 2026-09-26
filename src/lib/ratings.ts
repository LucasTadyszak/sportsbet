// Rebuilds every rating from the stored results (no API calls): Elo tuned per league,
// replayed over all finished fixtures, and one Dixon-Coles goals model per competition.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ELO } from "@/lib/methodology/config";
import { formScore, replayElo, tuneLeagues, type EloFixture } from "@/lib/methodology/elo";
import { fitGoalsModel } from "@/lib/methodology/goals";

export type RatingsSummary = {
  fixtures: number;
  teams: number;
  competitions: { competitionCode: string; matches: number; eloTuned: boolean; goalsModel: boolean }[];
};

export async function recomputeRatings(now = new Date()): Promise<RatingsSummary> {
  const finished = await prisma.fixture.findMany({
    where: { status: "FINISHED", homeGoals: { not: null }, awayGoals: { not: null }, utcDate: { lte: now } },
    orderBy: { utcDate: "asc" },
  });
  const fixtures: EloFixture[] = finished.map((f) => ({
    id: f.id,
    date: f.utcDate,
    competitionCode: f.competitionCode,
    season: f.season,
    homeId: f.homeTeamId,
    awayId: f.awayTeamId,
    homeName: f.homeTeamName,
    awayName: f.awayTeamName,
    homeGoals: f.homeGoals as number,
    awayGoals: f.awayGoals as number,
  }));

  const leagues = tuneLeagues(fixtures);
  const defaults = { kFactor: ELO.kFactor, homeAdvantage: ELO.homeAdvantage };
  const { teams } = replayElo(fixtures, (code) => leagues.get(code)?.params ?? defaults);

  const ratingWrites = Array.from(teams.values()).map((team) => {
    const data = {
      name: team.name,
      elo: team.elo,
      matchesRated: team.matches,
      formScore: formScore(team.residuals),
      lastMatchAt: team.lastDate,
    };
    return prisma.teamRating.upsert({ where: { teamId: team.id }, create: { teamId: team.id, ...data }, update: data });
  });
  for (let i = 0; i < ratingWrites.length; i += 100) await prisma.$transaction(ratingWrites.slice(i, i + 100));

  const competitions: RatingsSummary["competitions"] = [];
  for (const [competitionCode, league] of leagues) {
    const goals = fitGoalsModel(
      fixtures
        .filter((f) => f.competitionCode === competitionCode)
        .map((f) => ({ homeId: f.homeId, awayId: f.awayId, homeGoals: f.homeGoals, awayGoals: f.awayGoals, date: f.date })),
      now
    );
    const data = {
      kFactor: league.params.kFactor,
      homeAdvantage: league.params.homeAdvantage,
      drawBase: league.drawBase,
      drawWidth: league.drawWidth,
      eloTuned: league.tuned,
      goalsBase: goals?.base ?? null,
      goalsHomeAdv: goals?.homeAdv ?? null,
      rho: goals?.rho ?? 0,
      teamStrengths: goals ? (goals.teams as Prisma.InputJsonValue) : Prisma.DbNull,
      matchesUsed: league.matches,
    };
    await prisma.competitionModel.upsert({ where: { competitionCode }, create: { competitionCode, ...data }, update: data });
    competitions.push({ competitionCode, matches: league.matches, eloTuned: league.tuned, goalsModel: goals !== null });
  }

  return { fixtures: fixtures.length, teams: teams.size, competitions };
}
