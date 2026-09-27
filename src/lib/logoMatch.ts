// Which TheSportsDB team an Odds API team name refers to, and which logo URLs the site can
// show. Pure functions (unit tested): the lookups themselves are in src/lib/refreshLogos.ts.
import { normalizeTeamName } from "@/lib/teamNames";
import type { SportsDbLeague, SportsDbTeam } from "@/lib/theSportsDbApi";

// next.config.ts only lets next/image load images from these places (keep the two lists in
// step), and a URL from anywhere else would make the page throw: such a logo is dropped instead.
const LOGO_SOURCES = [
  { hostname: "crests.football-data.org", pathPrefix: "/" },
  { hostname: "r2.thesportsdb.com", pathPrefix: "/" },
  // Older TheSportsDB records still point at the main site rather than its image CDN.
  { hostname: "www.thesportsdb.com", pathPrefix: "/images/" },
  // Team and league logos of the matches Free API Live Football Data brings (src/lib/liveMatches.ts).
  { hostname: "images.fotmob.com", pathPrefix: "/image_resources/logo/" },
];

/** The URL if next/image may load it (see next.config.ts), else null. */
export function servableLogo(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname, port, username, pathname, search } = new URL(url);
    const allowed =
      protocol === "https:" &&
      !port &&
      !username &&
      !search &&
      LOGO_SOURCES.some((source) => source.hostname === hostname && pathname.startsWith(source.pathPrefix));
    return allowed ? url : null;
  } catch {
    return null;
  }
}

/** A competition's logo: its emblem, else its wordmark. */
export function leagueLogo(league: SportsDbLeague): string | null {
  return servableLogo(league.strBadge) ?? servableLogo(league.strLogo);
}

/** A club's crest. */
export function teamLogo(team: SportsDbTeam): string | null {
  return servableLogo(team.strBadge);
}

/** What a team has to be to be the one an Odds API name refers to (src/lib/leagueMapping.ts). */
export type TeamLookup = {
  sport: string;
  gender: "Male" | "Female";
  /** TheSportsDB ids of the competitions the name was seen in (its league first, as a rule). */
  leagueIds: string[];
};

function sameText(value: string | null | undefined, expected: string): boolean {
  return (value ?? "").trim().toLowerCase() === expected.toLowerCase();
}

/** Every name TheSportsDB knows a team by: its own and its alternates. */
function namesOf(team: SportsDbTeam): string[] {
  return [team.strTeam, ...(team.strTeamAlternate ?? "").split(",")].map((name) => name.trim()).filter((name) => name.length > 0);
}

function leaguesOf(team: SportsDbTeam): (string | null | undefined)[] {
  return [team.idLeague, team.idLeague2, team.idLeague3, team.idLeague4, team.idLeague5, team.idLeague6, team.idLeague7];
}

/**
 * The TheSportsDB team an Odds API team name refers to among `candidates` (a league's teams,
 * or the answer to a name search), or null unless exactly one fits: a missing logo falls back
 * to football-data.org's crest or a neutral shield, while a wrong one would mislead.
 * - Same sport, and not the women's side of a men's competition (or the other way round).
 * - Same name once normalized (accents, "FC"-style suffixes, aliases: src/lib/teamNames.ts),
 *   as the team's name or one of its alternates. One name merely containing the other isn't
 *   enough: the free key cuts lists short, so "Paris FC" could be left facing only "Paris SG".
 * - Namesakes of the same sport (two "Nacional"): the one playing in one of the competitions.
 */
export function matchSportsDbTeam(oddsApiName: string, candidates: SportsDbTeam[], lookup: TeamLookup): SportsDbTeam | null {
  const target = normalizeTeamName(oddsApiName);
  if (!target) return null;

  // Keyed by id: a league's teams and a search can both bring back the same team.
  const matches = new Map<string, SportsDbTeam>();
  for (const team of candidates) {
    if (!sameText(team.strSport, lookup.sport)) continue;
    if (team.strGender && !sameText(team.strGender, lookup.gender)) continue;
    if (matches.has(team.idTeam)) continue;
    if (namesOf(team).some((name) => normalizeTeamName(name) === target)) matches.set(team.idTeam, team);
  }

  const found = Array.from(matches.values());
  if (found.length <= 1) return found[0] ?? null;
  const inCompetition = found.filter((team) => leaguesOf(team).some((id) => id && lookup.leagueIds.includes(id)));
  return inCompetition.length === 1 ? inCompetition[0] : null;
}
