// [LE] "The model watches the market itself, not just the game": five signals read off
// the stored odds history (every sync keeps every book's prices):
//   1. line movement      — opener-vs-current consensus, a capped nudge to the model
//   2. steam              — several books moving the same way within minutes
//   3. reverse line move  — the sharp book and the public books moving opposite ways
//   4. multi-book consensus — a book priced away from everyone else ("stale"/"juiced")
//   5. sharp divergence + predicted CLV — where Pinnacle sits vs the soft books, and a
//      forecast of where the line closes
// Everything here is pure: history in, numbers out.
import { PINNACLE_CONSENSUS_WEIGHT, SIGNALS } from "@/lib/methodology/config";
import { devigPrices, weightedConsensus } from "@/lib/methodology/devig";

/** One distinct state of one book's market (consecutive identical syncs collapsed). */
export type BookObservation = {
  capturedAt: Date;
  /** The bookmaker's own last_update for the market — when the price actually moved. */
  updatedAt: Date;
  prices: Record<string, number>;
};

export type BookSeries = { bookmakerKey: string; observations: BookObservation[]; lastSeenAt: Date };

export type MarketHistory = {
  marketKey: string;
  point: number | null;
  outcomes: string[];
  books: BookSeries[];
};

export type BookRole = "sharp" | "exchange" | "soft";

export type BookClassifier = {
  role: (bookmakerKey: string) => BookRole;
  isBettable: (bookmakerKey: string) => boolean;
};

export type SteamSignal = { direction: 1 | -1; at: string; books: string[] };
export type RlmSignal = { sharpSide: 1 | -1; sharpMove: number; publicMove: number };
export type BookFlag = "stale" | "juiced";

export type OutcomeMarketView = {
  consensus: number;
  sharp: number | null;
  exchange: number | null;
  soft: number | null;
  open: number | null;
  delta: number;
  nudge: number;
  steam: SteamSignal | null;
  rlm: RlmSignal | null;
  /** Pinnacle minus the soft-book consensus: > 0 means the sharp book rates this outcome higher. */
  sharpDivergence: number | null;
  best: { price: number; bookmakerKey: string; flag: BookFlag | null; divergence: number | null } | null;
  /** Forecast closing fair probability, and how far that is from the consensus now. */
  predictedClose: number | null;
  predictedMove: number | null;
  /** Expected CLV of the best price against the forecast close (margin included). */
  predictedClv: number | null;
};

export type BookView = {
  bookmakerKey: string;
  role: BookRole;
  bettable: boolean;
  prices: Record<string, number>;
  fair: Record<string, number>;
  flags: Record<string, { divergence: number; flag: BookFlag | null }>;
};

export type MarketView = {
  marketKey: string;
  point: number | null;
  outcomes: string[];
  capturedAt: string;
  openAt: string | null;
  bookCount: number;
  hasSharp: boolean;
  hasExchange: boolean;
  consensus: Record<string, number>;
  exchange: Record<string, number> | null;
  byOutcome: Record<string, OutcomeMarketView>;
  books: BookView[];
};

// A book that didn't show up in the latest sync has pulled (or stopped quoting) the market.
const CURRENT_TOLERANCE_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

type BookFair = { bookmakerKey: string; role: BookRole; fair: Record<string, number>; prices: Record<string, number> };

export function fairOf(prices: Record<string, number>, outcomes: string[]): Record<string, number> | null {
  const quoted = outcomes.map((o) => prices[o]);
  if (quoted.some((p) => p === undefined)) return null;
  const fair = devigPrices(quoted);
  if (!fair) return null;
  return Object.fromEntries(outcomes.map((o, i) => [o, fair[i]]));
}

function observationAt(series: BookSeries, t: number): BookObservation | null {
  let found: BookObservation | null = null;
  for (const obs of series.observations) {
    if (obs.capturedAt.getTime() <= t) found = obs;
    else break;
  }
  return found;
}

function booksAt(history: MarketHistory, t: number, classifier: BookClassifier, currentOnly: boolean): BookFair[] {
  const result: BookFair[] = [];
  for (const series of history.books) {
    if (currentOnly && series.lastSeenAt.getTime() < t - CURRENT_TOLERANCE_MS) continue;
    const obs = observationAt(series, t);
    if (!obs) continue;
    const fair = fairOf(obs.prices, history.outcomes);
    if (!fair) continue;
    result.push({ bookmakerKey: series.bookmakerKey, role: classifier.role(series.bookmakerKey), fair, prices: obs.prices });
  }
  return result;
}

