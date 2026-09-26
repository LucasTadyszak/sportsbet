// Thin client for football-data.org v4 — https://www.football-data.org/documentation/api
// Free tier: 10 requests/minute, standings/matches only for a fixed set of competitions.
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://api.football-data.org/v4";

export type FootballDataTeam = {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
};

export type FootballDataStandingRow = {
  position: number;
  team: FootballDataTeam;
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
};

export type FootballDataStandings = {
  competition: { code: string; name: string };
  season: { startDate: string };
  standings: {
    type: "TOTAL" | "HOME" | "AWAY";
    table: FootballDataStandingRow[];
  }[];
};

function apiKey(): string {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
  return key;
}

async function logUsage(endpoint: string, res: Response) {
  // football-data.org reports remaining quota via these headers; absent on some plans/errors.
  const requestsRemaining = res.headers.get("x-requests-available-minute");
  await prisma.apiUsageLog.create({
    data: {
      provider: "football-data.org",
      endpoint,
      requestsUsed: null,
      requestsRemaining: requestsRemaining ? Number(requestsRemaining) : null,
      requestsLastCost: null,
    },
  });
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "X-Auth-Token": apiKey() },
    cache: "no-store",
  });
  await logUsage(path, res);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org ${path} failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export function getStandings(competitionCode: string): Promise<FootballDataStandings> {
  return getJson<FootballDataStandings>(`/competitions/${competitionCode}/standings`);
}

/** Free-tier plans throttle to 10 req/min; spread sequential calls out to stay under that. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
