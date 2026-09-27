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

// Maps The Odds API's `sport_key` to TheSportsDB's league id: the competition's logo, and the
// league a club's logo is looked for in first (src/lib/refreshLogos.ts). Ids from
// https://www.thesportsdb.com/league/<id>; a sport not listed simply shows no competition logo.
export const SPORT_KEY_TO_THESPORTSDB_LEAGUE: Record<string, string> = {
  soccer_epl: "4328",
  soccer_efl_champ: "4329",
  soccer_england_league1: "4396",
  soccer_england_league2: "4397",
  soccer_fa_cup: "4482",
  soccer_england_efl_cup: "4570",
  soccer_spl: "4330",
  soccer_germany_bundesliga: "4331",
  soccer_germany_bundesliga2: "4399",
  soccer_germany_dfb_pokal: "4485",
  soccer_italy_serie_a: "4332",
  soccer_italy_serie_b: "4394",
  soccer_italy_coppa_italia: "4506",
  soccer_spain_la_liga: "4335",
  soccer_spain_segunda_division: "4400",
  soccer_spain_copa_del_rey: "4483",
  soccer_france_ligue_one: "4334",
  soccer_france_ligue_two: "4401",
  soccer_france_coupe_de_france: "4484",
  soccer_netherlands_eredivisie: "4337",
  soccer_portugal_primeira_liga: "4344",
  soccer_belgium_first_div: "4338",
  soccer_turkey_super_league: "4339",
  soccer_greece_super_league: "4336",
  soccer_denmark_superliga: "4340",
  soccer_sweden_allsvenskan: "4347",
  soccer_norway_eliteserien: "4358",
  soccer_switzerland_superleague: "4675",
  soccer_austria_bundesliga: "4621",
  soccer_poland_ekstraklasa: "4422",
  soccer_brazil_campeonato: "4351",
  soccer_argentina_primera_division: "4406",
  soccer_mexico_ligamx: "4350",
  soccer_usa_mls: "4346",
  soccer_japan_j_league: "4633",
  soccer_korea_kleague1: "4689",
  soccer_china_superleague: "4359",
  soccer_australia_aleague: "4356",
  soccer_saudi_arabia_pro_league: "4668",
  soccer_uefa_champs_league: "4480",
  soccer_uefa_europa_league: "4481",
  soccer_uefa_europa_conference_league: "5071",
  soccer_uefa_nations_league: "4490",
  soccer_uefa_european_championship: "4502",
  soccer_fifa_world_cup: "4429",
  soccer_fifa_club_world_cup: "4503",
  soccer_conmebol_copa_libertadores: "4501",
  soccer_conmebol_copa_sudamericana: "4724",
  soccer_conmebol_copa_america: "4499",
  soccer_africa_cup_of_nations: "4496",
  basketball_nba: "4387",
  basketball_ncaab: "4607",
  americanfootball_nfl: "4391",
  icehockey_nhl: "4380",
  baseball_mlb: "4424",
};

// The Odds API's sport_key prefix -> TheSportsDB's sport name. Sports whose "teams" are
// players (tennis, golf, MMA, boxing) have no club badge to look for, so they're left out.
const SPORT_PREFIX_TO_THESPORTSDB_SPORT: Record<string, string> = {
  soccer: "Soccer",
  basketball: "Basketball",
  americanfootball: "American Football",
  icehockey: "Ice Hockey",
  baseball: "Baseball",
  aussierules: "Australian Football",
  rugbyleague: "Rugby",
  rugbyunion: "Rugby",
  cricket: "Cricket",
};

/** What TheSportsDB needs to know to find a team of an Odds API sport, or null for a sport without club badges. */
export function theSportsDbTeamLookup(sportKey: string): { sport: string; gender: "Male" | "Female"; leagueId: string | null } | null {
  const sport = SPORT_PREFIX_TO_THESPORTSDB_SPORT[sportKey.split("_")[0]];
  if (!sport) return null;
  return {
    sport,
    gender: /women|wnba|nwsl/.test(sportKey) ? "Female" : "Male",
    leagueId: SPORT_KEY_TO_THESPORTSDB_LEAGUE[sportKey] ?? null,
  };
}
