// Club logos, keyed by Odds API team name. TheSportsDB's badge first (Team.logo, looked up by
// src/lib/refreshLogos.ts), since it covers every league; else the crest football-data.org
// publishes with its standings (TeamStats.crest), reached through the football-data.org team
// the name was matched to (src/lib/teamNameMatch.ts). A name with neither simply has no logo.
import { prisma } from "@/lib/prisma";
import { servableLogo } from "@/lib/logoMatch";

/** Logo URL of every given Odds API team name that has one. */
export async function crestsByTeamName(names: string[]): Promise<Map<string, string>> {
  const crests = new Map<string, string>();
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return crests;

  const teams = await prisma.team.findMany({
    where: { name: { in: unique } },
    select: { name: true, logo: true, footballDataTeamId: true },
  });
  for (const team of teams) {
    const logo = servableLogo(team.logo);
    if (logo) crests.set(team.name, logo);
  }

  const rest = teams.filter((t) => !crests.has(t.name) && t.footballDataTeamId !== null);
  const teamIds = Array.from(new Set(rest.map((t) => t.footballDataTeamId as number)));
  if (teamIds.length === 0) return crests;

  // A club in several tracked competitions has one TeamStats row per competition, same crest.
  const stats = await prisma.teamStats.findMany({
    where: { teamId: { in: teamIds }, crest: { not: null } },
    select: { teamId: true, crest: true },
  });
  const crestById = new Map<number, string>();
  for (const row of stats) {
    const crest = servableLogo(row.crest);
    if (crest) crestById.set(row.teamId, crest);
  }

  for (const team of rest) {
    const crest = crestById.get(team.footballDataTeamId as number);
    if (crest) crests.set(team.name, crest);
  }
  return crests;
}
