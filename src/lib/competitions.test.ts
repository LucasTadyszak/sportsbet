import { test } from "node:test";
import assert from "node:assert/strict";
import { byRank, competitionTheme, knownThemes } from "@/lib/competitions";
import { NATIONAL_TEAM_COMPETITIONS } from "@/lib/leagueMapping";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

test("white text reads on every header band, end to end (WCAG AA, 4.5:1)", () => {
  for (const theme of [...knownThemes(), competitionTheme("basketball_nba", "NBA")]) {
    for (const color of [theme.from, theme.to]) {
      assert.ok(contrastWithWhite(color) >= 4.5, `${theme.sportKey} ${color}: ${contrastWithWhite(color).toFixed(2)}:1`);
    }
  }
});

test("a known competition gets its French name; an unknown one keeps The Odds API title", () => {
  assert.equal(competitionTheme("soccer_uefa_champs_league", "UEFA Champions League").name, "Ligue des champions");
  const unknown = competitionTheme("soccer_japan_j_league", "J League");
  assert.equal(unknown.name, "J League");
  assert.equal(unknown.sport, "football");
  assert.equal(competitionTheme("basketball_nba", "NBA").sport, "other");
});

test("every national-team competition followed has its own name on the board", () => {
  for (const sportKey of Object.keys(NATIONAL_TEAM_COMPETITIONS)) {
    assert.notEqual(competitionTheme(sportKey, "Odds API title").name, "Odds API title", sportKey);
  }
});

test("the biggest competitions come first", () => {
  const sorted = [
    competitionTheme("soccer_japan_j_league", "J League"),
    competitionTheme("soccer_epl", "EPL"),
    competitionTheme("soccer_uefa_champs_league", "UEFA Champions League"),
  ].sort(byRank);
  assert.deepEqual(
    sorted.map((t) => t.sportKey),
    ["soccer_uefa_champs_league", "soccer_epl", "soccer_japan_j_league"]
  );
});
