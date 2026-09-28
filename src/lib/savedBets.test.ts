import { test } from "node:test";
import assert from "node:assert/strict";
import { profitUnits } from "@/lib/methodology/settlement";
import {
  betPrice,
  finalResult,
  matchesInPlay,
  newSavedBet,
  parseSavedBets,
  settleBet,
  summarizeBets,
  unsettledEventIds,
  withResults,
  type MatchResult,
  type SavedBet,
} from "@/lib/savedBets";
import type { Selection } from "@/lib/selection";

const now = new Date("2026-09-27T12:00:00Z");

const selection = (eventId: string, outcomeName: string, price: number, extra: Partial<Selection> = {}): Selection => ({
  eventId,
  homeTeam: "Arsenal",
  awayTeam: "Chelsea",
  commenceTime: "2026-09-27T16:30:00.000Z",
  marketKey: "h2h",
  outcomeName,
  point: null,
  price,
  bookmakerKey: "winamax_fr",
  bookmakerTitle: "Winamax",
  verdict: null,
  asOf: "2026-09-27T11:00:00.000Z",
  ...extra,
});

const final = (home: number, away: number): MatchResult => ({
  state: "final",
  kickoff: "2026-09-27T16:30:00.000Z",
  home,
  away,
  label: "Terminé",
});

const single = (s: Selection, stake = 10) => newSavedBet([s], stake, 1.5, now, `bet-${s.eventId}`);

test("a saved bet keeps its selections as they were on screen, without a result yet", () => {
  const bet = newSavedBet([selection("evt1", "Arsenal", 2.1), selection("evt2", "Draw", 3.4)], 5, 0, now, "b1");
  assert.equal(bet.savedAt, "2026-09-27T12:00:00.000Z");
  assert.equal(bet.legs.length, 2);
  assert.deepEqual(
    bet.legs.map((leg) => [leg.eventId, leg.outcomeName, leg.price, leg.result]),
    [
      ["evt1", "Arsenal", 2.1, null],
      ["evt2", "Draw", 3.4, null],
    ]
  );
  assert.ok(Math.abs(betPrice(bet) - 7.14) < 1e-9, "a combo's odds are the product of its legs'");
});

test("a single bet settles on its match's 90-minute score", () => {
  const bet = single(selection("evt1", "Arsenal", 2.1));
  assert.deepEqual(settleBet(bet, {}), { status: "pending", legs: ["pending"], price: 2.1, payout: null, profit: null });
  assert.deepEqual(settleBet(bet, { evt1: final(2, 1) }), { status: "won", legs: ["won"], price: 2.1, payout: 21, profit: 11 });
  assert.equal(settleBet(bet, { evt1: final(1, 1) }).profit, -10);
  const live: MatchResult = { ...final(3, 0), state: "live", label: "80'" };
  assert.equal(settleBet(bet, { evt1: live }).status, "pending", "a live score settles nothing");
  const void_: MatchResult = { ...final(0, 0), state: "void", home: null, away: null };
  assert.deepEqual(settleBet(bet, { evt1: void_ }), { status: "void", legs: ["void"], price: 2.1, payout: 10, profit: 0 });
});

test("totals lines settle like the journal's, half results included, with the same profit", () => {
  const over = (point: number) => single(selection("evt1", "Over", 2, { marketKey: "totals", point }));
  assert.equal(settleBet(over(2.5), { evt1: final(2, 1) }).status, "won");
  assert.equal(settleBet(over(3), { evt1: final(2, 1) }).status, "push");
  const quarter = settleBet(over(2.75), { evt1: final(2, 1) });
  assert.equal(quarter.status, "half_won");
  assert.equal(quarter.profit, profitUnits("half_won", 2, 10));
  const halfLost = settleBet(over(3.25), { evt1: final(2, 1) });
  assert.equal(halfLost.status, "half_lost");
  assert.equal(halfLost.profit, profitUnits("half_lost", 2, 10));
});

test("a combo is lost as soon as one leg is, and otherwise waits for every leg", () => {
  const combo = newSavedBet([selection("evt1", "Arsenal", 2), selection("evt2", "Chelsea", 3)], 10, 0, now, "c1");
  assert.equal(settleBet(combo, { evt1: final(2, 0) }).status, "pending");
  const lost = settleBet(combo, { evt1: final(0, 2) });
  assert.deepEqual([lost.status, lost.legs, lost.payout, lost.profit], ["lost", ["lost", "pending"], 0, -10]);
  const won = settleBet(combo, { evt1: final(2, 0), evt2: final(0, 1) });
  assert.deepEqual([won.status, won.payout, won.profit], ["won", 60, 50]);
});

