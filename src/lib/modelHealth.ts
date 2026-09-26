// [LE] "Model Health": the model's own report card — calibration by sport, market and
// tier, Brier model vs book, CLV, ROI, and which inputs are actually loading.
import { prisma } from "@/lib/prisma";
import { calibrationHit } from "@/lib/methodology/settlement";
import { TIERS } from "@/lib/methodology/config";
import {
  binaryBrier,
  brier1x2,
  logLoss1x2,
  reliabilityBins,
  rps1x2,
  type ReliabilityBin,
  type Result,
  type ThreeWay,
} from "@/lib/methodology/metrics";

const COVERAGE_WINDOW_DAYS = 7;

type GradedPick = { modelProb: number; status: string; stakeUnits: number; profitUnits: number | null; clv: number | null };

export type PickStats = {
  n: number;
  avgPredicted: number | null;
  hitRate: number | null;
  gap: number | null;
  brier: number | null;
  roi: number | null;
  avgClv: number | null;
  beatClose: number | null;
};

function pickStats(picks: GradedPick[]): PickStats {
  const hits = picks.flatMap((p) => {
    const hit = calibrationHit(p.status);
    return hit ? [{ p: p.modelProb, ...hit }] : [];
  });
  const weight = hits.reduce((s, h) => s + h.weight, 0);
  const avgPredicted = weight > 0 ? hits.reduce((s, h) => s + h.weight * h.p, 0) / weight : null;
  const hitRate = weight > 0 ? hits.reduce((s, h) => s + h.weight * h.value, 0) / weight : null;
  const staked = picks.filter((p) => p.profitUnits !== null).reduce((s, p) => s + p.stakeUnits, 0);
  const profit = picks.reduce((s, p) => s + (p.profitUnits ?? 0), 0);
  const withClv = picks.filter((p) => p.clv !== null);
  return {
    n: picks.length,
    avgPredicted,
    hitRate,
    gap: avgPredicted !== null && hitRate !== null ? hitRate - avgPredicted : null,
    brier: binaryBrier(hits.map((h) => ({ p: h.p, y: h.value }))),
    roi: staked > 0 ? profit / staked : null,
    avgClv: withClv.length > 0 ? withClv.reduce((s, p) => s + (p.clv ?? 0), 0) / withClv.length : null,
    beatClose: withClv.length > 0 ? withClv.filter((p) => (p.clv ?? 0) > 0).length / withClv.length : null,
  };
}

export type ForecastScores = { n: number; brier: number; rps: number; logLoss: number };

