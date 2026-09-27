import { test } from "node:test";
import assert from "node:assert/strict";
import { theSportsDbTeamLookup } from "@/lib/leagueMapping";
import { leagueLogo, matchSportsDbTeam, servableLogo, teamLogo, type TeamLookup } from "@/lib/logoMatch";
import type { SportsDbTeam } from "@/lib/theSportsDbApi";

const badge = (id: string) => `https://r2.thesportsdb.com/images/media/team/badge/${id}.png`;

function team(fields: Partial<SportsDbTeam> & Pick<SportsDbTeam, "idTeam" | "strTeam">): SportsDbTeam {
  return { strSport: "Soccer", strGender: "Male", idLeague: "4328", strBadge: badge(fields.idTeam), ...fields };
}

const epl: TeamLookup = { sport: "Soccer", gender: "Male", leagueIds: ["4328"] };
const ucl: TeamLookup = { sport: "Soccer", gender: "Male", leagueIds: ["4480"] };
const laLiga: TeamLookup = { ...epl, leagueIds: ["4335"] };

test("a club is found by its name, accents and FC-style affixes aside", () => {
  const atletico = team({ idTeam: "133729", strTeam: "Atlético Madrid", idLeague: "4335" });
  assert.equal(matchSportsDbTeam("Atletico Madrid", [atletico], laLiga), atletico);
  const bournemouth = team({ idTeam: "134301", strTeam: "AFC Bournemouth" });
  assert.equal(matchSportsDbTeam("Bournemouth", [bournemouth], epl), bournemouth);
});

test("or by one of its alternate names", () => {
  const psg = team({ idTeam: "133714", strTeam: "Paris SG", strTeamAlternate: "Paris Saint-Germain, PSG", idLeague: "4334" });
  assert.equal(matchSportsDbTeam("Paris Saint Germain", [psg], ucl), psg);
  const inter = team({ idTeam: "133681", strTeam: "Internazionale", strTeamAlternate: "Inter Milan", idLeague: "4332" });
  assert.equal(matchSportsDbTeam("Inter Milan", [inter], ucl), inter);
});

test("a namesake from another sport, or the women's side, is never taken", () => {
  const basketball = team({ idTeam: "1", strTeam: "Arsenal", strSport: "Basketball" });
  const women = team({ idTeam: "2", strTeam: "Arsenal Women", strTeamAlternate: "Arsenal", strGender: "Female" });
  assert.equal(matchSportsDbTeam("Arsenal", [basketball, women], epl), null);
  const men = team({ idTeam: "133604", strTeam: "Arsenal", strGender: null });
  assert.equal(matchSportsDbTeam("Arsenal", [basketball, women, men], epl), men, "no gender on record isn't a mismatch");
});

test("a name that only contains another one never matches", () => {
  const tula = team({ idTeam: "3", strTeam: "Arsenal Tula", idLeague: "4355" });
  assert.equal(matchSportsDbTeam("Arsenal", [tula], epl), null);
  const psg = team({ idTeam: "133714", strTeam: "Paris SG", strTeamAlternate: "Paris Saint-Germain, PSG", idLeague: "4334" });
  assert.equal(matchSportsDbTeam("Paris FC", [psg], { ...epl, leagueIds: ["4334"] }), null, "a roster cut short");
  assert.equal(matchSportsDbTeam("", [psg], epl), null);
});

test("namesakes: the one playing in the name's competitions, or none when that can't tell them apart", () => {
  const uruguay = team({ idTeam: "10", strTeam: "Nacional", idLeague: "4432" });
  const portugal = team({ idTeam: "11", strTeam: "Nacional", idLeague: "4344", idLeague2: "4510" });
  assert.equal(matchSportsDbTeam("Nacional", [uruguay, portugal], { ...epl, leagueIds: ["4344"] }), portugal);
  assert.equal(matchSportsDbTeam("Nacional", [uruguay, portugal], { ...epl, leagueIds: ["4480", "4510"] }), portugal, "a cup it plays in counts");
  assert.equal(matchSportsDbTeam("Nacional", [uruguay, portugal], ucl), null);
  assert.equal(matchSportsDbTeam("Nacional", [uruguay, portugal], { ...epl, leagueIds: [] }), null);
});

test("one clear match stands even outside the competition's league (a European night)", () => {
  const bayern = team({ idTeam: "133664", strTeam: "Bayern Munich", idLeague: "4331" });
  assert.equal(matchSportsDbTeam("Bayern Munich", [bayern], ucl), bayern);
  assert.equal(matchSportsDbTeam("Bayern Munich", [bayern, { ...bayern }], ucl), bayern, "the same team twice is one team");
});

test("only logos next/image is allowed to load are kept", () => {
  for (const url of [
    "https://crests.football-data.org/57.png",
    "https://crests.football-data.org/5.svg",
    badge("uyhbfe1612467038"),
    "https://www.thesportsdb.com/images/media/league/badge/i6o0kh1549879062.png",
  ]) {
    assert.equal(servableLogo(url), url);
  }
  for (const url of [
    "http://r2.thesportsdb.com/images/media/team/badge/a.png",
    "https://example.com/a.png",
    "https://www.thesportsdb.com/team/133604-arsenal",
    "https://r2.thesportsdb.com/images/media/team/badge/a.png?w=50",
    "https://r2.thesportsdb.com:8443/images/media/team/badge/a.png",
    "not a url",
    "",
    null,
    undefined,
  ]) {
    assert.equal(servableLogo(url), null, String(url));
  }
});

test("a club shows its badge, a competition its emblem, else its wordmark", () => {
  assert.equal(teamLogo(team({ idTeam: "133604", strTeam: "Arsenal" })), badge("133604"));
  assert.equal(teamLogo(team({ idTeam: "1", strTeam: "Arsenal", strBadge: "" })), null);
  const emblem = "https://r2.thesportsdb.com/images/media/league/badge/pl.png";
  const wordmark = "https://r2.thesportsdb.com/images/media/league/logo/pl.png";
  const league = { idLeague: "4328", strLeague: "English Premier League", strSport: "Soccer" };
  assert.equal(leagueLogo({ ...league, strBadge: emblem, strLogo: wordmark }), emblem);
  assert.equal(leagueLogo({ ...league, strBadge: null, strLogo: wordmark }), wordmark);
  assert.equal(leagueLogo({ ...league, strBadge: "https://example.com/pl.png", strLogo: null }), null);
});

test("each Odds API sport says which sport, side and league to look a club up in", () => {
  assert.deepEqual(theSportsDbTeamLookup("soccer_epl"), { sport: "Soccer", gender: "Male", leagueId: "4328" });
  assert.deepEqual(theSportsDbTeamLookup("soccer_uefa_champs_league"), { sport: "Soccer", gender: "Male", leagueId: "4480" });
  assert.deepEqual(theSportsDbTeamLookup("basketball_wnba"), { sport: "Basketball", gender: "Female", leagueId: null });
  assert.equal(theSportsDbTeamLookup("tennis_atp_us_open"), null, "no club badges for players");
});
