// Standalone entry point for the nightly grade + calibrate job (e.g. a Render Cron Job, once a day).
// Usage: npx tsx scripts/nightly.ts
import "dotenv/config";
import { nightlyJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await nightlyJob(console.log)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
