import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_SLIP,
  parseBankroll,
  parseStoredSlip,
  refreshSelection,
  selectionFor,
  selectionKey,
  toggleSelection,
  type Selection,
} from "@/lib/selection";

const event = { id: "evt1", homeTeam: "Arsenal", awayTeam: "Chelsea", commenceTime: new Date("2026-09-27T16:30:00Z") };
const capturedAt = new Date("2026-09-26T18:00:00Z");

const offer = (bookmakerKey: string, price: number, outcomeName = "Arsenal") => ({
  marketKey: "h2h",
  outcomeName,
  point: null,
  price,
  bookmakerKey,
  bookmakerTitle: bookmakerKey,
  capturedAt,
});

const edge = {
  marketKey: "h2h",
  outcomeName: "Arsenal",
  point: null,
  modelProb: 0.52,
  tier: "GOOD_BET",
  reasons: ["EDGE_GOOD"],
  computedAt: new Date("2026-09-26T18:00:05Z"),
};

test("a price on screen carries the model's verdict on its outcome", () => {
  const home = selectionFor(event, offer("winamax_fr", 2.1), [edge]);
  assert.deepEqual(home.verdict, { modelProb: 0.52, tier: "GOOD_BET", reasons: ["EDGE_GOOD"] });
  assert.equal(home.commenceTime, "2026-09-27T16:30:00.000Z");
  assert.equal(home.asOf, "2026-09-26T18:00:05.000Z", "the later of price capture and verdict");
  assert.equal(selectionFor(event, offer("winamax_fr", 3.4, "Draw"), [edge]).verdict, null);
  const totals = { ...offer("winamax_fr", 1.9, "Over"), marketKey: "totals", point: 3.5 };
  assert.equal(selectionFor(event, totals, [{ ...edge, marketKey: "totals", outcomeName: "Over", point: 2.5 }]).verdict, null);
});

test("clicking a price adds it, clicking it again removes it, another book swaps it", () => {
  const winamax = selectionFor(event, offer("winamax_fr", 2.1), [edge]);
  const betclic = selectionFor(event, offer("betclic_fr", 2.05), [edge]);
  const draw = selectionFor(event, offer("winamax_fr", 3.4, "Draw"), [edge]);

  const one = toggleSelection([], winamax);
  assert.equal(one.length, 1);
  assert.deepEqual(toggleSelection(one, winamax), []);
  const swapped = toggleSelection(one, betclic);
  assert.equal(swapped.length, 1);
  assert.equal(swapped[0].bookmakerKey, "betclic_fr");
  assert.equal(toggleSelection(one, draw).length, 2, "another outcome of the same match is its own selection");
  assert.notEqual(selectionKey(winamax), selectionKey(draw));
});

test("fresher data for the same offer updates it; older or identical data never does", () => {
  const held = selectionFor(event, offer("winamax_fr", 2.1), [edge]);
  const later = selectionFor(event, { ...offer("winamax_fr", 2.2), capturedAt: new Date("2026-09-26T18:30:00Z") }, [
    { ...edge, computedAt: new Date("2026-09-26T18:30:04Z") },
  ]);
  assert.equal(refreshSelection([held], later)?.[0].price, 2.2);
  assert.equal(refreshSelection([later], held), null);
  assert.equal(refreshSelection([held], held), null);
  const otherBook = selectionFor(event, { ...offer("betclic_fr", 2.3), capturedAt: new Date("2026-09-26T19:00:00Z") }, [edge]);
  assert.equal(refreshSelection([held], otherBook), null, "only the same book's price refreshes it");
});

test("the stored slip drops malformed entries and matches that have started", () => {
  const upcoming = selectionFor(event, offer("winamax_fr", 2.1), [edge]);
  const started = { ...upcoming, eventId: "evt0", commenceTime: "2026-09-26T12:00:00.000Z" };
  const raw = JSON.stringify({ bankroll: 500, mode: "combo", selections: [upcoming, started, { price: "2.1" }, null] });
  const slip = parseStoredSlip(raw, new Date("2026-09-26T20:00:00Z"));
  assert.equal(slip.bankroll, 500);
  assert.equal(slip.mode, "combo");
  assert.deepEqual(slip.selections as Selection[], [upcoming]);

  assert.deepEqual(parseStoredSlip(null, new Date()), EMPTY_SLIP);
  assert.deepEqual(parseStoredSlip("{not json", new Date()), EMPTY_SLIP);
  assert.equal(parseStoredSlip(JSON.stringify({ bankroll: -5, selections: "x" }), new Date()).bankroll, null);
});

test("bankroll input accepts French and plain amounts, nothing else", () => {
  assert.equal(parseBankroll("500"), 500);
  assert.equal(parseBankroll("1 250,50"), 1250.5);
  assert.equal(parseBankroll("1 250,5 €"), 1250.5);
  assert.equal(parseBankroll("99.999"), 100);
  assert.equal(parseBankroll("0"), null);
  assert.equal(parseBankroll("-20"), null);
  assert.equal(parseBankroll("abc"), null);
  assert.equal(parseBankroll("1,250.50"), null);
  assert.equal(parseBankroll(""), null);
});
