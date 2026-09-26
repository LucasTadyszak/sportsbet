// Read models for /picks, /passes and /historique.
import { prisma } from "@/lib/prisma";
import { STAKED_TIERS } from "@/lib/methodology/config";
import { tierRank } from "@/lib/methodology/verdict";

export type VerdictListItem = {
  edgeId: string;
  eventId: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  tier: string;
  reasons: string[];
  bestPrice: number | null;
  bestBookmakerTitle: string | null;
  modelProb: number;
  marketProb: number;
  edge: number;
  ev: number | null;
  stakeUnits: number;
  journaled: { price: number; bookmakerTitle: string; publishedAt: Date } | null;
};

/** The side the model takes in every market of every upcoming match: staked ones, or the passes. */
export async function getUpcomingVerdicts(kind: "staked" | "passed"): Promise<VerdictListItem[]> {
  const [edges, bookmakers] = await Promise.all([
    prisma.edge.findMany({
      where: {
        isRecommended: true,
        tier: kind === "staked" ? { in: [...STAKED_TIERS] } : { in: ["MARGINAL", "PASS"] },
        event: { commenceTime: { gt: new Date() } },
      },
      include: { event: { include: { sport: true, picks: true } } },
    }),
    prisma.bookmaker.findMany(),
  ]);
  const title = new Map(bookmakers.map((b) => [b.key, b.title]));

  const items = edges.map((e): VerdictListItem => {
    const pick = e.event.picks.find((p) => p.marketKey === e.marketKey);
    return {
      edgeId: e.id,
      eventId: e.eventId,
      sportTitle: e.event.sport.title,
      homeTeam: e.event.homeTeam,
      awayTeam: e.event.awayTeam,
      commenceTime: e.event.commenceTime,
      marketKey: e.marketKey,
      outcomeName: e.outcomeName,
      point: e.point,
      tier: e.tier,
      reasons: e.reasons,
      bestPrice: e.bestPrice,
      bestBookmakerTitle: e.bestBookmakerKey ? (title.get(e.bestBookmakerKey) ?? e.bestBookmakerKey) : null,
      modelProb: e.modelProb,
      marketProb: e.marketProb,
      edge: e.edge,
      ev: e.ev,
      stakeUnits: e.stakeUnits,
      journaled: pick
        ? { price: pick.price, bookmakerTitle: title.get(pick.bookmakerKey) ?? pick.bookmakerKey, publishedAt: pick.publishedAt }
        : null,
    };
  });

  return kind === "staked"
    ? items.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || (b.ev ?? 0) - (a.ev ?? 0))
    : items.sort((a, b) => a.commenceTime.getTime() - b.commenceTime.getTime());
}

export type TrackFilter = "all" | "won" | "lost" | "pending";

export type TrackSummary = {
  total: number;
  pending: number;
  wins: number;
  losses: number;
  pushes: number;
  voids: number;
  stakedUnits: number;
  profitUnits: number;
  roi: number | null;
  clvCount: number;
  avgClv: number | null;
  beatClose: number | null;
};

const WINS = ["won", "half_won"];
const LOSSES = ["lost", "half_lost"];

export async function getTrackRecord(filter: TrackFilter) {
  const [all, bookmakers] = await Promise.all([
    prisma.pick.findMany({ include: { event: { include: { sport: true } } }, orderBy: { commenceTime: "desc" } }),
    prisma.bookmaker.findMany(),
  ]);
  const title = new Map(bookmakers.map((b) => [b.key, b.title]));

  const settled = all.filter((p) => p.status !== "pending" && p.status !== "void");
  const withClv = all.filter((p) => p.clv !== null);
  const stakedUnits = settled.reduce((s, p) => s + p.stakeUnits, 0);
  const profitUnits = settled.reduce((s, p) => s + (p.profitUnits ?? 0), 0);
  const summary: TrackSummary = {
    total: all.length,
    pending: all.filter((p) => p.status === "pending").length,
    wins: all.filter((p) => WINS.includes(p.status)).length,
    losses: all.filter((p) => LOSSES.includes(p.status)).length,
    pushes: all.filter((p) => p.status === "push").length,
    voids: all.filter((p) => p.status === "void").length,
    stakedUnits,
    profitUnits,
    roi: stakedUnits > 0 ? profitUnits / stakedUnits : null,
    clvCount: withClv.length,
    avgClv: withClv.length > 0 ? withClv.reduce((s, p) => s + (p.clv ?? 0), 0) / withClv.length : null,
    beatClose: withClv.length > 0 ? withClv.filter((p) => (p.clv ?? 0) > 0).length / withClv.length : null,
  };

  const picks = all
    .filter((p) =>
      filter === "won" ? WINS.includes(p.status) : filter === "lost" ? LOSSES.includes(p.status) : filter === "pending" ? p.status === "pending" : true
    )
    .map((p) => ({ ...p, bookmakerTitle: title.get(p.bookmakerKey) ?? p.bookmakerKey }));

  return { summary, picks };
}
