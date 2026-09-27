import { test } from "node:test";
import assert from "node:assert/strict";
import { ODDS_ERROR } from "@/lib/methodology/config";
import { detectOddsErrors, marketConsensus, type BookQuote } from "@/lib/methodology/oddsErrors";

const OUTCOMES = ["Home", "Draw", "Away"];
const isFrench = (key: string) => key.endsWith("_fr");

const quote = (bookmakerKey: string, home: number, draw: number, away: number): BookQuote => ({
  bookmakerKey,
  role: bookmakerKey === "pinnacle" ? "sharp" : "soft",
  prices: { Home: home, Draw: draw, Away: away },
});

const market = [
  quote("pinnacle", 2.0, 3.6, 4.1),
  quote("book_a", 1.95, 3.5, 4.0),
  quote("book_b", 1.97, 3.45, 3.9),
  quote("betclic_fr", 1.9, 3.4, 3.8),
];

test("a French price well above the others' fair odds is an odds error, at the others' fair probability", () => {
  const errors = detectOddsErrors([...market, quote("winamax_fr", 2.3, 3.3, 3.5)], OUTCOMES, isFrench);
  assert.equal(errors.length, 1);
  const [error] = errors;
  assert.equal(error.bookmakerKey, "winamax_fr");
  assert.equal(error.outcome, "Home");
  assert.equal(error.price, 2.3);
  // Judged against every other book, never against a consensus its own price pulled down.
  const others = marketConsensus(market, OUTCOMES)!;
  assert.ok(Math.abs(error.fairProb - others.Home) < 1e-12);
  assert.ok(Math.abs(error.ev - (2.3 * others.Home - 1)) < 1e-12);
  assert.ok(error.ev >= ODDS_ERROR.minEv);
});

test("prices in line with the market, and books that aren't candidates, are never flagged", () => {
  assert.deepEqual(detectOddsErrors(market, OUTCOMES, isFrench), []);
  const generousForeignBook = [...market, quote("book_c", 2.4, 3.9, 4.6)];
  assert.deepEqual(detectOddsErrors(generousForeignBook, OUTCOMES, isFrench), []);
});

test("the EV threshold is a floor: just under it is noise, just over it is an error", () => {
  const fair = marketConsensus(market, OUTCOMES)!.Home;
  const below = detectOddsErrors([...market, quote("winamax_fr", (1 + ODDS_ERROR.minEv - 0.01) / fair, 3.3, 3.5)], OUTCOMES, isFrench);
  assert.deepEqual(below, []);
  const above = detectOddsErrors([...market, quote("winamax_fr", (1 + ODDS_ERROR.minEv + 0.01) / fair, 3.3, 3.5)], OUTCOMES, isFrench);
  assert.equal(above.length, 1);
});

test("a longshot needs a real probability gap, not just EV that a sliver of de-vig noise can produce", () => {
  const lopsided = [quote("pinnacle", 1.25, 6.5, 12), quote("book_a", 1.22, 6.25, 11), quote("book_b", 1.24, 6.0, 11.5)];
  const fair = marketConsensus(lopsided, OUTCOMES)!.Away;

  const noisy = 1.1 / fair; // +10% EV, but under 1pp of probability
  assert.ok(fair - 1 / noisy < ODDS_ERROR.minGap);
  assert.deepEqual(detectOddsErrors([...lopsided, quote("pmu_fr", 1.2, 6.0, noisy)], OUTCOMES, isFrench), []);

  const clear = 1 / (fair - 0.03); // 3pp under the fair probability
  const errors = detectOddsErrors([...lopsided, quote("pmu_fr", 1.2, 6.0, clear)], OUTCOMES, isFrench);
  assert.deepEqual(
    errors.map((e) => e.outcome),
    ["Away"]
  );
});

test("the reference needs enough other books", () => {
  const thin = [quote("pinnacle", 2.0, 3.6, 4.1), quote("book_a", 1.95, 3.5, 4.0), quote("winamax_fr", 2.6, 3.3, 3.5)];
  assert.ok(thin.length - 1 < ODDS_ERROR.minBooks);
  assert.deepEqual(detectOddsErrors(thin, OUTCOMES, isFrench), []);
});

test("a book quoting only part of the market is still judged on what it quotes", () => {
  const partial: BookQuote = { bookmakerKey: "unibet_fr", role: "soft", prices: { Home: 2.35 } };
  const errors = detectOddsErrors([...market, partial], OUTCOMES, isFrench);
  assert.deepEqual(
    errors.map((e) => [e.bookmakerKey, e.outcome]),
    [["unibet_fr", "Home"]]
  );
  // …but can't feed the reference of the others.
  assert.deepEqual(marketConsensus([partial], OUTCOMES), null);
});

test("the market consensus counts Pinnacle double", () => {
  // Margin-free two-way prices, so the de-vigged probabilities are exactly 1/price.
  const consensus = marketConsensus(
    [
      { bookmakerKey: "pinnacle", role: "sharp", prices: { Over: 1.5, Under: 3 } },
      { bookmakerKey: "book_a", role: "soft", prices: { Over: 2, Under: 2 } },
      { bookmakerKey: "book_b", role: "soft", prices: { Over: 2, Under: 2 } },
    ],
    ["Over", "Under"]
  )!;
  assert.ok(Math.abs(consensus.Over - (2 * (2 / 3) + 0.5 + 0.5) / 4) < 1e-9);
  assert.ok(Math.abs(consensus.Over + consensus.Under - 1) < 1e-9);
});
