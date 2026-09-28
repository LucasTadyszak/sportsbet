// Recomputes every verdict from what's already stored (no API call) — e.g. after
// changing a constant in src/lib/methodology/config.ts.
// Usage: npx tsx scripts/refresh-edges.ts
import "dotenv/config";
import { refreshEdgesJob } from "@/lib/commands";
import { prisma } from "@/lib/prisma";

async function main() {
  if (await refreshEdgesJob(console.log)) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
