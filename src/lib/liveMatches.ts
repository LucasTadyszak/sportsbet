// Free API Live Football Data's matches (src/lib/liveFootballApi.ts): reading its payloads, where a
// match stands, and when to read them again. Pure (unit tested): the fetching and storing are in
// src/lib/refreshLiveMatches.ts.
//
// The API relays FotMob's data. A match is { id, leagueId?, home: { id, name, longName?, score? },
// away, status: { utcTime, started, finished, cancelled, scoreStr?, reason?: { short, long… },
// liveTime?: { short } } }, wherever it sits: a league's season list, a day's list (flat, or
// grouped by league: { id, primaryId, parentLeagueId, name, matches }), the live feed. So matches
// are looked for anywhere in a payload rather than at one path, and each field is read
// defensively (ids can come as strings, a list may only give the score as "2 - 1" in scoreStr).
import { addDays, parisStartOfDay } from "@/lib/dates";

export type LiveStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled" | "abandoned";

export type ApiTeam = {
  id: number | null;
  /** Full name ("Manchester City"), as the board shows club names. */
  name: string;
  /** Only once the match has started. */
  score: number | null;
};

export type ApiMatch = {
  id: number;
  /**
   * League ids the payload files the match under: its own `leagueId`, then those of the league
   * group around it — a group stage can have an id of its own under its competition's.
   */
  leagueIds: number[];
  kickoff: Date;
  home: ApiTeam;
  away: ApiTeam;
  status: LiveStatus;
  /** During the half-time break (status "live"). */
  halftime: boolean;
  /** Match clock while live, e.g. "37'" or "45+2'". */
  minute: string | null;
  /** The API's short status label ("FT", "AET", "Pen", "PP"…): how a finished match ended. */
  reason: string | null;
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** An ISO time (read as UTC when it carries no offset), or an epoch timestamp in ms or seconds. */
function toInstant(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return new Date(value > 1e11 ? value : value * 1000);
  const raw = text(value)?.replace(/^(\d{4}-\d{2}-\d{2}) (?=\d)/, "$1T");
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return null;
  const date = new Date(/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTeam(value: unknown): ApiTeam | null {
  if (!isObject(value)) return null;
  const name = text(value.longName) ?? text(value.name) ?? text(value.shortName);
  if (!name) return null;
  return { id: toInt(value.id), name, score: toInt(value.score) };
}

function parseStatus(status: Json): LiveStatus {
  const reason = isObject(status.reason) ? status.reason : {};
  const short = text(reason.short) ?? "";
  // Keys ("postponed") and labels, full or cut short ("Postp.", "PP", "Canc.", "Ab").
  const words = [reason.short, reason.shortKey, reason.long, reason.longKey].map(text).join(" ").toLowerCase();
  if (/postp/.test(words) || /^pp$/i.test(short)) return "postponed";
  if (/abandon/.test(words) || /^ab/i.test(short)) return "abandoned";
  if (status.cancelled === true || /canc/.test(words)) return "cancelled";
  if (status.finished === true || status.awarded === true) return "finished";
  if (status.started === true || status.ongoing === true) return "live";
  return "scheduled";
}

/** "2 - 1" → [2, 1]. */
function parseScoreStr(value: unknown): [number, number] | null {
  const match = text(value)?.match(/(\d+)\s*[-–:]\s*(\d+)/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function parseMatch(node: Json, groupLeagueIds: number[]): ApiMatch | null {
  const id = toInt(node.id);
  const home = parseTeam(node.home);
  const away = parseTeam(node.away);
  if (id === null || !home || !away) return null;
  const status = isObject(node.status) ? node.status : {};
  const kickoff = toInstant(status.utcTime) ?? toInstant(node.utcTime) ?? toInstant(node.timeTS);
  if (!kickoff) return null;

  const state = parseStatus(status);
  const liveTime = isObject(status.liveTime) ? status.liveTime : {};
  const clock = text(liveTime.short)?.replace(/[’‘`´]/g, "'") ?? null;
  const reasonShort = isObject(status.reason) ? text(status.reason.short) : null;
  const halftime = state === "live" && (/^(ht|mt)$/i.test(clock ?? "") || /^ht$/i.test(reasonShort ?? ""));

  // A match that hasn't started can still carry 0-0: its score only means something once it has.
  const started = state === "live" || state === "finished" || state === "abandoned";
  const fromText = parseScoreStr(status.scoreStr);
  const scores: [number | null, number | null] = !started
    ? [null, null]
    : home.score !== null && away.score !== null
      ? [home.score, away.score]
      : (fromText ?? [null, null]);

  const ownLeagueIds = [node.leagueId, node.parentLeagueId].map(toInt).filter((leagueId) => leagueId !== null);
  return {
    id,
    leagueIds: Array.from(new Set([...ownLeagueIds, ...groupLeagueIds])),
    kickoff,
    home: { ...home, score: scores[0] },
    away: { ...away, score: scores[1] },
    status: state,
    halftime,
    minute: state === "live" && !halftime ? clock : null,
    reason: reasonShort,
  };
}

const MAX_DEPTH = 12;

function collect(node: unknown, found: Map<number, ApiMatch>, groupLeagueIds: number[], depth: number) {
  if (depth > MAX_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, found, groupLeagueIds, depth + 1);
    return;
  }
  if (!isObject(node)) return;
  const match = parseMatch(node, groupLeagueIds);
  if (match) {
    found.set(match.id, match);
    return;
  }
  // A league group hands its ids down to its matches: its competition's first.
  const ids = Array.isArray(node.matches) ? [node.primaryId, node.parentLeagueId, node.id].map(toInt).filter((leagueId) => leagueId !== null) : [];
  const inner = ids.length > 0 ? Array.from(new Set([...ids, ...groupLeagueIds])) : groupLeagueIds;
  for (const value of Object.values(node)) {
    if (typeof value === "object" && value !== null) collect(value, found, inner, depth + 1);
  }
}

/** Every match in a payload of the API, whatever its layout; one per match id. */
export function parseMatches(payload: unknown): ApiMatch[] {
  const found = new Map<number, ApiMatch>();
  collect(payload, found, [], 0);
  return Array.from(found.values());
}

/** The API's date (YYYYMMDD, UTC) of an instant. */
function apiDate(instant: Date): string {
  return instant.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * The API dates a board day (Europe/Paris, YYYY-MM-DD) spans: the day's lists are by UTC date, and
 * a Paris day starts the evening before in UTC — when some matches in the Americas kick off.
 */
export function apiDatesOf(dayKey: string): string[] {
  const start = parisStartOfDay(dayKey);
  const end = new Date(parisStartOfDay(addDays(dayKey, 1)).getTime() - 1);
  return Array.from(new Set([apiDate(start), apiDate(end)]));
}

/** An API date's span, [start, end), in UTC. */
export function apiDateSpan(date: string): { start: Date; end: Date } {
  const start = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

// FotMob's image CDN, which the API's logo endpoints point at: a logo per team and per league id,
// no request to the API needed. Allowed in next.config.ts and src/lib/logoMatch.ts.
const FOTMOB_LOGOS = "https://images.fotmob.com/image_resources/logo";

export function fotmobTeamLogo(teamId: number | null): string | null {
  return teamId === null ? null : `${FOTMOB_LOGOS}/teamlogo/${teamId}.png`;
}

export function fotmobLeagueLogo(leagueId: number): string {
  return `${FOTMOB_LOGOS}/leaguelogo/${leagueId}.png`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// The Odds API is pre-match only: without the API's status, a match is taken to be on for this
// long after its kick-off.
const ASSUMED_MATCH_LENGTH_MS = 3 * HOUR_MS;
// A match the API still says is on this long after kick-off is stuck: it's over for the board.
const MAX_LIVE_MS = 6 * HOUR_MS;

/** Upcoming, on, or done for the day (finished, but also postponed, cancelled or abandoned). */
export type MatchPhase = "upcoming" | "live" | "done";

/** Where a match stands: from the API's status when it follows the match, else from its kick-off time. */
export function matchPhase(kickoff: Date, live: { status: LiveStatus } | null, now: Date): MatchPhase {
  const elapsed = now.getTime() - kickoff.getTime();
  if (!live) return elapsed < 0 ? "upcoming" : elapsed <= ASSUMED_MATCH_LENGTH_MS ? "live" : "done";
  if (live.status === "live") return elapsed <= MAX_LIVE_MS ? "live" : "done";
  // Not started yet: late, or kick-off moved without the list saying so yet.
  if (live.status === "scheduled") return elapsed <= ASSUMED_MATCH_LENGTH_MS ? "upcoming" : "done";
  return "done";
}

/** A stored match, as the refresh policy sees it. */
export type TrackedMatch = { kickoff: Date; status: LiveStatus; liveUpdatedAt: Date | null };

/** How often the live feed is read while a followed match is on. */
export const LIVE_FEED_INTERVAL_MS = MINUTE_MS;

// A live match the feed hasn't reported for this long has most likely finished (the feed only
// lists matches in play): its league's list is read again for the final score.
const LIVE_FEED_SILENCE_MS = 3 * MINUTE_MS;

/**
 * How long a list of matches (a league's season, or a day's) stays fresh, from its followed
 * matches around now (kick-off within the last 12 hours or the next 36): every few minutes while
 * one of them should have a result soon, hourly while it has some today or tomorrow (kick-off
 * times still move), twice a day otherwise.
 */
export function listRefreshIntervalMs(nearby: TrackedMatch[], now: Date): number {
  const t = now.getTime();
  const sinceKickoff = (m: TrackedMatch) => t - m.kickoff.getTime();
  const droppedFromFeed = nearby.some(
    (m) =>
      m.status === "live" &&
      sinceKickoff(m) <= MAX_LIVE_MS &&
      (m.liveUpdatedAt === null || t - m.liveUpdatedAt.getTime() > LIVE_FEED_SILENCE_MS)
  );
  if (droppedFromFeed) return 3 * MINUTE_MS;
  const due = nearby.some((m) => m.status === "scheduled" && sinceKickoff(m) >= 0 && sinceKickoff(m) <= 12 * HOUR_MS);
  if (due) return 10 * MINUTE_MS;
  const soon = nearby.some((m) => sinceKickoff(m) < 0 && sinceKickoff(m) >= -36 * HOUR_MS);
  if (soon) return HOUR_MS;
  return 12 * HOUR_MS;
}

/** Whether the live feed is worth reading: a followed match is on, or kicking off. */
export function needsLiveFeed(nearby: TrackedMatch[], now: Date): boolean {
  const t = now.getTime();
  return nearby.some((m) => {
    const sinceKickoff = t - m.kickoff.getTime();
    if (m.status === "live") return sinceKickoff <= MAX_LIVE_MS;
    return m.status === "scheduled" && sinceKickoff >= -2 * MINUTE_MS && sinceKickoff <= ASSUMED_MATCH_LENGTH_MS;
  });
}
