// Standalone entry point for scheduled refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-odds.ts
import "dotenv/config";
import { refreshOdds } from "@/lib/refreshOdds";
import { refreshEdges } from "@/lib/refreshEdges";
import { describeLogoRefresh, LOGO_REQUESTS_PER_ODDS_REFRESH, refreshLogos } from "@/lib/refreshLogos";
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
  // New prices → new market signals and edges; recomputed even when every sport was
  // throttled, so the verdicts stay in step with the latest calibration and predictions.
  const edges = await refreshEdges();
  console.log(`edges: ${edges.edges} verdicts over ${edges.events} events, ${edges.picksPublished} picks published`);
  // Logos of the competitions and clubs a sync brings in (TheSportsDB), a few per run.
  console.log(describeLogoRefresh(await refreshLogos({ maxRequests: LOGO_REQUESTS_PER_ODDS_REFRESH })));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
