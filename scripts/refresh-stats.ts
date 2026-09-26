// Standalone entry point for scheduled stats/predictions refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-stats.ts
import "dotenv/config";
import { refreshStats } from "@/lib/refreshStats";
import { prisma } from "@/lib/prisma";

async function main() {
  const { teamStats, predictionsComputed } = await refreshStats();
  for (const row of teamStats) {
    console.log(
      row.skipped
        ? `[${row.competitionCode}] skipped (throttled)`
        : `[${row.competitionCode}] ${row.teams} teams updated`
    );
  }
  for (const row of predictionsComputed) {
    console.log(`[${row.sportKey}] ${row.computed} predictions computed`);
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
