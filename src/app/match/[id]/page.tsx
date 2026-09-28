import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  bestPriceByOutcome,
  getMatchDetail,
  oddsErrorsFor,
  resultProbabilities,
  totalsProbabilities,
  type MatchDetail,
  type OddsError,
  type OddsLine,
} from "@/lib/board";
import { competitionTheme } from "@/lib/competitions";
import { formatKickoff, hasKickedOff } from "@/lib/dates";
import { oddsErrorsLabel, outcomeLabel, upperFirst } from "@/lib/labels";
import { ODDS_ERROR, isStakedTier } from "@/lib/methodology/config";
import { selectionFor } from "@/lib/selection";
import { CompetitionBand } from "@/components/Competition";
import { Icon } from "@/components/Icon";
import { KitCrest, KitStripes, ResultTiles, kitOrTheme } from "@/components/MatchCard";
import { OddsButton } from "@/components/OddsButton";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { TierBadge } from "@/components/Verdict";
import { Analysis } from "./Analysis";
import { ScoreMatrix } from "./ScoreMatrix";
import { MatchTabs } from "./Tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) return { title: "Match introuvable — SportsBet" };
  return { title: `${match.homeTeam} vs ${match.awayTeam} — SportsBet` };
}

type PickCell = { bookmakerKey: string | null; outcomeName: string; point: number | null };

/** The flame, with what it means spelled out in its tooltip. */
function OddsErrorFlame({ errors, className = "h-3.5 w-3.5" }: { errors: OddsError[]; className?: string }) {
  if (errors.length === 0) return null;
  return (
    <span title={oddsErrorsLabel(errors)} className="inline-flex">
      <Icon name="flame" label="Erreur de cote" className={`${className} text-flame`} />
    </span>
  );
}

function OddsErrorLegend() {
  return (
    <p className="flex items-start gap-1.5 text-xs text-fg-muted">
      <Icon name="flame" className="mt-px h-3.5 w-3.5 text-flame" />
      <span>
        Erreur de cote : au moins {Math.round(ODDS_ERROR.minEv * 100)} % au-dessus de la cote juste, calculée sur la probabilité
        sans marge de tous les autres bookmakers suivis (Pinnacle compté double).
      </span>
    </p>
  );
}

