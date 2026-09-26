// Recomputes every verdict from what's already stored (no API call) — e.g. after
// changing a constant in src/lib/methodology/config.ts.
// Usage: npx tsx scripts/refresh-edges.ts
import "dotenv/config";
import { refreshEdges } from "@/lib/refreshEdges";
import { prisma } from "@/lib/prisma";

async function main() {
  const edges = await refreshEdges();
  console.log(`edges: ${edges.edges} verdicts over ${edges.events} events, ${edges.picksPublished} picks published`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
