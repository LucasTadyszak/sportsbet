import type { UsageBucket } from "@/lib/usagePeriods";
import { formatCount } from "@/lib/labels";

const TIME_ZONE = "Europe/Paris";
const HOUR = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" });
const DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });
const DAY_MONTH = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short" });

// Read from its part: the French format of an hour alone is "14 h".
const hourOf = (date: Date) => Number(HOUR.formatToParts(date).find((part) => part.type === "hour")?.value);
const requests = (n: number) => `${formatCount(n)} requête${n > 1 ? "s" : ""}`;

/** A bucket as a tooltip and the table name it: "lun. 28 sept., 14h–15h" or "lun. 28 sept.". */
export function bucketLabel(bucket: UsageBucket, unit: "hour" | "day"): string {
  if (unit === "day") return DAY.format(bucket.start);
  const hour = hourOf(bucket.start);
  return `${DAY.format(bucket.start)}, ${hour}h–${(hour + 1) % 24}h`;
}

/** Axis ticks: every six hours, every day of a week, every seventh day of a month (counted back from today). */
function tickLabel(bucket: UsageBucket, i: number, count: number, unit: "hour" | "day"): string | null {
  if (unit === "hour") return hourOf(bucket.start) % 6 === 0 ? `${hourOf(bucket.start)}h` : null;
  if (count <= 7) return WEEKDAY.format(bucket.start);
  return (count - 1 - i) % 7 === 0 ? DAY_MONTH.format(bucket.start) : null;
}

/**
 * One API's requests per bucket, as columns from one baseline: one hue, no y-axis — the peak
 * column carries its value, the tooltip and the table view the others. Each chart has its own
 * scale (volumes differ by orders of magnitude from one API to the next): read the peak label.
 */
export function UsageBars({ series, buckets, unit, label }: { series: number[]; buckets: UsageBucket[]; unit: "hour" | "day"; label: string }) {
  const max = Math.max(...series);
  // The latest bucket at the peak carries the label.
  const peak = series.lastIndexOf(max);
  const total = series.reduce((sum, n) => sum + n, 0);
  const summary = `${label} : ${requests(total)}${max > 0 ? `, au plus ${requests(max)} (${bucketLabel(buckets[peak], unit)})` : ""}`;
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-1">
      <div role="img" aria-label={summary} className="flex h-20 items-end gap-0.5 pt-4">
        {series.map((n, i) => {
          const height = max > 0 ? (n / max) * 100 : 0;
          const current = i === series.length - 1;
          return (
            <div
              key={buckets[i].key}
              title={`${bucketLabel(buckets[i], unit)}${current ? " (en cours)" : ""} : ${requests(n)}`}
              className="group relative flex h-full min-w-0 flex-1 items-end justify-center"
            >
              {n > 0 ? (
                <span
                  className="block w-full max-w-6 bg-series-1 transition-colors duration-150 group-hover:bg-seq-6"
                  style={{ height: `max(${height}%, 2px)` }}
                />
              ) : null}
              {i === peak && max > 0 ? (
                <span
                  className="figures pointer-events-none absolute whitespace-nowrap text-xs font-bold leading-none text-fg-muted"
                  style={{ bottom: `calc(${height}% + 3px)` }}
                >
                  {formatCount(n)}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="h-px bg-border" aria-hidden />
      <div className="flex gap-0.5 font-cond text-xs font-bold uppercase leading-4 tracking-wide text-fg-muted" aria-hidden>
        {buckets.map((bucket, i) => (
          <span key={bucket.key} className="flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap">
            {tickLabel(bucket, i, buckets.length, unit)}
          </span>
        ))}
      </div>
    </figure>
  );
}
