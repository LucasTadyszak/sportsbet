"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatKickoff } from "@/lib/dates";
import { STATUS_LABELS, formatBankrollShare, formatFrPct, formatMoney, formatOdds, marketLabel, outcomeLabel } from "@/lib/labels";
import { myBets, useMyBets } from "@/lib/myBets";
import {
  matchesInPlay,
  settleBet,
  summarizeBets,
  unsettledEventIds,
  type BetOutcome,
  type BetStatus,
  type BetsSummary,
  type LegStatus,
  type MatchResult,
  type MatchResults,
  type SavedBet,
  type SavedLeg,
} from "@/lib/savedBets";
import { Icon, type IconName } from "@/components/Icon";
import { EmptyState, StatTile } from "@/components/Verdict";
import { fetchMatchResults } from "./actions";

// While a match of the bets is on (or about to be), where it stands is read again this often.
const POLL_MS = 60_000;

/**
 * Where the matches still to settle stand: read once, again every minute while one is being played,
 * and whenever the tab comes back into view. Final results are kept on the bets (src/lib/myBets.ts).
 */
function useMatchResults(bets: SavedBet[] | null) {
  const [fresh, setFresh] = useState<MatchResults>({});
  const [read, setRead] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = useMemo(() => (bets ? unsettledEventIds(bets).join(",") : ""), [bets]);

  useEffect(() => {
    if (key === "") return;
    const ids = key.split(",");
    let active = true;
    let latest: MatchResults = {};
    const load = async () => {
      try {
        const results = await fetchMatchResults(ids);
        if (!active) return;
        latest = results;
        setFresh((previous) => ({ ...previous, ...results }));
        setRead(true);
        setFailed(false);
        myBets.recordResults(results);
      } catch {
        if (active) setFailed(true);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && matchesInPlay(latest, new Date())) void load();
    }, POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [key, attempt]);

  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { fresh, loading: key !== "" && !read && !failed, failed, retry };
}

/** +11,00 € / −10,00 € / 0,00 €. */
function signedMoney(amount: number): string {
  if (amount > 0) return `+${formatMoney(amount)}`;
  if (amount < 0) return `−${formatMoney(-amount)}`;
  return formatMoney(0);
}

const toneOf = (amount: number | null) => (amount === null || amount === 0 ? undefined : amount > 0 ? "rise" : "fall");

function Summary({ summary }: { summary: BetsSummary }) {
  const decided = summary.wins + summary.losses + summary.pushes;
  const record = summary.voids > 0 ? `gagnés-perdus-remboursés · ${summary.voids} annulé${summary.voids > 1 ? "s" : ""}` : "gagnés-perdus-remboursés";
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        label="Profit"
        value={signedMoney(summary.profit)}
        hint={decided > 0 ? `sur ${formatMoney(summary.staked)} misés` : "Aucun pari terminé"}
        tone={toneOf(summary.profit)}
        icon="wallet"
      />
      <StatTile label="ROI" value={summary.roi === null ? "—" : formatFrPct(summary.roi, true)} tone={toneOf(summary.roi)} icon="trending-up" />
      <StatTile label="Bilan" value={`${summary.wins}-${summary.losses}-${summary.pushes}`} hint={record} />
      <StatTile
        label="En attente"
        value={String(summary.pending)}
        hint={summary.pending > 0 ? `${formatMoney(summary.pendingStake)} en jeu` : undefined}
        icon="clock"
      />
    </div>
  );
}

type Tone = "rise" | "fall" | "muted" | "live";

const CHIP_TONES: Record<Tone, string> = {
  rise: "bg-rise/10 text-rise",
  fall: "bg-fall/10 text-fall",
  muted: "bg-bg-row text-fg-muted",
  live: "bg-fall/10 text-fall",
};

