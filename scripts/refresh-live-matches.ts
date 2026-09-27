// Brings the matches of every followed competition up to date from Free API Live Football Data
// (each league's list that is due, then the live feed if a followed match is on). The board does
// this as its pages are served: this is for the first full sync after deploying, or a cron.
// Usage: npm run refresh:matches            (whatever is due)
//        npm run refresh:matches -- --force (every league's list, fresh or not)
import "dotenv/config";
import { hourlyUsage } from "@/lib/liveFootballApi";
import { prisma } from "@/lib/prisma";
import { describeLiveRefresh, liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";

async function main() {
  const summary = await refreshLiveMatches({ force: process.argv.includes("--force") });
  console.log(describeLiveRefresh(summary));
  if (!summary.configured || liveRefreshFailed(summary)) process.exitCode = 1;
  if (summary.configured) {
    const { used, limit } = await hourlyUsage();
    console.log(`${used}/${limit} requests over the last hour`);
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
