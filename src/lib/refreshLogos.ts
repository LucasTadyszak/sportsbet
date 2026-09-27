// Logos from TheSportsDB (src/lib/theSportsDbApi.ts): the emblem of each competition The Odds
// API syncs, and the crest of each club of its recent and upcoming matches. Stored on
// Sport.logo and Team.logo and looked up again now and then: the pages only read them back.
import type { Team } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { SPORT_KEY_TO_THESPORTSDB_LEAGUE, theSportsDbTeamLookup } from "@/lib/leagueMapping";
import { leagueLogo, matchSportsDbTeam, teamLogo, type TeamLookup } from "@/lib/logoMatch";
import { lookupAllTeams, lookupLeague, lookupTeam, searchTeams, type SportsDbTeam } from "@/lib/theSportsDbApi";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A logo found is looked up again after this long: clubs rebrand, TheSportsDB re-uploads. */
const FOUND_RECHECK_DAYS = 30;
/** A logo not found is looked for again after this long: TheSportsDB is crowd-sourced and fills in. */
const MISSING_RETRY_DAYS = 7;
/** A club's logo is kept up to date while it has a match this recent, or one to come. */
const RECENT_DAYS = 180;
/** A match still counts as upcoming this long after kickoff (it may be on). */
const LIVE_MS = 3 * 60 * 60 * 1000;

/**
 * TheSportsDB requests the odds job may spend on logos per run (~2 s each, spaced for the free
 * key's rate limit): new clubs get theirs within a run or two without holding the odds up.
 */
export const LOGO_REQUESTS_PER_ODDS_REFRESH = 20;

function isDue(item: { logo: string | null; logoCheckedAt: Date | null }, now: Date): boolean {
  if (!item.logoCheckedAt) return true;
  const ageDays = (now.getTime() - item.logoCheckedAt.getTime()) / DAY_MS;
  return ageDays >= (item.logo ? FOUND_RECHECK_DAYS : MISSING_RETRY_DAYS);
}

/** Thrown when a run has made all the requests it was allowed. */
class BudgetSpent extends Error {}

function requestBudget(max: number) {
  let used = 0;
  return {
    get used() {
      return used;
    },
    call<T>(request: () => Promise<T>): Promise<T> {
      if (used >= max) throw new BudgetSpent();
      used++;
      return request();
    },
  };
}

type Budget = ReturnType<typeof requestBudget>;

export type LogoRefreshSummary = {
  /** Competitions looked up this run, and whether they have a logo now. */
  competitions: { sportKey: string; found: boolean }[];
  /** Clubs looked up this run: how many have a logo now, and the ones that don't. */
  teams: { checked: number; found: number; missing: string[] };
  requests: number;
  /** Why the run ended before everything due was looked up, if it did: the rest is due next run. */
  stoppedEarly: string | null;
};

async function refreshCompetitionLogos(budget: Budget, now: Date, summary: LogoRefreshSummary) {
  const sports = await prisma.sport.findMany({ where: { key: { in: Object.keys(SPORT_KEY_TO_THESPORTSDB_LEAGUE) } } });
  for (const sport of sports) {
    if (!isDue(sport, now)) continue;
    const leagueId = SPORT_KEY_TO_THESPORTSDB_LEAGUE[sport.key];
    const league = await budget.call(() => lookupLeague(leagueId));
    // That very league's logo or none, whatever comes back; an empty answer keeps the logo
    // already found rather than taking it down over a hiccup.
    const logo = (league?.idLeague === leagueId ? leagueLogo(league) : null) ?? sport.logo;
    await prisma.sport.update({ where: { key: sport.key }, data: { logo, logoCheckedAt: now } });
    summary.competitions.push({ sportKey: sport.key, found: logo !== null });
  }
}

/**
 * The clubs of the recent and upcoming matches, the next match first (so what the board
 * shows gets its logo first when a run is cut short), each with the competitions of those
 * matches, the one it plays most in first: its league, rather than a cup or a European night.
 */
async function clubsToLookUp(now: Date): Promise<{ name: string; sportKeys: string[] }[]> {
  const events = await prisma.event.findMany({
    where: { commenceTime: { gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) } },
    select: { sportKey: true, homeTeam: true, awayTeam: true, commenceTime: true },
  });
  const rank = (commenceTime: Date) => {
    const ms = commenceTime.getTime() - now.getTime();
    return ms >= -LIVE_MS ? ms : RECENT_DAYS * DAY_MS - ms;
  };
  events.sort((a, b) => rank(a.commenceTime) - rank(b.commenceTime));

  // Insertion order: each club where its next (or latest) match puts it.
  const matchesBySport = new Map<string, Map<string, number>>();
  for (const event of events) {
    for (const name of [event.homeTeam, event.awayTeam]) {
      const bySport = matchesBySport.get(name) ?? new Map<string, number>();
      bySport.set(event.sportKey, (bySport.get(event.sportKey) ?? 0) + 1);
      matchesBySport.set(name, bySport);
    }
  }
  // A stable sort: between competitions with as many matches, the club's next match's first.
  return Array.from(matchesBySport, ([name, bySport]) => ({
    name,
    sportKeys: Array.from(bySport.keys()).sort((a, b) => (bySport.get(b) ?? 0) - (bySport.get(a) ?? 0)),
  }));
}

