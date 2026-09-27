// Thin client for The Odds API v4 — https://the-odds-api.com/liveapi/guides/v4/
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://api.the-odds-api.com/v4";

export type OddsApiSport = {
  key: string;
  group: string;
  title: string;
  active: boolean;
  has_outrights: boolean;
};

export type OddsApiOutcome = {
  name: string;
  price: number;
  point?: number;
};

export type OddsApiMarket = {
  key: string;
  last_update: string;
  outcomes: OddsApiOutcome[];
};

export type OddsApiBookmaker = {
  key: string;
  title: string;
  last_update: string;
  markets: OddsApiMarket[];
};

export type OddsApiEvent = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
};

function apiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) throw new Error("ODDS_API_KEY is not set");
  return key;
}

async function logUsage(endpoint: string, res: Response) {
  const requestsUsed = res.headers.get("x-requests-used");
  const requestsRemaining = res.headers.get("x-requests-remaining");
  const requestsLastCost = res.headers.get("x-requests-last");
  await prisma.apiUsageLog.create({
    data: {
      provider: "the-odds-api",
      endpoint,
      requestsUsed: requestsUsed ? Number(requestsUsed) : null,
      requestsRemaining: requestsRemaining ? Number(requestsRemaining) : null,
      requestsLastCost: requestsLastCost ? Number(requestsLastCost) : null,
    },
  });
}

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("apiKey", apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, { cache: "no-store" });
  await logUsage(path, res);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`The Odds API ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export function listSports(): Promise<OddsApiSport[]> {
  return getJson<OddsApiSport[]>("/sports", {});
}

export function getOddsForSport(
  sportKey: string,
  opts: { regions?: string; markets?: string; oddsFormat?: string } = {}
): Promise<OddsApiEvent[]> {
  return getJson<OddsApiEvent[]>(`/sports/${sportKey}/odds`, {
    // Each region costs one credit per market: "eu" carries Pinnacle and Betfair (the sharp
    // and exchange references the methodology needs), "fr" the French books — the only
    // ones the site displays and bets at (src/lib/bookmakers.ts).
    regions: opts.regions ?? process.env.ODDS_REGIONS ?? "eu,fr",
    markets: opts.markets ?? "h2h,totals",
    oddsFormat: opts.oddsFormat ?? "decimal",
    dateFormat: "iso",
  });
}
