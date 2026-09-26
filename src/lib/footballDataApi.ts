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

type FootballDataScoreLine = { home: number | null; away: number | null };

export type FootballDataMatch = {
  id: number;
  utcDate: string;
  // SCHEDULED | TIMED | IN_PLAY | PAUSED | EXTRA_TIME | PENALTY_SHOOTOUT | FINISHED |
  // SUSPENDED | POSTPONED | CANCELLED | AWARDED
  status: string;
  matchday: number | null;
  stage: string | null;
  season: { startDate: string };
  homeTeam: { id: number | null; name: string | null };
  awayTeam: { id: number | null; name: string | null };
  score: {
    duration?: string; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    fullTime: FootballDataScoreLine;
    // Only present when the match went past 90 minutes: the score bookmakers settle on.
    regularTime?: FootballDataScoreLine;
  };
};

export type FootballDataMatches = { matches: FootballDataMatch[] };

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

// Free tier is capped at 10 requests/minute; every call through this module waits for its
// slot, so a refresh that chains standings + matches for several competitions (and the
// nightly results sync) stays under it even if other traffic hits the same key.
const REQUEST_SPACING_MS = 7_000;
let nextSlotAt = 0;

async function waitForSlot() {
  const now = Date.now();
  const wait = nextSlotAt - now;
  nextSlotAt = Math.max(now, nextSlotAt) + REQUEST_SPACING_MS;
  if (wait > 0) await sleep(wait);
}

async function getJson<T>(path: string): Promise<T> {
  await waitForSlot();
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

/** Matches of a competition; `season` (start year) or a dateFrom/dateTo window (YYYY-MM-DD). */
export function getMatches(
  competitionCode: string,
  filters: { season?: number; dateFrom?: string; dateTo?: string } = {}
): Promise<FootballDataMatches> {
  const params = new URLSearchParams();
  if (filters.season !== undefined) params.set("season", String(filters.season));
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  const query = params.toString();
  return getJson<FootballDataMatches>(`/competitions/${competitionCode}/matches${query ? `?${query}` : ""}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
