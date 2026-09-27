import { cache } from "react";
import type { Edge, MatchPrediction } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { bookRole, isFrenchBook } from "@/lib/bookmakers";
import { teamLooksByName, type TeamLook } from "@/lib/crests";
import { addDays, parisStartOfDay } from "@/lib/dates";
import { findEventFixture } from "@/lib/footballDataMatches";
import { isStakedTier } from "@/lib/methodology/config";
import { detectOddsErrors, marketConsensus, type BookQuote } from "@/lib/methodology/oddsErrors";
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

/** A French book's price that the rest of the market says is too long (src/lib/methodology/oddsErrors.ts). */
export type OddsError = {
  marketKey: string;
  point: number | null;
  outcomeName: string;
  bookmakerKey: string;
  bookmakerTitle: string;
  price: number;
  /** Fair probability of the outcome according to every other book. */
  fairProb: number;
  ev: number;
};

/** Fair probabilities of one market line: every book of the latest sync, de-vigged, Pinnacle counted double. */
export type FairMarket = { marketKey: string; point: number | null; probabilities: Record<string, number> };

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
  /** The Odds API sport_key: the competition, whose look the match block takes (src/lib/competitions.ts). */
  sportKey: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  /** Kit colours of each club (src/lib/teamColors.ts); empty when unknown. */
  homeColors: string[];
  awayColors: string[];
  commenceTime: Date;
  /** Latest 1X2 price of every French book: the only books the site displays. */
  h2h: OddsLine[];
  /** 1X2 and totals. */
  oddsErrors: OddsError[];
  /** The whole market's fair 1X2 probabilities (see FairMarket), by outcome name; null without a consensus. */
  fairResult: Record<string, number> | null;
  prediction: ModelPrediction | null;
  verdicts: BoardVerdict[];
  /** The model's verdict on each priced outcome, so a price clicked into the slip can be sized. */
  edges: OutcomeEdge[];
};

/** The 90-minute score (what bookmakers settle on and the goals model predicts). */
export type FinalScore = { home: number; away: number };

export type MatchDetail = Omit<BoardEvent, "edges"> & {
  /** Latest totals price of every French book. */
  totals: OddsLine[];
  fair: FairMarket[];
  edges: Edge[];
  predictionDetail: MatchPrediction | null;
  /** Once football-data.org reports the match finished — there is no live score feed. */
  finalScore: FinalScore | null;
};

export type StatusFilter = "all" | "upcoming" | "live";

// No live score feed is wired up (The Odds API only provides pre-match odds), so
// "live" is a heuristic: kicked off recently enough that it could still be on.
const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

// A book missing from an event's latest sync has pulled (or stopped quoting) that line: its
// last price is still displayed, but it's no longer part of the market prices are judged on.
const CURRENT_TOLERANCE_MS = 2 * 60 * 1000;

/**
 * The latest price of every line (market × book × outcome × point) of each event. The odds
 * table keeps every sync, so only the most recent row of each line is brought back.
 */
async function latestLines(eventIds: string[]): Promise<Map<string, OddsLine[]>> {
  const byEvent = new Map<string, OddsLine[]>();
  if (eventIds.length === 0) return byEvent;
  const rows = await prisma.$queryRaw<(OddsLine & { eventId: string })[]>`
    SELECT DISTINCT ON (o."eventId", o."marketKey", o."bookmakerKey", o."outcomeName", o."point")
           o."eventId", o."bookmakerKey", b.title AS "bookmakerTitle", o."marketKey", o."outcomeName", o."point",
           o.price, o."capturedAt"
    FROM odds o
    JOIN bookmakers b ON b.key = o."bookmakerKey"
    WHERE o."eventId" = ANY(${eventIds}) AND o."marketKey" IN ('h2h', 'totals')
    ORDER BY o."eventId", o."marketKey", o."bookmakerKey", o."outcomeName", o."point", o."capturedAt" DESC
  `;
  for (const { eventId, ...line } of rows) {
    const list = byEvent.get(eventId) ?? [];
    list.push(line);
    byEvent.set(eventId, list);
  }
  return byEvent;
}

function outcomesOf(marketKey: string, homeTeam: string, awayTeam: string): string[] {
  return marketKey === "h2h" ? [homeTeam, "Draw", awayTeam] : ["Over", "Under"];
}

/**
 * Reads an event's latest sync: the fair probabilities of each market line, from every book
 * (not only the French ones), and the French prices they show to be odds errors. Errors are
 * only looked for before kickoff: once the match is on, the pre-match prices are gone.
 */
