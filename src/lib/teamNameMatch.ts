// The Odds API and football-data.org don't share team identifiers, so matching
// an event's home/away team name to a TeamStats row is done on normalized
// name text, with a small alias table for the common short names bookmakers use.

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

export type MatchableTeam = { name: string; shortName: string | null; tla: string | null };

/** Finds the TeamStats row whose name best matches an Odds API team name, or null. */
export function findTeamStats<T extends MatchableTeam>(oddsApiName: string, candidates: T[]): T | null {
  const target = normalizeTeamName(oddsApiName);
  if (!target) return null;

  for (const candidate of candidates) {
    if (normalizeTeamName(candidate.name) === target) return candidate;
    if (candidate.shortName && normalizeTeamName(candidate.shortName) === target) return candidate;
  }

  // Fallback: one normalized name fully contains the other (handles e.g.
  // "Wolverhampton Wanderers" vs "Wolverhampton Wanderers FC" edge cases
  // the suffix stripping above didn't anticipate).
  for (const candidate of candidates) {
    const candidateName = normalizeTeamName(candidate.name);
    if (candidateName.length > 3 && (candidateName.includes(target) || target.includes(candidateName))) {
      return candidate;
    }
  }

  return null;
}
