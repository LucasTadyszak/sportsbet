"use server";

import { getMatchResults } from "@/lib/betResults";
import { syncLiveMatches } from "@/lib/liveSync";
import type { MatchResult } from "@/lib/savedBets";

// More than a browser's saved bets ever have left to settle at once.
const MAX_EVENTS = 100;

/**
 * Where the matches of saved bets stand, by event id: the bets themselves stay in the browser.
 * Anyone may call it with any ids, and learns no more than the board shows. Like the board, it
 * first brings the live scores up to date (whatever is due).
 */
export async function fetchMatchResults(eventIds: string[]): Promise<Record<string, MatchResult>> {
  const valid = Array.isArray(eventIds) ? eventIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 100) : [];
  const ids = Array.from(new Set(valid)).slice(0, MAX_EVENTS);
  if (ids.length === 0) return {};
  await syncLiveMatches();
  return getMatchResults(ids);
}