function readMarket(
  lines: OddsLine[],
  event: { homeTeam: string; awayTeam: string; commenceTime: Date },
  now: Date
): { fair: FairMarket[]; oddsErrors: OddsError[] } {
  const fair: FairMarket[] = [];
  const oddsErrors: OddsError[] = [];
  if (lines.length === 0) return { fair, oddsErrors };

  const latest = Math.max(...lines.map((l) => l.capturedAt.getTime()));
  const byMarketLine = new Map<string, OddsLine[]>();
  for (const line of lines) {
    if (line.capturedAt.getTime() < latest - CURRENT_TOLERANCE_MS) continue;
    const key = `${line.marketKey}|${line.point ?? ""}`;
    const list = byMarketLine.get(key) ?? [];
    list.push(line);
    byMarketLine.set(key, list);
  }

  for (const group of byMarketLine.values()) {
    const { marketKey, point } = group[0];
    const outcomes = outcomesOf(marketKey, event.homeTeam, event.awayTeam);
    const quotes = new Map<string, BookQuote>();
    for (const line of group) {
      const quote = quotes.get(line.bookmakerKey) ?? { bookmakerKey: line.bookmakerKey, role: bookRole(line.bookmakerKey), prices: {} };
      quote.prices[line.outcomeName] = line.price;
      quotes.set(line.bookmakerKey, quote);
    }
    const books = Array.from(quotes.values());

    const probabilities = marketConsensus(books, outcomes);
    if (probabilities) fair.push({ marketKey, point, probabilities });
    if (now.getTime() >= event.commenceTime.getTime()) continue;
    for (const error of detectOddsErrors(books, outcomes, isFrenchBook)) {
      oddsErrors.push({
        marketKey,
        point,
        outcomeName: error.outcome,
        bookmakerKey: error.bookmakerKey,
        bookmakerTitle: group.find((l) => l.bookmakerKey === error.bookmakerKey)?.bookmakerTitle ?? error.bookmakerKey,
        price: error.price,
        fairProb: error.fairProb,
        ev: error.ev,
      });
    }
  }
  return { fair, oddsErrors };
}

