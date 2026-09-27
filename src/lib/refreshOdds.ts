import { prisma } from "@/lib/prisma";
import { isNationalTeamSport, trackedNationalSportKeys } from "@/lib/leagueMapping";
import { getOddsForSport, listSports, type OddsApiEvent } from "@/lib/oddsApi";

const DEFAULT_SPORT_KEYS = ["soccer_epl", "soccer_uefa_champs_league"];
const REFRESH_INTERVAL_MINUTES = Number(process.env.ODDS_REFRESH_INTERVAL_MINUTES ?? 30);

/** Club competitions to follow: ODDS_SPORT_KEYS, else the defaults. */
export function trackedClubSportKeys(): string[] {
  const fromEnv = process.env.ODDS_SPORT_KEYS;
  if (!fromEnv) return DEFAULT_SPORT_KEYS;
  return fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every competition followed: the club ones, then the national-team ones (see leagueMapping.ts). */
export function trackedSportKeys(): string[] {
  return Array.from(new Set([...trackedClubSportKeys(), ...trackedNationalSportKeys()]));
}

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

/** Remembers a team name forever (it doesn't change sync to sync), and bumps lastSeenAt. */
async function upsertTeam(name: string) {
  await prisma.team.upsert({
    where: { name },
    create: { name },
    update: {}, // no fields change, but the update still bumps the @updatedAt lastSeenAt
  });
}

async function upsertEvent(event: OddsApiEvent) {
  await prisma.sport.upsert({
    where: { key: event.sport_key },
    create: { key: event.sport_key, group: event.sport_title, title: event.sport_title },
    update: {},
  });

  await prisma.event.upsert({
    where: { id: event.id },
    create: {
      id: event.id,
      sportKey: event.sport_key,
      commenceTime: new Date(event.commence_time),
      homeTeam: event.home_team,
      awayTeam: event.away_team,
    },
    update: {
      commenceTime: new Date(event.commence_time),
      homeTeam: event.home_team,
      awayTeam: event.away_team,
    },
  });

  await upsertTeam(event.home_team);
  await upsertTeam(event.away_team);
}

/** Writes a full snapshot of every current price on every sync, not just the ones that moved. */
async function insertOddsSnapshot(event: OddsApiEvent): Promise<number> {
  const bookmakerKeys = event.bookmakers.map((b) => b.key);
  if (bookmakerKeys.length === 0) return 0;

  await prisma.bookmaker.createMany({
    data: event.bookmakers.map((b) => ({ key: b.key, title: b.title })),
    skipDuplicates: true,
  });

  const toInsert: {
    eventId: string;
    bookmakerKey: string;
    marketKey: string;
    outcomeName: string;
    price: number;
    point: number | null;
    lastUpdate: Date;
  }[] = [];

  for (const bookmaker of event.bookmakers) {
    for (const market of bookmaker.markets) {
      for (const outcome of market.outcomes) {
        toInsert.push({
          eventId: event.id,
          bookmakerKey: bookmaker.key,
          marketKey: market.key,
          outcomeName: outcome.name,
          price: outcome.price,
          point: outcome.point ?? null,
          lastUpdate: new Date(market.last_update),
        });
      }
    }
  }

  if (toInsert.length > 0) {
    await prisma.odds.createMany({ data: toInsert });
  }
  return toInsert.length;
}

export type RefreshSummary = {
  sportKey: string;
  skipped: boolean;
  /** Why nothing was fetched: fetched too recently, or a national-team competition out of season. */
  reason?: "throttled" | "out_of_season";
  events: number;
  oddsCaptured: number;
  /** The fetch failed; the other competitions were still refreshed. */
  error?: string;
}[];

/**
 * Keys of the sports The Odds API has in season. The sports list doesn't count against the
 * quota; null when it can't be read.
 */
async function inSeasonSportKeys(): Promise<Set<string> | null> {
  try {
    return new Set((await listSports()).filter((s) => s.active).map((s) => s.key));
  } catch (err) {
    console.warn("The Odds API sports list unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Pulls fresh odds for every tracked sport, respecting the per-sport throttle. National-team
 * competitions only play a few weeks a year, so they are only fetched while The Odds API lists
 * them in season (or when that list can't be read) instead of spending credits on empty fetches.
 */
export async function refreshOdds(): Promise<RefreshSummary> {
  const summary: RefreshSummary = [];

  const due: string[] = [];
  for (const sportKey of trackedSportKeys()) {
    if (await canFetch(`odds:${sportKey}`)) due.push(sportKey);
    else summary.push({ sportKey, skipped: true, reason: "throttled", events: 0, oddsCaptured: 0 });
  }
  const inSeason = due.some(isNationalTeamSport) ? await inSeasonSportKeys() : null;

  for (const sportKey of due) {
    if (inSeason && isNationalTeamSport(sportKey) && !inSeason.has(sportKey)) {
      summary.push({ sportKey, skipped: true, reason: "out_of_season", events: 0, oddsCaptured: 0 });
      continue;
    }
    try {
      const events = await getOddsForSport(sportKey);
      let oddsCaptured = 0;
      for (const event of events) {
        await upsertEvent(event);
        oddsCaptured += await insertOddsSnapshot(event);
      }
      await markFetched(`odds:${sportKey}`);
      summary.push({ sportKey, skipped: false, events: events.length, oddsCaptured });
    } catch (err) {
      summary.push({ sportKey, skipped: false, events: 0, oddsCaptured: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return summary;
}
