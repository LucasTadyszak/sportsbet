// Day-boundary and formatting helpers, anchored to Europe/Paris so "Aujourd'hui"
// matches the French audience's calendar day regardless of the server's own timezone.

const TIME_ZONE = "Europe/Paris";

export function parisDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** UTC instant corresponding to 00:00 Europe/Paris on the given YYYY-MM-DD day. */
export function parisStartOfDay(dateKey: string): Date {
  const utcGuess = new Date(`${dateKey}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcGuess);
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

export function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parisStartOfDay(value).getTime());
}

export function formatKickoff(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDayLabel(dateKey: string): string {
  const todayKey = parisDateKey(new Date());
  if (dateKey === todayKey) return "Aujourd'hui";
  if (dateKey === addDays(todayKey, 1)) return "Demain";
  if (dateKey === addDays(todayKey, -1)) return "Hier";
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/** "20:45" in Paris time — the board already groups by day, so rows only need the hour. */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
}

/** "sam. 27 sept." in Paris time. */
export function formatShortDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short" }).format(date);
}