/** Odds errors grouped by the price they flag (market line × outcome), several books' errors together. */
export function groupOddsErrors(errors: OddsError[]): OddsError[][] {
  const groups = new Map<string, OddsError[]>();
  for (const error of errors) {
    const key = `${error.marketKey}|${error.outcomeName}|${error.point ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(error);
    groups.set(key, list);
  }
  return Array.from(groups.values());
}

/** The odds errors on one outcome of one market line. */
export function oddsErrorsFor(errors: OddsError[], marketKey: string, outcomeName: string, point: number | null = null): OddsError[] {
  return errors.filter((e) => e.marketKey === marketKey && e.outcomeName === outcomeName && e.point === point);
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
 * clicked into the bet slip — any displayed (French) book's best price when none of those
 * quotes it.
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

type EventRow = {
  id: string;
  sportKey: string;
  sport: { title: string };
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  prediction: ModelPrediction | null;
  edges: BoardEdge[];
};

/** The fields of a board event that say how its two clubs look. */
function teamLooks(event: { homeTeam: string; awayTeam: string }, looks: Map<string, TeamLook>) {
  const home = looks.get(event.homeTeam);
  const away = looks.get(event.awayTeam);
  return {
    homeCrest: home?.crest ?? null,
    awayCrest: away?.crest ?? null,
    homeColors: home?.colors ?? [],
    awayColors: away?.colors ?? [],
  };
}

function toBoardEvent(event: EventRow, lines: OddsLine[], looks: Map<string, TeamLook>, now: Date): BoardEvent {
  const { fair, oddsErrors } = readMarket(lines, event, now);
  return {
    id: event.id,
    sportKey: event.sportKey,
    sportTitle: event.sport.title,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    ...teamLooks(event, looks),
    commenceTime: event.commenceTime,
    h2h: lines.filter((l) => l.marketKey === "h2h" && isFrenchBook(l.bookmakerKey)),
    oddsErrors,
    fairResult: fair.find((m) => m.marketKey === "h2h")?.probabilities ?? null,
    prediction: event.prediction,
    verdicts: event.edges.filter((e) => e.isRecommended).map(toVerdict),
    edges: event.edges,
  };
}

async function toBoardEvents(events: EventRow[]): Promise<BoardEvent[]> {
  const [lines, looks] = await Promise.all([
    latestLines(events.map((e) => e.id)),
    teamLooksByName(events.flatMap((e) => [e.homeTeam, e.awayTeam])),
  ]);
  const now = new Date();
  return events.map((event) => toBoardEvent(event, lines.get(event.id) ?? [], looks, now));
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
    },
  });
  return toBoardEvents(events);
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
      },
    }),
    prisma.odds.aggregate({ _max: { capturedAt: true } }),
  ]);

  const events = await toBoardEvents(rawEvents);

  // The viewed day/status can legitimately come back empty even with plenty of matches
  // elsewhere (e.g. no kickoff today); show the actual next matches directly instead of
  // just pointing at another day to click through to. Not applied to a search query,
  // since "no result for this search" isn't fixed by showing unrelated matches.
  const upcomingFallback = events.length === 0 && !search ? await getUpcomingFallback() : [];

  return { events, lastCapturedAt: lastCaptured._max.capturedAt, upcomingFallback };
}

/** Events by competition (sport_key), in the order each competition first appears. */
export function groupByCompetition(events: BoardEvent[]): [string, BoardEvent[]][] {
  const byCompetition = new Map<string, BoardEvent[]>();
  for (const event of events) {
    const list = byCompetition.get(event.sportKey) ?? [];
    list.push(event);
    byCompetition.set(event.sportKey, list);
  }
  return Array.from(byCompetition.entries());
}

export const getMatchDetail = cache(async (id: string): Promise<MatchDetail | null> => {
  const event = await prisma.event.findUnique({
    where: { id },
    include: { sport: true, prediction: true, edges: true },
  });
  if (!event) return null;

  let finalScore: FinalScore | null = null;
  if (event.commenceTime.getTime() <= Date.now()) {
    const fixture = await findEventFixture(event);
    if (fixture?.status === "FINISHED" && fixture.homeGoals !== null && fixture.awayGoals !== null) {
      finalScore = { home: fixture.homeGoals, away: fixture.awayGoals };
    }
  }

  const [latest, looks] = await Promise.all([latestLines([event.id]), teamLooksByName([event.homeTeam, event.awayTeam])]);
  const lines = latest.get(event.id) ?? [];
  const french = lines.filter((l) => isFrenchBook(l.bookmakerKey));
  const { fair, oddsErrors } = readMarket(lines, event, new Date());
  return {
    id: event.id,
    sportKey: event.sportKey,
    sportTitle: event.sport.title,
    homeTeam: event.homeTeam,
    awayTeam: event.awayTeam,
    ...teamLooks(event, looks),
    commenceTime: event.commenceTime,
    h2h: french.filter((l) => l.marketKey === "h2h"),
    totals: french.filter((l) => l.marketKey === "totals"),
    fair,
    oddsErrors,
    fairResult: fair.find((m) => m.marketKey === "h2h")?.probabilities ?? null,
    prediction: event.prediction,
    predictionDetail: event.prediction,
    edges: event.edges,
    verdicts: event.edges.filter((e) => e.isRecommended).map(toVerdict),
    finalScore,
  };
});

export type ResultProbability = { name: string; price: number | null; probability: number };

function withBestPrices(probabilities: Record<string, number>, lines: OddsLine[]): ResultProbability[] {
  const best = bestPriceByOutcome(lines);
  return Object.entries(probabilities).map(([name, probability]) => ({ name, probability, price: best.get(name) ?? null }));
}

/** 1/X/2 probabilities of the whole market (see FairMarket), with the best French price of each. */
export function resultProbabilities(match: MatchDetail): ResultProbability[] {
  const h2h = match.fair.find((m) => m.marketKey === "h2h");
  return h2h ? withBestPrices(h2h.probabilities, match.h2h).sort((a, b) => b.probability - a.probability) : [];
}

export type TotalsProbability = {
  point: number;
  outcomes: ResultProbability[];
};

/** Over/Under probabilities of the whole market for each goal line quoted, with the best French price. */
export function totalsProbabilities(match: MatchDetail): TotalsProbability[] {
  return match.fair
    .filter((m): m is FairMarket & { point: number } => m.marketKey === "totals" && m.point !== null)
    .map((m) => {
      const lines = match.totals.filter((l) => l.point === m.point);
      return { point: m.point, outcomes: withBestPrices(m.probabilities, lines).sort((a, b) => (a.name < b.name ? -1 : 1)) };
    })
    .sort((a, b) => a.point - b.point);
}
