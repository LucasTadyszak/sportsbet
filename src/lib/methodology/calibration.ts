// [LE] The calibration loop: every graded pick is replayed nightly, per sport, per
// (sport, market) and per verdict tier. It doesn't change what the model thinks — it
// scales and shifts the model's outputs by how reliably those outputs have predicted
// reality: if the model picks well but claims too large an edge, the claim is tightened
// without throwing out the pick.
//
//   shift: offset = hit rate - average predicted probability ("calibration gap"),
//          shrunk and capped by sample size (a noisy 20-pick gap of -33pp must only
//          propagate a fraction of itself).
//   scale: how much of the model's disagreement with the closing market turned out to
//          be real, fitted on every graded match (ridge regression toward a prior).
import { CALIBRATION } from "@/lib/methodology/config";

export type JournalRow = {
  sportKey: string;
  marketKey: string;
  tier: string;
  /** Model probability of the picked side before calibration offsets. */
  predicted: number;
  value: number;
  weight: number;
};

export type BucketStats = { n: number; avgPredicted: number; hitRate: number; gap: number };

export type OffsetBucket = BucketStats & { offset: number };

export function bucketStats(rows: JournalRow[]): BucketStats | null {
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  if (totalWeight <= 0) return null;
  const avgPredicted = rows.reduce((s, r) => s + r.weight * r.predicted, 0) / totalWeight;
  const hitRate = rows.reduce((s, r) => s + r.weight * r.value, 0) / totalWeight;
  return { n: rows.length, avgPredicted, hitRate, gap: hitRate - avgPredicted };
}

export function shrunkOffset(gap: number, n: number, cap: number): number {
  if (n < CALIBRATION.minSample) return 0;
  const shrunk = (gap * n) / (n + CALIBRATION.shrinkK);
  return Math.max(-cap, Math.min(cap, shrunk));
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }
  return groups;
}

export const sportMarketKey = (sportKey: string, marketKey: string) => `${sportKey}|${marketKey}`;

export type JournalCalibration = {
  sport: Record<string, OffsetBucket>;
  sportMarket: Record<string, OffsetBucket>;
  tier: Record<string, BucketStats>;
};

/** Rows must be sorted newest first: each bucket only looks at its most recent picks. */
export function computeJournalCalibration(rowsNewestFirst: JournalRow[]): JournalCalibration {
  const recent = (rows: JournalRow[]) => rows.slice(0, CALIBRATION.journalWindow);

  const sport: Record<string, OffsetBucket> = {};
  for (const [sportKey, rows] of groupBy(rowsNewestFirst, (r) => r.sportKey)) {
    const stats = bucketStats(recent(rows));
    if (!stats) continue;
    sport[sportKey] = { ...stats, offset: shrunkOffset(stats.gap, stats.n, CALIBRATION.sportOffsetCap(stats.n)) };
  }

  // The (sport, market) bucket only corrects what the sport-level offset doesn't: its residual.
  const sportMarket: Record<string, OffsetBucket> = {};
  for (const [key, rows] of groupBy(rowsNewestFirst, (r) => sportMarketKey(r.sportKey, r.marketKey))) {
    const stats = bucketStats(recent(rows));
    if (!stats) continue;
    const residual = stats.gap - (sport[rows[0].sportKey]?.offset ?? 0);
    sportMarket[key] = { ...stats, offset: shrunkOffset(residual, stats.n, CALIBRATION.sportMarketOffsetCap(stats.n)) };
  }

  const tier: Record<string, BucketStats> = {};
  for (const [tierKey, rows] of groupBy(rowsNewestFirst, (r) => r.tier)) {
    const stats = bucketStats(recent(rows));
    if (stats) tier[tierKey] = stats;
  }

  return { sport, sportMarket, tier };
}

/** One outcome of one graded match: model probability p, closing market m, result y (0/1). */
export type ScaleRow = { p: number; m: number; y: number };

export type EdgeScaleFit = { n: number; scale: number; raw: number | null };

/**
 * Least-squares slope of (y - m) on (p - m), ridge-shrunk toward the prior: 1 means
 * the model's disagreements with the market are fully real, 0 that they are pure noise.
 * Never above 1 (the loop only ever tightens claims).
 */
export function fitEdgeScale(rows: ScaleRow[]): EdgeScaleFit {
  let sxy = 0;
  let sxx = 0;
  for (const { p, m, y } of rows) {
    sxy += (y - m) * (p - m);
    sxx += (p - m) ** 2;
  }
  const lambda = CALIBRATION.edgeScalePriorStrength;
  const scale = (sxy + lambda * CALIBRATION.edgeScalePrior) / (sxx + lambda);
  return { n: rows.length, scale: Math.max(0, Math.min(1, scale)), raw: sxx > 0 ? sxy / sxx : null };
}

export type CalibrationLookup = {
  offset: (sportKey: string, marketKey: string) => number;
  scale: (sportKey: string, marketKey: string) => number;
};

export type StoredBucket = { scope: string; sportKey: string; marketKey: string; applied: number };

/** Builds the lookup the verdict step uses from the stored output of the nightly job. */
export function calibrationLookup(buckets: StoredBucket[]): CalibrationLookup {
  const find = (scope: string, sportKey: string, marketKey = "") =>
    buckets.find((b) => b.scope === scope && b.sportKey === sportKey && b.marketKey === marketKey);
  return {
    offset: (sportKey, marketKey) => (find("sport", sportKey)?.applied ?? 0) + (find("sport_market", sportKey, marketKey)?.applied ?? 0),
    scale: (sportKey, marketKey) => find("edge_scale", sportKey, marketKey)?.applied ?? CALIBRATION.edgeScalePrior,
  };
}
