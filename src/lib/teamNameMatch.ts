// The Odds API and football-data.org don't share team identifiers, so matching
// an event's home/away team name to a TeamStats row is done on normalized
// name text (src/lib/teamNames.ts).
import { prisma } from "@/lib/prisma";
import { normalizeTeamName } from "@/lib/teamNames";

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

export type TeamStatsCandidate = MatchableTeam & { teamId: number };

/**
 * Resolves an Odds API team name to a TeamStats row, remembering a successful match in
 * the Team registry (keyed by the exact Odds API name) so that a name only ever needs
 * the fuzzy-matching heuristics above once — every later sync reuses the stored id.
 */
export async function resolveTeamStats<T extends TeamStatsCandidate>(
  oddsApiName: string,
  competitionCode: string,
  candidates: T[]
): Promise<T | null> {
  const team = await prisma.team.findUnique({ where: { name: oddsApiName } });

  if (team?.competitionCode === competitionCode && team.footballDataTeamId !== null) {
    const remembered = candidates.find((c) => c.teamId === team.footballDataTeamId);
    if (remembered) return remembered;
  }

  const match = findTeamStats(oddsApiName, candidates);
  if (match) {
    await prisma.team.upsert({
      where: { name: oddsApiName },
      create: { name: oddsApiName, competitionCode, footballDataTeamId: match.teamId },
      update: { competitionCode, footballDataTeamId: match.teamId },
    });
  }
  return match;
}
