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
