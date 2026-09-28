// The Odds API and Free API Live Football Data list the same match under their own ids and their
// own spellings ("Brighton and Hove Albion" / "Brighton & Hove Albion", "USA" / "United States").
// A priced Event and a LiveMatch are one match on the board when they're in the same competition,
// kick off within a few hours of each other and their teams' names agree — or, failing the names,
// when each is the only one of its kind at that kick-off in that competition. The pairs also give
// each Odds API team its FotMob id, hence a logo (src/lib/refreshLogos.ts). Pure (unit tested).
import { canonicalCountryName } from "@/lib/nationalTeamNames";
import { normalizeTeamName } from "@/lib/teamNames";

/** What the pairing looks at, on either side. */
export type PairingMatch = { sportKey: string; kickoff: Date; homeTeam: string; awayTeam: string };

// One side's kick-off time can lag behind a rescheduling for a while.
const MAX_KICKOFF_GAP_MS = 6 * 60 * 60 * 1000;
// Same kick-off, give or take.
const SAME_SLOT_MS = 5 * 60 * 1000;

// Words too common in club names to say two names are the same club.
const COMMON_WORDS = new Set([
  "real", "club", "united", "city", "athletic", "atletico", "sporting", "olympique", "racing", "deportivo",
  "union", "stade", "borussia", "hotspur", "albion", "town", "rovers", "wanderers", "county", "saint",
  "north", "south", "northern", "republic", "new",
]);

/** What a team name is compared on: its normalised forms, as a club and as a country, and its telling words. */
type NameForms = { spellings: Set<string>; normalized: string; words: string[] };

// A board compares the same few hundred names over and over: each is worked out once.
const formsCache = new Map<string, NameForms>();

function formsOf(raw: string): NameForms {
  let forms = formsCache.get(raw);
  if (!forms) {
    if (formsCache.size >= 5000) formsCache.clear();
    const normalized = normalizeTeamName(raw);
    forms = {
      spellings: new Set([normalized, canonicalCountryName(raw)].filter((name) => name.length > 0)),
      normalized,
      // The words that can tell a club apart.
      words: normalized.split(" ").filter((word) => word.length >= 4 && !COMMON_WORDS.has(word)),
    };
    formsCache.set(raw, forms);
  }
  return forms;
}

/**
 * 2: the same team; 1: probably — one name contains the other, or a distinctive word of one starts
 * a word of the other ("Brest" / "Stade Brestois 29"); 0: no.
 */
export function sameTeamScore(a: string, b: string): 0 | 1 | 2 {
  const fa = formsOf(a);
  const fb = formsOf(b);
  for (const name of fa.spellings) if (fb.spellings.has(name)) return 2;
  const [na, nb] = [fa.normalized, fb.normalized];
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return 1;
  return fa.words.some((wa) => fb.words.some((wb) => wa.startsWith(wb) || wb.startsWith(wa))) ? 1 : 0;
}

function orientationScores(a: PairingMatch, b: PairingMatch): { straight: number; swapped: number } {
  return {
    straight: sameTeamScore(a.homeTeam, b.homeTeam) + sameTeamScore(a.awayTeam, b.awayTeam),
    swapped: sameTeamScore(a.homeTeam, b.awayTeam) + sameTeamScore(a.awayTeam, b.homeTeam),
  };
}

/** How well two fixtures' teams agree, either way round (a neutral venue has no true home side): 0 to 4. */
function namesScore(a: PairingMatch, b: PairingMatch): number {
  const { straight, swapped } = orientationScores(a, b);
  return Math.max(straight, swapped);
}

/** Whether a paired match lists the teams the other way round: its home side is the other's away side. */
export function isSwapped(a: PairingMatch, b: PairingMatch): boolean {
  const { straight, swapped } = orientationScores(a, b);
  return swapped > straight;
}

/**
 * The LiveMatch each Event is, if any: Event id → LiveMatch id. Names first (both teams probable,
 * or one certain), the best agreement and then the closest kick-off winning; then, for names no
 * table knows, a pair that is alone in its competition's kick-off slot.
 */
export function pairMatches(
  events: (PairingMatch & { id: string })[],
  liveMatches: (PairingMatch & { id: number })[]
): Map<string, number> {
  type Candidate = { eventId: string; matchId: number; score: number; gap: number };
  const candidates: Candidate[] = [];
  for (const event of events) {
    for (const match of liveMatches) {
      if (event.sportKey !== match.sportKey) continue;
      const gap = Math.abs(event.kickoff.getTime() - match.kickoff.getTime());
      if (gap <= MAX_KICKOFF_GAP_MS) candidates.push({ eventId: event.id, matchId: match.id, score: namesScore(event, match), gap });
    }
  }

  const pairs = new Map<string, number>();
  const taken = new Set<number>();
  const free = (c: Candidate) => !pairs.has(c.eventId) && !taken.has(c.matchId);
  const pair = (c: Candidate) => {
    pairs.set(c.eventId, c.matchId);
    taken.add(c.matchId);
  };

  for (const c of candidates.filter((c) => c.score >= 2).sort((a, b) => b.score - a.score || a.gap - b.gap)) {
    if (free(c)) pair(c);
  }

  const sameSlot = candidates.filter((c) => c.gap <= SAME_SLOT_MS);
  for (const c of sameSlot) {
    if (!free(c)) continue;
    const rivals = sameSlot.filter((o) => o !== c && free(o) && (o.eventId === c.eventId || o.matchId === c.matchId));
    if (rivals.length === 0) pair(c);
  }
  return pairs;
}

/** A LiveMatch as its teams' FotMob ids are read off it. */
export type IdentifiedMatch = PairingMatch & { homeTeamId: number | null; awayTeamId: number | null };

/**
 * FotMob's id of each Odds API team name, read off the LiveMatch each of its events is paired
 * with: the id most of its pairs give its side, counting a pair only when its name for that side
 * agrees with ours too — a pair made on the kick-off slot alone says nothing about a name. A name
 * whose pairs are split evenly gets none: better no logo than a wrong one.
 */
export function fotmobTeamIds(pairs: { event: PairingMatch; match: IdentifiedMatch }[]): Map<string, number> {
  const votes = new Map<string, Map<number, number>>();
  const vote = (name: string, theirName: string, id: number | null) => {
    if (id === null || sameTeamScore(name, theirName) === 0) return;
    const byId = votes.get(name) ?? new Map<number, number>();
    byId.set(id, (byId.get(id) ?? 0) + 1);
    votes.set(name, byId);
  };
  for (const { event, match } of pairs) {
    const swapped = isSwapped(event, match);
    vote(event.homeTeam, swapped ? match.awayTeam : match.homeTeam, swapped ? match.awayTeamId : match.homeTeamId);
    vote(event.awayTeam, swapped ? match.homeTeam : match.awayTeam, swapped ? match.homeTeamId : match.awayTeamId);
  }

  const ids = new Map<string, number>();
  for (const [name, byId] of votes) {
    const [first, second] = Array.from(byId).sort((a, b) => b[1] - a[1]);
    if (!second || first[1] > second[1]) ids.set(name, first[0]);
  }
  return ids;
}
