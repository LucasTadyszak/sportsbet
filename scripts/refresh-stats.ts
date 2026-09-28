// Standalone entry point for scheduled stats/predictions refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-stats.ts
import "dotenv/config";
import { refreshStatsJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await refreshStatsJob(console.log)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
