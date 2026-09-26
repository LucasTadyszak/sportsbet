import { prisma } from "@/lib/prisma";
import { getOddsForSport, type OddsApiEvent } from "@/lib/oddsApi";

const DEFAULT_SPORT_KEYS = ["soccer_epl", "soccer_uefa_champs_league"];
const REFRESH_INTERVAL_MINUTES = Number(process.env.ODDS_REFRESH_INTERVAL_MINUTES ?? 30);

export function trackedSportKeys(): string[] {
  const fromEnv = process.env.ODDS_SPORT_KEYS;
  if (!fromEnv) return DEFAULT_SPORT_KEYS;
  return fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  events: number;
  oddsCaptured: number;
}[];

/** Pulls fresh odds for every tracked sport, respecting the per-sport throttle. */
export async function refreshOdds(): Promise<RefreshSummary> {
  const summary: RefreshSummary = [];

  for (const sportKey of trackedSportKeys()) {
    const resourceKey = `odds:${sportKey}`;
    if (!(await canFetch(resourceKey))) {
      summary.push({ sportKey, skipped: true, events: 0, oddsCaptured: 0 });
      continue;
    }

    const events = await getOddsForSport(sportKey);
    let oddsCaptured = 0;
    for (const event of events) {
      await upsertEvent(event);
      oddsCaptured += await insertOddsSnapshot(event);
    }
    await markFetched(resourceKey);

    summary.push({ sportKey, skipped: false, events: events.length, oddsCaptured });
  }

  return summary;
}
