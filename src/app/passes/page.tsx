import Link from "next/link";
import { getUpcomingVerdicts } from "@/lib/journal";
import { formatKickoff } from "@/lib/dates";
import { formatOdds, formatPts, mainPassReason, marketLabel, outcomeLabel, reasonLabel } from "@/lib/labels";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { EmptyState, TierBadge } from "@/components/Verdict";

export const dynamic = "force-dynamic";

export const metadata = { title: "Passes — SportsBet" };

export default async function PassesPage() {
  const passes = await getUpcomingVerdicts("passed");
  const byReason = new Map<string, number>();
  for (const p of passes) {
    const reason = mainPassReason(p.reasons);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }
  const reasonCounts = Array.from(byReason).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="passes" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold">Centre des passes</h1>
          <p className="max-w-3xl text-sm text-fg-muted">
            Tous les marchés que le modèle ne mise pas, et pourquoi. Les petits edges et les longshots ne coûtent rien à
            passer aujourd&apos;hui, et beaucoup à jouer sur la durée. Un MARGINAL est tentant mais a une raison d&apos;être
            douteux ; un PASS n&apos;a simplement pas d&apos;edge.
          </p>
        </div>

        {reasonCounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {reasonCounts.map(([reason, count]) => (
              <span key={reason} className="rounded-md border border-border bg-bg-elevated px-2.5 py-1 text-xs text-fg-muted">
                <span className="font-mono-tabular font-semibold text-fg">{count}</span> · {reasonLabel(reason)}
              </span>
            ))}
          </div>
        ) : null}

        {passes.length === 0 ? (
          <EmptyState title="Rien à afficher">
            Aucun verdict calculé sur les matchs à venir (il faut des cotes récentes et un modèle pour les deux équipes).
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-2 font-normal">Match</th>
                  <th className="px-3 py-2 font-normal">Marché · penchant</th>
                  <th className="px-3 py-2 text-right font-normal">Edge</th>
                  <th className="px-3 py-2 text-right font-normal">Cote</th>
                  <th className="px-3 py-2 font-normal">Verdict</th>
                  <th className="px-4 py-2 font-normal">Raison principale</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.edgeId} className="border-t border-border align-top">
                    <td className="px-4 py-2.5">
                      <Link href={`/match/${p.eventId}`} className="text-fg hover:text-accent-strong">
                        {p.homeTeam} – {p.awayTeam}
                      </Link>
                      <span className="block font-mono-tabular text-xs text-fg-muted">{formatKickoff(p.commenceTime)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">
                      {marketLabel(p.marketKey, p.point)} · {outcomeLabel(p.marketKey, p.outcomeName, p.point, p.homeTeam, p.awayTeam)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right font-mono-tabular">{formatPts(p.edge)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right font-mono-tabular">{formatOdds(p.bestPrice)}</td>
                    <td className="px-3 py-2.5">
                      <TierBadge tier={p.tier} compact />
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{reasonLabel(mainPassReason(p.reasons))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <PageFooter />
    </div>
  );
}
