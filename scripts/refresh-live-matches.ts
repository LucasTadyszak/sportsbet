// Brings the matches of every followed competition up to date from Free API Live Football Data
// (the day lists of the coming week, each competition's list that is due, then the live feed if a
// followed match is on), and says what the database now holds for each competition — what the
// board can show. The board does the refresh itself as its pages are served: this is for the
// first full sync after deploying, a cron, or checking what the API sends.
// Usage: npm run refresh:matches            (whatever is due)
//        npm run refresh:matches -- --force (every list, fresh or not)
import "dotenv/config";
import { addDays, parisDateKey } from "@/lib/dates";
import { hourlyUsage } from "@/lib/liveFootballApi";
import { prisma } from "@/lib/prisma";
import { describeLiveRefresh, liveMatchesOverview, liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";

// Yesterday to a week ahead.
const DAYS = Array.from({ length: 9 }, (_, i) => addDays(parisDateKey(new Date()), i - 1));

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : "?");

async function main() {
  const summary = await refreshLiveMatches({ force: process.argv.includes("--force"), days: DAYS });
  console.log(describeLiveRefresh(summary));
  if (!summary.configured || liveRefreshFailed(summary)) process.exitCode = 1;
  if (summary.configured) {
    const { used, limit } = await hourlyUsage();
    console.log(`${used}/${limit} requests over the last hour`);
  }

  console.log("\nIn the database (what the board shows):");
  for (const c of await liveMatchesOverview()) {
    console.log(
      c.matches === 0
        ? `  ${c.name}: no match`
        : `  ${c.name}: ${c.matches} matches, ${day(c.first)} → ${day(c.last)}, ${c.upcoming} to come, ${c.today} today`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
