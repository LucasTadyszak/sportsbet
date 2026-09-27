import { cache } from "react";
import type { Edge, MatchPrediction } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, parisStartOfDay } from "@/lib/dates";
import { findEventFixture } from "@/lib/footballDataMatches";
import { consensusProbabilities } from "@/lib/probability";
import { isStakedTier } from "@/lib/methodology/config";
import type { OutcomeEdge } from "@/lib/selection";

export type OddsLine = {
  bookmakerKey: string;
  bookmakerTitle: string;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  capturedAt: Date;
};

// The raw model's estimate (Elo + goals model, src/lib/methodology), before any market
// anchor or calibration — independent of the odds-implied probabilities above.
export type ModelPrediction = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
};

// The side the methodology would take in one market, and its verdict (src/lib/refreshEdges.ts).
export type BoardVerdict = {
  marketKey: string;
  outcomeName: string;
  point: number | null;
  tier: string;
  bestPrice: number | null;
  edge: number;
  stakeUnits: number;
};

// The Edge columns the board reads: its verdicts, and what a slip selection carries.
type BoardEdge = OutcomeEdge & Pick<Edge, "bestPrice" | "edge" | "stakeUnits" | "isRecommended">;

const BOARD_EDGE_FIELDS = {
  marketKey: true,
  outcomeName: true,
  point: true,
  tier: true,
  reasons: true,
  modelProb: true,
  bestPrice: true,
  edge: true,
  stakeUnits: true,
  isRecommended: true,
  computedAt: true,
} as const;

// Every 1X2 outcome's verdict (for the selections), plus the recommended side of each market.
const BOARD_EDGES = {
  where: { OR: [{ isRecommended: true }, { marketKey: "h2h" }] },
  select: BOARD_EDGE_FIELDS,
};

export type BoardEvent = {
  id: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  h2h: OddsLine[];
  prediction: ModelPrediction | null;
  verdicts: BoardVerdict[];
  /** The model's verdict on each priced outcome, so a price clicked into the slip can be sized. */
  edges: OutcomeEdge[];
};

