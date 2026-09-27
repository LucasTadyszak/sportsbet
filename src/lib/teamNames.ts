// The Odds API, football-data.org and TheSportsDB don't share team identifiers or spell
// names the same way, so matching between them is done on normalized name text, with a small
// alias table for the common short names bookmakers use. Pure: shared by the football-data.org
// matching (src/lib/teamNameMatch.ts) and the logo matching (src/lib/logoMatch.ts).

const SUFFIX_WORDS = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "club", "calcio", "futbol", "football",
]);

// Odds API short/nickname -> normalized football-data.org name fragment.
const ALIASES: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "man city": "manchester city",
  spurs: "tottenham hotspur",
  wolves: "wolverhampton wanderers",
  "nottm forest": "nottingham forest",
  "nott'm forest": "nottingham forest",
  "west brom": "west bromwich albion",
  "brighton": "brighton hove albion",
  "leeds": "leeds united",
  "newcastle": "newcastle united",
  psg: "paris saint germain",
  "inter milan": "internazionale milano",
  inter: "internazionale milano",
  "ac milan": "milan",
  "bayern munich": "bayern munchen",
  atletico: "atletico madrid",
};

export function normalizeTeamName(rawName: string): string {
  const withoutAccents = rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const lower = withoutAccents.toLowerCase().trim();
  const aliased = ALIASES[lower] ?? lower;

  const words = aliased
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SUFFIX_WORDS.has(word));

  return words.join(" ");
}
