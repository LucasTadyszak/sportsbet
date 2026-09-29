// Day-boundary and formatting helpers, anchored to Europe/Paris so "Aujourd'hui"
// matches the French audience's calendar day regardless of the server's own timezone.

const TIME_ZONE = "Europe/Paris";

// Built once: creating an Intl.DateTimeFormat costs about 80 times what formatting with one does,
// and a board formats a few hundred dates.
const DATE_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
const WALL_CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});
const KICKOFF = new Intl.DateTimeFormat("fr-FR", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const DAY_LABEL = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "short" });
const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
const TIME = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" });

export function parisDateKey(date: Date): string {
  return DATE_KEY.format(date);
}

/** UTC instant corresponding to 00:00 Europe/Paris on the given YYYY-MM-DD day. */
export function parisStartOfDay(dateKey: string): Date {
  const utcGuess = new Date(`${dateKey}T00:00:00Z`);
  const parts = WALL_CLOCK.formatToParts(utcGuess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  // asIfUtc treats the Paris wall-clock reading as UTC, so the gap to utcGuess is exactly the Paris offset at that instant.
  const offsetMs = asIfUtc - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offsetMs);
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Kicked off already: its pre-match odds are no longer on offer. */
export function hasKickedOff(commenceTime: Date, now = new Date()): boolean {
  return commenceTime.getTime() <= now.getTime();
}

export function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parisStartOfDay(value).getTime());
}

export function formatKickoff(date: Date): string {
  return KICKOFF.format(date);
}

export function formatDayLabel(dateKey: string): string {
  const todayKey = parisDateKey(new Date());
  if (dateKey === todayKey) return "Aujourd'hui";
  if (dateKey === addDays(todayKey, 1)) return "Demain";
  if (dateKey === addDays(todayKey, -1)) return "Hier";
  const [y, m, d] = dateKey.split("-").map(Number);
  return DAY_LABEL.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "lundi 28 septembre", the day a board shows spelled out (a year is left implicit). */
export function formatLongDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return LONG_DAY.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "20:45" in Paris time — the board already groups by day, so rows only need the hour. */
export function formatTime(date: Date): string {
  return TIME.format(date);
}

/** "sam. 27 sept." in Paris time. */
export function formatShortDay(date: Date): string {
  return SHORT_DAY.format(date);
}
