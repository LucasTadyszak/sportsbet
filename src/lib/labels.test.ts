import { test } from "node:test";
import assert from "node:assert/strict";
import { formatAgo, formatCount, formatDuration } from "@/lib/labels";

const NOW = new Date("2026-09-28T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("formatAgo rounds to the unit that reads best", () => {
  assert.equal(formatAgo(ago(20_000), NOW), "à l'instant");
  assert.equal(formatAgo(ago(5 * 60_000), NOW), "il y a 5 min");
  assert.equal(formatAgo(ago(59 * 60_000), NOW), "il y a 59 min");
  assert.equal(formatAgo(ago(3 * 3_600_000), NOW), "il y a 3 h");
  assert.equal(formatAgo(ago(49 * 3_600_000), NOW), "il y a 2 j");
});

test("formatDuration: seconds, then minutes and seconds, then hours and minutes", () => {
  assert.equal(formatDuration(8_400), "8 s");
  assert.equal(formatDuration(125_000), "2 min 05 s");
  assert.equal(formatDuration(3_840_000), "1 h 04 min");
  assert.equal(formatDuration(-5), "0 s");
});

test("formatCount groups thousands the French way", () => {
  assert.equal(formatCount(12345).replace(/\s/g, " "), "12 345");
  assert.equal(formatCount(7), "7");
});
