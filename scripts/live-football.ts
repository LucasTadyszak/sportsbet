// Calls one endpoint of Free API Live Football Data (RapidAPI) and prints its JSON: to check
// RAPIDAPI_KEY or look at a real payload. Each call takes a slot of the hourly cap.
// Usage: npx tsx scripts/live-football.ts <path> [param=value ...]
//   e.g. npm run live-football -- /football-current-live
//        npm run live-football -- /football-get-matches-by-date date=20260927
import "dotenv/config";
import { hourlyUsage, liveFootballGet } from "@/lib/liveFootballApi";
import { prisma } from "@/lib/prisma";

async function main() {
  const [path, ...pairs] = process.argv.slice(2);
  if (!path) {
    console.error("usage: npm run live-football -- <path> [param=value ...]   (e.g. /football-current-live)");
    process.exitCode = 1;
    return;
  }
  const params = Object.fromEntries(
    pairs.map((pair) => {
      const [key, ...value] = pair.split("=");
      return [key, value.join("=")];
    })
  );

  const body = await liveFootballGet(path.startsWith("/") ? path : `/${path}`, params);
  console.log(JSON.stringify(body, null, 2));
  const { used, limit } = await hourlyUsage();
  // On stderr, so the JSON above can be piped as is (e.g. into jq).
  console.error(`${used}/${limit} requests over the last hour`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
