// [adapt] Odds errors ("erreurs de cote"): a price a book is offering that the rest of the
// market says is too long. Each book is judged against the fair probability of all the
// *other* books quoting the same sync, so its own price never dilutes the reference, and
// flagged when that price is clearly +EV against it. Unlike a verdict, the model plays no
// part: it's the market itself saying the price is wrong.
import { ODDS_ERROR, PINNACLE_CONSENSUS_WEIGHT } from "@/lib/methodology/config";
import { weightedConsensus } from "@/lib/methodology/devig";
import { fairOf, type BookRole } from "@/lib/methodology/signals";

/** One book's current prices in one market (it may not quote every outcome). */
export type BookQuote = { bookmakerKey: string; role: BookRole; prices: Record<string, number> };

export type OddsError = {
  bookmakerKey: string;
  outcome: string;
  price: number;
  /** Fair probability of the outcome according to the other books. */
  fairProb: number;
  /** Expected return per unit staked at `price`. */
  ev: number;
};

type BookFair = { bookmakerKey: string; weight: number; fair: Record<string, number> };

/** De-vigged probabilities of every book quoting the whole market, Pinnacle weighted double. */
function fairBooks(quotes: BookQuote[], outcomes: string[]): BookFair[] {
  return quotes.flatMap((q) => {
    const fair = fairOf(q.prices, outcomes);
    return fair ? [{ bookmakerKey: q.bookmakerKey, weight: q.role === "sharp" ? PINNACLE_CONSENSUS_WEIGHT : 1, fair }] : [];
  });
}

/** Fair probabilities of a market: the Pinnacle-weighted consensus of every book quoting it. */
export function marketConsensus(quotes: BookQuote[], outcomes: string[]): Record<string, number> | null {
  return weightedConsensus(fairBooks(quotes, outcomes), outcomes);
}

/** Every price of a `candidate` book that the consensus of the other books flags as an odds error. */
export function detectOddsErrors(
  quotes: BookQuote[],
  outcomes: string[],
  candidate: (bookmakerKey: string) => boolean
): OddsError[] {
  const books = fairBooks(quotes, outcomes);
  const errors: OddsError[] = [];
  for (const quote of quotes) {
    if (!candidate(quote.bookmakerKey)) continue;
    const others = books.filter((b) => b.bookmakerKey !== quote.bookmakerKey);
    if (others.length < ODDS_ERROR.minBooks) continue;
    const fair = weightedConsensus(others, outcomes);
    if (!fair) continue;
    for (const outcome of outcomes) {
      const price = quote.prices[outcome];
      if (price === undefined) continue;
      const ev = price * fair[outcome] - 1;
      if (ev >= ODDS_ERROR.minEv && fair[outcome] - 1 / price >= ODDS_ERROR.minGap) {
        errors.push({ bookmakerKey: quote.bookmakerKey, outcome, price, fairProb: fair[outcome], ev });
      }
    }
  }
  return errors;
}
