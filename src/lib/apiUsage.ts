// What the request dashboard (/vestiaire/requetes) reads: every external API call the site and its
// crons made, as ApiUsageLog holds them (one row per call, src/lib/apiProviders.ts for who's who),
// counted per provider, per hour or per Paris day, per endpoint, and against each provider's limit.
import { Prisma, type ApiUsageLog } from "@/generated/prisma/client";
import { API_PROVIDER_KEYS, PER_MINUTE_LIMITS, isApiProvider, type ApiProvider } from "@/lib/apiProviders";
import { hourlyUsage } from "@/lib/liveFootballApi";
import { prisma } from "@/lib/prisma";
import { periodBuckets, USAGE_PERIODS, type UsageBucket, type UsagePeriod } from "@/lib/usagePeriods";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * A bound for the SQL below, as a UTC wall-clock `timestamp` (what capturedAt holds): cast from ISO
 * text, whose zone Postgres ignores, so neither the session's nor the server's time zone can shift it.
 */
const at = (date: Date) => date.toISOString();

export type ProviderUsage = {
  provider: ApiProvider | string;
  /** Requests over the period, bucket by bucket (same order as periodBuckets). */
  series: number[];
  total: number;
  lastMinute: number;
  lastHour: number;
  /** The Odds API credits the period's calls cost (x-requests-last), null for the others. */
  credits: number | null;
  lastCallAt: Date | null;
};

export type QuotaReading = { used: number; remaining: number; at: Date };

export type UsageDashboard = {
  period: UsagePeriod;
  buckets: UsageBucket[];
  /** Every known provider first, in the table's order, then any other found in the log. */
  providers: ProviderUsage[];
  /** Free API Live Football Data's own hourly cap (src/lib/liveFootballApi.ts); null if it can't be read. */
  liveHourlyCap: { used: number; limit: number } | null;
  /** The last quota headers each plan sent back. */
  oddsApiCredits: QuotaReading | null;
  rapidApiQuota: QuotaReading | null;
  topEndpoints: { provider: string; endpoint: string; requests: number; lastCallAt: Date }[];
  /** The period's latest calls, newest first. */
  recentCalls: ApiUsageLog[];
};

async function lastQuotaReading(provider: ApiProvider): Promise<QuotaReading | null> {
  const row = await prisma.apiUsageLog.findFirst({
    where: { provider, requestsUsed: { not: null }, requestsRemaining: { not: null } },
    orderBy: { capturedAt: "desc" },
    select: { requestsUsed: true, requestsRemaining: true, capturedAt: true },
  });
  return row?.requestsUsed != null && row.requestsRemaining != null
    ? { used: row.requestsUsed, remaining: row.requestsRemaining, at: row.capturedAt }
    : null;
}

export async function getUsageDashboard(period: UsagePeriod, now = new Date()): Promise<UsageDashboard> {
  const buckets = periodBuckets(period, now);
  const start = at(buckets[0].start);
  const bucketSql = Prisma.raw(
    USAGE_PERIODS[period].unit === "hour"
      ? `to_char(date_trunc('hour', "capturedAt"), 'YYYY-MM-DD"T"HH24')`
      : `to_char(("capturedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD')`
  );

  const [windows, perBucket, lastCalls, topEndpoints, recentCalls, liveHourlyCap, oddsApiCredits, rapidApiQuota] = await Promise.all([
    prisma.$queryRaw<{ provider: string; last_minute: number; last_hour: number; total: number; credits: number | null }[]>`
      SELECT provider,
        count(*) FILTER (WHERE "capturedAt" >= ${at(new Date(now.getTime() - MINUTE_MS))}::timestamp)::int AS last_minute,
        count(*) FILTER (WHERE "capturedAt" >= ${at(new Date(now.getTime() - HOUR_MS))}::timestamp)::int AS last_hour,
        count(*)::int AS total,
        sum("requestsLastCost")::int AS credits
      FROM api_usage_log
      WHERE "capturedAt" >= ${start}::timestamp
      GROUP BY provider`,
    // The bucket expression is one of the two constants above, never input.
    prisma.$queryRaw<{ provider: string; bucket: string; requests: number }[]>`
      SELECT provider, ${bucketSql} AS bucket, count(*)::int AS requests
      FROM api_usage_log
      WHERE "capturedAt" >= ${start}::timestamp
      GROUP BY provider, bucket`,
    // One indexed lookup per provider: the last call, whenever it was.
    Promise.all(
      API_PROVIDER_KEYS.map((provider) =>
        prisma.apiUsageLog.findFirst({ where: { provider }, orderBy: { capturedAt: "desc" }, select: { provider: true, capturedAt: true } })
      )
    ),
    prisma.$queryRaw<{ provider: string; endpoint: string; requests: number; last_call: string }[]>`
      SELECT provider, endpoint, count(*)::int AS requests,
        to_char(max("capturedAt"), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_call
      FROM api_usage_log
      WHERE "capturedAt" >= ${start}::timestamp
      GROUP BY provider, endpoint
      ORDER BY requests DESC, provider, endpoint
      LIMIT 12`,
    prisma.apiUsageLog.findMany({ where: { capturedAt: { gte: buckets[0].start } }, orderBy: { capturedAt: "desc" }, take: 25 }),
    hourlyUsage().catch(() => null),
    lastQuotaReading("the-odds-api"),
    lastQuotaReading("free-api-live-football-data"),
  ]);

  const bucketIndex = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  const lastCallAt = new Map(lastCalls.filter((row) => row !== null).map((row) => [row.provider, row.capturedAt]));
  const byProvider = new Map(windows.map((row) => [row.provider, row]));
  const names = [...API_PROVIDER_KEYS, ...windows.map((row) => row.provider).filter((provider) => !isApiProvider(provider))];

  const providers = names.map((provider): ProviderUsage => {
    const series = new Array<number>(buckets.length).fill(0);
    for (const row of perBucket) {
      const i = bucketIndex.get(row.bucket);
      if (row.provider === provider && i !== undefined) series[i] = row.requests;
    }
    const counts = byProvider.get(provider);
    return {
      provider,
      series,
      total: counts?.total ?? 0,
      lastMinute: counts?.last_minute ?? 0,
      lastHour: counts?.last_hour ?? 0,
      credits: provider === "the-odds-api" ? (counts?.credits ?? 0) : null,
      lastCallAt: lastCallAt.get(provider) ?? null,
    };
  });

  return {
    period,
    buckets,
    providers,
    liveHourlyCap,
    oddsApiCredits,
    rapidApiQuota,
    topEndpoints: topEndpoints.map((row) => ({ provider: row.provider, endpoint: row.endpoint, requests: row.requests, lastCallAt: new Date(row.last_call) })),
    recentCalls,
  };
}

/** A provider's requests per minute against its limit, for those whose limit is per minute. */
export function perMinuteLimit(provider: string): number | null {
  return isApiProvider(provider) ? (PER_MINUTE_LIMITS[provider] ?? null) : null;
}