function Chip({ tone, icon, children }: { tone: Tone; icon?: IconName; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold tabular ${CHIP_TONES[tone]}`}>
      {tone === "live" ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-fall" />
        </span>
      ) : icon ? (
        <Icon name={icon} className="h-3 w-3" />
      ) : null}
      {children}
    </span>
  );
}

const STATUS_CHIPS: Record<Exclude<BetStatus, "pending">, { tone: Tone; icon: IconName }> = {
  won: { tone: "rise", icon: "check" },
  half_won: { tone: "rise", icon: "check" },
  push: { tone: "muted", icon: "minus" },
  void: { tone: "muted", icon: "minus" },
  half_lost: { tone: "fall", icon: "x" },
  lost: { tone: "fall", icon: "x" },
};

const BORDERS: Record<BetStatus, string> = {
  pending: "border-l-border",
  won: "border-l-rise",
  half_won: "border-l-rise",
  push: "border-l-border",
  void: "border-l-border",
  half_lost: "border-l-fall",
  lost: "border-l-fall",
};

const scoreText = (score: { home: number; away: number } | null) => (score ? `${score.home}–${score.away}` : null);

/** How one selection stands: settled, or where its match is. */
function LegState({ leg, status, result }: { leg: SavedLeg; status: LegStatus; result: MatchResult | undefined }) {
  const kept = leg.result !== null && leg.result !== "void" ? leg.result : null;
  const latest = result && result.home !== null && result.away !== null ? { home: result.home, away: result.away } : null;
  const score = scoreText(kept ?? latest);
  const detail = (text: string | null) => (text ? <span className="text-xs text-fg-muted">{text}</span> : null);

  if (status === "pending") {
    if (result?.state === "live") {
      return (
        <>
          <Chip tone="live">{result.label ?? "En cours"}</Chip>
          {detail(score)}
        </>
      );
    }
    if (result?.state === "upcoming") return <Chip tone="muted" icon="clock">À venir</Chip>;
    const waiting = [score, result?.label].filter(Boolean).join(" · ");
    return (
      <span className="flex flex-col items-end gap-1" title="Les paris se règlent sur le score à 90 minutes : il arrive avec les résultats officiels.">
        <Chip tone="muted" icon="clock">En attente</Chip>
        {detail(waiting || "Résultat attendu")}
      </span>
    );
  }
  const { tone, icon } = STATUS_CHIPS[status];
  return (
    <>
      <Chip tone={tone} icon={icon}>
        {STATUS_LABELS[status]}
      </Chip>
      {detail(status === "void" ? (result?.label && result.label !== STATUS_LABELS.void ? `${result.label} · remboursé` : "Remboursé") : score)}
    </>
  );
}

function LegRow({ leg, status, result }: { leg: SavedLeg; status: LegStatus; result: MatchResult | undefined }) {
  const kickoff = new Date(result?.kickoff ?? leg.commenceTime);
  return (
    <li className="flex items-start justify-between gap-3 px-3.5 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/match/${leg.eventId}`} className="w-fit text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline">
          {leg.homeTeam} – {leg.awayTeam} · {formatKickoff(kickoff)}
        </Link>
        <span className="text-[15px] font-semibold text-fg">{outcomeLabel(leg.marketKey, leg.outcomeName, leg.point, leg.homeTeam, leg.awayTeam)}</span>
        <span className="text-xs text-fg-muted">
          {marketLabel(leg.marketKey, leg.point)} · {leg.bookmakerTitle}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-mono-tabular text-base font-bold text-fg">{formatOdds(leg.price)}</span>
        <LegState leg={leg} status={status} result={result} />
      </div>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="font-mono-tabular text-sm font-semibold text-fg">{value}</dd>
    </div>
  );
}

/** Removes a bet on a second click, within a few seconds of the first. */
function DeleteButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  return (
    <button
      type="button"
      onClick={() => (confirming ? myBets.remove(id) : setConfirming(true))}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-medium transition-colors duration-200 ${
        confirming ? "bg-fall/10 text-fall" : "text-fg-muted hover:text-fall"
      }`}
    >
      <Icon name="trash" className="h-3.5 w-3.5" />
      {confirming ? "Confirmer la suppression" : "Supprimer"}
    </button>
  );
}

function BetCard({ bet, outcome, fresh }: { bet: SavedBet; outcome: BetOutcome; fresh: MatchResults }) {
  const combo = bet.legs.length > 1;
  const pending = outcome.status === "pending";
  const live = pending && bet.legs.some((leg, i) => outcome.legs[i] === "pending" && fresh[leg.eventId]?.state === "live");
  const profit = outcome.profit;

  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border border-border border-l-4 bg-bg-elevated p-4 shadow-card sm:p-5 ${
        live ? "border-l-accent" : BORDERS[outcome.status]
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-base font-semibold text-fg">{combo ? `Combiné · ${bet.legs.length} sélections` : "Pari simple"}</h3>
          <span className="text-xs text-fg-muted">Enregistré {formatKickoff(new Date(bet.savedAt))}</span>
        </div>
        {live ? (
          <Chip tone="live">En cours</Chip>
        ) : pending ? (
          <Chip tone="muted" icon="clock">
            En attente
          </Chip>
        ) : (
          <Chip {...STATUS_CHIPS[outcome.status as Exclude<BetStatus, "pending">]}>{STATUS_LABELS[outcome.status]}</Chip>
        )}
      </header>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {bet.legs.map((leg, i) => (
          <LegRow key={`${leg.eventId}|${leg.marketKey}|${leg.outcomeName}|${leg.point ?? ""}`} leg={leg} status={outcome.legs[i]} result={fresh[leg.eventId]} />
        ))}
      </ul>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          <Figure label="Mise" value={formatMoney(bet.stake)} />
          <Figure label={combo ? "Cote totale" : "Cote"} value={formatOdds(outcome.price)} />
          <Figure label={pending ? "Gain potentiel" : "Retour"} value={formatMoney(pending ? bet.stake * outcome.price : (outcome.payout ?? 0))} />
        </dl>
        {profit !== null ? (
          <div className="flex flex-col items-end">
            <span className="text-xs text-fg-muted">
              {profit > 0 ? "Tu aurais gagné" : profit < 0 ? "Tu aurais perdu" : "Tu aurais récupéré ta mise"}
            </span>
            <span className={`font-display text-2xl font-bold tabular ${profit > 0 ? "text-rise" : profit < 0 ? "text-fall" : "text-fg-muted"}`}>
              {signedMoney(profit)}
            </span>
          </div>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-fg-muted">
        <span>
          {bet.advisedUnits > 0
            ? `Le modèle conseillait d'y miser ${formatBankrollShare(bet.advisedUnits)} de ta bankroll.`
            : "Le modèle ne conseillait pas de miser dessus."}
        </span>
        <DeleteButton id={bet.id} />
      </footer>
    </article>
  );
}

