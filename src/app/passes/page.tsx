import Link from "next/link";
import { getUpcomingVerdicts } from "@/lib/journal";
import { formatKickoff } from "@/lib/dates";
import { formatOdds, formatPts, mainPassReason, marketLabel, outcomeLabel, reasonLabel } from "@/lib/labels";
import { PageFooter, PageIntro, SiteHeader } from "@/components/SiteHeader";
import { TeamName } from "@/components/TeamCrest";
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
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageIntro title="Centre des passes">
          Tous les marchés que le modèle ne mise pas, et pourquoi. Les petits edges et les longshots ne coûtent rien à passer
          aujourd&apos;hui, et beaucoup à jouer sur la durée. Un MARGINAL est tentant mais a une raison d&apos;être douteux ; un
          PASS n&apos;a simplement pas d&apos;edge.
        </PageIntro>

        {reasonCounts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {reasonCounts.map(([reason, count]) => (
              <span
                key={reason}
                className="inline-flex items-center gap-2 border-l-4 border-slate bg-bg-elevated py-1 pl-1.5 pr-3 font-cond text-sm font-bold uppercase tracking-wide text-fg-muted"
              >
                <span className="figures flex h-6 min-w-6 items-center justify-center bg-bg-row px-1.5 text-base font-bold text-fg">
                  {count}
                </span>
                {reasonLabel(reason)}
              </span>
            ))}
          </div>
        ) : null}

        {passes.length === 0 ? (
          <EmptyState title="Rien à afficher" icon="inbox">
            Aucun verdict calculé sur les matchs à venir (il faut des cotes récentes et un modèle pour les deux équipes).
          </EmptyState>
        ) : (
          <div className="overflow-x-auto bg-bg-elevated shadow-hard">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead className="bg-bg-deep">
                <tr className="text-left font-cond text-xs font-bold uppercase tracking-widest text-fg-muted">
                  <th className="px-4 py-2.5 font-bold">Match</th>
                  <th className="px-3 py-2.5 font-bold">Marché · penchant</th>
                  <th className="px-3 py-2.5 text-right font-bold">Edge</th>
                  <th className="px-3 py-2.5 text-right font-bold">Cote</th>
                  <th className="px-3 py-2.5 font-bold">Verdict</th>
                  <th className="px-4 py-2.5 font-bold">Raison principale</th>
                </tr>
              </thead>
              <tbody>
                {passes.map((p) => (
                  <tr key={p.edgeId} className="border-t border-border align-top transition-colors duration-150 hover:bg-bg-row/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/match/${p.eventId}`} className="flex items-center gap-2 text-fg underline-offset-2 hover:underline">
                        <TeamName name={p.homeTeam} crest={p.homeCrest} size={16} />
                        <span className="text-fg-muted">–</span>
                        <TeamName name={p.awayTeam} crest={p.awayCrest} size={16} />
                      </Link>
                      <span className="block figures text-xs text-fg-muted">{formatKickoff(p.commenceTime)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-fg-muted">
                      {marketLabel(p.marketKey, p.point)} · {outcomeLabel(p.marketKey, p.outcomeName, p.point, p.homeTeam, p.awayTeam)}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right figures">{formatPts(p.edge)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right figures">{formatOdds(p.bestPrice)}</td>
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