function consensusOf(books: BookFair[], outcomes: string[], weighted = true): Record<string, number> | null {
  return weightedConsensus(
    books.map((b) => ({ weight: weighted && b.role === "sharp" ? PINNACLE_CONSENSUS_WEIGHT : 1, fair: b.fair })),
    outcomes
  );
}

/** First sync at which enough books were quoting to call it the opening line. */
function openingTime(history: MarketHistory): number | null {
  const firstSeen = history.books
    .map((s) => s.observations[0]?.capturedAt.getTime())
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);
  if (firstSeen.length === 0) return null;
  const needed = Math.min(3, firstSeen.length);
  return firstSeen[needed - 1];
}

/** [LE] quadratic weighting, capped: small moves barely register, large ones hit the cap. */
export function lineMovementNudge(delta: number): number {
  const weight = Math.min(1, (Math.abs(delta) / SIGNALS.lineMoveFullAt) ** 2);
  return Math.sign(delta) * SIGNALS.lineMoveCap * weight;
}

/** [LE] steam: >= 2 books moving >= 0.5pp the same way within 5 minutes, timed on the books' own updates. */
export function detectSteam(history: MarketHistory, now: Date): Record<string, SteamSignal | null> {
  const since = now.getTime() - SIGNALS.steamLookbackHours * HOUR_MS;
  const moves: Record<string, { book: string; move: number; time: number }[]> = {};
  for (const outcome of history.outcomes) moves[outcome] = [];

  for (const series of history.books) {
    let previous: Record<string, number> | null = null;
    for (const obs of series.observations) {
      const fair = fairOf(obs.prices, history.outcomes);
      if (!fair) continue;
      const time = obs.updatedAt.getTime();
      if (previous && time >= since && time <= now.getTime()) {
        for (const outcome of history.outcomes) {
          const move = fair[outcome] - previous[outcome];
          if (Math.abs(move) >= SIGNALS.steamMinMove) moves[outcome].push({ book: series.bookmakerKey, move, time });
        }
      }
      previous = fair;
    }
  }

  const windowMs = SIGNALS.steamWindowMinutes * 60 * 1000;
  const result: Record<string, SteamSignal | null> = {};
  for (const outcome of history.outcomes) {
    let latest: SteamSignal | null = null;
    let latestTime = -Infinity;
    for (const direction of [1, -1] as const) {
      const sameWay = moves[outcome].filter((m) => Math.sign(m.move) === direction).sort((a, b) => a.time - b.time);
      let left = 0;
      for (let right = 0; right < sameWay.length; right++) {
        while (sameWay[right].time - sameWay[left].time > windowMs) left++;
        const books = Array.from(new Set(sameWay.slice(left, right + 1).map((m) => m.book)));
        if (books.length >= SIGNALS.steamMinBooks && sameWay[right].time > latestTime) {
          latestTime = sameWay[right].time;
          latest = { direction, at: new Date(sameWay[right].time).toISOString(), books };
        }
      }
    }
    result[outcome] = latest;
  }
  return result;
}

/** [LE] reverse line movement: the sharp book and the public books moving opposite ways. */
export function detectReverseLineMovement(history: MarketHistory, classifier: BookClassifier): Record<string, RlmSignal | null> {
  const movement = (series: BookSeries): Record<string, number> | null => {
    const first = series.observations[0];
    const last = series.observations[series.observations.length - 1];
    if (!first || !last || first === last) return null;
    const open = fairOf(first.prices, history.outcomes);
    const current = fairOf(last.prices, history.outcomes);
    if (!open || !current) return null;
    return Object.fromEntries(history.outcomes.map((o) => [o, current[o] - open[o]]));
  };

  const sharpSeries = history.books.find((s) => classifier.role(s.bookmakerKey) === "sharp");
  const sharpMoves = sharpSeries ? movement(sharpSeries) : null;
  const publicMoves = history.books
    .filter((s) => classifier.role(s.bookmakerKey) === "soft")
    .map(movement)
    .filter((m): m is Record<string, number> => m !== null);

  const result: Record<string, RlmSignal | null> = {};
  for (const outcome of history.outcomes) {
    result[outcome] = null;
    if (!sharpMoves || publicMoves.length === 0) continue;
    const sharpMove = sharpMoves[outcome];
    const publicMove = publicMoves.reduce((sum, m) => sum + m[outcome], 0) / publicMoves.length;
    if (
      Math.abs(sharpMove) >= SIGNALS.rlmMinMove &&
      Math.abs(publicMove) >= SIGNALS.rlmMinMove &&
      Math.sign(sharpMove) !== Math.sign(publicMove)
    ) {
      result[outcome] = { sharpSide: Math.sign(sharpMove) as 1 | -1, sharpMove, publicMove };
    }
  }
  return result;
}

