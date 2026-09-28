// Looks up every competition and club logo that is due (TheSportsDB), without the cap the
// odds job runs it with — e.g. once after deploying, to fill in every logo in one go.
// Usage: npx tsx scripts/refresh-logos.ts
import "dotenv/config";
import { refreshLogosJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await refreshLogosJob(console.log)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
