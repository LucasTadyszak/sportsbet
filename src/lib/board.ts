import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { addDays, parisStartOfDay } from "@/lib/dates";
import { consensusProbabilities } from "@/lib/probability";

export type OddsLine = {
  bookmakerKey: string;
  bookmakerTitle: string;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  capturedAt: Date;
};

export type BoardEvent = {
  id: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  h2h: OddsLine[];
};

export type MatchDetail = BoardEvent & {
  totals: OddsLine[];
};

export type StatusFilter = "all" | "upcoming" | "live";

// No live score feed is wired up (The Odds API only provides pre-match odds), so
// "live" is a heuristic: kicked off recently enough that it could still be on.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

function dedupeLatestPerLine(
  odds: {
    bookmakerKey: string;
    bookmaker: { title: string };
    marketKey: string;
    outcomeName: string;
    point: number | null;
    price: number;
    capturedAt: Date;
  }[]
): OddsLine[] {
  const latestByLine = new Map<string, OddsLine>();
  for (const row of odds) {
    const key = `${row.marketKey}|${row.bookmakerKey}|${row.outcomeName}|${row.point ?? ""}`;
    if (!latestByLine.has(key)) {
      latestByLine.set(key, {
        bookmakerKey: row.bookmakerKey,
        bookmakerTitle: row.bookmaker.title,
        marketKey: row.marketKey,
        outcomeName: row.outcomeName,
        point: row.point,
        price: row.price,
        capturedAt: row.capturedAt,
      });
    }
  }
  return Array.from(latestByLine.values());
}

export function bestPriceByOutcome(lines: OddsLine[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const line of lines) {
    const current = best.get(line.outcomeName);
    if (current === undefined || line.price > current) best.set(line.outcomeName, line.price);
  }
  return best;
}

export type ResultBox = { label: "1" | "X" | "2"; price: number | null };

/** The three 1/X/2 boxes ZoneStat shows for a match, using the best price seen per outcome. */
export function resultBoxes(h2h: OddsLine[], homeTeam: string, awayTeam: string): ResultBox[] {
  const best = bestPriceByOutcome(h2h);
  return [
    { label: "1", price: best.get(homeTeam) ?? null },
    { label: "X", price: best.get("Draw") ?? null },
    { label: "2", price: best.get(awayTeam) ?? null },
  ];
}

function statusWindow(status: StatusFilter, dayStart: Date, dayEnd: Date) {
  const now = new Date();
  if (status === "upcoming") {
    return { gte: now > dayStart ? now : dayStart, lt: dayEnd };
  }
  if (status === "live") {
    const liveFloor = new Date(now.getTime() - LIVE_WINDOW_MS);
    return { gte: liveFloor > dayStart ? liveFloor : dayStart, lt: now < dayEnd ? now : dayEnd };
  }
  return { gte: dayStart, lt: dayEnd };
}

export async function getBoard(opts: {
  dateKey: string;
  status: StatusFilter;
  query: string;
}): Promise<{ events: BoardEvent[]; lastCapturedAt: Date | null }> {
  const dayStart = parisStartOfDay(opts.dateKey);
  const dayEnd = parisStartOfDay(addDays(opts.dateKey, 1));
  const search = opts.query.trim();

  const events = await prisma.event.findMany({
    where: {
      commenceTime: statusWindow(opts.status, dayStart, dayEnd),
      ...(search
        ? {
            OR: [
              { homeTeam: { contains: search, mode: "insensitive" } },
              { awayTeam: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { commenceTime: "asc" },
    take: 200,
    include: {
      sport: true,
      odds: {
        where: { marketKey: "h2h" },
        orderBy: { capturedAt: "desc" },
        include: { bookmaker: true },
      },
    },
  });

  let lastCapturedAt: Date | null = null;
  const board: BoardEvent[] = events.map((event) => {
    const h2h = dedupeLatestPerLine(event.odds);
    for (const line of h2h) {
      if (!lastCapturedAt || line.capturedAt > lastCapturedAt) lastCapturedAt = line.capturedAt;
    }
    return {
      id: event.id,
      sportTitle: event.sport.title,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTime: event.commenceTime,
      h2h,
    };
  });

  return { events: board, lastCapturedAt };
}

export function groupBySport(events: BoardEvent[]): [string, BoardEvent[]][] {
  const bySport = new Map<string, BoardEvent[]>();
  for (const event of events) {
    const list = bySport.get(event.sportTitle) ?? [];
    list.push(event);
    bySport.set(event.sportTitle, list);
  }
  return Array.from(bySport.entries());
}

export const getMatchDetail = cache(async (id: string): Promise<MatchDetail | null> => {
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      sport: true,
      odds: {
        where: { marketKey: { in: ["h2h", "totals"] } },
        orderBy: { capturedAt: "desc" },
        include: { bookmaker: true },
      },
    },
  });
  if (!event) return null;

  const lines = dedupeLatestPerLine(event.odds);
  return {
    id: event.id,
    sportTitle: event.sport.title,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    commenceTime: event.commenceTime,
    h2h: lines.filter((l) => l.marketKey === "h2h"),
    totals: lines.filter((l) => l.marketKey === "totals"),
  };
});

export type ResultProbability = { name: string; price: number | null; probability: number };

/** Consensus 1/X/2 probabilities, de-vigged per bookmaker then averaged. */
export function resultProbabilities(h2h: OddsLine[]): ResultProbability[] {
  const byBookmaker = new Map<string, OddsLine[]>();
  for (const line of h2h) {
    const list = byBookmaker.get(line.bookmakerKey) ?? [];
    list.push(line);
    byBookmaker.set(line.bookmakerKey, list);
  }
  const sets = Array.from(byBookmaker.values())
    .filter((lines) => lines.length >= 2)
    .map((lines) => lines.map((l) => ({ name: l.outcomeName, price: l.price })));

  const consensus = consensusProbabilities(sets);
  const best = bestPriceByOutcome(h2h);
  return Array.from(consensus.entries())
    .map(([name, probability]) => ({ name, probability, price: best.get(name) ?? null }))
    .sort((a, b) => b.probability - a.probability);
}

export type TotalsProbability = {
  point: number;
  outcomes: ResultProbability[];
};

/** Consensus Over/Under probabilities for each goal line quoted, de-vigged per bookmaker then averaged. */
export function totalsProbabilities(totals: OddsLine[]): TotalsProbability[] {
  const byPoint = new Map<number, OddsLine[]>();
  for (const line of totals) {
    if (line.point == null) continue;
    const list = byPoint.get(line.point) ?? [];
    list.push(line);
    byPoint.set(line.point, list);
  }

  const result: TotalsProbability[] = [];
  for (const [point, lines] of byPoint) {
    const byBookmaker = new Map<string, OddsLine[]>();
    for (const line of lines) {
      const list = byBookmaker.get(line.bookmakerKey) ?? [];
      list.push(line);
      byBookmaker.set(line.bookmakerKey, list);
    }
    const sets = Array.from(byBookmaker.values())
      .filter((l) => l.length >= 2)
      .map((l) => l.map((o) => ({ name: o.outcomeName, price: o.price })));

    const consensus = consensusProbabilities(sets);
    const best = bestPriceByOutcome(lines);
    const outcomes = Array.from(consensus.entries())
      .map(([name, probability]) => ({ name, probability, price: best.get(name) ?? null }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));

    result.push({ point, outcomes });
  }

  return result.sort((a, b) => a.point - b.point);
}
