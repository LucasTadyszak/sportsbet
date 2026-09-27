// Club crests, as football-data.org publishes them with its standings (TeamStats.crest),
// and kit colours, from its team list (TeamStats.clubColors). An Odds API team name reaches
// them through the Team registry, which remembers the football-data.org team each name was
// matched to (src/lib/teamNameMatch.ts); a name that was never matched has neither.
import { prisma } from "@/lib/prisma";
import { parseClubColors } from "@/lib/teamColors";

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

/** How a club shows on the board: its crest, and its kit colours (src/lib/teamColors.ts). */
export type TeamLook = { crest: string | null; colors: string[] };

/** Crest and kit colours of every given Odds API team name matched to a football-data.org club. */
export async function teamLooksByName(names: string[]): Promise<Map<string, TeamLook>> {
  const looks = new Map<string, TeamLook>();
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return looks;

  const teams = await prisma.team.findMany({
    where: { name: { in: unique }, footballDataTeamId: { not: null } },
    select: { name: true, footballDataTeamId: true },
  });
  const teamIds = Array.from(new Set(teams.map((t) => t.footballDataTeamId as number)));
  if (teamIds.length === 0) return looks;

  // A club in several tracked competitions has one TeamStats row per competition, same crest and kit.
  const stats = await prisma.teamStats.findMany({
    where: { teamId: { in: teamIds }, OR: [{ crest: { not: null } }, { clubColors: { not: null } }] },
    select: { teamId: true, crest: true, clubColors: true },
  });
  const byId = new Map<number, TeamLook>();
  for (const row of stats) {
    const look = byId.get(row.teamId) ?? { crest: null, colors: [] };
    if (!look.crest && row.crest && isServableCrest(row.crest)) look.crest = row.crest;
    if (look.colors.length === 0) look.colors = parseClubColors(row.clubColors);
    byId.set(row.teamId, look);
  }

  for (const team of teams) {
    const look = byId.get(team.footballDataTeamId as number);
    if (look) looks.set(team.name, look);
  }
  return looks;
}

/** Crest URL of every given Odds API team name that has one. */
export async function crestsByTeamName(names: string[]): Promise<Map<string, string>> {
  const crests = new Map<string, string>();
  for (const [name, look] of await teamLooksByName(names)) {
    if (look.crest) crests.set(name, look.crest);
  }
  return crests;
}
