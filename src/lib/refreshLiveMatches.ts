// Keeps LiveMatch (every match of the followed competitions, src/lib/liveCompetitions.ts) up to
// date from Free API Live Football Data, within its hourly cap (src/lib/liveFootballApi.ts):
// - each competition's list (one request: its whole season, fixtures and results), read again
//   more or less often depending on what its matches are doing (leagueRefreshIntervalMs);
// - the live feed (one request: every match in play, worldwide), read at most once a minute and
//   only while a followed match is on, for their score and clock.
// Runs as the board is served (whatever is due), from `npm run refresh:matches` and from
// /api/refresh-matches. Every read is claimed in FetchLog before it goes out, so concurrent runs
// (several page views, a cron) never make the same request twice.
import type { LiveMatch } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isLiveFootballConfigured, liveFootballGet, LiveFootballRateLimitError } from "@/lib/liveFootballApi";
import { followedLiveCompetitions, type LiveCompetition } from "@/lib/liveCompetitions";
import {
  LIVE_FEED_INTERVAL_MS,
  leagueRefreshIntervalMs,
  needsLiveFeed,
  parseMatches,
  type ApiMatch,
  type LiveStatus,
  type TrackedMatch,
} from "@/lib/liveMatches";

export const LEAGUE_MATCHES_PATH = "/football-get-all-matches-by-league";
const LIVE_FEED_PATH = "/football-current-live";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
// A failed read is due again this soon, whatever its usual interval.
const RETRY_MS = 5 * MINUTE_MS;
// Leagues read at the same time.
const CONCURRENCY = 3;
// While a match is on, the live feed is ahead of its league's list: the list doesn't overwrite a
// score and clock the feed reported this recently.
const LIVE_FEED_AUTHORITY_MS = 3 * MINUTE_MS;

const leagueKey = (leagueId: number) => `live-football:league:${leagueId}`;
const LIVE_FEED_KEY = "live-football:live";

