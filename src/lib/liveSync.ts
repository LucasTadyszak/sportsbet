// The site brings the followed competitions' matches up to date itself as it's used
// (src/lib/refreshLiveMatches.ts): a page, or an action, starts whatever is due, waits for it a
// moment, then goes on with what the database has; the rest finishes after the response.
import { after } from "next/server";
import { describeLiveRefresh, liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";

// How long a page waits for Free API Live Football Data before rendering with what it has: the
// rest of the refresh finishes after the response, and shows from the next render on.
const LIVE_SYNC_WAIT_MS = 3000;

let reportedMissingKey = false;

/** Fixtures and live scores of the followed competitions, the board days `days` included: whatever is due. */
export async function syncLiveMatches(days: string[] = []) {
  const sync = refreshLiveMatches({ days }).then((summary) => {
    if (!summary.configured && !reportedMissingKey) {
      reportedMissingKey = true;
      console.warn("RAPIDAPI_KEY is not set for the site: the board shows the matches already in the database, without refreshing them");
    }
    if (liveRefreshFailed(summary)) console.warn(`Free API Live Football Data refresh:\n${describeLiveRefresh(summary)}`);
  });
  after(() => sync);
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([sync, new Promise((resolve) => (timer = setTimeout(resolve, LIVE_SYNC_WAIT_MS)))]);
  clearTimeout(timer);
}
