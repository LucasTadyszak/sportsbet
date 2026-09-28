// Keeps LiveMatch (every match of the followed competitions, src/lib/liveCompetitions.ts) up to
// date from Free API Live Football Data, within its hourly cap (src/lib/liveFootballApi.ts):
// - the day lists (/football-get-matches-by-date, one request per UTC date: every match of the
//   day, all leagues, the followed ones kept) of the days the board shows — today, the next two
//   and the day viewed: those days are complete and current whatever the league lists say;
// - each followed competition's list (one request: its whole season), for the rest of the
//   calendar. A list with nothing to come — a competition between editions, or a list still on
//   last season — is only read again once a day;
// - the live feed (one request: every match in play, worldwide), read at most once a minute and
//   only while a followed match is on, for their score and clock.
// A list is read again more or less often depending on what its matches are doing
// (listRefreshIntervalMs). Runs as the board is served (whatever is due), from `npm run
// refresh:matches` and from /api/refresh-matches. Every read is claimed in FetchLog before it goes
// out, so concurrent runs (several page views, a cron) never make the same request twice.
import type { LiveMatch } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, parisDateKey, parisStartOfDay } from "@/lib/dates";
import { isLiveFootballConfigured, liveFootballGet, LiveFootballRateLimitError } from "@/lib/liveFootballApi";
import { followedCompetitionOf, followedLiveCompetitions, type LiveCompetition } from "@/lib/liveCompetitions";
import {
  LIVE_FEED_INTERVAL_MS,
  apiDateSpan,
  apiDatesOf,
  listRefreshIntervalMs,
  needsLiveFeed,
  parseMatches,
  type ApiMatch,
  type LiveStatus,
  type TrackedMatch,
} from "@/lib/liveMatches";

export const LEAGUE_MATCHES_PATH = "/football-get-all-matches-by-league";
export const DAY_MATCHES_PATH = "/football-get-matches-by-date";
const LIVE_FEED_PATH = "/football-current-live";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
// A failed read is due again this soon, whatever its usual interval.
const RETRY_MS = 5 * MINUTE_MS;
// How often a league list with no match to come is read again.
const ENDED_LIST_INTERVAL_MS = 24 * HOUR_MS;
// Reads made at the same time.
const CONCURRENCY = 3;
// While a match is on, the live feed is ahead of the lists: they don't overwrite a score and clock
// the feed reported this recently.
const LIVE_FEED_AUTHORITY_MS = 3 * MINUTE_MS;
// The days after today whose day lists are always kept current: the board's fallback shows the
// next matches when the day viewed has none.
const DAYS_AHEAD = 2;

const leagueKey = (leagueId: number) => `live-football:league:${leagueId}`;
// Present while the league's last list had no match to come (see ENDED_LIST_INTERVAL_MS).
const endedKey = (leagueId: number) => `live-football:league-ended:${leagueId}`;
const dayKey = (date: string) => `live-football:date:${date}`;
const LIVE_FEED_KEY = "live-football:live";
// Present while a resource's last read failed: its "lastFetchedAt" is when to try again.
const retryKey = (resourceKey: string) => `${resourceKey}:retry`;
/** When a read last succeeded: the board says how fresh its matches are. */
export const LIVE_SYNC_OK_KEY = "live-football:ok";

