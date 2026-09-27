// The international results dataset in the database (NationalTeam + InternationalMatch), the
// national-team side of the Team registry, and the lookups the model and the grading need.
import { prisma } from "@/lib/prisma";
import { canFetch, markFetched } from "@/lib/footballDataStats";
import { buildInternationalMatches, fetchInternationalDataset, type InternationalMatchRecord } from "@/lib/internationalResultsApi";
import { trackedNationalSportKeys } from "@/lib/leagueMapping";
import { matchNationalTeam, nationalTeamIndex, type NationalTeamIndex } from "@/lib/nationalTeamNames";

const RESOURCE_KEY = "international-results";
const DAY_MS = 24 * 60 * 60 * 1000;

export type InternationalSyncSummary = { skipped: boolean; matches: number; added: number; updated: number; removed: number };

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const matchKey = (date: string, homeTeamId: number, awayTeamId: number) => `${date}|${homeTeamId}|${awayTeamId}`;

/**
 * Stores what changed in the dataset: new matches, corrected scores, 90-minute scores that
 * became known (goal minutes often come a few days after the result), and drops matches the
 * dataset no longer lists (a corrected date shows up as a new match).
 */
async function storeInternationalMatches(records: InternationalMatchRecord[]): Promise<Omit<InternationalSyncSummary, "skipped">> {
  const names = Array.from(new Set(records.flatMap((r) => [r.homeTeam, r.awayTeam])));
  await prisma.nationalTeam.createMany({ data: names.map((name) => ({ name })), skipDuplicates: true });
  const idOf = new Map((await prisma.nationalTeam.findMany()).map((t) => [t.name, t.id]));

  const stored = await prisma.internationalMatch.findMany();
  const storedByKey = new Map(stored.map((m) => [matchKey(isoDay(m.date), m.homeTeamId, m.awayTeamId), m]));

  const toCreate = [];
  const toUpdate = [];
  const listed = new Set<string>();
  for (const r of records) {
    const homeTeamId = idOf.get(r.homeTeam) as number;
    const awayTeamId = idOf.get(r.awayTeam) as number;
    const key = matchKey(r.date, homeTeamId, awayTeamId);
    listed.add(key);
    const data = {
      homeScore: r.homeScore,
      awayScore: r.awayScore,
      home90: r.home90,
      away90: r.away90,
      tournament: r.tournament,
      eloClass: r.eloClass,
      neutral: r.neutral,
    };
    const current = storedByKey.get(key);
    if (!current) toCreate.push({ date: new Date(`${r.date}T00:00:00Z`), homeTeamId, awayTeamId, ...data });
    else if ((Object.keys(data) as (keyof typeof data)[]).some((field) => current[field] !== data[field])) {
      toUpdate.push(prisma.internationalMatch.update({ where: { id: current.id }, data }));
    }
  }

  for (let i = 0; i < toCreate.length; i += 5000) {
    await prisma.internationalMatch.createMany({ data: toCreate.slice(i, i + 5000), skipDuplicates: true });
  }
  for (let i = 0; i < toUpdate.length; i += 100) await prisma.$transaction(toUpdate.slice(i, i + 100));

  // A download cut short must never wipe the history: only prune against a complete-looking file.
  const unlisted = stored.filter((m) => !listed.has(matchKey(isoDay(m.date), m.homeTeamId, m.awayTeamId)));
  const removed = records.length >= stored.length * 0.95 && unlisted.length > 0
    ? (await prisma.internationalMatch.deleteMany({ where: { id: { in: unlisted.map((m) => m.id) } } })).count
    : 0;

  return { matches: records.length, added: toCreate.length, updated: toUpdate.length, removed };
}

/**
 * Downloads the dataset (no key, no quota) and stores what changed. Throttled like the
 * football-data.org stats unless forced (the nightly grading wants the latest results), and
 * skipped altogether when no national-team competition is followed.
 */
export async function syncInternationalResults(opts: { force?: boolean } = {}): Promise<InternationalSyncSummary> {
  const skipped = { skipped: true, matches: 0, added: 0, updated: 0, removed: 0 };
  if (trackedNationalSportKeys().length === 0) return skipped;
  if (!opts.force && !(await canFetch(RESOURCE_KEY))) return skipped;
  const records = buildInternationalMatches(await fetchInternationalDataset());
  const summary = await storeInternationalMatches(records);
  await markFetched(RESOURCE_KEY);
  return { skipped: false, ...summary };
}

export type NationalTeamRef = { id: number; name: string };

export type NationalTeams = { byId: Map<number, NationalTeamRef>; byName: Map<string, NationalTeamRef>; index: NationalTeamIndex };

export async function loadNationalTeams(): Promise<NationalTeams> {
  const teams = await prisma.nationalTeam.findMany({ select: { id: true, name: true } });
  return {
    byId: new Map(teams.map((t) => [t.id, t])),
    byName: new Map(teams.map((t) => [t.name, t])),
    index: nationalTeamIndex(teams.map((t) => t.name)),
  };
}

