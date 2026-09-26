// [LE] "edges recomputed" loop: after every odds or stats refresh, rebuild the verdict for
// every outcome of every upcoming match, and journal the staked ones. A journaled pick is
// a snapshot of every input at publish time and is never rewritten afterwards.
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { bookClassifier } from "@/lib/bookmakers";
import { loadMarketHistories, mainTotalsLine } from "@/lib/oddsHistory";
import { MODEL_VERSION, STAKING, isStakedTier } from "@/lib/methodology/config";
import { calibrationLookup, type CalibrationLookup } from "@/lib/methodology/calibration";
import { totalsProbability } from "@/lib/methodology/goals";
import type { DataQuality } from "@/lib/methodology/model";
import {
  analyzeMarket,
  type BookClassifier,
  type BookFlag,
  type BookRole,
  type MarketHistory,
  type OutcomeMarketView,
} from "@/lib/methodology/signals";
import { assessMarket, type ReasonCode } from "@/lib/methodology/verdict";

/** What Edge.signals holds: the outcome's market view plus everything the verdict used. */
export type StoredEdgeSignals = OutcomeMarketView & {
  confirmations: ReasonCode[];
  contradictions: ReasonCode[];
  calibration: { scale: number; offset: number };
  dataQuality: DataQuality;
  market: { bookCount: number; hasSharp: boolean; hasExchange: boolean; openAt: string | null; capturedAt: string };
  books: {
    bookmakerKey: string;
    role: BookRole;
    bettable: boolean;
    price: number;
    fair: number;
    divergence: number;
    flag: BookFlag | null;
  }[];
};

const EDGE_WINDOW_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;

type PredictionRow = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number | null;
  expectedAwayGoals: number | null;
  rho: number;
  dataQuality: string;
  components: Prisma.JsonValue;
  eloHomeWin: number | null;
  eloDraw: number | null;
  eloAwayWin: number | null;
  goalsHomeWin: number | null;
  goalsDraw: number | null;
  goalsAwayWin: number | null;
  modelVersion: string;
};

type EventRow = {
  id: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  prediction: PredictionRow | null;
};

function rawModelFor(marketKey: string, history: MarketHistory, event: EventRow): Record<string, number> | null {
  const p = event.prediction;
  if (!p) return null;
  if (marketKey === "h2h") {
    return { [event.homeTeam]: p.homeWinProbability, Draw: p.drawProbability, [event.awayTeam]: p.awayWinProbability };
  }
  if (p.expectedHomeGoals === null || p.expectedAwayGoals === null || history.point === null) return null;
  const over = totalsProbability(p.expectedHomeGoals, p.expectedAwayGoals, p.rho, "Over", history.point);
  return over === null ? null : { Over: over, Under: 1 - over };
}

function assessEventMarket(
  event: EventRow,
  history: MarketHistory,
  classifier: BookClassifier,
  calibration: CalibrationLookup,
  now: Date
) {
  const rawModel = rawModelFor(history.marketKey, history, event);
  if (!rawModel) return null;
  const view = analyzeMarket(history, classifier, now, event.commenceTime);
  if (!view) return null;
  const scale = calibration.scale(event.sportKey, history.marketKey);
  const offset = calibration.offset(event.sportKey, history.marketKey);
  const dataQuality = (event.prediction?.dataQuality ?? "thin") as DataQuality;
  const assessment = assessMarket({ sportKey: event.sportKey, rawModel, view, calibration: { scale, offset }, dataQuality });
  return { view, assessment, scale, offset, dataQuality, rawModel };
}

export type EdgesSummary = { events: number; edges: number; picksPublished: number };