function forecastScores(rows: { p: ThreeWay; result: Result }[]): ForecastScores | null {
  if (rows.length === 0) return null;
  const mean = (f: (r: { p: ThreeWay; result: Result }) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  return {
    n: rows.length,
    brier: mean((r) => brier1x2(r.p, r.result)),
    rps: mean((r) => rps1x2(r.p, r.result)),
    logLoss: mean((r) => logLoss1x2(r.p, r.result)),
  };
}

export type CoverageRow = {
  sportKey: string;
  sportTitle: string;
  events: number;
  withModel: number;
  fullData: number;
  withSharp: number;
  withExchange: number;
  withTotals: number;
};

export async function getModelHealth() {
  const [picks, grades, buckets, leagues, sports] = await Promise.all([
    prisma.pick.findMany({ where: { status: { notIn: ["pending", "void"] } }, orderBy: { gradedAt: "desc" } }),
    prisma.eventGrade.findMany(),
    prisma.calibrationBucket.findMany(),
    prisma.competitionModel.findMany({ orderBy: { competitionCode: "asc" } }),
    prisma.sport.findMany(),
  ]);
  const sportTitle = new Map(sports.map((s) => [s.key, s.title]));

  const byTier = TIERS.map((tier) => ({ tier, ...pickStats(picks.filter((p) => p.tier === tier)) })).filter((t) => t.n > 0);

  const sportMarketKeys = Array.from(new Set(picks.map((p) => `${p.sportKey}|${p.marketKey}`)));
  const bySportMarket = sportMarketKeys.map((key) => {
    const [sportKey, marketKey] = key.split("|");
    const applied =
      (buckets.find((b) => b.scope === "sport" && b.sportKey === sportKey)?.applied ?? 0) +
      (buckets.find((b) => b.scope === "sport_market" && b.sportKey === sportKey && b.marketKey === marketKey)?.applied ?? 0);
    return {
      sportKey,
      sportTitle: sportTitle.get(sportKey) ?? sportKey,
      marketKey,
      offsetApplied: applied,
      ...pickStats(picks.filter((p) => p.sportKey === sportKey && p.marketKey === marketKey)),
    };
  });

  // Every graded match where both the model and the closing market priced the 1X2.
  const priced = grades.filter(
    (g) => g.modelHome !== null && g.modelDraw !== null && g.modelAway !== null && g.marketHome !== null && g.marketDraw !== null && g.marketAway !== null
  );
  const asThreeWay = (h: number | null, d: number | null, a: number | null): ThreeWay => ({ home: h ?? 0, draw: d ?? 0, away: a ?? 0 });
  const scores = {
    model: forecastScores(priced.map((g) => ({ p: asThreeWay(g.modelHome, g.modelDraw, g.modelAway), result: g.result as Result }))),
    final: forecastScores(
      priced
        .filter((g) => g.finalHome !== null && g.finalDraw !== null && g.finalAway !== null)
        .map((g) => {
          // The final probabilities are per outcome (offsets don't renormalise): rescale for a proper 1X2 score.
          const total = (g.finalHome ?? 0) + (g.finalDraw ?? 0) + (g.finalAway ?? 0);
          return { p: asThreeWay((g.finalHome ?? 0) / total, (g.finalDraw ?? 0) / total, (g.finalAway ?? 0) / total), result: g.result as Result };
        })
    ),
    market: forecastScores(priced.map((g) => ({ p: asThreeWay(g.marketHome, g.marketDraw, g.marketAway), result: g.result as Result }))),
    sharp: forecastScores(
      priced
        .filter((g) => g.sharpHome !== null && g.sharpDraw !== null && g.sharpAway !== null)
        .map((g) => ({ p: asThreeWay(g.sharpHome, g.sharpDraw, g.sharpAway), result: g.result as Result }))
    ),
  };

  const outcomeRows = (pick: (g: (typeof priced)[number]) => [number | null, number | null, number | null]) =>
    priced.flatMap((g) => {
      const [h, d, a] = pick(g);
      return [
        { p: h ?? 0, y: g.result === "H" ? 1 : 0 },
        { p: d ?? 0, y: g.result === "D" ? 1 : 0 },
        { p: a ?? 0, y: g.result === "A" ? 1 : 0 },
      ];
    });
  const reliability: { model: ReliabilityBin[]; market: ReliabilityBin[] } = {
    model: reliabilityBins(outcomeRows((g) => [g.modelHome, g.modelDraw, g.modelAway])),
    market: reliabilityBins(outcomeRows((g) => [g.marketHome, g.marketDraw, g.marketAway])),
  };

  const edgeScales = buckets
    .filter((b) => b.scope === "edge_scale")
    .map((b) => ({ sportKey: b.sportKey, sportTitle: sportTitle.get(b.sportKey) ?? b.sportKey, marketKey: b.marketKey, n: b.n, scale: b.applied, raw: b.gap }));

  // Data coverage of the matches the model is about to price.
  const upcoming = await prisma.event.findMany({
    where: { commenceTime: { gt: new Date(), lte: new Date(Date.now() + COVERAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000) } },
    include: { prediction: true, edges: { where: { isRecommended: true } }, sport: true },
  });
  const coverage = new Map<string, CoverageRow>();
  for (const event of upcoming) {
    const row = coverage.get(event.sportKey) ?? {
      sportKey: event.sportKey,
      sportTitle: event.sport.title,
      events: 0,
      withModel: 0,
      fullData: 0,
      withSharp: 0,
      withExchange: 0,
      withTotals: 0,
    };
    const h2h = event.edges.find((e) => e.marketKey === "h2h");
    const market = h2h ? (h2h.signals as { market?: { hasSharp?: boolean; hasExchange?: boolean } }).market : undefined;
    row.events++;
    if (event.prediction) row.withModel++;
    if (event.prediction?.dataQuality === "full") row.fullData++;
    if (market?.hasSharp) row.withSharp++;
    if (market?.hasExchange) row.withExchange++;
    if (event.edges.some((e) => e.marketKey === "totals")) row.withTotals++;
    coverage.set(event.sportKey, row);
  }

  const lastCalibration = buckets.reduce<Date | null>((latest, b) => (!latest || b.computedAt > latest ? b.computedAt : latest), null);

  return {
    journal: pickStats(picks),
    gradedPicks: picks.length,
    byTier,
    bySportMarket,
    scores,
    reliability,
    edgeScales,
    coverage: Array.from(coverage.values()),
    leagues,
    lastCalibration,
  };
}
