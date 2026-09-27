import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshTeamStats, type TeamStatsRefreshSummary } from "@/lib/footballDataStats";
import { syncFixtures, type FixtureSyncSummary } from "@/lib/footballDataMatches";
import {
  loadNationalTeams,
  nationalRatingId,
  nationalRestDays,
  resolveNationalTeam,
  syncInternationalResults,
  type InternationalSyncSummary,
  type NationalTeamRef,
  type NationalTeams,
} from "@/lib/internationalResults";
import {
  NATIONAL_TEAM_COMPETITIONS,
  SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION,
  nationalCompetitionCode,
  trackedCompetitionCodes,
  type NationalCompetition,
} from "@/lib/leagueMapping";
import { trackedSportKeys } from "@/lib/refreshOdds";
import { resolveTeamStats } from "@/lib/teamNameMatch";
import { computeMatchProbabilities, leagueAverageGoalsPerGame } from "@/lib/predictions";
import { recomputeRatings, type RatingsSummary } from "@/lib/ratings";
import { ELO, MODEL_VERSION } from "@/lib/methodology/config";
import { expectedGoals, type GoalsModel, type TeamStrength } from "@/lib/methodology/goals";
import { rawMatchModel, type EloSide, type GoalsInput, type LeagueEloParams, type RawModel } from "@/lib/methodology/model";

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

async function eloSide(teamId: number, restDaysBefore: number | null): Promise<EloSide | null> {
  const rating = await prisma.teamRating.findUnique({ where: { teamId } });
  if (!rating) return null;
  return { elo: rating.elo, matches: rating.matchesRated, formScore: rating.formScore, restDays: restDaysBefore };
}

type CompetitionRow = NonNullable<Awaited<ReturnType<typeof prisma.competitionModel.findUnique>>>;

function storedGoalsModel(competition: CompetitionRow | null): GoalsModel | null {
  return competition?.goalsBase != null && competition.goalsHomeAdv != null && competition.teamStrengths
    ? {
        base: competition.goalsBase,
        homeAdv: competition.goalsHomeAdv,
        rho: competition.rho,
        teams: competition.teamStrengths as Record<string, TeamStrength>,
        matches: competition.matchesUsed,
      }
    : null;
}

type PredictionInput = {
  model: RawModel;
  goals: GoalsInput | null;
  home: EloSide | null;
  away: EloSide | null;
  competitionCode: string;
  homeTeamId: number;
  awayTeamId: number;
  league: LeagueEloParams & { eloTuned: boolean };
  /** National-team match on neutral ground: no home advantage anywhere in the model. */
  neutral?: boolean;
};

async function savePrediction(eventId: string, p: PredictionInput) {
  const data = {
    homeWinProbability: p.model.probabilities.home,
    drawProbability: p.model.probabilities.draw,
    awayWinProbability: p.model.probabilities.away,
    expectedHomeGoals: p.goals?.lambdaHome ?? null,
    expectedAwayGoals: p.goals?.lambdaAway ?? null,
    rho: p.goals?.rho ?? 0,
    eloHomeRating: p.home?.elo ?? null,
    eloAwayRating: p.away?.elo ?? null,
    eloHomeWin: p.model.elo?.home ?? null,
    eloDraw: p.model.elo?.draw ?? null,
    eloAwayWin: p.model.elo?.away ?? null,
    goalsHomeWin: p.model.goals?.home ?? null,
    goalsDraw: p.model.goals?.draw ?? null,
    goalsAwayWin: p.model.goals?.away ?? null,
    dataQuality: p.model.dataQuality,
    components: {
      competitionCode: p.competitionCode,
      homeTeamId: p.homeTeamId,
      awayTeamId: p.awayTeamId,
      homeMatches: p.home?.matches ?? 0,
      awayMatches: p.away?.matches ?? 0,
      eloDiff: p.model.elo?.diff ?? null,
      formHome: p.model.elo?.formHome ?? null,
      formAway: p.model.elo?.formAway ?? null,
      rest: p.model.elo?.rest ?? null,
      restDaysHome: p.home?.restDays ?? null,
      restDaysAway: p.away?.restDays ?? null,
      goalsFitted: p.goals?.fitted ?? false,
      league: p.league,
      ...(p.neutral !== undefined ? { neutral: p.neutral } : {}),
    } satisfies Prisma.InputJsonValue,
    modelVersion: MODEL_VERSION,
    computedAt: new Date(),
  };
  await prisma.matchPrediction.upsert({ where: { eventId }, create: { eventId, ...data }, update: data });
}

function upcomingEvents(sportKey: string, now: Date) {
  return prisma.event.findMany({
    where: { sportKey, commenceTime: { gte: now, lte: new Date(now.getTime() + PREDICTION_WINDOW_DAYS * DAY_MS) } },
  });
}

