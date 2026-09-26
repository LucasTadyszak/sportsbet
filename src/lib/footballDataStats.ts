import { prisma } from "@/lib/prisma";
import { getStandings, sleep } from "@/lib/footballDataApi";
import { trackedCompetitionCodes } from "@/lib/leagueMapping";
import { trackedSportKeys } from "@/lib/refreshOdds";

const REFRESH_INTERVAL_MINUTES = Number(process.env.FOOTBALL_DATA_REFRESH_INTERVAL_MINUTES ?? 360);
// Free tier is capped at 10 requests/minute; spacing calls out keeps a multi-competition
// refresh well under that even if other traffic is hitting the same API key.
const REQUEST_SPACING_MS = 7_000;

async function canFetch(resourceKey: string): Promise<boolean> {
  const log = await prisma.fetchLog.findUnique({ where: { resourceKey } });
  if (!log) return true;
  const ageMinutes = (Date.now() - log.lastFetchedAt.getTime()) / 60_000;
  return ageMinutes >= REFRESH_INTERVAL_MINUTES;
}

async function markFetched(resourceKey: string) {
  await prisma.fetchLog.upsert({
    where: { resourceKey },
    create: { resourceKey },
    update: { lastFetchedAt: new Date() },
  });
}

export type TeamStatsRefreshSummary = {
  competitionCode: string;
  skipped: boolean;
  teams: number;
}[];

/** Pulls current-season standings for every tracked competition, respecting the per-competition throttle. */
export async function refreshTeamStats(): Promise<TeamStatsRefreshSummary> {
  const summary: TeamStatsRefreshSummary = [];
  const competitionCodes = trackedCompetitionCodes(trackedSportKeys());

  let isFirstRequest = true;
  for (const competitionCode of competitionCodes) {
    const resourceKey = `stats:${competitionCode}`;
    if (!(await canFetch(resourceKey))) {
      summary.push({ competitionCode, skipped: true, teams: 0 });
      continue;
    }

    if (!isFirstRequest) await sleep(REQUEST_SPACING_MS);
    isFirstRequest = false;

    const data = await getStandings(competitionCode);
    const totalTable = data.standings.find((s) => s.type === "TOTAL")?.table ?? [];
    const season = new Date(data.season.startDate).getFullYear();

    for (const row of totalTable) {
      await prisma.teamStats.upsert({
        where: { competitionCode_teamId: { competitionCode, teamId: row.team.id } },
        create: {
          competitionCode,
          teamId: row.team.id,
          name: row.team.name,
          shortName: row.team.shortName,
          tla: row.team.tla,
          position: row.position,
          playedGames: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          form: row.form,
          season,
        },
        update: {
          name: row.team.name,
          shortName: row.team.shortName,
          tla: row.team.tla,
          position: row.position,
          playedGames: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          form: row.form,
          season,
        },
      });
    }
    await markFetched(resourceKey);

    summary.push({ competitionCode, skipped: false, teams: totalTable.length });
  }

  return summary;
}
