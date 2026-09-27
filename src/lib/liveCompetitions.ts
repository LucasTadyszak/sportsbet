// The competitions whose every match the board shows, fixtures and live scores from Free API Live
// Football Data (src/lib/liveFootballApi.ts), whether or not The Odds API prices them. The API uses
// FotMob's league ids (https://www.fotmob.com/leagues/<id>). Each competition is shown under a board
// key: The Odds API's sport_key when it has the competition, so that a priced match and the same
// match listed here become one block (src/lib/matchPairing.ts); else a key of ours in the same style.
// A competition's look and French name come from src/lib/competitions.ts, by that key.

export type LiveCompetition = {
  /** FotMob league id: the API's `leagueid`. */
  leagueId: number;
  /** Board competition key (src/lib/competitions.ts), shared with The Odds API where it has one. */
  sportKey: string;
  /** English name, for logs and the title of a key without a theme. */
  name: string;
};

export const LIVE_COMPETITIONS: LiveCompetition[] = [
  // The five big European leagues.
  { leagueId: 47, sportKey: "soccer_epl", name: "Premier League" },
  { leagueId: 87, sportKey: "soccer_spain_la_liga", name: "LaLiga" },
  { leagueId: 55, sportKey: "soccer_italy_serie_a", name: "Serie A" },
  { leagueId: 54, sportKey: "soccer_germany_bundesliga", name: "Bundesliga" },
  { leagueId: 53, sportKey: "soccer_france_ligue_one", name: "Ligue 1" },
  // European club cups.
  { leagueId: 42, sportKey: "soccer_uefa_champs_league", name: "Champions League" },
  { leagueId: 73, sportKey: "soccer_uefa_europa_league", name: "Europa League" },
  { leagueId: 10216, sportKey: "soccer_uefa_europa_conference_league", name: "Conference League" },
  // National teams: tournaments, their qualifiers, the Nations League (its four tiers are one
  // competition at The Odds API) and friendlies. Women's and youth sides have their own leagues.
  { leagueId: 77, sportKey: "soccer_fifa_world_cup", name: "World Cup" },
  { leagueId: 50, sportKey: "soccer_uefa_european_championship", name: "EURO" },
  { leagueId: 9806, sportKey: "soccer_uefa_nations_league", name: "UEFA Nations League A" },
  { leagueId: 9807, sportKey: "soccer_uefa_nations_league", name: "UEFA Nations League B" },
  { leagueId: 9808, sportKey: "soccer_uefa_nations_league", name: "UEFA Nations League C" },
  { leagueId: 9809, sportKey: "soccer_uefa_nations_league", name: "UEFA Nations League D" },
  { leagueId: 10195, sportKey: "soccer_fifa_world_cup_qualifiers_europe", name: "World Cup Qualification UEFA" },
  { leagueId: 10199, sportKey: "soccer_fifa_world_cup_qualifiers_south_america", name: "World Cup Qualification CONMEBOL" },
  { leagueId: 10196, sportKey: "soccer_fifa_world_cup_qualifiers_africa", name: "World Cup Qualification CAF" },
  { leagueId: 10197, sportKey: "soccer_fifa_world_cup_qualifiers_asia", name: "World Cup Qualification AFC" },
  { leagueId: 10198, sportKey: "soccer_fifa_world_cup_qualifiers_concacaf", name: "World Cup Qualification CONCACAF" },
  { leagueId: 10607, sportKey: "soccer_uefa_euro_qualification", name: "EURO Qualification" },
  { leagueId: 44, sportKey: "soccer_conmebol_copa_america", name: "Copa America" },
  { leagueId: 289, sportKey: "soccer_africa_cup_of_nations", name: "Africa Cup of Nations" },
  { leagueId: 290, sportKey: "soccer_afc_asian_cup", name: "Asian Cup" },
  { leagueId: 298, sportKey: "soccer_concacaf_gold_cup", name: "Gold Cup" },
  { leagueId: 114, sportKey: "soccer_international_friendlies", name: "International Friendlies" },
];

const BY_LEAGUE_ID = new Map(LIVE_COMPETITIONS.map((c) => [c.leagueId, c]));

// Read on every board render: an unknown id is only reported once per process.
const reportedUnknownIds = new Set<string>();

/**
 * The competitions followed: every one above unless LIVE_FOOTBALL_LEAGUE_IDS lists some of their
 * ids (e.g. "47,87,55,54,53" for the five leagues only; empty = none). An id missing from the
 * table has no board key to go under: it is ignored, with a warning.
 */
export function followedLiveCompetitions(): LiveCompetition[] {
  const fromEnv = process.env.LIVE_FOOTBALL_LEAGUE_IDS;
  if (fromEnv === undefined) return LIVE_COMPETITIONS;
  const followed: LiveCompetition[] = [];
  for (const raw of fromEnv.split(",").map((s) => s.trim()).filter(Boolean)) {
    const competition = BY_LEAGUE_ID.get(Number(raw));
    if (competition) followed.push(competition);
    else if (!reportedUnknownIds.has(raw)) {
      reportedUnknownIds.add(raw);
      console.warn(`LIVE_FOOTBALL_LEAGUE_IDS: no competition with league id "${raw}" in src/lib/liveCompetitions.ts, ignored`);
    }
  }
  return followed;
}

export function liveCompetition(leagueId: number): LiveCompetition | undefined {
  return BY_LEAGUE_ID.get(leagueId);
}
