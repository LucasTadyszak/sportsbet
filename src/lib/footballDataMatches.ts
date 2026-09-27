// Stores every match of the tracked competitions (football-data.org) as Fixture rows:
// finished ones feed the Elo ratings, the goals model and the form score, and grade the
// picks; scheduled ones tell the model about fixture congestion (rest days).
import { prisma } from "@/lib/prisma";
import { getMatches, type FootballDataMatch } from "@/lib/footballDataApi";
import { canFetch, markFetched } from "@/lib/footballDataStats";

// How many past seasons to backfill once, so ratings don't start from scratch every August.
// Seasons the plan doesn't give access to are skipped (logged), not fatal.
const SEASONS_BACK = Number(process.env.FOOTBALL_DATA_SEASONS_BACK ?? 1);
const BACKFILL_COMPLETE_MIN_FINISHED = 100;
const FIXTURE_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

/**
 * The stored Fixture of an Odds API event: same two teams (ids remembered on the Team
 * registry once their names were matched) kicking off within a day and a half of it.
 */
export async function findEventFixture(event: { homeTeam: string; awayTeam: string; commenceTime: Date }) {
  const teams = await prisma.team.findMany({ where: { name: { in: [event.homeTeam, event.awayTeam] } } });
  const homeId = teams.find((t) => t.name === event.homeTeam)?.footballDataTeamId;
  const awayId = teams.find((t) => t.name === event.awayTeam)?.footballDataTeamId;
  if (homeId == null || awayId == null) return null;
  return prisma.fixture.findFirst({
    where: {
      homeTeamId: homeId,
      awayTeamId: awayId,
      utcDate: {
        gte: new Date(event.commenceTime.getTime() - FIXTURE_MATCH_WINDOW_MS),
        lte: new Date(event.commenceTime.getTime() + FIXTURE_MATCH_WINDOW_MS),
      },
    },
  });
}

/** The score bookmakers settle on: after 90 minutes, i.e. regularTime when there was extra time. */
export function ninetyMinuteScore(match: FootballDataMatch): { home: number; away: number } | null {
  const line = match.score.regularTime ?? match.score.fullTime;
  if (line?.home == null || line?.away == null) return null;
  return { home: line.home, away: line.away };
}

async function storeMatches(competitionCode: string, matches: FootballDataMatch[]): Promise<number> {
  const rows = matches.filter((m) => m.homeTeam.id !== null && m.awayTeam.id !== null);
  for (let i = 0; i < rows.length; i += 100) {
    await prisma.$transaction(
      rows.slice(i, i + 100).map((match) => {
        const score = match.status === "FINISHED" ? ninetyMinuteScore(match) : null;
        const data = {
          competitionCode,
          season: new Date(match.season.startDate).getUTCFullYear(),
          utcDate: new Date(match.utcDate),
          status: match.status,
          matchday: match.matchday,
          stage: match.stage,
          homeTeamId: match.homeTeam.id as number,
          awayTeamId: match.awayTeam.id as number,
          homeTeamName: match.homeTeam.name ?? String(match.homeTeam.id),
          awayTeamName: match.awayTeam.name ?? String(match.awayTeam.id),
          homeGoals: score?.home ?? null,
          awayGoals: score?.away ?? null,
        };
        return prisma.fixture.upsert({ where: { id: match.id }, create: { id: match.id, ...data }, update: data });
      })
    );
  }
  return rows.length;
}

export type FixtureSyncSummary = {
  competitionCode: string;
  skipped: boolean;
  matches: number;
  backfilled: number[];
  error?: string;
}[];

/**
 * Current season of every tracked competition (throttled like standings), plus a one-time
 * backfill. A competition failing doesn't stop the others: ratings are rebuilt from whatever is stored.
 */
export async function syncFixtures(competitionCodes: string[]): Promise<FixtureSyncSummary> {
  const summary: FixtureSyncSummary = [];
  for (const competitionCode of competitionCodes) {
    const resourceKey = `fixtures:${competitionCode}`;
    if (!(await canFetch(resourceKey))) {
      summary.push({ competitionCode, skipped: true, matches: 0, backfilled: [] });
      continue;
    }

    let current: Awaited<ReturnType<typeof getMatches>>;
    try {
      current = await getMatches(competitionCode);
    } catch (err) {
      summary.push({ competitionCode, skipped: false, matches: 0, backfilled: [], error: err instanceof Error ? err.message : String(err) });
      continue;
    }
    let matches = await storeMatches(competitionCode, current.matches);
    await markFetched(resourceKey);

    const backfilled: number[] = [];
    const currentSeason = current.matches[0] ? new Date(current.matches[0].season.startDate).getUTCFullYear() : null;
    if (currentSeason !== null) {
      for (let back = 1; back <= SEASONS_BACK; back++) {
        const season = currentSeason - back;
        const alreadyStored = await prisma.fixture.count({ where: { competitionCode, season, status: "FINISHED" } });
        if (alreadyStored >= BACKFILL_COMPLETE_MIN_FINISHED) continue;
        try {
          const past = await getMatches(competitionCode, { season });
          matches += await storeMatches(competitionCode, past.matches);
          backfilled.push(season);
        } catch (err) {
          console.warn(`[${competitionCode}] season ${season} not available:`, err instanceof Error ? err.message : err);
        }
      }
    }

    summary.push({ competitionCode, skipped: false, matches, backfilled });
  }
  return summary;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Last few days' results only — what the nightly grading needs, cheap enough to run unthrottled. */
export async function syncRecentResults(competitionCodes: string[], days = 3): Promise<number> {
  const now = new Date();
  let stored = 0;
  for (const competitionCode of competitionCodes) {
    const recent = await getMatches(competitionCode, {
      dateFrom: isoDay(new Date(now.getTime() - days * 24 * 60 * 60 * 1000)),
      dateTo: isoDay(now),
    });
    stored += await storeMatches(competitionCode, recent.matches);
  }
  return stored;
}
