import Link from "next/link";
import { getUpcomingVerdicts } from "@/lib/journal";
import { formatKickoff } from "@/lib/dates";
import { formatOdds, formatPct, formatPts, formatSignedPct, formatUnits, marketLabel, outcomeLabel } from "@/lib/labels";
import { STAKING } from "@/lib/methodology/config";
import { userLabel } from "@/lib/methodology/verdict";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { EmptyState, ReasonList, TierBadge } from "@/components/Verdict";

export const dynamic = "force-dynamic";

export const metadata = { title: "Picks — SportsBet" };

export default async function PicksPage() {
  const verdicts = await getUpcomingVerdicts("staked");
  const topPicks = verdicts.filter((v) => userLabel(v.tier) === "Top pick").length;

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="picks" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold">Picks à venir</h1>
          <p className="max-w-3xl text-sm text-fg-muted">
            Les marchés où le modèle, une fois calibré, s&apos;écarte assez du consensus de marché (sans marge, Pinnacle
            compté double) pour miser, avec un prix +EV chez un bookmaker jouable. {verdicts.length} pick
            {verdicts.length > 1 ? "s" : ""} dont {topPicks} top pick{topPicks > 1 ? "s" : ""}. Chaque pick est
            journalisé tel quel à {STAKING.publishWindowHours} h du coup d&apos;envoi, puis gradé contre le résultat et la
            cote de clôture sur{" "}
            <Link href="/historique" className="text-accent-strong underline underline-offset-2">
              l&apos;historique
            </Link>
            .
          </p>
        </div>

        {verdicts.length === 0 ? (
          <EmptyState title="Aucun pick pour l'instant">
            Aucun marché à venir ne passe tous les filtres (edge, prix, signaux, données). C&apos;est normal : sur un marché
            efficient, passer est la décision la plus fréquente —{" "}
            <Link href="/passes" className="text-accent-strong underline underline-offset-2">
              voir pourquoi chaque match est passé
            </Link>
            .
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {verdicts.map((v) => (
              <Link
                key={v.edgeId}
                href={`/match/${v.eventId}`}
                className="flex flex-col gap-3 rounded-lg border border-border bg-bg-elevated px-5 py-4 transition hover:border-accent"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono-tabular text-xs text-fg-muted">
                      {v.sportTitle} · {formatKickoff(v.commenceTime)} · {marketLabel(v.marketKey, v.point)}
                    </span>
                    <span className="font-display text-base font-semibold text-fg">
                      {v.homeTeam} <span className="text-fg-muted">vs</span> {v.awayTeam}
                    </span>
                    <span className="text-sm text-fg">
                      {outcomeLabel(v.marketKey, v.outcomeName, v.point, v.homeTeam, v.awayTeam)} @{formatOdds(v.bestPrice)}
                      {v.bestBookmakerTitle ? <span className="text-fg-muted"> chez {v.bestBookmakerTitle}</span> : null}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <TierBadge tier={v.tier} />
                    <span className="font-mono-tabular text-xs text-fg-muted">Mise {formatUnits(v.stakeUnits)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono-tabular text-xs text-fg-muted">
                  <span>
                    Modèle {formatPct(v.modelProb, 1)} · marché {formatPct(v.marketProb, 1)}
                  </span>
                  <span>Edge {formatPts(v.edge)}</span>
                  <span>EV {formatSignedPct(v.ev)}</span>
                  {v.journaled ? (
                    <span>
                      Journalisé @{formatOdds(v.journaled.price)} ({v.journaled.bookmakerTitle})
                    </span>
                  ) : (
                    <span>Pas encore journalisé</span>
                  )}
                </div>
                <ReasonList reasons={v.reasons.filter((r) => r.startsWith("CONFIRM_") || r === "TOO_CONFIDENT" || r === "PARTIAL_DATA")} />
              </Link>
            ))}
          </div>
        )}
      </main>
      <PageFooter />
    </div>
  );
}