export type LiveRefreshSummary = {
  /** false without RAPIDAPI_KEY: nothing was fetched. */
  configured: boolean;
  /** Every day list read (or tried): its matches of followed competitions, and the others. */
  days: { date: string; kept: number; others: number; error?: string }[];
  /** Every league list read (or tried); the others were fresh, or read by another run. */
  leagues: { leagueId: number; name: string; matches: number; upcoming: number; last?: Date; error?: string }[];
  /** The live feed, when this run read it. */
  live?: { inPlay: number; updated: number; error?: string };
  /** The hourly cap was reached: nothing more is fetched until then. */
  capReachedUntil?: Date;
  /** The run itself failed (e.g. the database is unreachable). */
  error?: string;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Takes the read of a resource unless someone took it after `notAfter`, and marks it read now;
 * false when another run got there first. Each statement is atomic, so two runs can't both take it.
 */
async function claim(resourceKey: string, notAfter: Date): Promise<boolean> {
  const now = new Date();
  const taken = await prisma.fetchLog.updateMany({ where: { resourceKey, lastFetchedAt: { lte: notAfter } }, data: { lastFetchedAt: now } });
  if (taken.count > 0) return true;
  const created = await prisma.fetchLog.createMany({ data: [{ resourceKey, lastFetchedAt: now }], skipDuplicates: true });
  return created.count > 0;
}

async function setFetchLog(resourceKey: string, at: Date) {
  await prisma.fetchLog.upsert({ where: { resourceKey }, create: { resourceKey, lastFetchedAt: at }, update: { lastFetchedAt: at } });
}

/** A failed read is tried again when the cap frees a slot, else a few minutes later — whatever its interval. */
async function afterFailure(resourceKey: string, err: unknown, summary: LiveRefreshSummary) {
  const at = err instanceof LiveFootballRateLimitError ? err.retryAt : new Date(Date.now() + RETRY_MS);
  if (err instanceof LiveFootballRateLimitError) summary.capReachedUntil = err.retryAt;
  await setFetchLog(retryKey(resourceKey), at).catch(() => undefined);
}

async function afterSuccess(resourceKey: string) {
  await prisma.fetchLog.deleteMany({ where: { resourceKey: retryKey(resourceKey) } });
  await setFetchLog(LIVE_SYNC_OK_KEY, new Date());
}

/** What the API says about where a match stands. */
function stateOf(match: ApiMatch) {
  return {
    status: match.status,
    homeScore: match.home.score,
    awayScore: match.away.score,
    halftime: match.halftime,
    minute: match.minute,
    reason: match.reason,
  };
}

function rowOf(leagueId: number, match: ApiMatch) {
  return {
    leagueId,
    kickoff: match.kickoff,
    homeTeamId: match.home.id,
    homeTeam: match.home.name,
    awayTeamId: match.away.id,
    awayTeam: match.away.name,
    ...stateOf(match),
  };
}

function differs(current: LiveMatch, next: Partial<LiveMatch>): boolean {
  return Object.entries(next).some(([key, value]) => {
    const before = current[key as keyof LiveMatch];
    if (value instanceof Date) return !(before instanceof Date) || before.getTime() !== value.getTime();
    return before !== value;
  });
}

/**
 * Writes matches of a list, each under the followed competition it belongs to: new ones in one
 * go, and only the ones that changed otherwise. A match with no competition (`leagueId` null) is
 * only updated if it's already known.
 */
async function storeMatches(entries: { leagueId: number | null; match: ApiMatch }[]) {
  if (entries.length === 0) return;
  const existing = new Map(
    (await prisma.liveMatch.findMany({ where: { id: { in: entries.map((e) => e.match.id) } } })).map((row) => [row.id, row])
  );
  const now = Date.now();
  const created = [];
  for (const { leagueId, match } of entries) {
    const current = existing.get(match.id);
    if (!current) {
      if (leagueId !== null) created.push({ id: match.id, ...rowOf(leagueId, match) });
      continue;
    }
    const row = rowOf(leagueId ?? current.leagueId, match);
    const feedAhead =
      current.status === "live" &&
      row.status === "live" &&
      current.liveUpdatedAt !== null &&
      now - current.liveUpdatedAt.getTime() < LIVE_FEED_AUTHORITY_MS;
    const data = feedAhead
      ? { leagueId: row.leagueId, kickoff: row.kickoff, homeTeamId: row.homeTeamId, homeTeam: row.homeTeam, awayTeamId: row.awayTeamId, awayTeam: row.awayTeam }
      : row;
    if (differs(current, data)) await prisma.liveMatch.update({ where: { id: match.id }, data });
  }
  if (created.length > 0) await prisma.liveMatch.createMany({ data: created, skipDuplicates: true });
}

/** A read that is due. */
type Due = {
  key: string;
  /** Taken unless another run read it after this. */
  notAfter: Date;
  overdueMs: number;
};

/** A day's list: its matches of followed competitions, and fresher states for known matches. */
async function refreshDay(due: Due & { date: string }, followed: LiveCompetition[], summary: LiveRefreshSummary) {
  if (summary.capReachedUntil || !(await claim(due.key, due.notAfter))) return;
  const entry: LiveRefreshSummary["days"][number] = { date: due.date, kept: 0, others: 0 };
  summary.days.push(entry);
  try {
    const matches = parseMatches(await liveFootballGet(DAY_MATCHES_PATH, { date: due.date }));
    const entries = matches.map((match) => ({ leagueId: followedCompetitionOf(match.leagueIds, followed)?.leagueId ?? null, match }));
    await storeMatches(entries);
    entry.kept = entries.filter((e) => e.leagueId !== null).length;
    entry.others = entries.length - entry.kept;
    await afterSuccess(due.key);
  } catch (err) {
    entry.error = errorMessage(err);
    await afterFailure(due.key, err, summary);
  }
}

/** A competition's list: its whole season. One with nothing to come is marked, and read daily. */
async function refreshLeague(due: Due & { competition: LiveCompetition }, summary: LiveRefreshSummary) {
  const { competition } = due;
  if (summary.capReachedUntil || !(await claim(due.key, due.notAfter))) return;
  const entry: LiveRefreshSummary["leagues"][number] = { leagueId: competition.leagueId, name: competition.name, matches: 0, upcoming: 0 };
  summary.leagues.push(entry);
  try {
    const matches = parseMatches(await liveFootballGet(LEAGUE_MATCHES_PATH, { leagueid: competition.leagueId }));
    await storeMatches(matches.map((match) => ({ leagueId: competition.leagueId, match })));
    const now = Date.now();
    entry.matches = matches.length;
    entry.upcoming = matches.filter((m) => m.kickoff.getTime() > now).length;
    if (matches.length > 0) entry.last = new Date(Math.max(...matches.map((m) => m.kickoff.getTime())));
    const ended = endedKey(competition.leagueId);
    if (matches.length > 0 && entry.upcoming === 0) await setFetchLog(ended, new Date());
    else await prisma.fetchLog.deleteMany({ where: { resourceKey: ended } });
    await afterSuccess(due.key);
  } catch (err) {
    entry.error = errorMessage(err);
    await afterFailure(due.key, err, summary);
  }
}

/** The score and clock of every followed match in play. */
async function refreshLiveFeed(due: Due, summary: LiveRefreshSummary) {
  if (!(await claim(due.key, due.notAfter))) return;
  try {
    const inPlay = parseMatches(await liveFootballGet(LIVE_FEED_PATH));
    const followed = await prisma.liveMatch.findMany({ where: { id: { in: inPlay.map((m) => m.id) } }, select: { id: true } });
    const followedIds = new Set(followed.map((row) => row.id));
    const now = new Date();
    let updated = 0;
    for (const match of inPlay) {
      if (!followedIds.has(match.id)) continue;
      await prisma.liveMatch.update({ where: { id: match.id }, data: { ...stateOf(match), liveUpdatedAt: now } });
      updated++;
    }
    summary.live = { inPlay: inPlay.length, updated };
    await afterSuccess(due.key);
  } catch (err) {
    summary.live = { inPlay: 0, updated: 0, error: errorMessage(err) };
    await afterFailure(due.key, err, summary);
  }
}

type Tracked = TrackedMatch & { leagueId: number };

/** The followed competitions' matches kicking off in [from, to). */
async function trackedMatches(leagueIds: number[], from: Date, to: Date): Promise<Tracked[]> {
  const rows = await prisma.liveMatch.findMany({
    where: { leagueId: { in: leagueIds }, kickoff: { gte: from, lt: to } },
    select: { leagueId: true, kickoff: true, status: true, liveUpdatedAt: true },
  });
  return rows.map((row) => ({ ...row, status: row.status as LiveStatus }));
}

/** Matches around now, as the refresh policy sees them: kick-off within the last 12 hours or the next 36. */
function aroundNow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - 12 * HOUR_MS), to: new Date(now.getTime() + 36 * HOUR_MS) };
}

