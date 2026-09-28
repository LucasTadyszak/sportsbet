import Link from "next/link";
import { getTrackRecord, type TrackFilter } from "@/lib/journal";
import { formatKickoff } from "@/lib/dates";
import {
  STATUS_LABELS,
  formatOdds,
  formatPct,
  formatSignedPct,
  formatUnits,
  marketLabel,
  outcomeLabel,
} from "@/lib/labels";
import { PageFooter, PageIntro, SiteHeader } from "@/components/SiteHeader";
import { Straight, slantTabClass } from "@/components/Slant";
import { CompetitionName, TeamName } from "@/components/TeamCrest";
import { EmptyState, StatTile, TierBadge } from "@/components/Verdict";

export const dynamic = "force-dynamic";

export const metadata = { title: "Historique — SportsBet" };

const FILTERS: { value: TrackFilter; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "won", label: "Gagnés" },
  { value: "lost", label: "Perdus" },
  { value: "pending", label: "En attente" },
];

function statusTone(status: string): string {
  if (status === "won" || status === "half_won") return "text-rise";
  if (status === "lost" || status === "half_lost") return "text-fall";
  return "text-fg-muted";
}

export default async function TrackRecordPage({ searchParams }: { searchParams: Promise<{ filtre?: string }> }) {
  const params = await searchParams;
  const filter: TrackFilter = FILTERS.some((f) => f.value === params.filtre) ? (params.filtre as TrackFilter) : "all";
  const { summary, picks } = await getTrackRecord(filter);

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="track" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageIntro title="Historique — chaque pick gradé">
            Chaque recommandation est figée au moment de sa publication, gradée automatiquement une fois le match terminé
            (score à 90 minutes) et comparée à la cote de clôture. Les défaites restent affichées, les remboursements ne
            comptent pas comme des victoires. La CLV (closing line value) — avoir pris un meilleur prix que celui de la
            clôture — est la mesure qui prédit le mieux la rentabilité sur la durée ; le bilan V/D, beaucoup moins.
        </PageIntro>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="CLV moyenne"
            value={formatSignedPct(summary.avgClv)}
            hint={`${summary.clvCount} pick${summary.clvCount > 1 ? "s" : ""} avec clôture`}
            tone={summary.avgClv === null ? undefined : summary.avgClv >= 0 ? "rise" : "fall"}
          />
          <StatTile label="Bat la clôture" value={formatPct(summary.beatClose)} />
          <StatTile
            label="ROI"
            value={formatSignedPct(summary.roi)}
            tone={summary.roi === null ? undefined : summary.roi >= 0 ? "rise" : "fall"}
          />
          <StatTile
            label="Profit"
            value={formatUnits(summary.profitUnits, true)}
            hint={`sur ${formatUnits(summary.stakedUnits)} misées`}
          />
          <StatTile label="Bilan" value={`${summary.wins}-${summary.losses}-${summary.pushes}`} hint="gagnés-perdus-remboursés" />
          <StatTile label="En attente" value={String(summary.pending)} hint={summary.voids ? `${summary.voids} annulé(s)` : undefined} />
        </div>

        <nav aria-label="Filtrer les picks" className="flex w-full flex-wrap gap-1.5 pl-1 sm:w-fit">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/historique" : { pathname: "/historique", query: { filtre: f.value } }}
              aria-current={filter === f.value ? "page" : undefined}
              className={`${slantTabClass(filter === f.value, "sm")} ${filter === f.value ? "" : "bg-bg-elevated"}`}
            >
              <Straight>{f.label}</Straight>
            </Link>
          ))}
        </nav>

        {picks.length === 0 ? (
          <EmptyState title="Aucun pick dans cette vue">
            Les picks apparaissent ici dès qu&apos;un marché passe tous les filtres dans les 48 h avant le coup
            d&apos;envoi. Le job nocturne (<code className="text-fg">npm run nightly</code>) les grade ensuite.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto bg-bg-elevated shadow-hard">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-bg-deep">
                <tr className="text-left font-cond text-xs font-bold uppercase tracking-widest text-fg-muted">
                  <th className="px-4 py-2.5 font-bold">Match</th>
                  <th className="px-3 py-2.5 font-bold">Pari</th>
                  <th className="px-3 py-2.5 font-bold">Verdict</th>
                  <th className="px-3 py-2.5 text-right font-bold">Cote</th>
                  <th className="px-3 py-2.5 text-right font-bold">Proba</th>
                  <th className="px-3 py-2.5 text-right font-bold">Mise</th>
                  <th className="px-3 py-2.5 text-right font-bold">CLV</th>
                  <th className="px-3 py-2.5 font-bold">Résultat</th>
                  <th className="px-4 py-2.5 text-right font-bold">P/L</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((p) => (
                  <tr key={p.id} className="border-t border-border align-top transition-colors duration-150 hover:bg-bg-row/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/match/${p.eventId}`} className="flex items-center gap-2 text-fg underline-offset-2 hover:underline">
                        <TeamName name={p.event.homeTeam} crest={p.homeCrest} size={16} />
                        <span className="text-fg-muted">–</span>
                        <TeamName name={p.event.awayTeam} crest={p.awayCrest} size={16} />
                      </Link>
                      <span className="flex items-center gap-1 figures text-xs text-fg-muted">
                        <CompetitionName title={p.event.sport.title} logo={p.sportLogo} size={12} />
                        <span aria-hidden>·</span>
                        <span className="shrink-0">{formatKickoff(p.commenceTime)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-fg">{outcomeLabel(p.marketKey, p.outcomeName, p.point, p.event.homeTeam, p.event.awayTeam)}</span>
                      <span className="block text-xs text-fg-muted">
                        {marketLabel(p.marketKey)} · {p.bookmakerTitle}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <TierBadge tier={p.tier} compact />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right figures">{formatOdds(p.price)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right figures">{formatPct(p.modelProb, 1)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-right figures">{formatUnits(p.stakeUnits)}</td>
                    <td
                      className={`px-3 py-2.5 whitespace-nowrap text-right figures ${
                        p.clv === null ? "text-fg-muted" : p.clv >= 0 ? "text-rise" : "text-fall"
                      }`}
                      title={p.closingSource ? `Clôture ${p.closingSource === "pinnacle" ? "Pinnacle" : "consensus"} : ${formatPct(p.closingFairProb, 1)}` : undefined}
                    >
                      {formatSignedPct(p.clv)}
                    </td>
                    <td className={`px-3 py-2.5 ${statusTone(p.status)}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                      {p.homeGoals !== null && p.awayGoals !== null ? (
                        <span className="block figures text-xs text-fg-muted">
                          {p.homeGoals}–{p.awayGoals}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-2.5 whitespace-nowrap text-right figures ${
                        p.profitUnits === null ? "text-fg-muted" : p.profitUnits >= 0 ? "text-rise" : "text-fall"
                      }`}
                    >
                      {p.profitUnits === null ? "—" : formatUnits(p.profitUnits, true)}
                    </td>
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