/** What TheSportsDB is told to look for: the sport and side of the club's main competition, in any of its competitions. */
function teamLookup(sportKeys: string[]): TeamLookup | null {
  const competitions = sportKeys.map(theSportsDbTeamLookup).filter((c) => c !== null);
  if (competitions.length === 0) return null;
  const [{ sport, gender }] = competitions;
  const leagueIds = competitions.flatMap((c) => (c.sport === sport && c.gender === gender && c.leagueId ? [c.leagueId] : []));
  return { sport, gender, leagueIds };
}

/** A club by its known id, else among its competitions' teams, else by a search on its name. */
async function findTeam(
  team: Team,
  lookup: TeamLookup,
  budget: Budget,
  rosters: Map<string, SportsDbTeam[]>
): Promise<SportsDbTeam | null> {
  const knownId = team.sportsDbTeamId;
  if (knownId) {
    // Our own earlier match, or set by hand to fix one the names never led to: taken as is.
    const known = await budget.call(() => lookupTeam(knownId));
    if (known?.idTeam === knownId) return known;
  }

  for (const leagueId of lookup.leagueIds) {
    // One request brings a whole league's clubs (a capped share of them on the free key).
    let roster = rosters.get(leagueId);
    if (!roster) {
      roster = await budget.call(() => lookupAllTeams(leagueId));
      rosters.set(leagueId, roster);
    }
    const inLeague = matchSportsDbTeam(team.name, roster, lookup);
    if (inLeague) return inLeague;
  }

  return matchSportsDbTeam(team.name, await budget.call(() => searchTeams(team.name)), lookup);
}

async function refreshTeamLogos(budget: Budget, now: Date, summary: LogoRefreshSummary) {
  const clubs = await clubsToLookUp(now);
  const teams = await prisma.team.findMany({ where: { name: { in: clubs.map((c) => c.name) } } });
  const byName = new Map(teams.map((t) => [t.name, t]));
  const rosters = new Map<string, SportsDbTeam[]>();

  for (const club of clubs) {
    const team = byName.get(club.name);
    const lookup = teamLookup(club.sportKeys);
    if (!team || !lookup || !isDue(team, now)) continue;

    const match = await findTeam(team, lookup, budget, rosters);
    const logo = (match ? teamLogo(match) : null) ?? team.logo;
    await prisma.team.update({
      where: { id: team.id },
      data: {
        sportsDbTeamId: match?.idTeam ?? team.sportsDbTeamId,
        logo,
        logoCheckedAt: now,
        // A lookup isn't a sighting: lastSeenAt stays when The Odds API last listed the team.
        lastSeenAt: team.lastSeenAt,
      },
    });
    summary.teams.checked++;
    if (logo) summary.teams.found++;
    else summary.teams.missing.push(team.name);
  }
}

/**
 * Looks up every logo that is due: never looked up yet, or long enough ago. `maxRequests` caps
 * the run's calls to TheSportsDB; whatever it leaves out is due at the next run.
 */
export async function refreshLogos({ maxRequests = Infinity, now = new Date() }: { maxRequests?: number; now?: Date } = {}): Promise<LogoRefreshSummary> {
  const budget = requestBudget(maxRequests);
  const summary: LogoRefreshSummary = { competitions: [], teams: { checked: 0, found: 0, missing: [] }, requests: 0, stoppedEarly: null };
  try {
    await refreshCompetitionLogos(budget, now, summary);
    await refreshTeamLogos(budget, now, summary);
  } catch (err) {
    // Out of requests, rate limited or TheSportsDB unreachable: what was looked up is saved,
    // the rest is still due. Logos are cosmetic: never a reason to fail the job running this.
    summary.stoppedEarly =
      err instanceof BudgetSpent ? `request cap (${maxRequests}) reached` : err instanceof Error ? err.message : String(err);
  }
  summary.requests = budget.used;
  return summary;
}

/** One line for a job's log. */
export function describeLogoRefresh({ competitions, teams, requests, stoppedEarly }: LogoRefreshSummary): string {
  const parts: string[] = [];
  if (competitions.length > 0) parts.push(`${competitions.filter((c) => c.found).length}/${competitions.length} competitions found`);
  if (teams.checked > 0) {
    const missing = teams.missing.length > 0 ? ` (not found: ${teams.missing.join(", ")})` : "";
    parts.push(`${teams.found}/${teams.checked} clubs found${missing}`);
  }
  const stopped = stoppedEarly ? `; stopped early: ${stoppedEarly}` : "";
  return `logos: ${parts.length > 0 ? parts.join(", ") : "nothing due"}; ${requests} TheSportsDB requests${stopped}`;
}
