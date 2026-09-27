import { test } from "node:test";
import assert from "node:assert/strict";
import { isNationalTeamSport, NATIONAL_TEAM_COMPETITIONS, trackedNationalSportKeys } from "@/lib/leagueMapping";
import { matchNationalTeam, nationalTeamIndex, normalizeCountryName } from "@/lib/nationalTeamNames";

const index = nationalTeamIndex([
  "United States",
  "South Korea",
  "North Korea",
  "Republic of Ireland",
  "Northern Ireland",
  "Czech Republic",
  "Turkey",
  "Ivory Coast",
  "Bosnia and Herzegovina",
  "Curaçao",
  "São Tomé and Príncipe",
  "Saint Kitts and Nevis",
  "Trinidad and Tobago",
  "Guinea",
  "Equatorial Guinea",
  "Guinea-Bissau",
  "DR Congo",
  "Congo",
  "France",
]);

test("country names are normalised: accents, punctuation, '&' and 'St.'", () => {
  assert.equal(normalizeCountryName("São Tomé & Príncipe"), "sao tome and principe");
  assert.equal(normalizeCountryName("St. Kitts and Nevis"), "saint kitts and nevis");
  assert.equal(normalizeCountryName("Côte d'Ivoire"), "cote d ivoire");
  assert.equal(normalizeCountryName("Guinea-Bissau"), "guinea bissau");
});

test("bookmaker spellings find the dataset's team", () => {
  const cases: [string, string][] = [
    ["USA", "United States"],
    ["Korea Republic", "South Korea"],
    ["Korea DPR", "North Korea"],
    ["Czechia", "Czech Republic"],
    ["Türkiye", "Turkey"],
    ["Côte d'Ivoire", "Ivory Coast"],
    ["Bosnia & Herzegovina", "Bosnia and Herzegovina"],
    ["Curacao", "Curaçao"],
    ["Sao Tome & Principe", "São Tomé and Príncipe"],
    ["St. Kitts and Nevis", "Saint Kitts and Nevis"],
    ["Trinidad & Tobago", "Trinidad and Tobago"],
    ["Congo DR", "DR Congo"],
    ["Guinea Bissau", "Guinea-Bissau"],
    ["France", "France"],
  ];
  for (const [oddsApiName, datasetName] of cases) assert.equal(matchNationalTeam(oddsApiName, index), datasetName, oddsApiName);
});

test("never a substring match: Ireland is the Republic, Guinea is Guinea", () => {
  assert.equal(matchNationalTeam("Ireland", index), "Republic of Ireland");
  assert.equal(matchNationalTeam("Northern Ireland", index), "Northern Ireland");
  assert.equal(matchNationalTeam("Guinea", index), "Guinea");
  assert.equal(matchNationalTeam("Congo", index), "Congo");
  assert.equal(matchNationalTeam("Korea", index), "South Korea");
  assert.equal(matchNationalTeam("Atlantis", index), null);
});

test("the same spelling wins over a variant, so a renamed dataset team is still found", () => {
  assert.equal(matchNationalTeam("Türkiye", nationalTeamIndex(["Türkiye", "Wales"])), "Türkiye");
  assert.equal(matchNationalTeam("Turkiye", nationalTeamIndex(["Turkey"])), "Turkey");
});

test("women's, youth and Olympic sides don't borrow the senior men's ratings", () => {
  for (const name of ["France Women", "France W", "France U21", "France U23", "France Olympic"]) {
    assert.equal(matchNationalTeam(name, index), null, name);
  }
});

test("national-team competitions are followed by default, and can be narrowed or switched off", () => {
  const previous = process.env.ODDS_NATIONAL_SPORT_KEYS;
  try {
    delete process.env.ODDS_NATIONAL_SPORT_KEYS;
    assert.deepEqual(trackedNationalSportKeys(), Object.keys(NATIONAL_TEAM_COMPETITIONS));
    assert.ok(isNationalTeamSport("soccer_uefa_nations_league"));
    assert.ok(!isNationalTeamSport("soccer_epl"));

    process.env.ODDS_NATIONAL_SPORT_KEYS = " soccer_uefa_nations_league , soccer_some_friendlies ";
    assert.deepEqual(trackedNationalSportKeys(), ["soccer_uefa_nations_league", "soccer_some_friendlies"]);
    assert.ok(isNationalTeamSport("soccer_some_friendlies"), "an extra key is still a national-team competition");

    process.env.ODDS_NATIONAL_SPORT_KEYS = "";
    assert.deepEqual(trackedNationalSportKeys(), []);
    assert.ok(isNationalTeamSport("soccer_fifa_world_cup"), "a known competition stays national even when not followed");
  } finally {
    if (previous === undefined) delete process.env.ODDS_NATIONAL_SPORT_KEYS;
    else process.env.ODDS_NATIONAL_SPORT_KEYS = previous;
  }
});