/** Runs `run` over the items, `size` at a time, in order. */
async function inPool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

const mostOverdueFirst = (a: Due, b: Due) => (a.overdueMs === b.overdueMs ? 0 : b.overdueMs > a.overdueMs ? 1 : -1);

/**
 * Reads whatever is due: the day lists of today, the next DAYS_AHEAD days and `days` (board days,
 * YYYY-MM-DD), then the league lists whose matches call for it (most overdue first, never read
 * ones before all), then the live feed if a followed match is on. `force` reads every list now.
 * Never throws: what failed is in the summary, and the board shows what it has.
 */
export async function refreshLiveMatches(opts: { force?: boolean; days?: string[] } = {}): Promise<LiveRefreshSummary> {
  const summary: LiveRefreshSummary = { configured: isLiveFootballConfigured(), days: [], leagues: [] };
  const competitions = followedLiveCompetitions();
  if (!summary.configured || competitions.length === 0) return summary;
  const leagueIds = competitions.map((c) => c.leagueId);

  try {
    const now = new Date();
    const today = parisDateKey(now);
    const boardDays = [...Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i)), ...(opts.days ?? [])];
    const dates = Array.from(new Set(boardDays.flatMap(apiDatesOf))).sort();
    const spans = dates.map(apiDateSpan);
    const window = aroundNow(now);
    const keys = [...dates.map(dayKey), ...leagueIds.map(leagueKey), LIVE_FEED_KEY];
    const [nearby, ofDates, logs] = await Promise.all([
      trackedMatches(leagueIds, window.from, window.to),
      trackedMatches(leagueIds, spans[0].start, spans[spans.length - 1].end),
      prisma.fetchLog.findMany({ where: { resourceKey: { in: [...keys, ...keys.map(retryKey), ...leagueIds.map(endedKey)] } } }),
    ]);
    const logged = new Map(logs.map((log) => [log.resourceKey, log.lastFetchedAt.getTime()]));
    /** The read of `key` if it's due: forced, its retry time passed, or its interval since its last read. */
    const due = (key: string, intervalMs: number): Due | null => {
      const t = now.getTime();
      if (opts.force) return { key, notAfter: now, overdueMs: Infinity };
      const retry = logged.get(retryKey(key));
      if (retry !== undefined) return t >= retry ? { key, notAfter: new Date(retry), overdueMs: t - retry } : null;
      const last = logged.get(key);
      const overdueMs = last === undefined ? Infinity : t - last - intervalMs;
      return overdueMs >= 0 ? { key, notAfter: new Date(t - intervalMs), overdueMs } : null;
    };

    const dayReads = dates
      .flatMap((date, i) => {
        const { start, end } = spans[i];
        const read = due(dayKey(date), listRefreshIntervalMs(ofDates.filter((m) => m.kickoff >= start && m.kickoff < end), now));
        return read ? [{ ...read, date }] : [];
      })
      .sort(mostOverdueFirst);
    const leagueReads = competitions
      .flatMap((competition) => {
        const ended = logged.has(endedKey(competition.leagueId));
        const intervalMs = ended ? ENDED_LIST_INTERVAL_MS : listRefreshIntervalMs(nearby.filter((m) => m.leagueId === competition.leagueId), now);
        const read = due(leagueKey(competition.leagueId), intervalMs);
        return read ? [{ ...read, competition }] : [];
      })
      .sort(mostOverdueFirst);

    // The board's days first: they're what is on screen.
    await inPool<(Due & { date: string }) | (Due & { competition: LiveCompetition })>([...dayReads, ...leagueReads], CONCURRENCY, (read) =>
      "date" in read ? refreshDay(read, competitions, summary) : refreshLeague(read, summary)
    );

    if (summary.capReachedUntil) return summary;
    // The lists just read may have brought matches that are on.
    const fresh = summary.days.length + summary.leagues.length > 0 ? await trackedMatches(leagueIds, window.from, window.to) : nearby;
    const liveRead = needsLiveFeed(fresh, new Date()) ? due(LIVE_FEED_KEY, LIVE_FEED_INTERVAL_MS) : null;
    if (liveRead) await refreshLiveFeed(liveRead, summary);
  } catch (err) {
    summary.error = errorMessage(err);
  }
  return summary;
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/** One line per list read, then the live feed: for the CLI and the server logs. */
export function describeLiveRefresh(summary: LiveRefreshSummary): string {
  if (!summary.configured) return "Free API Live Football Data: RAPIDAPI_KEY is not set, nothing fetched";
  const lines = [
    ...summary.days.map((d) =>
      d.error
        ? `[day ${d.date}] failed: ${d.error}`
        : `[day ${d.date}] ${d.kept} match${d.kept === 1 ? "" : "es"} of followed competitions (${d.others} other${d.others === 1 ? "" : "s"})`
    ),
    ...summary.leagues.map((league) => {
      if (league.error) return `[${league.name}] failed: ${league.error}`;
      if (league.matches === 0) {
        return `[${league.name}] no match found: check its payload with npm run live-football -- ${LEAGUE_MATCHES_PATH} leagueid=${league.leagueId}`;
      }
      const count = `[${league.name}] ${league.matches} match${league.matches > 1 ? "es" : ""}`;
      if (league.upcoming > 0) return `${count}, ${league.upcoming} to come (until ${league.last ? day(league.last) : "?"})`;
      return `${count}, none to come (last on ${league.last ? day(league.last) : "?"}): between editions, or a past season — read once a day, the day lists fill in`;
    }),
  ];
  if (summary.days.length + summary.leagues.length === 0) lines.push("every list is fresh");
  if (summary.live) {
    lines.push(
      summary.live.error
        ? `live feed failed: ${summary.live.error}`
        : `live feed: ${summary.live.inPlay} matches in play, ${summary.live.updated} of them followed`
    );
  }
  if (summary.capReachedUntil) lines.push(`hourly cap reached: next request at ${summary.capReachedUntil.toISOString()}`);
  if (summary.error) lines.push(`failed: ${summary.error}`);
  return lines.join("\n");
}

