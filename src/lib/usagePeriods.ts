// The request dashboard's periods (/vestiaire/requetes): the hourly or Paris-daily buckets each one
// is charted in. Pure, so it can be tested without a database; src/lib/apiUsage.ts counts into them.
import { addDays, parisDateKey, parisStartOfDay } from "@/lib/dates";

const HOUR_MS = 60 * 60 * 1000;

export const USAGE_PERIODS = {
  "24h": { label: "24 h", buckets: 24, unit: "hour" },
  "7j": { label: "7 jours", buckets: 7, unit: "day" },
  "30j": { label: "30 jours", buckets: 30, unit: "day" },
} as const satisfies Record<string, { label: string; buckets: number; unit: "hour" | "day" }>;

export type UsagePeriod = keyof typeof USAGE_PERIODS;

export function isUsagePeriod(value: string | undefined): value is UsagePeriod {
  return value !== undefined && Object.hasOwn(USAGE_PERIODS, value);
}

/** One bar of a chart: an hour (UTC and Paris hours line up) or a Paris day. */
export type UsageBucket = { key: string; start: Date };

/**
 * The period's buckets, oldest first, the current (unfinished) one last. Hour keys are the UTC
 * hour ("2026-09-28T14"), day keys the Paris day ("2026-09-28"): the SQL of src/lib/apiUsage.ts
 * groups on the same.
 */
export function periodBuckets(period: UsagePeriod, now = new Date()): UsageBucket[] {
  const { buckets, unit } = USAGE_PERIODS[period];
  if (unit === "hour") {
    const thisHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
    return Array.from({ length: buckets }, (_, i) => {
      const start = new Date(thisHour - (buckets - 1 - i) * HOUR_MS);
      return { key: start.toISOString().slice(0, 13), start };
    });
  }
  const today = parisDateKey(now);
  return Array.from({ length: buckets }, (_, i) => {
    const key = addDays(today, i - (buckets - 1));
    return { key, start: parisStartOfDay(key) };
  });
}
