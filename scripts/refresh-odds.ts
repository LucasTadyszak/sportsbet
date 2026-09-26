// Standalone entry point for scheduled refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-odds.ts
import "dotenv/config";
import { refreshOdds } from "@/lib/refreshOdds";
import { prisma } from "@/lib/prisma";

async function main() {
  const summary = await refreshOdds();
  for (const row of summary) {
    console.log(
      row.skipped
        ? `[${row.sportKey}] skipped (throttled)`
        : `[${row.sportKey}] ${row.events} events, ${row.oddsCaptured} odds rows captured`
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
