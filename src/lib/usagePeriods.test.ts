import { test } from "node:test";
import assert from "node:assert/strict";
import { isUsagePeriod, periodBuckets } from "@/lib/usagePeriods";

test("24 h: one bucket per UTC hour, the current one last", () => {
  const buckets = periodBuckets("24h", new Date("2026-09-28T14:37:12Z"));
  assert.equal(buckets.length, 24);
  assert.equal(buckets.at(-1)?.key, "2026-09-28T14");
  assert.equal(buckets.at(-1)?.start.toISOString(), "2026-09-28T14:00:00.000Z");
  assert.equal(buckets[0].key, "2026-09-27T15");
});

test("7 and 30 days: one bucket per Paris day, today last", () => {
  // 23:30 UTC on the 27th is already the 28th in Paris.
  const week = periodBuckets("7j", new Date("2026-09-27T23:30:00Z"));
  assert.deepEqual(
    week.map((b) => b.key),
    ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"]
  );
  assert.equal(week.at(-1)?.start.toISOString(), "2026-09-27T22:00:00.000Z");
  assert.equal(periodBuckets("30j", new Date("2026-09-28T10:00:00Z")).length, 30);
});

test("days start at Paris midnight on both sides of the clocks going back", () => {
  const days = periodBuckets("7j", new Date("2026-10-28T10:00:00Z"));
  const starts = Object.fromEntries(days.map((b) => [b.key, b.start.toISOString()]));
  assert.equal(starts["2026-10-25"], "2026-10-24T22:00:00.000Z"); // summer time, UTC+2
  assert.equal(starts["2026-10-26"], "2026-10-25T23:00:00.000Z"); // winter time, UTC+1
});

test("only the known periods are accepted from the URL", () => {
  assert.equal(isUsagePeriod("24h"), true);
  assert.equal(isUsagePeriod("30j"), true);
  assert.equal(isUsagePeriod("1an"), false);
  assert.equal(isUsagePeriod("toString"), false);
  assert.equal(isUsagePeriod(undefined), false);
});