test("a void leg counts as odds of 1 in a combo; a combo of void legs is refunded", () => {
  const combo = newSavedBet([selection("evt1", "Arsenal", 2), selection("evt2", "Chelsea", 3)], 10, 0, now, "c1");
  const cancelled: MatchResult = { ...final(0, 0), state: "void", home: null, away: null };
  assert.deepEqual(settleBet(combo, { evt1: final(1, 0), evt2: cancelled }).payout, 20);
  assert.equal(settleBet(combo, { evt1: cancelled, evt2: cancelled }).status, "void");
  const halfLost = newSavedBet([selection("evt1", "Arsenal", 1.5), selection("evt2", "Under", 1.9, { marketKey: "totals", point: 2.75 })], 10, 0, now, "c2");
  const outcome = settleBet(halfLost, { evt1: final(2, 0), evt2: final(2, 1) });
  assert.deepEqual(outcome.legs, ["won", "half_lost"]);
  assert.equal(outcome.status, "half_lost", "half the stake back on a leg, times 1.5, is less than the stake");
  assert.equal(outcome.payout, 7.5);
});

test("results kept on the bet settle it without asking again", () => {
  const bets = [single(selection("evt1", "Arsenal", 2.1)), single(selection("evt2", "Draw", 3.4))];
  assert.deepEqual(unsettledEventIds(bets), ["evt1", "evt2"]);
  const live: MatchResult = { ...final(1, 1), state: "live", label: "60'" };
  assert.equal(withResults(bets, { evt2: live }), null, "only a final result is kept");
  const kept = withResults(bets, { evt1: final(2, 1), evt2: live });
  assert.ok(kept);
  assert.deepEqual(kept[0].legs[0].result, { home: 2, away: 1 });
  assert.equal(kept[1], bets[1], "bets without news stay as they are");
  assert.deepEqual(unsettledEventIds(kept), ["evt2"]);
  assert.equal(settleBet(kept[0]).status, "won");
  assert.equal(withResults(kept, { evt1: final(0, 3) }), null, "a kept result is never overwritten");
  assert.equal(finalResult({ ...final(0, 0), state: "waiting", label: "Après prol." }), null);
});

test("the summary counts decided bets only, and the stakes still at play apart", () => {
  const bets: SavedBet[] = [
    single(selection("evt1", "Arsenal", 2.1)),
    single(selection("evt2", "Draw", 3.4), 20),
    single(selection("evt3", "Chelsea", 1.8)),
    single(selection("evt4", "Arsenal", 1.5)),
  ];
  const cancelled: MatchResult = { ...final(0, 0), state: "void", home: null, away: null };
  const fresh = { evt1: final(2, 1), evt2: final(2, 1), evt4: cancelled };
  const summary = summarizeBets(bets.map((bet) => ({ bet, outcome: settleBet(bet, fresh) })));
  assert.deepEqual(summary, {
    pending: 1,
    pendingStake: 10,
    wins: 1,
    losses: 1,
    pushes: 0,
    voids: 1,
    staked: 30,
    profit: -9,
    roi: -0.3,
  });
  assert.equal(summarizeBets([]).roi, null);
});

test("results are read again every minute only around the matches being played", () => {
  const at = (state: MatchResult["state"], kickoff: string): MatchResult => ({ state, kickoff, home: null, away: null, label: null });
  assert.equal(matchesInPlay({ a: at("live", "2026-09-27T10:00:00Z") }, now), true);
  assert.equal(matchesInPlay({ a: at("upcoming", "2026-09-27T12:05:00Z") }, now), true, "about to kick off");
  assert.equal(matchesInPlay({ a: at("upcoming", "2026-09-28T12:00:00Z") }, now), false);
  assert.equal(matchesInPlay({ a: at("waiting", "2026-09-27T10:30:00Z") }, now), true, "the final score is due any minute");
  assert.equal(matchesInPlay({ a: at("waiting", "2026-09-26T20:00:00Z") }, now), false);
  assert.equal(matchesInPlay({ a: at("final", "2026-09-27T10:00:00Z") }, now), false);
});

test("the stored bets drop anything malformed", () => {
  const bet = single(selection("evt1", "Arsenal", 2.1));
  const settled = { ...bet, id: "b2", legs: [{ ...bet.legs[0], result: { home: 1, away: 0 } }] };
  const raw = JSON.stringify({
    bets: [bet, settled, { ...bet, stake: 0 }, { ...bet, legs: [] }, { ...bet, legs: [{ ...bet.legs[0], result: { home: -1, away: 0 } }] }, null],
  });
  assert.deepEqual(parseSavedBets(raw), [bet, settled]);
  assert.deepEqual(parseSavedBets(null), []);
  assert.deepEqual(parseSavedBets("{nope"), []);
  assert.deepEqual(parseSavedBets(JSON.stringify([bet])), []);
});