export function analyzeMarket(
  history: MarketHistory,
  classifier: BookClassifier,
  now: Date,
  commenceTime: Date
): MarketView | null {
  const latest = Math.max(...history.books.map((s) => s.lastSeenAt.getTime()));
  if (!Number.isFinite(latest)) return null;
  const outcomes = history.outcomes;

  const current = booksAt(history, latest, classifier, true);
  const consensus = consensusOf(current, outcomes);
  if (!consensus) return null;

  const sharpBook = current.find((b) => b.role === "sharp") ?? null;
  const exchange = consensusOf(current.filter((b) => b.role === "exchange"), outcomes, false);
  const soft = consensusOf(current.filter((b) => b.role === "soft"), outcomes, false);

  // 1. Line movement since the opener.
  const openAt = openingTime(history);
  const open = openAt !== null ? consensusOf(booksAt(history, openAt, classifier, false), outcomes) : null;

  // Recent trend, for the closing-line forecast.
  const trendFrom = Math.max(openAt ?? latest, latest - SIGNALS.clvTrendHorizonHours * HOUR_MS);
  const past = consensusOf(booksAt(history, trendFrom, classifier, false), outcomes);
  const hoursToKickoff = Math.max(0, (commenceTime.getTime() - now.getTime()) / HOUR_MS);

  const steam = detectSteam(history, now);
  const rlm = detectReverseLineMovement(history, classifier);

  // 4. Every current book vs the consensus of all the others.
  const books: BookView[] = current.map((book) => {
    const others = consensusOf(current.filter((b) => b !== book), outcomes);
    const flags: BookView["flags"] = {};
    for (const outcome of outcomes) {
      const divergence = others ? others[outcome] - book.fair[outcome] : 0;
      const flag: BookFlag | null =
        others && divergence >= SIGNALS.staleThreshold ? "stale" : others && divergence <= -SIGNALS.staleThreshold ? "juiced" : null;
      flags[outcome] = { divergence, flag };
    }
    return {
      bookmakerKey: book.bookmakerKey,
      role: book.role,
      bettable: classifier.isBettable(book.bookmakerKey),
      prices: book.prices,
      fair: book.fair,
      flags,
    };
  });

  const byOutcome: Record<string, OutcomeMarketView> = {};
  for (const outcome of outcomes) {
    const delta = open ? consensus[outcome] - open[outcome] : 0;

    let best: OutcomeMarketView["best"] = null;
    for (const book of books) {
      if (!book.bettable) continue;
      const price = book.prices[outcome];
      if (best === null || price > best.price) {
        best = { price, bookmakerKey: book.bookmakerKey, flag: book.flags[outcome].flag, divergence: book.flags[outcome].divergence };
      }
    }

    // 5. Where the line should close: soft books drift toward the sharp price, plus a damped recent trend.
    const sharp = sharpBook ? sharpBook.fair[outcome] : null;
    const trend = past ? consensus[outcome] - past[outcome] : 0;
    const projectedTrend = Math.max(
      -SIGNALS.clvTrendCap,
      Math.min(SIGNALS.clvTrendCap, trend * Math.min(1, hoursToKickoff / SIGNALS.clvTrendHorizonHours) * SIGNALS.clvTrendDamping)
    );
    const predictedClose = Math.min(
      0.999,
      Math.max(0.001, consensus[outcome] + (sharp !== null ? SIGNALS.clvConvergence * (sharp - consensus[outcome]) : 0) + projectedTrend)
    );

    byOutcome[outcome] = {
      consensus: consensus[outcome],
      sharp,
      exchange: exchange ? exchange[outcome] : null,
      soft: soft ? soft[outcome] : null,
      open: open ? open[outcome] : null,
      delta,
      nudge: lineMovementNudge(delta),
      steam: steam[outcome],
      rlm: rlm[outcome],
      sharpDivergence: sharp !== null && soft ? sharp - soft[outcome] : null,
      best,
      predictedClose,
      predictedMove: predictedClose - consensus[outcome],
      predictedClv: best ? best.price * predictedClose - 1 : null,
    };
  }

  return {
    marketKey: history.marketKey,
    point: history.point,
    outcomes,
    capturedAt: new Date(latest).toISOString(),
    openAt: openAt !== null ? new Date(openAt).toISOString() : null,
    bookCount: current.length,
    hasSharp: sharpBook !== null,
    hasExchange: exchange !== null,
    consensus,
    exchange,
    byOutcome,
    books,
  };
}