export async function refreshEdges(now = new Date()): Promise<EdgesSummary> {
  const events: EventRow[] = await prisma.event.findMany({
    where: { commenceTime: { gt: now, lte: new Date(now.getTime() + EDGE_WINDOW_DAYS * 24 * HOUR_MS) } },
    include: { prediction: true },
  });
  const histories = await loadMarketHistories(events);
  const calibration = calibrationLookup(await prisma.calibrationBucket.findMany());
  const classifier = bookClassifier();

  const edgeRows: Prisma.EdgeCreateManyInput[] = [];
  const pickRows: Prisma.PickCreateManyInput[] = [];

  for (const event of events) {
    const markets = histories.get(event.id);
    // Only verdicts from the current model: a prediction left over from an older model
    // version waits for the next stats refresh to be recomputed.
    if (!markets || !event.prediction || event.prediction.modelVersion !== MODEL_VERSION) continue;
    const candidates = [markets.h2h, mainTotalsLine(markets.totals)].filter((m): m is MarketHistory => m !== null);

    for (const history of candidates) {
      const result = assessEventMarket(event, history, classifier, calibration, now);
      if (!result) continue;
      const { view, assessment, scale, offset, dataQuality, rawModel } = result;

      for (const o of assessment.outcomes) {
        const isRecommended = o.outcome === assessment.recommended;
        const signals: StoredEdgeSignals = {
          ...o.view,
          confirmations: o.verdict.confirmations,
          contradictions: o.verdict.contradictions,
          calibration: { scale, offset },
          dataQuality,
          market: { bookCount: view.bookCount, hasSharp: view.hasSharp, hasExchange: view.hasExchange, openAt: view.openAt, capturedAt: view.capturedAt },
          books: view.books.map((b) => ({
            bookmakerKey: b.bookmakerKey,
            role: b.role,
            bettable: b.bettable,
            price: b.prices[o.outcome],
            fair: b.fair[o.outcome],
            divergence: b.flags[o.outcome].divergence,
            flag: b.flags[o.outcome].flag,
          })),
        };

        edgeRows.push({
          eventId: event.id,
          marketKey: history.marketKey,
          outcomeName: o.outcome,
          point: history.point,
          bestPrice: o.view.best?.price ?? null,
          bestBookmakerKey: o.view.best?.bookmakerKey ?? null,
          marketProb: o.view.consensus,
          sharpProb: o.view.sharp,
          modelRawProb: o.rawProb,
          modelBaseProb: o.baseProb,
          modelProb: o.verdict.modelProb,
          edge: o.verdict.edge,
          ev: o.verdict.ev,
          tier: o.verdict.tier,
          reasons: o.verdict.reasons,
          signals: signals as Prisma.InputJsonValue,
          stakeUnits: o.verdict.stakeUnits,
          isRecommended,
          computedAt: now,
        });

        const inPublishWindow = event.commenceTime.getTime() - now.getTime() <= STAKING.publishWindowHours * HOUR_MS;
        if (isRecommended && isStakedTier(o.verdict.tier) && inPublishWindow && o.view.best && o.verdict.ev !== null) {
          pickRows.push({
            eventId: event.id,
            sportKey: event.sportKey,
            commenceTime: event.commenceTime,
            marketKey: history.marketKey,
            outcomeName: o.outcome,
            point: history.point,
            bookmakerKey: o.view.best.bookmakerKey,
            price: o.view.best.price,
            tier: o.verdict.tier,
            modelProb: o.verdict.modelProb,
            modelProbPreOffset: o.verdict.modelProbPreOffset,
            marketProb: o.view.consensus,
            sharpProb: o.view.sharp,
            edge: o.verdict.edge,
            ev: o.verdict.ev,
            stakeUnits: o.verdict.stakeUnits,
            modelVersion: MODEL_VERSION,
            publishedAt: now,
            inputs: {
              modelVersion: MODEL_VERSION,
              rawModel,
              baseModel: Object.fromEntries(assessment.outcomes.map((x) => [x.outcome, x.baseProb])),
              prediction: event.prediction,
              consensus: view.consensus,
              exchange: view.exchange,
              verdict: o.verdict,
              signals,
            } as Prisma.InputJsonValue,
          });
        }
      }
    }
  }

  const eventIds = events.map((e) => e.id);
  await prisma.$transaction([
    prisma.edge.deleteMany({ where: { eventId: { in: eventIds } } }),
    prisma.edge.createMany({ data: edgeRows }),
  ]);
  // One pick per (event, market), frozen at the first moment it qualified.
  const published = pickRows.length > 0 ? await prisma.pick.createMany({ data: pickRows, skipDuplicates: true }) : { count: 0 };

  return { events: events.length, edges: edgeRows.length, picksPublished: published.count };
}