export type LiveRefreshSummary = {
  /** false without RAPIDAPI_KEY: nothing was fetched. */
  configured: boolean;
  /** Every league list read (or tried) by this run; the others were fresh, or read by another run. */
  leagues: { leagueId: number; name: string; matches: number; error?: string }[];
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
 * Takes the read of a resource if it's due (last taken at least `intervalMs` ago, or never), and
 * marks it read now; false when it's still fresh or another run just took it. Each statement is
 * atomic, so two runs can't both take it.
 */
async function claim(resourceKey: string, intervalMs: number): Promise<boolean> {
  const now = new Date();
  const taken = await prisma.fetchLog.updateMany({
    where: { resourceKey, lastFetchedAt: { lte: new Date(now.getTime() - intervalMs) } },
    data: { lastFetchedAt: now },
  });
  if (taken.count > 0) return true;
  const created = await prisma.fetchLog.createMany({ data: [{ resourceKey, lastFetchedAt: now }], skipDuplicates: true });
  return created.count > 0;
}

/** After a failed read: due again at `at` rather than a whole interval later. */
async function retryAt(resourceKey: string, intervalMs: number, at: Date) {
  await prisma.fetchLog.update({ where: { resourceKey }, data: { lastFetchedAt: new Date(at.getTime() - intervalMs) } });
}

/** A failed read's next try: when the cap frees a slot, else a few minutes from now. */
async function afterFailure(resourceKey: string, intervalMs: number, err: unknown, summary: LiveRefreshSummary) {
  const at = err instanceof LiveFootballRateLimitError ? err.retryAt : new Date(Date.now() + RETRY_MS);
  if (err instanceof LiveFootballRateLimitError) summary.capReachedUntil = err.retryAt;
  await retryAt(resourceKey, intervalMs, at).catch(() => undefined);
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

/** Writes a league's list: new matches in one go, and only the ones that changed otherwise. */
async function storeLeagueMatches(leagueId: number, matches: ApiMatch[]) {
  if (matches.length === 0) return;
  const existing = new Map(
    (await prisma.liveMatch.findMany({ where: { id: { in: matches.map((m) => m.id) } } })).map((row) => [row.id, row])
  );
  const now = Date.now();
  const created = [];
  for (const match of matches) {
    const row = rowOf(leagueId, match);
    const current = existing.get(match.id);
    if (!current) {
      created.push({ id: match.id, ...row });
      continue;
    }
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

type DueLeague = {
  competition: LiveCompetition;
  /** Its list's refresh interval (leagueRefreshIntervalMs): a failed read's retry is set against it. */
  intervalMs: number;
  /** How old its last read must be to take this one: the interval, or 0 when forced. */
  claimAfterMs: number;
  overdueMs: number;
};

async function refreshLeague({ competition, intervalMs, claimAfterMs }: DueLeague, summary: LiveRefreshSummary) {
  const key = leagueKey(competition.leagueId);
  if (summary.capReachedUntil || !(await claim(key, claimAfterMs))) return;
  const entry: LiveRefreshSummary["leagues"][number] = { leagueId: competition.leagueId, name: competition.name, matches: 0 };
  summary.leagues.push(entry);
  try {
    const matches = parseMatches(await liveFootballGet(LEAGUE_MATCHES_PATH, { leagueid: competition.leagueId }));
    await storeLeagueMatches(competition.leagueId, matches);
    entry.matches = matches.length;
  } catch (err) {
    entry.error = errorMessage(err);
    await afterFailure(key, intervalMs, err, summary);
  }
}

/** The score and clock of every followed match in play. */
async function refreshLiveFeed(summary: LiveRefreshSummary) {
  if (!(await claim(LIVE_FEED_KEY, LIVE_FEED_INTERVAL_MS))) return;
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
  } catch (err) {
    summary.live = { inPlay: 0, updated: 0, error: errorMessage(err) };
    await afterFailure(LIVE_FEED_KEY, LIVE_FEED_INTERVAL_MS, err, summary);
  }
}

/** The followed leagues' matches around now (kick-off within the last 12 hours or the next 36), by league. */
async function nearbyMatches(leagueIds: number[], now: Date): Promise<Map<number, TrackedMatch[]>> {
  const rows = await prisma.liveMatch.findMany({
    where: {
      leagueId: { in: leagueIds },
      kickoff: { gte: new Date(now.getTime() - 12 * HOUR_MS), lte: new Date(now.getTime() + 36 * HOUR_MS) },
    },
    select: { leagueId: true, kickoff: true, status: true, liveUpdatedAt: true },
  });
  const byLeague = new Map<number, TrackedMatch[]>();
  for (const { leagueId, kickoff, status, liveUpdatedAt } of rows) {
    const list = byLeague.get(leagueId) ?? [];
    list.push({ kickoff, status: status as LiveStatus, liveUpdatedAt });
    byLeague.set(leagueId, list);
  }
  return byLeague;
}

/** Runs `run` over the items, `size` at a time. */
async function inPool<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

/**
 * Reads whatever is due: the lists of the leagues whose matches call for it (most overdue first,
 * never read ones before all), then the live feed if a followed match is on. `force` reads every
 * league now. Never throws: what failed is in the summary, and the board shows what it has.
 */
export async function refreshLiveMatches(opts: { force?: boolean } = {}): Promise<LiveRefreshSummary> {
  const summary: LiveRefreshSummary = { configured: isLiveFootballConfigured(), leagues: [] };
  const competitions = followedLiveCompetitions();
  if (!summary.configured || competitions.length === 0) return summary;
  const leagueIds = competitions.map((c) => c.leagueId);

  try {
    const now = new Date();
    const [nearby, logs] = await Promise.all([
      nearbyMatches(leagueIds, now),
      prisma.fetchLog.findMany({ where: { resourceKey: { in: leagueIds.map(leagueKey) } } }),
    ]);
    const lastRead = new Map(logs.map((log) => [log.resourceKey, log.lastFetchedAt.getTime()]));
    const due = competitions
      .map((competition): DueLeague => {
        const intervalMs = leagueRefreshIntervalMs(nearby.get(competition.leagueId) ?? [], now);
        const claimAfterMs = opts.force ? 0 : intervalMs;
        const last = lastRead.get(leagueKey(competition.leagueId));
        return { competition, intervalMs, claimAfterMs, overdueMs: last === undefined ? Infinity : now.getTime() - last - claimAfterMs };
      })
      .filter((league) => league.overdueMs >= 0)
      .sort((a, b) => (a.overdueMs === b.overdueMs ? 0 : b.overdueMs > a.overdueMs ? 1 : -1));
    await inPool(due, CONCURRENCY, (league) => refreshLeague(league, summary));

    if (summary.capReachedUntil) return summary;
    // The lists just read may have brought matches that are on.
    const current = summary.leagues.length > 0 ? await nearbyMatches(leagueIds, new Date()) : nearby;
    if (needsLiveFeed(Array.from(current.values()).flat(), new Date())) await refreshLiveFeed(summary);
  } catch (err) {
    summary.error = errorMessage(err);
  }
  return summary;
}

/** One line per league read, then the live feed: for the CLI and the server logs. */
export function describeLiveRefresh(summary: LiveRefreshSummary): string {
  if (!summary.configured) return "Free API Live Football Data: RAPIDAPI_KEY is not set, nothing fetched";
  const lines = summary.leagues.map((league) =>
    league.error
      ? `[${league.name}] failed: ${league.error}`
      : league.matches === 0
        ? `[${league.name}] no match found: check its payload with npm run live-football -- ${LEAGUE_MATCHES_PATH} leagueid=${league.leagueId}`
        : `[${league.name}] ${league.matches} match${league.matches > 1 ? "es" : ""}`
  );
  if (summary.leagues.length === 0) lines.push("every league list is fresh");
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
  return Boolean(summary.error || summary.live?.error || summary.leagues.some((league) => league.error));
}
