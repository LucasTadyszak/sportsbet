// Thin client for TheSportsDB's v1 JSON API — https://www.thesportsdb.com/documentation
// Free, no sign-up: the shared public key "123" works as is; a personal (Patreon) key set in
// THESPORTSDB_API_KEY lifts its limits. Free tier: 30 requests/minute, and list methods return
// a capped number of rows. Only used for logos (src/lib/refreshLogos.ts).

const BASE_URL = "https://www.thesportsdb.com/api/v1/json";
const FREE_API_KEY = "123";

export type SportsDbTeam = {
  idTeam: string;
  strTeam: string;
  /** Other names the team goes by, comma-separated (e.g. "Paris Saint-Germain, PSG"). */
  strTeamAlternate?: string | null;
  strSport?: string | null; // "Soccer", "Basketball", ...
  strGender?: string | null; // "Male" | "Female"
  strCountry?: string | null;
  // Every competition the team plays in: its league first, then cups and continental ones.
  idLeague?: string | null;
  idLeague2?: string | null;
  idLeague3?: string | null;
  idLeague4?: string | null;
  idLeague5?: string | null;
  idLeague6?: string | null;
  idLeague7?: string | null;
  /** Club crest, a transparent PNG, e.g. "https://r2.thesportsdb.com/images/media/team/badge/….png". */
  strBadge?: string | null;
};

export type SportsDbLeague = {
  idLeague: string;
  strLeague: string;
  strSport?: string | null;
  /** The competition's emblem (square), e.g. the Premier League lion. */
  strBadge?: string | null;
  /** Its wordmark (wide). */
  strLogo?: string | null;
};

function apiKey(): string {
  return process.env.THESPORTSDB_API_KEY?.trim() || FREE_API_KEY;
}

// 30 requests/minute on the free key: one call every 2.1 s keeps any run under it.
const REQUEST_SPACING_MS = 2_100;
let nextSlotAt = 0;

async function waitForSlot() {
  const now = Date.now();
  const wait = nextSlotAt - now;
  nextSlotAt = Math.max(now, nextSlotAt) + REQUEST_SPACING_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function getJson(path: string): Promise<unknown> {
  await waitForSlot();
  const res = await fetch(`${BASE_URL}/${apiKey()}/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TheSportsDB ${path} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The rows under `key`: TheSportsDB answers `null` rather than an empty list when nothing
 * matches, and a message instead of rows for a method the key doesn't give access to.
 */
function rowsOf(body: unknown, key: string): Record<string, unknown>[] {
  const rows = isRecord(body) ? body[key] : null;
  return Array.isArray(rows) ? rows.filter(isRecord) : [];
}

function teamsOf(body: unknown): SportsDbTeam[] {
  return rowsOf(body, "teams").filter(
    (row): row is SportsDbTeam => typeof row.idTeam === "string" && typeof row.strTeam === "string"
  );
}

/** A league's details, including its badge and logo. */
export async function lookupLeague(leagueId: string): Promise<SportsDbLeague | null> {
  const leagues = rowsOf(await getJson(`lookupleague.php?id=${encodeURIComponent(leagueId)}`), "leagues").filter(
    (row): row is SportsDbLeague => typeof row.idLeague === "string" && typeof row.strLeague === "string"
  );
  return leagues[0] ?? null;
}

/** The teams of a league (capped on the free key: it can come back short of the full league). */
export async function lookupAllTeams(leagueId: string): Promise<SportsDbTeam[]> {
  return teamsOf(await getJson(`lookup_all_teams.php?id=${encodeURIComponent(leagueId)}`));
}

/** Teams whose name matches, from any sport and any country (few rows on the free key). */
export async function searchTeams(name: string): Promise<SportsDbTeam[]> {
  return teamsOf(await getJson(`searchteams.php?t=${encodeURIComponent(name)}`));
}

/** One team by its TheSportsDB id. */
export async function lookupTeam(teamId: string): Promise<SportsDbTeam | null> {
  return teamsOf(await getJson(`lookupteam.php?id=${encodeURIComponent(teamId)}`))[0] ?? null;
}
