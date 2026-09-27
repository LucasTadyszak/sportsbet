// Standalone entry point for the nightly grade + calibrate job (e.g. a Render Cron Job, once a day).
// Usage: npx tsx scripts/nightly.ts
import "dotenv/config";
import { runNightly } from "@/lib/nightly";
import { prisma } from "@/lib/prisma";

async function main() {
  const { resultsSynced, resultsError, international, internationalError, grading, reflect, edges } = await runNightly();
  console.log(resultsError ? `results sync failed: ${resultsError}` : `${resultsSynced} recent fixtures synced`);
  console.log(
    internationalError
      ? `international results sync failed: ${internationalError}`
      : international && !international.skipped
        ? `international results: ${international.added} added, ${international.updated} updated, ${international.removed} removed`
        : "international results: no national-team competition followed"
  );
  console.log(
    `graded ${grading.eventsGraded} events, ${grading.picksGraded} picks (${grading.picksVoided} void, ${grading.unresolved} not resolved yet)`
  );
  console.log(`calibration: ${reflect.gradedPicks} graded picks, ${reflect.gradedEvents} graded events → ${reflect.buckets} buckets`);
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