/** Elo ratings, the goals model and TeamRating use the negative id: it can never be a club's. */
export const nationalRatingId = (team: NationalTeamRef) => -team.id;

/**
 * Resolves an Odds API national team name and records the match on the Team registry (which
 * the grading reads). Unlike club names, country names match exactly, so the match is redone
 * every time — a team the dataset renames is followed — and the registry is only the fallback.
 */
export async function resolveNationalTeam(oddsApiName: string, teams: NationalTeams): Promise<NationalTeamRef | null> {
  const registered = await prisma.team.findUnique({ where: { name: oddsApiName } });
  const datasetName = matchNationalTeam(oddsApiName, teams.index);
  const team = datasetName ? teams.byName.get(datasetName) : undefined;
  if (!team) return registered?.nationalTeamId != null ? (teams.byId.get(registered.nationalTeamId) ?? null) : null;
  if (registered?.nationalTeamId !== team.id) {
    await prisma.team.upsert({
      where: { name: oddsApiName },
      create: { name: oddsApiName, nationalTeamId: team.id },
      update: { nationalTeamId: team.id },
    });
  }
  return team;
}

// The dataset only has the local date of a match: count it as played at midday UTC.
const MIDDAY_MS = 12 * 60 * 60 * 1000;
const REST_LOOKBACK_DAYS = 30;
// A match this close to kickoff is the event itself (the two sources' dates can differ by a day).
const SAME_MATCH_MS = 20 * 60 * 60 * 1000;

/**
 * Days since the team's previous match, from the dataset or from the national-team events we
 * have odds for — the dataset only catches up a few days after an international window, when
 * the second match of the window is precisely the one where short rest matters.
 */
export async function nationalRestDays(team: NationalTeamRef, oddsApiName: string, kickoff: Date): Promise<number | null> {
  const from = new Date(kickoff.getTime() - REST_LOOKBACK_DAYS * DAY_MS);
  const before = new Date(kickoff.getTime() - SAME_MATCH_MS);
  const [played, listed] = await Promise.all([
    prisma.internationalMatch.findFirst({
      where: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }], date: { gte: from, lte: before } },
      orderBy: { date: "desc" },
    }),
    prisma.event.findFirst({
      where: {
        sportKey: { in: trackedNationalSportKeys() },
        OR: [{ homeTeam: oddsApiName }, { awayTeam: oddsApiName }],
        commenceTime: { gte: from, lte: before },
      },
      orderBy: { commenceTime: "desc" },
    }),
  ]);
  const last = Math.max(played ? played.date.getTime() + MIDDAY_MS : 0, listed ? listed.commenceTime.getTime() : 0);
  return last > 0 ? (kickoff.getTime() - last) / DAY_MS : null;
}

export type InternationalResult = { status: "FINISHED"; homeGoals: number | null; awayGoals: number | null };

/**
 * The dataset's match for a national-team event: same two teams (either way round — on neutral
 * ground the dataset may list them the other way) within a day of kickoff, the local date
 * differing from the UTC one for late kickoffs in the Americas. The score is the 90-minute one,
 * oriented like the event, and null while it isn't known for certain.
 */
export async function findEventInternationalResult(event: {
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
}): Promise<InternationalResult | null> {
  // Names are normally matched while the event is upcoming (predictions); if that never
  // happened, match them now rather than leave the event ungraded.
  const registered = await prisma.team.findMany({ where: { name: { in: [event.homeTeam, event.awayTeam] } } });
  let teams: NationalTeams | null = null;
  const nationalTeamId = async (name: string) => {
    const known = registered.find((t) => t.name === name)?.nationalTeamId;
    if (known != null) return known;
    teams ??= await loadNationalTeams();
    return (await resolveNationalTeam(name, teams))?.id ?? null;
  };
  const homeId = await nationalTeamId(event.homeTeam);
  const awayId = await nationalTeamId(event.awayTeam);
  if (homeId == null || awayId == null) return null;

  const day = new Date(`${isoDay(event.commenceTime)}T00:00:00Z`);
  const match = await prisma.internationalMatch.findFirst({
    where: {
      OR: [
        { homeTeamId: homeId, awayTeamId: awayId },
        { homeTeamId: awayId, awayTeamId: homeId },
      ],
      date: { gte: new Date(day.getTime() - DAY_MS), lte: new Date(day.getTime() + DAY_MS) },
    },
    orderBy: { date: "asc" },
  });
  if (!match) return null;
  const swapped = match.homeTeamId !== homeId;
  return {
    status: "FINISHED",
    homeGoals: swapped ? match.away90 : match.home90,
    awayGoals: swapped ? match.home90 : match.away90,
  };
}
