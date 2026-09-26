import { syncRecentResults } from "@/lib/footballDataMatches";
import { gradeFinishedEvents, type GradingSummary } from "@/lib/grading";
import { trackedCompetitionCodes } from "@/lib/leagueMapping";
import { reflectCalibration, type ReflectSummary } from "@/lib/reflect";
import { refreshEdges, type EdgesSummary } from "@/lib/refreshEdges";
import { trackedSportKeys } from "@/lib/refreshOdds";

export type NightlySummary = {
  resultsSynced: number;
  resultsError: string | null;
  grading: GradingSummary;
  reflect: ReflectSummary;
  edges: EdgesSummary;
};

/**
 * The nightly loop: pull the latest results, grade the journal against the result and
 * the closing line, recompute the calibration from it, and re-run the verdicts with it.
 */
export async function runNightly(): Promise<NightlySummary> {
  let resultsSynced = 0;
  let resultsError: string | null = null;
  try {
    resultsSynced = await syncRecentResults(trackedCompetitionCodes(trackedSportKeys()));
  } catch (err) {
    // Grading still runs on whatever results the stats refresh already stored.
    resultsError = err instanceof Error ? err.message : String(err);
  }
  const grading = await gradeFinishedEvents();
  const reflect = await reflectCalibration();
  const edges = await refreshEdges();
  return { resultsSynced, resultsError, grading, reflect, edges };
}
