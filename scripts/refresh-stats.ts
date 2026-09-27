// Standalone entry point for scheduled stats/predictions refreshes (e.g. a Render Cron Job).
// Usage: npx tsx scripts/refresh-stats.ts
import "dotenv/config";
import { refreshStats } from "@/lib/refreshStats";
import { refreshEdges } from "@/lib/refreshEdges";
import { prisma } from "@/lib/prisma";

async function main() {
  const { teamStats, fixtures, international, ratings, predictionsComputed } = await refreshStats();
  for (const row of teamStats) {
    console.log(
      row.skipped
        ? `[${row.competitionCode}] skipped (throttled)`
        : `[${row.competitionCode}] ${row.teams} teams updated`
    );
  }
  for (const row of fixtures) {
    console.log(
      row.skipped
        ? `[${row.competitionCode}] fixtures skipped (throttled)`
        : row.error
          ? `[${row.competitionCode}] fixtures failed: ${row.error}`
          : `[${row.competitionCode}] ${row.matches} fixtures stored${row.backfilled.length ? ` (backfilled ${row.backfilled.join(", ")})` : ""}`
    );
  }
  console.log(
    international.error
      ? `[international results] failed: ${international.error}`
      : international.skipped
        ? "[international results] skipped (throttled, or no national-team competition followed)"
        : `[international results] ${international.matches} matches: ${international.added} added, ${international.updated} updated, ${international.removed} removed`
  );
  console.log(`ratings: ${ratings.teams} teams rated over ${ratings.fixtures} finished fixtures`);
  for (const c of ratings.competitions) {
    console.log(`  [${c.competitionCode}] ${c.matches} matches, Elo ${c.eloTuned ? "tuned" : "defaults"}, goals model ${c.goalsModel ? "fitted" : "not enough data"}`);
  }
  for (const row of predictionsComputed) {
    console.log(`[${row.sportKey}] ${row.computed} predictions computed`);
    // No model for these until an alias is added to src/lib/nationalTeamNames.ts.
    if (row.unmatched?.length) console.log(`  unmatched national teams: ${row.unmatched.join(", ")}`);
  }
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
