// [LE] "When a game finishes, a nightly job auto-grades it and computes a closing-line
// snapshot": every journaled pick gets its closing line (Pinnacle's close when it quoted
// the market, else the consensus close), its CLV and its result; every priced match gets
// an EventGrade with the model's and the market's closing probabilities side by side.
import { prisma } from "@/lib/prisma";
import { bookClassifier } from "@/lib/bookmakers";
import { loadMarketHistories, mainTotalsLine } from "@/lib/oddsHistory";
import { analyzeMarket, type MarketView } from "@/lib/methodology/signals";
import { closingLineValue, profitUnits, settleH2h, settleTotals, type Settlement } from "@/lib/methodology/settlement";

// Kickoff + 2h15 covers 90 minutes, half-time and stoppages before we look for a result.
const GRADE_AFTER_MS = 135 * 60 * 1000;
const GRADE_LOOKBACK_DAYS = 30;
const FIXTURE_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

export type GradingSummary = { eventsGraded: number; picksGraded: number; picksVoided: number; unresolved: number };

async function findFixture(event: { homeTeam: string; awayTeam: string; commenceTime: Date }) {
  const teams = await prisma.team.findMany({ where: { name: { in: [event.homeTeam, event.awayTeam] } } });
  const homeId = teams.find((t) => t.name === event.homeTeam)?.footballDataTeamId;
  const awayId = teams.find((t) => t.name === event.awayTeam)?.footballDataTeamId;
  if (homeId == null || awayId == null) return null;
  return prisma.fixture.findFirst({
    where: {
      homeTeamId: homeId,
      awayTeamId: awayId,
      utcDate: {
        gte: new Date(event.commenceTime.getTime() - FIXTURE_MATCH_WINDOW_MS),
        lte: new Date(event.commenceTime.getTime() + FIXTURE_MATCH_WINDOW_MS),
      },
    },
  });
}

/** Closing fair probability of an outcome: Pinnacle's close if it was quoting, else the consensus close. */
function closingFor(view: MarketView | null, outcome: string): { prob: number; source: "pinnacle" | "consensus" } | null {
  const o = view?.byOutcome[outcome];
  if (!o) return null;
  return o.sharp !== null ? { prob: o.sharp, source: "pinnacle" } : { prob: o.consensus, source: "consensus" };
}

export async function gradeFinishedEvents(now = new Date()): Promise<GradingSummary> {
  const events = await prisma.event.findMany({
    where: {
      commenceTime: { lt: new Date(now.getTime() - GRADE_AFTER_MS), gt: new Date(now.getTime() - GRADE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000) },
      OR: [{ grade: null }, { picks: { some: { status: "pending" } } }],
    },
    include: { picks: { where: { status: "pending" } }, edges: true },
  });

  const classifier = bookClassifier();
  const summary: GradingSummary = { eventsGraded: 0, picksGraded: 0, picksVoided: 0, unresolved: 0 };

  for (const event of events) {
    const fixture = await findFixture(event);
    if (fixture && (fixture.status === "CANCELLED" || fixture.status === "AWARDED")) {
      const voided = await prisma.pick.updateMany({
        where: { eventId: event.id, status: "pending" },
        data: { status: "void", profitUnits: 0, gradedAt: now },
      });
      summary.picksVoided += voided.count;
      continue;
    }
    if (!fixture || fixture.status !== "FINISHED" || fixture.homeGoals === null || fixture.awayGoals === null) {
      summary.unresolved++;
      continue;
    }
    const homeGoals = fixture.homeGoals;
    const awayGoals = fixture.awayGoals;
    const totalGoals = homeGoals + awayGoals;

    // Closing lines: the market as of the last sync before kickoff.
    const histories = (await loadMarketHistories([event])).get(event.id);
    const closingH2h = histories?.h2h ? analyzeMarket(histories.h2h, classifier, event.commenceTime, event.commenceTime) : null;
    const closingTotals = new Map<number, MarketView | null>();
    const totalsView = (point: number) => {
      if (!closingTotals.has(point)) {
        const history = histories?.totals.find((t) => t.point === point);
        closingTotals.set(point, history ? analyzeMarket(history, classifier, event.commenceTime, event.commenceTime) : null);
      }
      return closingTotals.get(point) ?? null;
    };

    for (const pick of event.picks) {
      let settlement: Settlement;
      let closing: ReturnType<typeof closingFor>;
      if (pick.marketKey === "h2h") {
        settlement = settleH2h(pick.outcomeName, event.homeTeam, event.awayTeam, homeGoals, awayGoals);
        closing = closingFor(closingH2h, pick.outcomeName);
      } else if (pick.marketKey === "totals" && pick.point !== null) {
        settlement = settleTotals(pick.outcomeName as "Over" | "Under", pick.point, totalGoals);
        closing = closingFor(totalsView(pick.point), pick.outcomeName);
      } else {
        continue;
      }
      await prisma.pick.update({
        where: { id: pick.id },
        data: {
          status: settlement,
          profitUnits: Math.round(profitUnits(settlement, pick.price, pick.stakeUnits) * 10_000) / 10_000,
          homeGoals,
          awayGoals,
          gradedAt: now,
          closingFairProb: closing?.prob ?? null,
          closingSource: closing?.source ?? null,
          clv: closing ? closingLineValue(pick.price, closing.prob) : null,
        },
      });
      summary.picksGraded++;
    }

    const existingGrade = await prisma.eventGrade.findUnique({ where: { eventId: event.id } });
    if (!existingGrade && (closingH2h || event.edges.length > 0)) {
      const h2hEdge = (outcome: string) => event.edges.find((e) => e.marketKey === "h2h" && e.outcomeName === outcome);
      const totalsEdge = event.edges.find((e) => e.marketKey === "totals" && e.outcomeName === "Over");
      const totalsLine = totalsEdge?.point ?? (histories ? mainTotalsLine(histories.totals)?.point ?? null : null);
      const totalsClose = totalsLine !== null ? totalsView(totalsLine) : null;
      await prisma.eventGrade.create({
        data: {
          eventId: event.id,
          sportKey: event.sportKey,
          commenceTime: event.commenceTime,
          homeGoals,
          awayGoals,
          result: homeGoals > awayGoals ? "H" : homeGoals === awayGoals ? "D" : "A",
          modelHome: h2hEdge(event.homeTeam)?.modelBaseProb ?? null,
          modelDraw: h2hEdge("Draw")?.modelBaseProb ?? null,
          modelAway: h2hEdge(event.awayTeam)?.modelBaseProb ?? null,
          finalHome: h2hEdge(event.homeTeam)?.modelProb ?? null,
          finalDraw: h2hEdge("Draw")?.modelProb ?? null,
          finalAway: h2hEdge(event.awayTeam)?.modelProb ?? null,
          marketHome: closingH2h?.consensus[event.homeTeam] ?? null,
          marketDraw: closingH2h?.consensus.Draw ?? null,
          marketAway: closingH2h?.consensus[event.awayTeam] ?? null,
          sharpHome: closingH2h?.byOutcome[event.homeTeam]?.sharp ?? null,
          sharpDraw: closingH2h?.byOutcome.Draw?.sharp ?? null,
          sharpAway: closingH2h?.byOutcome[event.awayTeam]?.sharp ?? null,
          totalsLine,
          modelOver: totalsEdge?.modelBaseProb ?? null,
          marketOver: totalsClose?.consensus.Over ?? null,
        },
      });
      summary.eventsGraded++;
    }
  }

  return summary;
}
