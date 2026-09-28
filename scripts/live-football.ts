// Calls one endpoint of Free API Live Football Data (RapidAPI) and prints its JSON: to check
// RAPIDAPI_KEY or look at a real payload. Each call takes a slot of the hourly cap.
// Usage: npx tsx scripts/live-football.ts <path> [param=value ...]
//   e.g. npm run live-football -- /football-current-live
//        npm run live-football -- /football-get-matches-by-date date=20260927
import "dotenv/config";
import { liveFootballJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  // The JSON on stdout, the rest on stderr: the output can be piped as is (e.g. into jq).
  if (await liveFootballJob(console.log, process.argv.slice(2), console.error)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