function OddsTable({
  match,
  lines,
  outcomeOrder,
  pick,
  errors,
  kickedOff,
}: {
  match: MatchDetail;
  /** Pre-match prices can't be taken once the match has started. */
  kickedOff: boolean;
  lines: OddsLine[];
  outcomeOrder: string[];
  /** The price the methodology would take in this market, highlighted. */
  pick?: PickCell | null;
  /** Odds errors of this market line, flagged with a flame. */
  errors: OddsError[];
}) {
  const outcomes = outcomeOrder.filter((name) => lines.some((l) => l.outcomeName === name));
  const bookmakers = Array.from(new Map(lines.map((l) => [l.bookmakerKey, l.bookmakerTitle])).entries());
  const best = bestPriceByOutcome(lines);

  if (bookmakers.length === 0) {
    return <p className="text-sm text-fg-muted">Aucun bookmaker français ne cote encore ce marché.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead className="bg-bg-row/60">
          <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
            <th className="px-5 py-2 font-normal">Bookmaker</th>
            {outcomes.map((outcome) => (
              <th key={outcome} className="px-3 py-2 text-right font-normal">
                {outcome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bookmakers.map(([bookmakerKey, bookmakerTitle]) => (
            <tr key={bookmakerKey} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
              <td className="px-5 py-2.5 text-fg-muted">{bookmakerTitle}</td>
              {outcomes.map((outcome) => {
                const line = lines.find((l) => l.bookmakerKey === bookmakerKey && l.outcomeName === outcome);
                const isPick = pick?.bookmakerKey === bookmakerKey && pick.outcomeName === outcome;
                const cellErrors = errors.filter((e) => e.bookmakerKey === bookmakerKey && e.outcomeName === outcome);
                return (
                  <td key={outcome} className="px-2 py-1.5 text-right">
                    {line ? (
                      <OddsButton
                        variant="cell"
                        selection={selectionFor(match, line, match.edges)}
                        isBest={best.get(outcome) === line.price}
                        isPick={isPick}
                        hint={isPick ? "La cote que le modèle prendrait" : undefined}
                        oddsError={oddsErrorsLabel(cellErrors)}
                        disabled={kickedOff}
                      />
                    ) : (
                      <span className="px-2 font-mono-tabular text-fg-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbabilityBar({ segments }: { segments: { pct: number; color: string }[] }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-bg-row">
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%` }} className={s.color} />
      ))}
    </div>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();

  const [picks, bookmakers] = await Promise.all([
    prisma.pick.findMany({ where: { eventId: match.id } }),
    prisma.bookmaker.findMany(),
  ]);
  const bookTitles = new Map(bookmakers.map((b) => [b.key, b.title]));

  const stakedEdge = (marketKey: string) =>
    match.edges.find((e) => e.marketKey === marketKey && e.isRecommended && isStakedTier(e.tier)) ?? null;
  const h2hPick = stakedEdge("h2h");
  const totalsPick = stakedEdge("totals");
  const pickCell = (edge: typeof h2hPick): PickCell | null =>
    edge ? { bookmakerKey: edge.bestBookmakerKey, outcomeName: edge.outcomeName, point: edge.point } : null;

  const totalsByPoint = new Map<number, OddsLine[]>();
  for (const line of match.totals) {
    if (line.point == null) continue;
    const list = totalsByPoint.get(line.point) ?? [];
    list.push(line);
    totalsByPoint.set(line.point, list);
  }

  const results = resultProbabilities(match);
  const findResult = (name: string) => results.find((r) => r.name === name);
  const home = findResult(match.homeTeam);
  const draw = findResult("Draw");
  const away = findResult(match.awayTeam);
  const hasResults = Boolean(home || draw || away);

  const totalsProbs = totalsProbabilities(match);
  const kickedOff = hasKickedOff(match.commenceTime);

  const resume = (
    <div className="flex flex-col gap-6">
      {kickedOff ? null : (
        <p className="flex items-start gap-2 rounded-lg bg-bg-row px-3.5 py-2.5 text-sm text-fg">
          <Icon name="wallet" className="mt-0.5 h-4 w-4 text-fg-muted" />
          <span>
            Clique sur une cote pour l&apos;ajouter à ta sélection : on t&apos;indique quel pourcentage de ta bankroll tu peux y
            miser.
          </span>
        </p>
      )}
      <p className="text-xs text-fg-muted">Cotes des bookmakers français agréés par l&apos;ANJ, les seuls où parier depuis la France.</p>

      <section>
        <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Résultat (1X2)
        </h3>
        <OddsTable
          match={match}
          kickedOff={kickedOff}
          lines={match.h2h}
          outcomeOrder={[match.homeTeam, "Draw", match.awayTeam]}
          pick={pickCell(h2hPick)}
          errors={match.oddsErrors.filter((e) => e.marketKey === "h2h")}
        />
      </section>

      {Array.from(totalsByPoint.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([point, lines]) => (
          <section key={point}>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
              Total de buts — {point}
            </h3>
            <OddsTable
              match={match}
              kickedOff={kickedOff}
              lines={lines}
              outcomeOrder={["Over", "Under"]}
              pick={totalsPick?.point === point ? pickCell(totalsPick) : null}
              errors={match.oddsErrors.filter((e) => e.marketKey === "totals" && e.point === point)}
            />
          </section>
        ))}

      {match.oddsErrors.length > 0 ? <OddsErrorLegend /> : null}
    </div>
  );

  const probabilites = (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-fg-muted">
        Probabilités « de-vig » : la marge de chaque bookmaker est retirée (méthode de Shin), puis le résultat est moyenné sur
        tous les bookmakers suivis — Pinnacle compté double, comme pour les verdicts. Les cotes affichées sont les meilleures
        des bookmakers français ; une flamme signale une erreur de cote par rapport à ces probabilités. Donnée indicative
        calculée à partir des cotes stockées — pas un pronostic garanti.
      </p>

      <section>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Résultat — implicite (cotes)
        </h3>
        {!hasResults ? (
          <p className="text-sm text-fg-muted">Pas encore assez de cotes pour estimer ce marché.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "1", name: match.homeTeam, outcome: match.homeTeam, data: home, color: "text-fg" },
                { label: "X", name: "Nul", outcome: "Draw", data: draw, color: "text-fg-muted" },
                { label: "2", name: match.awayTeam, outcome: match.awayTeam, data: away, color: "text-fg" },
              ].map((slot) => (
                <div
                  key={slot.label}
                  className="flex flex-col items-center gap-1 rounded-xl border border-border bg-bg-row/50 px-3 py-4 text-center"
                >
                  <span className="font-mono-tabular text-xs uppercase text-fg-muted">{slot.label}</span>
                  <span className="truncate text-xs text-fg-muted">{slot.name}</span>
                  <span className={`font-display text-xl font-bold ${slot.color}`}>
                    {slot.data ? `${Math.round(slot.data.probability * 100)}%` : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono-tabular text-xs text-fg-muted">
                    <OddsErrorFlame errors={oddsErrorsFor(match.oddsErrors, "h2h", slot.outcome)} className="h-3 w-3" />
                    {slot.data?.price ? `cote ${slot.data.price.toFixed(2)}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <ProbabilityBar
              segments={[
                { pct: (home?.probability ?? 0) * 100, color: "bg-fg" },
                { pct: (draw?.probability ?? 0) * 100, color: "bg-seq-3" },
                { pct: (away?.probability ?? 0) * 100, color: "bg-fg-muted" },
              ]}
            />
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Résultat — modèle brut (Elo + modèle de buts)
        </h3>
        {!match.prediction ? (
          <p className="text-sm text-fg-muted">
            Pas de modèle pour ce match : compétition non couverte, ou équipe non reconnue.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "1", name: match.homeTeam, outcome: match.homeTeam, probability: match.prediction.homeWinProbability, price: home?.price ?? null, color: "text-fg" },
                { label: "X", name: "Nul", outcome: "Draw", probability: match.prediction.drawProbability, price: draw?.price ?? null, color: "text-fg-muted" },
                { label: "2", name: match.awayTeam, outcome: match.awayTeam, probability: match.prediction.awayWinProbability, price: away?.price ?? null, color: "text-fg" },
              ].map((slot) => {
                const isPick = h2hPick?.outcomeName === slot.outcome;
                return (
                  <div
                    key={slot.label}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center ${
                      isPick ? "border-accent bg-accent-dim" : "border-border bg-bg-row/50"
                    }`}
                  >
                    <span className="font-mono-tabular text-xs uppercase text-fg-muted">{slot.label}</span>
                    <span className="truncate text-xs text-fg-muted">{slot.name}</span>
                    <span className={`font-display text-xl font-bold ${isPick ? "text-accent-strong" : slot.color}`}>
                      {Math.round(slot.probability * 100)}%
                    </span>
                    <span className="font-mono-tabular text-xs text-fg-muted">
                      {slot.price ? `cote ${slot.price.toFixed(2)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <ProbabilityBar
              segments={[
                { pct: match.prediction.homeWinProbability * 100, color: "bg-fg" },
                { pct: match.prediction.drawProbability * 100, color: "bg-seq-3" },
                { pct: match.prediction.awayWinProbability * 100, color: "bg-fg-muted" },
              ]}
            />
            <p className="text-xs text-fg-muted">
              Modèle brut, avant l&apos;ancre marché, le mouvement de ligne et la calibration : le détail et le verdict
              sont dans l&apos;onglet Analyse — indicatif, pas un pronostic garanti.
            </p>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Total de buts dans le match
        </h3>
        {totalsProbs.length === 0 ? (
          <p className="text-sm text-fg-muted">Pas encore de cotes « total de buts » pour ce match.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {totalsProbs.map(({ point, outcomes }) => (
              <div key={point} className="flex flex-col gap-2 sm:flex-row">
                {outcomes.map((outcome) => (
                  <div
                    key={outcome.name}
                    className="flex flex-1 items-center justify-between gap-3 rounded-xl border border-border bg-bg-row/50 px-4 py-2.5"
                  >
                    <span className="text-sm text-fg">
                      {outcome.name === "Over" ? `Plus de ${point} buts` : `Moins de ${point} buts`}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <OddsErrorFlame errors={oddsErrorsFor(match.oddsErrors, "totals", outcome.name, point)} />
                      <span className="font-mono-tabular text-sm font-semibold text-fg">
                        {Math.round(outcome.probability * 100)}%
                      </span>
                      <span className="rounded bg-bg-elevated px-2 py-0.5 font-mono-tabular text-xs font-semibold text-fg ring-1 ring-border">
                        {outcome.price ? outcome.price.toFixed(2) : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const theme = competitionTheme(match.sportKey, match.sportTitle);
  const homeKit = kitOrTheme(match.homeColors, theme, "home");
  const awayKit = kitOrTheme(match.awayColors, theme, "away");

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="board" />
      <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-1 rounded-md pr-2 text-sm font-medium text-fg-muted transition-colors duration-200 hover:text-fg"
        >
          <Icon name="chevron-left" /> Retour au tableau
        </Link>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 pb-12 sm:px-6">
        <div className="overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
          <div className="relative isolate bg-bg-row">
            <KitStripes colors={homeKit} side="home" />
            <KitStripes colors={awayKit} side="away" />
            <CompetitionBand theme={theme} logo={match.sportLogo} className="h-10 sm:px-5" />
            <div className="mx-1.5 mb-1.5 rounded-b-lg bg-bg-elevated px-4 py-7 text-center sm:px-8">
              <h1 className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 font-display text-xl font-bold text-fg sm:text-2xl">
                <span className="flex flex-col items-center gap-3 text-center">
                  <KitCrest crest={match.homeCrest} kit={homeKit} size={64} />
                  {match.homeTeam}
                </span>
                <span className="flex h-[70px] items-center text-sm font-medium text-fg-muted">vs</span>
                <span className="flex flex-col items-center gap-3 text-center">
                  <KitCrest crest={match.awayCrest} kit={awayKit} size={64} />
                  {match.awayTeam}
                </span>
              </h1>
              <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-fg-muted">
                <Icon name="clock" className="h-3.5 w-3.5" />
                <time>{upperFirst(formatKickoff(match.commenceTime))}</time>
              </p>
              <ResultTiles event={match} className="mx-auto mt-5 max-w-md text-left" />
              {h2hPick || totalsPick ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[h2hPick, totalsPick].map((edge) =>
                    edge ? (
                      <span key={edge.marketKey} className="inline-flex items-center gap-2">
                        <TierBadge tier={edge.tier} />
                        <span className="text-sm text-fg">
                          {outcomeLabel(edge.marketKey, edge.outcomeName, edge.point, match.homeTeam, match.awayTeam)}
                        </span>
                      </span>
                    ) : null
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border">
            <MatchTabs
              tabs={[
                { id: "resume", label: "Résumé", content: resume },
                { id: "analyse", label: "Analyse", content: <Analysis match={match} picks={picks} bookTitles={bookTitles} /> },
                { id: "probabilites", label: "Probabilités", content: probabilites },
                { id: "matrice", label: "Matrice", content: <ScoreMatrix match={match} /> },
              ]}
            />
          </div>
        </div>
      </div>
      <PageFooter />
    </div>
  );
}