async function refreshPredictionsForSport(sportKey: string, competitionCode: string, now: Date): Promise<number> {
  const teams = await prisma.teamStats.findMany({ where: { competitionCode } });
  const leagueAvg = leagueAverageGoalsPerGame(teams);
  const competition = await prisma.competitionModel.findUnique({ where: { competitionCode } });
  const goalsModel = storedGoalsModel(competition);
  const league = {
    homeAdvantage: competition?.homeAdvantage ?? ELO.homeAdvantage,
    drawBase: competition?.drawBase ?? ELO.drawBase,
    drawWidth: competition?.drawWidth ?? ELO.drawWidth,
  };

  let computed = 0;
  for (const event of await upcomingEvents(sportKey, now)) {
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

    const home = await eloSide(homeStats.teamId, await restDays(homeStats.teamId, event.commenceTime));
    const away = await eloSide(awayStats.teamId, await restDays(awayStats.teamId, event.commenceTime));
    const model = rawMatchModel({ home, away, league, goals });
    if (!model) continue;

    await savePrediction(event.id, {
      model,
      goals,
      home,
      away,
      competitionCode,
      homeTeamId: homeStats.teamId,
      awayTeamId: awayStats.teamId,
      league: { ...league, eloTuned: competition?.eloTuned ?? false },
    });
    computed++;
  }

  return computed;
}

/**
 * National-team matches: the Elo constants of the competition's class of match, the goals
 * model fitted on every recent international, and no home advantage on neutral ground.
 */
async function refreshNationalPredictionsForSport(
  sportKey: string,
  national: NationalCompetition,
  teams: NationalTeams,
  now: Date
): Promise<{ computed: number; unmatched: string[] }> {
  const competitionCode = nationalCompetitionCode(national.eloClass);
  const competition = await prisma.competitionModel.findUnique({ where: { competitionCode } });
  const goalsModel = storedGoalsModel(competition);
  const league = {
    homeAdvantage: national.neutral ? 0 : (competition?.homeAdvantage ?? ELO.homeAdvantage),
    drawBase: competition?.drawBase ?? ELO.drawBase,
    drawWidth: competition?.drawWidth ?? ELO.drawWidth,
  };

  let computed = 0;
  const unmatched = new Set<string>();
  for (const event of await upcomingEvents(sportKey, now)) {
    const sides: [string, NationalTeamRef | null][] = [
      [event.homeTeam, await resolveNationalTeam(event.homeTeam, teams)],
      [event.awayTeam, await resolveNationalTeam(event.awayTeam, teams)],
    ];
    for (const [name, team] of sides) if (!team) unmatched.add(name);
    const [homeTeam, awayTeam] = sides.map(([, team]) => team);
    if (!homeTeam || !awayTeam) continue;

    const fitted = goalsModel
      ? expectedGoals(goalsModel, nationalRatingId(homeTeam), nationalRatingId(awayTeam), { neutral: national.neutral })
      : null;
    const goals: GoalsInput | null = fitted && goalsModel ? { lambdaHome: fitted.home, lambdaAway: fitted.away, rho: goalsModel.rho, fitted: true } : null;

    const home = await eloSide(nationalRatingId(homeTeam), await nationalRestDays(homeTeam, event.homeTeam, event.commenceTime));
    const away = await eloSide(nationalRatingId(awayTeam), await nationalRestDays(awayTeam, event.awayTeam, event.commenceTime));
    const model = rawMatchModel({ home, away, league, goals });
    if (!model) continue;

    await savePrediction(event.id, {
      model,
      goals,
      home,
      away,
      competitionCode,
      homeTeamId: nationalRatingId(homeTeam),
      awayTeamId: nationalRatingId(awayTeam),
      league: { ...league, eloTuned: competition?.eloTuned ?? false },
      neutral: national.neutral,
    });
    computed++;
  }

  return { computed, unmatched: Array.from(unmatched) };
}

export type PredictionsSummary = { sportKey: string; computed: number; unmatched?: string[] }[];

export type StatsRefreshSummary = {
  teamStats: TeamStatsRefreshSummary;
  fixtures: FixtureSyncSummary;
  international: InternationalSyncSummary & { error?: string };
  ratings: RatingsSummary;
  predictionsComputed: PredictionsSummary;
};

/**
 * Refreshes football-data.org standings and results and the international results dataset,
 * rebuilds the ratings and goals models from the stored results, then recomputes match
 * probabilities from them.
 */
export async function refreshStats(): Promise<StatsRefreshSummary> {
  const teamStats = await refreshTeamStats();
  const fixtures = await syncFixtures(trackedCompetitionCodes(trackedSportKeys()));
  let international: StatsRefreshSummary["international"];
  try {
    international = await syncInternationalResults();
  } catch (err) {
    // National-team ratings are rebuilt from whatever was stored before.
    international = { skipped: false, matches: 0, added: 0, updated: 0, removed: 0, error: err instanceof Error ? err.message : String(err) };
  }
  const ratings = await recomputeRatings();
  const predictionsComputed = await refreshPredictions();
  return { teamStats, fixtures, international, ratings, predictionsComputed };
}

/** Recomputes the raw model of every upcoming match from what's stored (no API call). */
export async function refreshPredictions(now = new Date()): Promise<PredictionsSummary> {
  const predictionsComputed: PredictionsSummary = [];
  let nationalTeams: NationalTeams | null = null;
  for (const sportKey of trackedSportKeys()) {
    const competitionCode = SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION[sportKey];
    const national = NATIONAL_TEAM_COMPETITIONS[sportKey];
    if (competitionCode) {
      predictionsComputed.push({ sportKey, computed: await refreshPredictionsForSport(sportKey, competitionCode, now) });
    } else if (national) {
      nationalTeams ??= await loadNationalTeams();
      predictionsComputed.push({ sportKey, ...(await refreshNationalPredictionsForSport(sportKey, national, nationalTeams, now)) });
    }
  }
  return predictionsComputed;
}
