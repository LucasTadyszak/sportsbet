// The site brings the followed competitions' matches up to date itself as it's used
// (src/lib/refreshLiveMatches.ts): a page, or an action, starts whatever is due, waits for it a
// moment (the board only for a day it has never fetched), then goes on with what the database
// has; the rest finishes after the response.
import { after } from "next/server";
import { dayListsRead, describeLiveRefresh, liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";

// How long a page waits for Free API Live Football Data before rendering with what it has: the
// rest of the refresh finishes after the response, and shows from the next render on.
const LIVE_SYNC_WAIT_MS = 3000;

let reportedMissingKey = false;

/** Starts whatever is due, the board days `days` included, and lets it finish after the response. */
function startLiveSync(days: string[]): Promise<void> {
  const sync = refreshLiveMatches({ days }).then((summary) => {
    if (!summary.configured && !reportedMissingKey) {
      reportedMissingKey = true;
      console.warn("RAPIDAPI_KEY is not set for the site: the board shows the matches already in the database, without refreshing them");
    }
    if (liveRefreshFailed(summary)) console.warn(`Free API Live Football Data refresh:\n${describeLiveRefresh(summary)}`);
  });
  after(() => sync);
  return sync;
}

async function waitAMoment(sync: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([sync, new Promise((resolve) => (timer = setTimeout(resolve, LIVE_SYNC_WAIT_MS)))]);
  clearTimeout(timer);
}

/** Fixtures and live scores of the followed competitions, the board days `days` included: whatever is due. */
export async function syncLiveMatches(days: string[] = []) {
  await waitAMoment(startLiveSync(days));
}

/**
 * The board's refresh: it only holds the page for a day whose matches were never fetched, which
 * it would otherwise show without them. Any other day is served from the database at once — the
 * refresh (a list read, the live feed…) can take seconds, and what it brings shows from the next
 * render on: the board re-renders itself every minute while a match is on (LiveRefresh).
 */
export async function syncBoardDays(days: string[]) {
  const sync = startLiveSync(days);
  if (!(await dayListsRead(days))) await waitAMoment(sync);
}
