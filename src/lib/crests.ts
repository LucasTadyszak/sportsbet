// Club logos and kit colours, keyed by Odds API team name. The logo is TheSportsDB's badge
// first (Team.logo, looked up by src/lib/refreshLogos.ts), since it covers every league; else
// the crest football-data.org publishes with its standings (TeamStats.crest); else FotMob's,
// by the id read off the Free API Live Football Data matches the team's are paired with
// (Team.fotmobTeamId, src/lib/refreshLogos.ts) — e.g. a national team that TheSportsDB's
// search, a few rows on the free key, doesn't bring back. Kit colours come
// from football-data.org's team list (TeamStats.clubColors). Both football-data.org fields are
// reached through the football-data.org team the name was matched to
// (src/lib/teamNameMatch.ts). A name with none of them simply has no logo and no colours.
import { prisma } from "@/lib/prisma";
import { fotmobTeamLogo } from "@/lib/liveMatches";
import { servableLogo } from "@/lib/logoMatch";
import { parseClubColors } from "@/lib/teamColors";

/** How a club shows on the board: its logo, and its kit colours (src/lib/teamColors.ts). */
export type TeamLook = { crest: string | null; colors: string[] };

/** Logo and kit colours of every given Odds API team name that has either. */
export async function teamLooksByName(names: string[]): Promise<Map<string, TeamLook>> {
  const looks = new Map<string, TeamLook>();
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return looks;

  const teams = await prisma.team.findMany({
    where: { name: { in: unique } },
    select: { name: true, logo: true, footballDataTeamId: true, fotmobTeamId: true },
  });

  // A club in several tracked competitions has one TeamStats row per competition, same crest and kit.
  const teamIds = Array.from(new Set(teams.flatMap((t) => (t.footballDataTeamId === null ? [] : [t.footballDataTeamId]))));
  const fromStats = new Map<number, TeamLook>();
  if (teamIds.length > 0) {
    const stats = await prisma.teamStats.findMany({
      where: { teamId: { in: teamIds }, OR: [{ crest: { not: null } }, { clubColors: { not: null } }] },
      select: { teamId: true, crest: true, clubColors: true },
    });
    for (const row of stats) {
      const look = fromStats.get(row.teamId) ?? { crest: null, colors: [] };
      look.crest ??= servableLogo(row.crest);
      if (look.colors.length === 0) look.colors = parseClubColors(row.clubColors);
      fromStats.set(row.teamId, look);
    }
  }

  for (const team of teams) {
    const stats = team.footballDataTeamId === null ? undefined : fromStats.get(team.footballDataTeamId);
    const crest = servableLogo(team.logo) ?? stats?.crest ?? servableLogo(fotmobTeamLogo(team.fotmobTeamId));
    const colors = stats?.colors ?? [];
    if (crest || colors.length > 0) looks.set(team.name, { crest, colors });
  }
  return looks;
}

/** Logo URL of every given Odds API team name that has one. */
export async function crestsByTeamName(names: string[]): Promise<Map<string, string>> {
  const crests = new Map<string, string>();
  for (const [name, look] of await teamLooksByName(names)) {
    if (look.crest) crests.set(name, look.crest);
  }
  return crests;
}
