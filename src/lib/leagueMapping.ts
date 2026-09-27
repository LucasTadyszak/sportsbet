import type { InternationalClass } from "@/lib/internationalResultsApi";

// Maps The Odds API's `sport_key` to the equivalent football-data.org
// competition code, for the competitions available on football-data.org's
// free tier (https://www.football-data.org/documentation/api).
export const SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION: Record<string, string> = {
  soccer_epl: "PL",
  soccer_uefa_champs_league: "CL",
  soccer_germany_bundesliga: "BL1",
  soccer_spain_la_liga: "PD",
  soccer_italy_serie_a: "SA",
  soccer_france_ligue_one: "FL1",
  soccer_netherlands_eredivisie: "DED",
  soccer_portugal_primeira_liga: "PPL",
  soccer_england_efl_champ: "ELC",
  soccer_brazil_campeonato: "BSA",
};

/** football-data.org competition codes reachable from the currently tracked Odds API sport keys. */
export function trackedCompetitionCodes(sportKeys: string[]): string[] {
  const codes = new Set<string>();
  for (const sportKey of sportKeys) {
    const code = SPORT_KEY_TO_FOOTBALL_DATA_COMPETITION[sportKey];
    if (code) codes.add(code);
  }
  return Array.from(codes);
}

export type NationalCompetition = {
  /** The Elo class its matches are rated in: K, home advantage and draw model tuned on that kind of match. */
  eloClass: InternationalClass;
  /** Tournament finals are played on neutral ground (a host nation's edge isn't modelled). */
  neutral: boolean;
};

/**
 * National-team competitions on The Odds API, priced by the national-team model (built on the
 * international results dataset, see internationalResultsApi.ts — football-data.org's free tier
 * has no national-team competition besides the World Cup and Euro finals).
 */
export const NATIONAL_TEAM_COMPETITIONS: Record<string, NationalCompetition> = {
  soccer_uefa_nations_league: { eloClass: "NL", neutral: false },
  soccer_fifa_world_cup_qualifiers_europe: { eloClass: "WCQ", neutral: false },
  soccer_fifa_world_cup_qualifiers_south_america: { eloClass: "WCQ", neutral: false },
  soccer_uefa_euro_qualification: { eloClass: "CQ", neutral: false },
  soccer_fifa_world_cup: { eloClass: "WC", neutral: true },
  soccer_uefa_european_championship: { eloClass: "CC", neutral: true },
  soccer_conmebol_copa_america: { eloClass: "CC", neutral: true },
  soccer_africa_cup_of_nations: { eloClass: "CC", neutral: true },
  soccer_concacaf_gold_cup: { eloClass: "CC", neutral: true },
};

/**
 * National-team competitions followed on top of the club ones: every competition above unless
 * ODDS_NATIONAL_SPORT_KEYS says otherwise (empty = none). They only play a few weeks a year,
 * so their odds are only fetched while The Odds API lists them in season.
 */
export function trackedNationalSportKeys(): string[] {
  const fromEnv = process.env.ODDS_NATIONAL_SPORT_KEYS;
  if (fromEnv === undefined) return Object.keys(NATIONAL_TEAM_COMPETITIONS);
  return fromEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Whether an event's teams are national teams (results and ratings come from the international dataset). */
export function isNationalTeamSport(sportKey: string): boolean {
  return sportKey in NATIONAL_TEAM_COMPETITIONS || trackedNationalSportKeys().includes(sportKey);
}

/** CompetitionModel code of a national-team Elo class ("INT-NL"): clubs use football-data.org codes. */
export function nationalCompetitionCode(eloClass: InternationalClass): string {
  return `INT-${eloClass}`;
}
