import { test } from "node:test";
import assert from "node:assert/strict";
import { fotmobTeamIds, isSwapped, pairMatches, sameTeamScore, type IdentifiedMatch, type PairingMatch } from "@/lib/matchPairing";

const at = (hhmm: string, day = "2026-09-27") => new Date(`${day}T${hhmm}:00Z`);

function event(id: string, homeTeam: string, awayTeam: string, kickoff: Date, sportKey = "soccer_epl"): PairingMatch & { id: string } {
  return { id, sportKey, kickoff, homeTeam, awayTeam };
}

function live(id: number, homeTeam: string, awayTeam: string, kickoff: Date, sportKey = "soccer_epl"): PairingMatch & { id: number } {
  return { id, sportKey, kickoff, homeTeam, awayTeam };
}

test("two spellings of one club, or of one country, are the same team", () => {
  assert.equal(sameTeamScore("Manchester United", "Manchester United FC"), 2);
  assert.equal(sameTeamScore("Wolves", "Wolverhampton Wanderers"), 2, "a known alias");
  assert.equal(sameTeamScore("USA", "United States"), 2);
  assert.equal(sameTeamScore("Czech Republic", "Czechia"), 2);
  assert.equal(sameTeamScore("Brighton and Hove Albion", "Brighton & Hove Albion"), 2);
  assert.equal(sameTeamScore("Stade Brestois 29", "Brest"), 1);
  assert.equal(sameTeamScore("Borussia Mönchengladbach", "Gladbach"), 1);
  assert.equal(sameTeamScore("Manchester United", "Manchester City"), 1, "a shared place name is only a hint");
  assert.equal(sameTeamScore("Real Madrid", "Real Sociedad"), 0, "a word every other club has says nothing");
  assert.equal(sameTeamScore("Arsenal", "Chelsea"), 0);
});

test("the same slot's matches pair up by their teams", () => {
  const pairs = pairMatches(
    [event("a", "Arsenal", "Chelsea", at("14:00")), event("b", "Brighton and Hove Albion", "Manchester United", at("14:00"))],
    [live(1, "Brighton & Hove Albion", "Manchester United", at("14:00")), live(2, "Arsenal", "Chelsea", at("14:00"))]
  );
  assert.deepEqual(Object.fromEntries(pairs), { a: 2, b: 1 });
});

test("a kick-off moved by an hour, or home and away the other way round, is still the same match", () => {
  const pairs = pairMatches(
    [event("moved", "Liverpool", "Everton", at("16:30")), event("neutral", "France", "Spain", at("19:45"), "soccer_uefa_nations_league")],
    [live(1, "Liverpool", "Everton", at("17:30")), live(2, "Spain", "France", at("19:45"), "soccer_uefa_nations_league")]
  );
  assert.deepEqual(Object.fromEntries(pairs), { moved: 1, neutral: 2 });
  assert.equal(isSwapped(event("n", "France", "Spain", at("19:45")), live(2, "Spain", "France", at("19:45"))), true);
  assert.equal(isSwapped(event("m", "Liverpool", "Everton", at("16:30")), live(1, "Liverpool", "Everton", at("17:30"))), false);
});

test("another competition, or a kick-off more than six hours away, is another match", () => {
  const pairs = pairMatches(
    [event("league", "Arsenal", "Chelsea", at("14:00")), event("cup", "Arsenal", "Chelsea", at("19:00", "2026-09-30"), "soccer_uefa_champs_league")],
    [live(1, "Arsenal", "Chelsea", at("19:00", "2026-09-30")), live(2, "Arsenal", "Chelsea", at("20:15"))]
  );
  assert.equal(pairs.size, 0);
});

test("Ireland is the Republic of Ireland, not Northern Ireland playing at the same time", () => {
  const nationsLeague = "soccer_fifa_world_cup_qualifiers_europe";
  const pairs = pairMatches(
    [event("irl", "Ireland", "Portugal", at("18:45"), nationsLeague)],
    [live(1, "Northern Ireland", "Germany", at("18:45"), nationsLeague), live(2, "Republic of Ireland", "Portugal", at("18:45"), nationsLeague)]
  );
  assert.deepEqual(Object.fromEntries(pairs), { irl: 2 });
});

test("names no table knows: paired when alone in their competition's kick-off slot, never on a guess", () => {
  const alone = pairMatches(
    [event("e", "Olympique Lyonnais", "AS Saint-Etienne", at("19:00"), "soccer_france_ligue_one")],
    [live(1, "OL", "ASSE", at("19:00"), "soccer_france_ligue_one")]
  );
  assert.deepEqual(Object.fromEntries(alone), { e: 1 });

  const crowded = pairMatches(
    [event("e1", "OL", "ASSE", at("19:00"), "soccer_france_ligue_one"), event("e2", "LOSC", "RCL", at("19:00"), "soccer_france_ligue_one")],
    [live(1, "Lyon", "Saint-Etienne", at("19:00"), "soccer_france_ligue_one"), live(2, "Lille", "Lens", at("19:00"), "soccer_france_ligue_one")]
  );
  assert.equal(crowded.size, 0);
});

// The LiveMatch of a pair, with its teams' FotMob ids (sport and kick-off don't matter here).
function identified(homeTeam: string, homeTeamId: number | null, awayTeam: string, awayTeamId: number | null): IdentifiedMatch {
  return { sportKey: "soccer_uefa_nations_league", kickoff: at("18:45"), homeTeam, homeTeamId, awayTeam, awayTeamId };
}

test("each side of a paired match gets its FotMob id, whichever way round and however spelt", () => {
  const nl = "soccer_uefa_nations_league";
  const ids = fotmobTeamIds([
    { event: event("a", "Germany", "Serbia", at("18:45"), nl), match: identified("Germany", 1, "Serbia", 2) },
    { event: event("b", "Bulgaria", "Estonia", at("16:00"), nl), match: identified("Estonia", 3, "Bulgaria", 4) },
    { event: event("c", "Czech Republic", "Bosnia & Herzegovina", at("18:45"), nl), match: identified("Czechia", 5, "Bosnia and Herzegovina", 6) },
  ]);
  assert.deepEqual(Object.fromEntries(ids), {
    Germany: 1,
    Serbia: 2,
    Bulgaria: 4,
    Estonia: 3,
    "Czech Republic": 5,
    "Bosnia & Herzegovina": 6,
  });
});

test("a side whose names don't agree (a pair made on the slot alone), or without an id, gets none", () => {
  const ids = fotmobTeamIds([
    { event: event("e", "Olympique Lyonnais", "AS Saint-Etienne", at("19:00")), match: identified("OL", 1, "Saint-Etienne", 2) },
    { event: event("f", "Arsenal", "Chelsea", at("14:00")), match: identified("Arsenal", null, "Chelsea", 3) },
  ]);
  assert.deepEqual(Object.fromEntries(ids), { "AS Saint-Etienne": 2, Chelsea: 3 });
});

test("the id most of a team's pairs give wins; an even split gives none", () => {
  const pair = (latviaId: number, montenegroId: number) => ({
    event: event("x", "Latvia", "Montenegro", at("16:00")),
    match: identified("Latvia", latviaId, "Montenegro", montenegroId),
  });
  const ids = fotmobTeamIds([pair(1, 2), pair(1, 3), pair(4, 2), pair(1, 3)]);
  assert.deepEqual(Object.fromEntries(ids), { Latvia: 1 });
});
