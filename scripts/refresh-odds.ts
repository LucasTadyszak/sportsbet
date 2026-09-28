// Standalone entry point for scheduled refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-odds.ts
import "dotenv/config";
import { refreshOddsJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await refreshOddsJob(console.log)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
