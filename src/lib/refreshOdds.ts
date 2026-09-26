import { prisma } from "@/lib/prisma";
import { getOddsForSport, type OddsApiEvent } from "@/lib/oddsApi";

const DEFAULT_SPORT_KEYS = ["soccer_epl", "soccer_uefa_champs_league"];
const REFRESH_INTERVAL_MINUTES = Number(process.env.ODDS_REFRESH_INTERVAL_MINUTES ?? 30);

function trackedSportKeys(): string[] {
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

/** Key identifying one quoted line, used to detect whether a price actually moved. */
function lineKey(bookmakerKey: string, marketKey: string, outcomeName: string, point: number | null) {
  return `${bookmakerKey}|${marketKey}|${outcomeName}|${point ?? ""}`;
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
}

async function insertChangedOdds(event: OddsApiEvent): Promise<number> {
  const bookmakerKeys = event.bookmakers.map((b) => b.key);
  if (bookmakerKeys.length === 0) return 0;

  await prisma.bookmaker.createMany({
    data: event.bookmakers.map((b) => ({ key: b.key, title: b.title })),
    skipDuplicates: true,
  });

  // Latest known price per line for this event, so we only write rows that actually changed.
  const existing = await prisma.odds.findMany({
    where: { eventId: event.id },
    orderBy: { capturedAt: "desc" },
    select: { bookmakerKey: true, marketKey: true, outcomeName: true, point: true, price: true },
  });
  const latestByLine = new Map<string, number>();
  for (const row of existing) {
    const key = lineKey(row.bookmakerKey, row.marketKey, row.outcomeName, row.point);
    if (!latestByLine.has(key)) latestByLine.set(key, row.price);
  }

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
        const point = outcome.point ?? null;
        const key = lineKey(bookmaker.key, market.key, outcome.name, point);
        const previousPrice = latestByLine.get(key);
        if (previousPrice === outcome.price) continue;
        toInsert.push({
          eventId: event.id,
          bookmakerKey: bookmaker.key,
          marketKey: market.key,
          outcomeName: outcome.name,
          price: outcome.price,
          point,
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
  oddsInserted: number;
}[];

/** Pulls fresh odds for every tracked sport, respecting the per-sport throttle. */
export async function refreshOdds(): Promise<RefreshSummary> {
  const summary: RefreshSummary = [];

  for (const sportKey of trackedSportKeys()) {
    const resourceKey = `odds:${sportKey}`;
    if (!(await canFetch(resourceKey))) {
      summary.push({ sportKey, skipped: true, events: 0, oddsInserted: 0 });
      continue;
    }

    const events = await getOddsForSport(sportKey);
    let oddsInserted = 0;
    for (const event of events) {
      await upsertEvent(event);
      oddsInserted += await insertChangedOdds(event);
    }
    await markFetched(resourceKey);

    summary.push({ sportKey, skipped: false, events: events.length, oddsInserted });
  }

  return summary;
}