export type MatchDetail = Omit<BoardEvent, "edges"> & {
  totals: OddsLine[];
  edges: Edge[];
  predictionDetail: MatchPrediction | null;
  /** Once football-data.org reports the match finished — there is no live score feed. */
  finalScore: FinalScore | null;
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

/** The line (bookmaker) quoting the highest price for each outcome. */
export function bestLineByOutcome(lines: OddsLine[]): Map<string, OddsLine> {
  const best = new Map<string, OddsLine>();
  for (const line of lines) {
    const current = best.get(line.outcomeName);
    if (current === undefined || line.price > current.price) best.set(line.outcomeName, line);
  }
  return best;
}

export function bestPriceByOutcome(lines: OddsLine[]): Map<string, number> {
  return new Map(Array.from(bestLineByOutcome(lines), ([outcome, line]) => [outcome, line.price]));
}

export type ResultBox = { label: "1" | "X" | "2"; outcomeName: string; best: OddsLine | null };

/**
 * The three 1/X/2 boxes ZoneStat shows for a match: the best price per outcome among the
 * books one can actually bet at (src/lib/bookmakers.ts), since a box is also what gets
 * clicked into the bet slip — any book's best price when none of those quotes it.
 */
export function resultBoxes(
  h2h: OddsLine[],
  homeTeam: string,
  awayTeam: string,
  isBettable: (bookmakerKey: string) => boolean
): ResultBox[] {
  const bettable = bestLineByOutcome(h2h.filter((line) => isBettable(line.bookmakerKey)));
  const any = bestLineByOutcome(h2h);
  const best = (outcomeName: string) => bettable.get(outcomeName) ?? any.get(outcomeName) ?? null;
  return [
    { label: "1", outcomeName: homeTeam, best: best(homeTeam) },
    { label: "X", outcomeName: "Draw", best: best("Draw") },
    { label: "2", outcomeName: awayTeam, best: best(awayTeam) },
  ];
}

function toVerdict(edge: Pick<Edge, "marketKey" | "outcomeName" | "point" | "tier" | "bestPrice" | "edge" | "stakeUnits">): BoardVerdict {
  return {
    marketKey: edge.marketKey,
    outcomeName: edge.outcomeName,
    point: edge.point,
    tier: edge.tier,
    bestPrice: edge.bestPrice,
    edge: edge.edge,
    stakeUnits: edge.stakeUnits,
  };
}

function toBoardEvent(event: {
  id: string;
  sport: { title: string };
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  odds: Parameters<typeof dedupeLatestPerLine>[0];
  prediction: ModelPrediction | null;
  edges: BoardEdge[];
}): BoardEvent {
  return {
    id: event.id,
    sportTitle: event.sport.title,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    commenceTime: event.commenceTime,
    h2h: dedupeLatestPerLine(event.odds),
    prediction: event.prediction,
    verdicts: event.edges.filter((e) => e.isRecommended).map(toVerdict),
    edges: event.edges,
  };
}

/** The recommended side of a market, if the methodology would stake it. */
export function stakedVerdict(verdicts: BoardVerdict[], marketKey: string): BoardVerdict | null {
  return verdicts.find((v) => v.marketKey === marketKey && isStakedTier(v.tier)) ?? null;
}

const UPCOMING_FALLBACK_LIMIT = 30;

/** The next matches overall, regardless of the day/status/search being viewed. */
async function getUpcomingFallback(): Promise<BoardEvent[]> {
  const events = await prisma.event.findMany({
    where: { commenceTime: { gte: new Date() } },
    orderBy: { commenceTime: "asc" },
    take: UPCOMING_FALLBACK_LIMIT,
    include: {
      sport: true,
      prediction: true,
      edges: BOARD_EDGES,
      odds: {
        where: { marketKey: "h2h" },
        orderBy: { capturedAt: "desc" },
        include: { bookmaker: true },
      },
    },
  });
  return events.map(toBoardEvent);
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
}): Promise<{ events: BoardEvent[]; lastCapturedAt: Date | null; upcomingFallback: BoardEvent[] }> {
  const dayStart = parisStartOfDay(opts.dateKey);
  const dayEnd = parisStartOfDay(addDays(opts.dateKey, 1));
  const search = opts.query.trim();

  // Deliberately not derived from the filtered `events` below: the currently viewed
  // day/status/search can legitimately have zero matches right after a successful
  // sync (e.g. no kickoffs today), and this indicator should still reflect that a
  // sync did happen, rather than looking exactly like "never synced".
  const [rawEvents, lastCaptured] = await Promise.all([
    prisma.event.findMany({
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
        prediction: true,
        edges: BOARD_EDGES,
        odds: {
          where: { marketKey: "h2h" },
          orderBy: { capturedAt: "desc" },
          include: { bookmaker: true },
        },
      },
    }),
    prisma.odds.aggregate({ _max: { capturedAt: true } }),
  ]);

  const events = rawEvents.map(toBoardEvent);

  // The viewed day/status can legitimately come back empty even with plenty of matches
  // elsewhere (e.g. no kickoff today); show the actual next matches directly instead of
  // just pointing at another day to click through to. Not applied to a search query,
  // since "no result for this search" isn't fixed by showing unrelated matches.
  const upcomingFallback = events.length === 0 && !search ? await getUpcomingFallback() : [];

  return { events, lastCapturedAt: lastCaptured._max.capturedAt, upcomingFallback };
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
      prediction: true,
      edges: true,
      odds: {
        where: { marketKey: { in: ["h2h", "totals"] } },
        orderBy: { capturedAt: "desc" },
        include: { bookmaker: true },
      },
    },
  });
  if (!event) return null;

  let finalScore: FinalScore | null = null;
  if (event.commenceTime.getTime() <= Date.now()) {
    const fixture = await findEventFixture(event);
    if (fixture?.status === "FINISHED" && fixture.homeGoals !== null && fixture.awayGoals !== null) {
      finalScore = { home: fixture.homeGoals, away: fixture.awayGoals };
    }
  }

  const lines = dedupeLatestPerLine(event.odds);
  return {
    id: event.id,
    sportTitle: event.sport.title,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    commenceTime: event.commenceTime,
    h2h: lines.filter((l) => l.marketKey === "h2h"),
    totals: lines.filter((l) => l.marketKey === "totals"),
    prediction: event.prediction,
    predictionDetail: event.prediction,
    edges: event.edges,
    verdicts: event.edges.filter((e) => e.isRecommended).map(toVerdict),
    finalScore,
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