type Row = { bet: SavedBet; outcome: BetOutcome };

function BetSection({ id, title, rows, fresh }: { id: string; title: string; rows: Row[]; fresh: MatchResults }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-center gap-2 font-display text-lg font-extrabold text-fg">
        {title}
        <span className="min-w-6 rounded-full bg-bg-row px-1.5 py-0.5 text-center text-xs font-semibold tabular text-fg-muted">{rows.length}</span>
      </h2>
      <div className="flex flex-col gap-4">
        {rows.map(({ bet, outcome }) => (
          <BetCard key={bet.id} bet={bet} outcome={outcome} fresh={fresh} />
        ))}
      </div>
    </section>
  );
}

/** A leg's kickoff, as the latest results have it. */
const kickoffOf = (leg: SavedLeg, fresh: MatchResults) => new Date(fresh[leg.eventId]?.kickoff ?? leg.commenceTime).getTime();

/** The saved bets: those still at play first (next kickoff first), then the settled ones (latest first). */
export function MyBets() {
  const bets = useMyBets();
  const { fresh, loading, failed, retry } = useMatchResults(bets);

  if (bets === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-fg-muted">
        <Icon name="loader" className="h-4 w-4 animate-spin" /> Chargement de tes paris…
      </p>
    );
  }
  if (bets.length === 0) {
    return (
      <EmptyState title="Aucun pari enregistré" icon="ticket">
        Clique sur des cotes du{" "}
        <Link href="/" className="font-medium text-accent-strong underline underline-offset-2">
          tableau
        </Link>{" "}
        ou des{" "}
        <Link href="/picks" className="font-medium text-accent-strong underline underline-offset-2">
          picks
        </Link>{" "}
        pour remplir ta sélection, indique ta mise puis « Enregistrer » : ton pari arrive ici, et dès la fin de ses matchs tu vois
        s&apos;il aurait été gagnant.
      </EmptyState>
    );
  }

  const rows = bets.map((bet) => ({ bet, outcome: settleBet(bet, fresh) }));
  const first = (bet: SavedBet) => Math.min(...bet.legs.map((leg) => kickoffOf(leg, fresh)));
  const last = (bet: SavedBet) => Math.max(...bet.legs.map((leg) => kickoffOf(leg, fresh)));
  const open = rows.filter(({ outcome }) => outcome.status === "pending").sort((a, b) => first(a.bet) - first(b.bet));
  const settled = rows.filter(({ outcome }) => outcome.status !== "pending").sort((a, b) => last(b.bet) - last(a.bet));

  return (
    <div className="flex flex-col gap-8">
      <Summary summary={summarizeBets(rows)} />
      {loading ? (
        <p role="status" className="-mt-4 flex items-center gap-2 text-sm text-fg-muted">
          <Icon name="loader" className="h-4 w-4 animate-spin" /> Mise à jour des résultats…
        </p>
      ) : failed ? (
        <p role="alert" className="-mt-4 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
          <Icon name="alert-triangle" className="h-4 w-4 text-fall" />
          Impossible de récupérer les résultats pour l&apos;instant.
          <button type="button" onClick={retry} className="font-medium text-accent-strong underline underline-offset-2">
            Réessayer
          </button>
        </p>
      ) : null}
      {open.length > 0 ? <BetSection id="open-bets" title="En cours et à venir" rows={open} fresh={fresh} /> : null}
      {settled.length > 0 ? <BetSection id="settled-bets" title="Terminés" rows={settled} fresh={fresh} /> : null}
    </div>
  );
}
