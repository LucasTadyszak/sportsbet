// Brings the matches of every followed competition up to date from Free API Live Football Data
// (the day lists of the coming week and each league's list that are due, then the live feed if a
// followed match is on), then says what the database holds for each competition — what the board
// can show. The board does the refresh itself as its pages are served: this is for the first full
// sync after deploying, a cron, or checking what the API sends.
// Usage: npm run refresh:matches            (whatever is due)
//        npm run refresh:matches -- --force (every list, fresh or not)
import "dotenv/config";
import { refreshMatchesJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await refreshMatchesJob(console.log, { force: process.argv.includes("--force") })) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
