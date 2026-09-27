import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClubColors } from "@/lib/teamColors";

test("parses football-data.org kit colours in order", () => {
  assert.deepEqual(parseClubColors("Red / White"), ["#d7141a", "#ffffff"]);
  assert.deepEqual(parseClubColors("Claret / Sky Blue"), ["#7a263a", "#6cabdd"]);
  assert.deepEqual(parseClubColors("Navy Blue / White / Red"), ["#1b2a4a", "#ffffff", "#d7141a"]);
});

test("accepts other separators and casing", () => {
  assert.deepEqual(parseClubColors("black-white"), ["#111111", "#ffffff"]);
  assert.deepEqual(parseClubColors("Blue, Yellow & Red"), ["#1d4ed8", "#fcd116", "#d7141a"]);
  assert.deepEqual(parseClubColors("Red and Black"), ["#d7141a", "#111111"]);
});

test("drops qualifiers it doesn't know, and skips words it can't read", () => {
  assert.deepEqual(parseClubColors("Deep Sky Blue / Mystery"), ["#6cabdd"]);
  assert.deepEqual(parseClubColors("Unknown"), []);
  assert.deepEqual(parseClubColors(null), []);
  assert.deepEqual(parseClubColors(""), []);
});

test("keeps at most three distinct colours", () => {
  assert.deepEqual(parseClubColors("Red / Red / White / Blue / Green"), ["#d7141a", "#ffffff", "#1d4ed8"]);
});
