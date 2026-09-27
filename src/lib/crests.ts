// Club crests, as football-data.org publishes them with its standings (TeamStats.crest).
// An Odds API team name reaches its crest through the Team registry, which remembers the
// football-data.org team each name was matched to (src/lib/teamNameMatch.ts); a name that
// was never matched simply has no crest.
import { prisma } from "@/lib/prisma";

// next.config.ts only lets next/image load crests from football-data.org's own CDN, and a
// URL from anywhere else would make the page throw: such a crest is dropped instead.
const CREST_HOST = "crests.football-data.org";

function isServableCrest(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname === CREST_HOST;
  } catch {
    return false;
  }
}

/** Crest URL of every given Odds API team name that has one. */
export async function crestsByTeamName(names: string[]): Promise<Map<string, string>> {
  const crests = new Map<string, string>();
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return crests;

  const teams = await prisma.team.findMany({
    where: { name: { in: unique }, footballDataTeamId: { not: null } },
    select: { name: true, footballDataTeamId: true },
  });
  const teamIds = Array.from(new Set(teams.map((t) => t.footballDataTeamId as number)));
  if (teamIds.length === 0) return crests;

  // A club in several tracked competitions has one TeamStats row per competition, same crest.
  const stats = await prisma.teamStats.findMany({
    where: { teamId: { in: teamIds }, crest: { not: null } },
    select: { teamId: true, crest: true },
  });
  const crestById = new Map<number, string>();
  for (const row of stats) {
    if (row.crest && isServableCrest(row.crest)) crestById.set(row.teamId, row.crest);
  }

  for (const team of teams) {
    const crest = crestById.get(team.footballDataTeamId as number);
    if (crest) crests.set(team.name, crest);
  }
  return crests;
}
