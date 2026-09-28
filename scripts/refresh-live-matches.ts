// Brings the matches of every followed competition up to date from Free API Live Football Data
// (each league's list that is due, then the live feed if a followed match is on). The board does
// this as its pages are served: this is for the first full sync after deploying, or a cron.
// Usage: npm run refresh:matches            (whatever is due)
//        npm run refresh:matches -- --force (every league's list, fresh or not)
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
