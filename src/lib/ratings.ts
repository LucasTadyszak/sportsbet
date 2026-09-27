// Rebuilds every rating from the stored results (no API calls): Elo tuned per league,
// replayed over all finished fixtures, and one Dixon-Coles goals model per competition.
// National teams are rated apart — they never meet a club — over every stored
// international: Elo tuned per class of match, one goals model for all of them.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ELO, NATIONAL } from "@/lib/methodology/config";
import { formScore, replayElo, tuneLeagues, type EloFixture, type TunedLeague } from "@/lib/methodology/elo";
import { fitGoalsModel, type GoalsModel } from "@/lib/methodology/goals";
import type { InternationalClass } from "@/lib/internationalResultsApi";
import { nationalCompetitionCode } from "@/lib/leagueMapping";

export type RatingsSummary = {
  fixtures: number;
  teams: number;
  competitions: { competitionCode: string; matches: number; eloTuned: boolean; goalsModel: boolean }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function saveRatings(fixtures: EloFixture[], leagues: Map<string, TunedLeague>): Promise<number> {
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
  return teams.size;
}

async function saveCompetitionModel(competitionCode: string, league: TunedLeague, goals: GoalsModel | null) {
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
}

const toGoalsFixture = (f: EloFixture) => ({
  homeId: f.homeId,
  awayId: f.awayId,
  homeGoals: f.homeGoals,
  awayGoals: f.awayGoals,
  date: f.date,
  neutral: f.neutral,
});

async function recomputeClubRatings(now: Date): Promise<RatingsSummary> {
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
  const teams = await saveRatings(fixtures, leagues);

  const competitions: RatingsSummary["competitions"] = [];
  for (const [competitionCode, league] of leagues) {
    const goals = fitGoalsModel(fixtures.filter((f) => f.competitionCode === competitionCode).map(toGoalsFixture), now);
    await saveCompetitionModel(competitionCode, league, goals);
    competitions.push({ competitionCode, matches: league.matches, eloTuned: league.tuned, goalsModel: goals !== null });
  }

  return { fixtures: fixtures.length, teams, competitions };
}

async function recomputeNationalRatings(now: Date): Promise<RatingsSummary> {
  const [matches, nationalTeams] = await Promise.all([
    prisma.internationalMatch.findMany({ where: { date: { lte: now } }, orderBy: [{ date: "asc" }, { id: "asc" }] }),
    prisma.nationalTeam.findMany(),
  ]);
  if (matches.length === 0) return { fixtures: 0, teams: 0, competitions: [] };
  const nameOf = new Map(nationalTeams.map((t) => [t.id, t.name]));

  const fixtures: EloFixture[] = matches.map((m) => ({
    id: m.id,
    date: m.date,
    competitionCode: nationalCompetitionCode(m.eloClass as InternationalClass),
    season: 0, // one long season: a national side isn't pulled back toward the mean every year
    homeId: -m.homeTeamId,
    awayId: -m.awayTeamId,
    homeName: nameOf.get(m.homeTeamId) ?? String(m.homeTeamId),
    awayName: nameOf.get(m.awayTeamId) ?? String(m.awayTeamId),
    // What the model predicts is the 90-minute result; the final score when that isn't known.
    homeGoals: m.home90 ?? m.homeScore,
    awayGoals: m.away90 ?? m.awayScore,
    neutral: m.neutral,
  }));

  const leagues = tuneLeagues(fixtures);
  const teams = await saveRatings(fixtures, leagues);

  const since = now.getTime() - NATIONAL.goalsWindowDays * DAY_MS;
  const goals = fitGoalsModel(fixtures.filter((f) => f.date.getTime() >= since).map(toGoalsFixture), now);
  const competitions: RatingsSummary["competitions"] = [];
  for (const [competitionCode, league] of leagues) {
    await saveCompetitionModel(competitionCode, league, goals);
    competitions.push({ competitionCode, matches: league.matches, eloTuned: league.tuned, goalsModel: goals !== null });
  }

  return { fixtures: fixtures.length, teams, competitions };
}

export async function recomputeRatings(now = new Date()): Promise<RatingsSummary> {
  const clubs = await recomputeClubRatings(now);
  const nations = await recomputeNationalRatings(now);
  return {
    fixtures: clubs.fixtures + nations.fixtures,
    teams: clubs.teams + nations.teams,
    competitions: [...clubs.competitions, ...nations.competitions],
  };
}
