// [LE] the overnight "reflect" job: replays the graded journal and the graded matches,
// and stores the calibration the next predictions will run with (scale + shifts).
import { prisma } from "@/lib/prisma";
import { CALIBRATION } from "@/lib/methodology/config";
import {
  computeJournalCalibration,
  fitEdgeScale,
  sportMarketKey,
  type JournalRow,
  type ScaleRow,
} from "@/lib/methodology/calibration";
import { calibrationHit } from "@/lib/methodology/settlement";

export type ReflectSummary = { gradedPicks: number; gradedEvents: number; buckets: number };

type BucketRow = {
  scope: string;
  sportKey: string;
  marketKey: string;
  tier: string;
  n: number;
  avgPredicted: number;
  hitRate: number;
  gap: number;
  applied: number;
};

export async function reflectCalibration(): Promise<ReflectSummary> {
  const picks = await prisma.pick.findMany({
    where: { status: { in: ["won", "lost", "half_won", "half_lost"] } },
    orderBy: { gradedAt: "desc" },
  });
  const journal: JournalRow[] = picks.flatMap((p) => {
    const hit = calibrationHit(p.status);
    return hit
      ? [{ sportKey: p.sportKey, marketKey: p.marketKey, tier: p.tier, predicted: p.modelProbPreOffset, value: hit.value, weight: hit.weight }]
      : [];
  });
  const table = computeJournalCalibration(journal);

  const rows: BucketRow[] = [];
  for (const [sportKey, b] of Object.entries(table.sport)) {
    rows.push({ scope: "sport", sportKey, marketKey: "", tier: "", n: b.n, avgPredicted: b.avgPredicted, hitRate: b.hitRate, gap: b.gap, applied: b.offset });
  }
  for (const [key, b] of Object.entries(table.sportMarket)) {
    const [sportKey, marketKey] = key.split("|");
    rows.push({ scope: "sport_market", sportKey, marketKey, tier: "", n: b.n, avgPredicted: b.avgPredicted, hitRate: b.hitRate, gap: b.gap, applied: b.offset });
  }
  for (const [tier, b] of Object.entries(table.tier)) {
    rows.push({ scope: "tier", sportKey: "", marketKey: "", tier, n: b.n, avgPredicted: b.avgPredicted, hitRate: b.hitRate, gap: b.gap, applied: 0 });
  }

  // Edge scale per (sport, market), from every graded match's closing model vs closing market.
  const grades = await prisma.eventGrade.findMany({ orderBy: { commenceTime: "desc" } });
  const scaleRows = new Map<string, ScaleRow[]>();
  const counts = new Map<string, number>();
  const add = (key: string, row: ScaleRow) => {
    const list = scaleRows.get(key) ?? [];
    list.push(row);
    scaleRows.set(key, list);
  };
  for (const g of grades) {
    const h2hKey = sportMarketKey(g.sportKey, "h2h");
    if (
      (counts.get(h2hKey) ?? 0) < CALIBRATION.edgeScaleWindow &&
      g.modelHome !== null && g.modelDraw !== null && g.modelAway !== null &&
      g.marketHome !== null && g.marketDraw !== null && g.marketAway !== null
    ) {
      counts.set(h2hKey, (counts.get(h2hKey) ?? 0) + 1);
      add(h2hKey, { p: g.modelHome, m: g.marketHome, y: g.result === "H" ? 1 : 0 });
      add(h2hKey, { p: g.modelDraw, m: g.marketDraw, y: g.result === "D" ? 1 : 0 });
      add(h2hKey, { p: g.modelAway, m: g.marketAway, y: g.result === "A" ? 1 : 0 });
    }
    const totalsKey = sportMarketKey(g.sportKey, "totals");
    const total = g.homeGoals + g.awayGoals;
    // Only half lines: no push, so the outcome is a clean 0/1.
    if (
      (counts.get(totalsKey) ?? 0) < CALIBRATION.edgeScaleWindow &&
      g.totalsLine !== null && Math.abs(g.totalsLine % 1) === 0.5 &&
      g.modelOver !== null && g.marketOver !== null
    ) {
      counts.set(totalsKey, (counts.get(totalsKey) ?? 0) + 1);
      add(totalsKey, { p: g.modelOver, m: g.marketOver, y: total > g.totalsLine ? 1 : 0 });
    }
  }
  for (const [key, scaleData] of scaleRows) {
    const [sportKey, marketKey] = key.split("|");
    const fit = fitEdgeScale(scaleData);
    rows.push({
      scope: "edge_scale",
      sportKey,
      marketKey,
      tier: "",
      n: counts.get(key) ?? 0,
      avgPredicted: scaleData.reduce((s, r) => s + r.p, 0) / scaleData.length,
      hitRate: scaleData.reduce((s, r) => s + r.y, 0) / scaleData.length,
      gap: fit.raw ?? 0,
      applied: fit.scale,
    });
  }

  await prisma.$transaction([prisma.calibrationBucket.deleteMany({}), prisma.calibrationBucket.createMany({ data: rows })]);
  return { gradedPicks: journal.length, gradedEvents: grades.length, buckets: rows.length };
}
