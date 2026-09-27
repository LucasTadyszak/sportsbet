// Thin client for Free API Live Football Data (RapidAPI, by Creativesdev) —
// https://rapidapi.com/Creativesdev/api/free-api-live-football-data
// Livescores, fixtures, lineups, match stats, standings, odds… for 2100+ leagues, under its
// own ids (leagueid, eventid, teamid). Capped at 1000 requests per rolling hour by default.
import { prisma } from "@/lib/prisma";

const HOST = "free-api-live-football-data.p.rapidapi.com";
const BASE_URL = `https://${HOST}`;
const PROVIDER = "free-api-live-football-data";
const WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_REQUESTS_PER_HOUR = 1000;

/** Thrown instead of calling the API once the last hour already holds the maximum number of requests. */
export class LiveFootballRateLimitError extends Error {
  readonly limit: number;
  /** When the oldest request of the window turns an hour old, freeing a slot. */
  readonly retryAt: Date;

  constructor(limit: number, retryAt: Date) {
    super(`Free API Live Football Data: hourly cap of ${limit} requests reached, next one allowed at ${retryAt.toISOString()}`);
    this.name = "LiveFootballRateLimitError";
    this.limit = limit;
    this.retryAt = retryAt;
  }
}

function apiKey(): string {
  // One RapidAPI key serves every API the account subscribes to.
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is not set");
  return key;
}

/** Whether a RapidAPI key is set: without one, nothing is fetched and the board only shows priced matches. */
export function isLiveFootballConfigured(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}

function maxRequestsPerHour(): number {
  const raw = process.env.LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR?.trim();
  if (!raw) return DEFAULT_MAX_REQUESTS_PER_HOUR;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error(`LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR must be a positive whole number, got "${raw}"`);
  }
  return limit;
}

function lastHour(now: Date) {
  return { provider: PROVIDER, capturedAt: { gt: new Date(now.getTime() - WINDOW_MS) } };
}

/**
 * Takes a slot of the hourly cap, or throws LiveFootballRateLimitError. The slot is the call's
 * ApiUsageLog row, written before the call goes out (so a call that then fails still counts), and
 * the count-then-write runs under a Postgres advisory lock: the web service and the cron jobs share
 * one cap and can't both take its last slot.
 */
async function reserveSlot(endpoint: string): Promise<bigint> {
  const limit = maxRequestsPerHour();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${PROVIDER}))`;
    const now = new Date();
    const used = await tx.apiUsageLog.count({ where: lastHour(now) });
    if (used >= limit) {
      // Enough of the window has to age out to get back under the cap (more than one if it was lowered).
      const freeing = await tx.apiUsageLog.findFirst({
        where: lastHour(now),
        orderBy: { capturedAt: "asc" },
        skip: used - limit,
        select: { capturedAt: true },
      });
      throw new LiveFootballRateLimitError(limit, new Date((freeing?.capturedAt ?? now).getTime() + WINDOW_MS));
    }
    const row = await tx.apiUsageLog.create({ data: { provider: PROVIDER, endpoint, capturedAt: now }, select: { id: true } });
    return row.id;
  });
}

async function logUsage(usageId: bigint, res: Response) {
  // RapidAPI's quota headers are about the plan's allowance, not the hourly cap enforced here.
  const quota = res.headers.get("x-ratelimit-requests-limit");
  const remaining = res.headers.get("x-ratelimit-requests-remaining");
  await prisma.apiUsageLog.update({
    where: { id: usageId },
    data: {
      requestsUsed: quota && remaining ? Number(quota) - Number(remaining) : null,
      requestsRemaining: remaining ? Number(remaining) : null,
    },
  });
}

/** Requests sent over the last hour (by every process sharing the database), against the cap. */
export async function hourlyUsage(): Promise<{ used: number; limit: number }> {
  const used = await prisma.apiUsageLog.count({ where: lastHour(new Date()) });
  return { used, limit: maxRequestsPerHour() };
}

/** GET one endpoint, e.g. ("/football-get-match-detail", { eventid: 4621624 }): one slot of the hourly cap. */
export async function liveFootballGet<T = unknown>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  if (url.host !== HOST) throw new Error(`Not a Free API Live Football Data path: ${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const endpoint = `${url.pathname}${url.search}`;

  const key = apiKey(); // before reserving, so a missing key doesn't use up a slot
  const usageId = await reserveSlot(endpoint);
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    cache: "no-store",
  });
  await logUsage(usageId, res);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Free API Live Football Data ${endpoint} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}
