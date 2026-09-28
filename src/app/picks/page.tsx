import Link from "next/link";
import { getUpcomingVerdicts, type VerdictListItem } from "@/lib/journal";
import { formatKickoff } from "@/lib/dates";
import { formatOdds, formatPct, formatPts, formatSignedPct, formatUnits, marketLabel, outcomeLabel } from "@/lib/labels";
import { STAKING } from "@/lib/methodology/config";
import { userLabel } from "@/lib/methodology/verdict";
import { selectionFor } from "@/lib/selection";
import { BankrollPrompt } from "@/components/BetSlip";
import { Icon } from "@/components/Icon";
import { OddsButton } from "@/components/OddsButton";
import { PageFooter, PageIntro, SiteHeader } from "@/components/SiteHeader";
import { CompetitionName, TeamName } from "@/components/TeamCrest";
import { EmptyState, ReasonList, StatTile, TierBadge } from "@/components/Verdict";

export const dynamic = "force-dynamic";

export const metadata = { title: "Picks — SportsBet" };

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{label}</span>
      <span className="font-mono-tabular text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}

function PickCard({ v }: { v: VerdictListItem }) {
  const top = userLabel(v.tier) === "Top pick";
  const confirmations = v.reasons.filter((r) => r.startsWith("CONFIRM_") || r === "TOO_CONFIDENT" || r === "PARTIAL_DATA");
  const selection =
    v.bestPrice !== null && v.bestBookmakerKey !== null
      ? selectionFor(
          { id: v.eventId, homeTeam: v.homeTeam, awayTeam: v.awayTeam, commenceTime: v.commenceTime },
          {
            marketKey: v.marketKey,
            outcomeName: v.outcomeName,
            point: v.point,
            price: v.bestPrice,
            bookmakerKey: v.bestBookmakerKey,
            bookmakerTitle: v.bestBookmakerTitle ?? v.bestBookmakerKey,
            capturedAt: v.computedAt,
          },
          [v]
        )
      : null;
  // The match link is stretched over the card, so the price can be a button of its own.
  return (
    <div
      className={`group relative flex flex-col gap-4 rounded-xl border border-border border-l-4 bg-bg-elevated p-5 shadow-card transition-colors duration-200 hover:border-accent/70 ${
        top ? "border-l-accent" : "border-l-accent/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-fg-muted">
            <Icon name="clock" className="h-3.5 w-3.5" />
            <span className="capitalize">{formatKickoff(v.commenceTime)}</span>
            <span aria-hidden>·</span>
            <CompetitionName title={v.sportTitle} logo={v.sportLogo} size={14} />
          </span>
          <Link
            href={`/match/${v.eventId}`}
            className="flex min-w-0 items-center gap-2 font-display text-base font-semibold text-fg after:absolute after:inset-0 after:rounded-xl focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-accent-strong"
          >
            <TeamName name={v.homeTeam} crest={v.homeCrest} />
            <span className="shrink-0 font-normal text-fg-muted">vs</span>
            <TeamName name={v.awayTeam} crest={v.awayCrest} />
          </Link>
        </div>
        <TierBadge tier={v.tier} />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-bg-row/70 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">{marketLabel(v.marketKey, v.point)}</span>
          <span className="truncate text-[15px] font-semibold text-fg">
            {outcomeLabel(v.marketKey, v.outcomeName, v.point, v.homeTeam, v.awayTeam)}
          </span>
          {v.bestBookmakerTitle ? <span className="text-xs text-fg-muted">chez {v.bestBookmakerTitle}</span> : null}
        </div>
        <div className="relative z-10 flex shrink-0 flex-col items-end gap-1">
          {selection ? (
            <OddsButton variant="pick" selection={selection} />
          ) : (
            <span className="font-mono-tabular text-2xl font-bold text-accent-strong">{formatOdds(v.bestPrice)}</span>
          )}
          <span className="text-xs font-medium text-fg-muted">mise {formatUnits(v.stakeUnits)}</span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MiniStat label="Modèle" value={formatPct(v.modelProb, 1)} />
        <MiniStat label="Marché" value={formatPct(v.marketProb, 1)} />
        <MiniStat label="Edge" value={formatPts(v.edge)} />
        <MiniStat label="EV" value={formatSignedPct(v.ev)} />
      </div>

      {confirmations.length > 0 ? <ReasonList reasons={confirmations} /> : null}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <Icon name={v.journaled ? "check" : "clock"} className="h-3.5 w-3.5" />
          {v.journaled
            ? `Journalisé @ ${formatOdds(v.journaled.price)} (${v.journaled.bookmakerTitle})`
            : `Journalisé à ${STAKING.publishWindowHours} h du coup d'envoi`}
        </span>
        <span className="inline-flex items-center gap-0.5 font-medium text-accent-strong">
          Analyse <Icon name="chevron-right" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

export default async function PicksPage() {
  const verdicts = await getUpcomingVerdicts("staked");
  const topPicks = verdicts.filter((v) => userLabel(v.tier) === "Top pick").length;
  const totalStake = verdicts.reduce((s, v) => s + v.stakeUnits, 0);
  const avgEv = verdicts.length > 0 ? verdicts.reduce((s, v) => s + (v.ev ?? 0), 0) / verdicts.length : null;

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="picks" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageIntro title="Picks à venir">
          Les marchés où le modèle, une fois calibré, s&apos;écarte assez du consensus de marché (sans marge, Pinnacle compté
          double) pour miser, avec un prix +EV chez un bookmaker jouable. Chaque pick est journalisé tel quel puis gradé
          contre le résultat et la cote de clôture sur{" "}
          <Link href="/historique" className="font-medium text-accent-strong underline underline-offset-2">
            l&apos;historique
          </Link>
          .
        </PageIntro>

        {verdicts.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Picks" value={String(verdicts.length)} icon="target" />
            <StatTile label="Top picks" value={String(topPicks)} icon="star" />
            <StatTile label="Mise totale" value={formatUnits(totalStake)} hint="1 u = 1 % de la bankroll" />
            <StatTile label="EV moyenne" value={formatSignedPct(avgEv)} icon="trending-up" />
          </div>
        ) : null}

        {verdicts.length > 0 ? <BankrollPrompt /> : null}

        {verdicts.length === 0 ? (
          <EmptyState title="Aucun pick pour l'instant" icon="target">
            Aucun marché à venir ne passe tous les filtres (edge, prix, signaux, données). C&apos;est normal : sur un marché
            efficient, passer est la décision la plus fréquente —{" "}
            <Link href="/passes" className="font-medium text-accent-strong underline underline-offset-2">
              voir pourquoi chaque match est passé
            </Link>
            .
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {verdicts.map((v) => (
              <PickCard key={v.edgeId} v={v} />
            ))}
          </div>
        )}
      </main>
      <PageFooter />
    </div>
  );
}
