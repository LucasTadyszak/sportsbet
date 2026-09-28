// Where the matches of saved bets stand ("Mes paris", src/lib/savedBets.ts). Bets settle on the
// 90-minute score: the one the journal is graded on (src/lib/eventResults.ts) as soon as its
// source has it, else Free API Live Football Data's final score when the match ended in regular
// time — minutes after the whistle, as the board shows it. While a match is on: its score and clock.
import { liveScoresOf, type LiveScore } from "@/lib/board";
import { hasKickedOff } from "@/lib/dates";
import { findEventResult } from "@/lib/eventResults";
import { liveStatusLabel } from "@/lib/labels";
import { matchPhase } from "@/lib/liveMatches";
import { prisma } from "@/lib/prisma";
import type { MatchResult } from "@/lib/savedBets";

// How the API labels a match that went beyond 90 minutes ("AET", "Pen"): its final score isn't
// the one bets settle on.
const BEYOND_90_MINUTES = /pen|aet|extra/i;

type ResultEvent = { id: string; sportKey: string; homeTeam: string; awayTeam: string; commenceTime: Date };

async function matchResult(event: ResultEvent, live: LiveScore | null, now: Date): Promise<MatchResult> {
  const kickoff = event.commenceTime.toISOString();
  const label = live ? liveStatusLabel(live) : null;
  const beyond90 = BEYOND_90_MINUTES.test(live?.reason ?? "");

  if (hasKickedOff(event.commenceTime, now)) {
    const result = await findEventResult(event);
    if (result?.status === "CANCELLED" || result?.status === "AWARDED") return { state: "void", kickoff, home: null, away: null, label: "Annulé" };
    if (result?.status === "FINISHED" && result.homeGoals !== null && result.awayGoals !== null) {
      return { state: "final", kickoff, home: result.homeGoals, away: result.awayGoals, label: beyond90 ? "Score à 90 min" : "Terminé" };
    }
  }

  const score = { home: live?.homeScore ?? null, away: live?.awayScore ?? null };
  switch (matchPhase(event.commenceTime, live, now)) {
    case "upcoming":
      return { state: "upcoming", kickoff, home: null, away: null, label: null };
    case "live":
      return { state: "live", kickoff, ...score, label: label ?? "En cours" };
    case "done":
      if (live?.status === "cancelled" || live?.status === "abandoned") return { state: "void", kickoff, ...score, label };
      if (live?.status === "finished" && score.home !== null && score.away !== null && !beyond90) {
        return { state: "final", kickoff, home: score.home, away: score.away, label };
      }
      // Extra time, a postponed match, or no result reported yet.
      return { state: "waiting", kickoff, ...score, label };
  }
}

/** Where each of these events stands, by id; an id that isn't a priced event is left out. */
export async function getMatchResults(eventIds: string[], now = new Date()): Promise<Record<string, MatchResult>> {
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, sportKey: true, homeTeam: true, awayTeam: true, commenceTime: true },
  });
  const live = await liveScoresOf(events);
  const results = await Promise.all(events.map((event) => matchResult(event, live.get(event.id) ?? null, now)));
  return Object.fromEntries(events.map((event, i) => [event.id, results[i]]));
}