/** Whether anything went wrong. */
export function liveRefreshFailed(summary: LiveRefreshSummary): boolean {
  return Boolean(
    summary.error || summary.live?.error || summary.days.some((d) => d.error) || summary.leagues.some((league) => league.error)
  );
}

export type CompetitionOverview = {
  name: string;
  matches: number;
  first: Date | null;
  last: Date | null;
  upcoming: number;
  today: number;
};

/** What the database holds for each followed competition: what the board can show. */
export async function liveMatchesOverview(now = new Date()): Promise<CompetitionOverview[]> {
  const competitions = followedLiveCompetitions();
  const leagueIds = competitions.map((c) => c.leagueId);
  const todayKey = parisDateKey(now);
  const [all, upcoming, today] = await Promise.all([
    prisma.liveMatch.groupBy({ by: ["leagueId"], where: { leagueId: { in: leagueIds } }, _count: true, _min: { kickoff: true }, _max: { kickoff: true } }),
    prisma.liveMatch.groupBy({ by: ["leagueId"], where: { leagueId: { in: leagueIds }, kickoff: { gt: now } }, _count: true }),
    prisma.liveMatch.groupBy({
      by: ["leagueId"],
      where: { leagueId: { in: leagueIds }, kickoff: { gte: parisStartOfDay(todayKey), lt: parisStartOfDay(addDays(todayKey, 1)) } },
      _count: true,
    }),
  ]);
  const countOf = (rows: { leagueId: number; _count: number }[], leagueId: number) => rows.find((r) => r.leagueId === leagueId)?._count ?? 0;
  return competitions.map((competition) => {
    const row = all.find((r) => r.leagueId === competition.leagueId);
    return {
      name: competition.name,
      matches: row?._count ?? 0,
      first: row?._min.kickoff ?? null,
      last: row?._max.kickoff ?? null,
      upcoming: countOf(upcoming, competition.leagueId),
      today: countOf(today, competition.leagueId),
    };
  });
}
