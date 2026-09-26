import type { ReactNode } from "react";
import type { Edge, MatchPrediction, Pick } from "@/generated/prisma/client";
import type { MatchDetail } from "@/lib/board";
import { formatKickoff } from "@/lib/dates";
import {
  DATA_QUALITY_LABELS,
  formatOdds,
  formatPct,
  formatPts,
  formatSignedPct,
  formatUnits,
  marketLabel,
  outcomeLabel,
} from "@/lib/labels";
import { ELO_BLEND_WEIGHT, STAKING, isStakedTier } from "@/lib/methodology/config";
import type { StoredEdgeSignals } from "@/lib/refreshEdges";
import { ReasonList, TierBadge } from "@/components/Verdict";

type BookTitles = Map<string, string>;

const ROLE_LABELS: Record<string, string> = { sharp: "Sharp", exchange: "Exchange", soft: "Grand public" };

function signalsOf(edge: Edge): StoredEdgeSignals {
  return edge.signals as unknown as StoredEdgeSignals;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">{children}</h3>;
}

function SignalCard({ index, title, children }: { index: number; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg-row px-4 py-3">
      <span className="font-mono-tabular text-[11px] uppercase tracking-wide text-fg-muted">
        Signal {index} · {title}
      </span>
      <div className="text-sm text-fg">{children}</div>
    </div>
  );
}

function MarketSignals({ edge, bookTitles }: { edge: Edge; bookTitles: BookTitles }) {
  const s = signalsOf(edge);
  const title = (key: string) => bookTitles.get(key) ?? key;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SignalCard index={1} title="Mouvement de ligne">
        {s.open === null ? (
          <span className="text-fg-muted">Pas assez d&apos;historique pour une cote d&apos;ouverture.</span>
        ) : (
          <>
            Consensus {formatPct(s.open, 1)} à l&apos;ouverture → {formatPct(s.consensus, 1)} maintenant ({formatPts(s.delta)}).
            <span className="block text-xs text-fg-muted">Ajustement appliqué au modèle : {formatPts(s.nudge, 2)} (quadratique, plafonné à ±1,5 pt).</span>
          </>
        )}
      </SignalCard>
      <SignalCard index={2} title="Steam">
        {s.steam ? (
          <>
            {s.steam.direction === 1 ? "↑ Vers ce côté" : "↓ Contre ce côté"} — {s.steam.books.map(title).join(", ")} ont bougé
            ensemble en moins de 5 min ({formatKickoff(new Date(s.steam.at))}).
          </>
        ) : (
          <span className="text-fg-muted">Aucun mouvement synchronisé de plusieurs books sur les dernières heures.</span>
        )}
      </SignalCard>
      <SignalCard index={3} title="Reverse line movement">
        {s.rlm ? (
          <>
            Pinnacle {formatPts(s.rlm.sharpMove)} contre {formatPts(s.rlm.publicMove)} pour les books grand public :
            {s.rlm.sharpSide === 1 ? " les sharps sont sur ce côté." : " les sharps sont de l'autre côté."}
          </>
        ) : (
          <span className="text-fg-muted">Pinnacle et les books grand public vont dans le même sens (ou ne bougent pas).</span>
        )}
      </SignalCard>
      <SignalCard index={4} title="Consensus multi-books">
        {s.best ? (
          <>
            Meilleure cote {formatOdds(s.best.price)} chez {title(s.best.bookmakerKey)}
            {s.best.flag === "stale"
              ? ` — en retard sur le consensus (${formatPts(s.best.divergence)}) : +EV.`
              : s.best.flag === "juiced"
                ? ` — rabotée par rapport au consensus (${formatPts(s.best.divergence)}).`
                : ", alignée sur le consensus."}
            <span className="block text-xs text-fg-muted">
              Consensus pondéré ({s.market.bookCount} books, Pinnacle compté double){s.market.hasSharp ? "" : " — Pinnacle absent"}.
            </span>
          </>
        ) : (
          <span className="text-fg-muted">Aucun bookmaker jouable ne cote cette issue.</span>
        )}
      </SignalCard>
      <SignalCard index={5} title="Divergence sharp & CLV prévue">
        {s.sharpDivergence === null ? (
          <span className="text-fg-muted">Pinnacle ne cote pas ce marché : pas de référence sharp.</span>
        ) : (
          <>Pinnacle vs books grand public : {formatPts(s.sharpDivergence)}.</>
        )}
        {s.predictedClose !== null ? (
          <span className="block text-xs text-fg-muted">
            Clôture prévue {formatPct(s.predictedClose, 1)} ({formatPts(s.predictedMove)} d&apos;ici le coup d&apos;envoi)
            {s.predictedClv !== null ? ` — CLV attendue à la meilleure cote : ${formatSignedPct(s.predictedClv)}.` : "."}
          </span>
        ) : null}
      </SignalCard>
    </div>
  );
}

function BooksTable({ edge, bookTitles }: { edge: Edge; bookTitles: BookTitles }) {
  const books = [...signalsOf(edge).books].sort((a, b) => b.price - a.price);
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
            <th className="px-4 py-2 font-normal">Bookmaker</th>
            <th className="px-3 py-2 font-normal">Rôle</th>
            <th className="px-3 py-2 text-right font-normal">Cote</th>
            <th className="px-3 py-2 text-right font-normal">Proba sans marge</th>
            <th className="px-3 py-2 text-right font-normal">Consensus − book</th>
            <th className="px-4 py-2 font-normal">Signal</th>
          </tr>
        </thead>
        <tbody>
          {books.map((b) => (
            <tr key={b.bookmakerKey} className="border-t border-border">
              <td className="px-4 py-2 text-fg">
                {bookTitles.get(b.bookmakerKey) ?? b.bookmakerKey}
                {b.bettable ? "" : <span className="ml-1.5 text-xs text-fg-muted">(référence)</span>}
              </td>
              <td className="px-3 py-2 text-fg-muted">{ROLE_LABELS[b.role] ?? b.role}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatOdds(b.price)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPct(b.fair, 1)}</td>
              <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPts(b.divergence)}</td>
              <td className="px-4 py-2 text-xs">
                {b.flag === "stale" ? (
                  <span className="text-rise">▲ en retard (+EV)</span>
                ) : b.flag === "juiced" ? (
                  <span className="text-fall">▼ rabotée</span>
                ) : (
                  <span className="text-fg-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarketAnalysis({
  match,
  edges,
  pick,
  bookTitles,
}: {
  match: MatchDetail;
  edges: Edge[];
  pick: Pick | undefined;
  bookTitles: BookTitles;
}) {
  const recommended = edges.find((e) => e.isRecommended) ?? edges[0];
  const signals = signalsOf(recommended);
  const label = (e: Edge) => outcomeLabel(e.marketKey, e.outcomeName, e.point, match.homeTeam, match.awayTeam);
  const staked = isStakedTier(recommended.tier);

  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>{marketLabel(recommended.marketKey, recommended.point)}</SectionTitle>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-row px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">{staked ? "Le modèle prend" : "Le modèle pencherait pour"}</span>
            <span className="font-display text-lg font-bold text-fg">{label(recommended)}</span>
          </div>
          <TierBadge tier={recommended.tier} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs text-fg-muted">Proba modèle / marché</span>
            <span className="font-mono-tabular">
              {formatPct(recommended.modelProb, 1)} / {formatPct(recommended.marketProb, 1)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Edge</span>
            <span className="font-mono-tabular">{formatPts(recommended.edge)}</span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Meilleure cote · EV</span>
            <span className="font-mono-tabular">
              {formatOdds(recommended.bestPrice)} · {formatSignedPct(recommended.ev)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Mise conseillée</span>
            <span className="font-mono-tabular">
              {staked ? `${formatUnits(recommended.stakeUnits)} (¼ Kelly)` : "aucune"}
            </span>
          </div>
        </div>
        {pick ? (
          <p className="text-xs text-fg-muted">
            Journalisé {formatKickoff(pick.publishedAt)} : {outcomeLabel(pick.marketKey, pick.outcomeName, pick.point, match.homeTeam, match.awayTeam)} @
            {formatOdds(pick.price)} chez {bookTitles.get(pick.bookmakerKey) ?? pick.bookmakerKey} ({pick.tier.replace("_", " ")},{" "}
            {formatUnits(pick.stakeUnits)}) — ce snapshot ne change plus.
          </p>
        ) : null}
        <ReasonList reasons={recommended.reasons} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-2 font-normal">Issue</th>
              <th className="px-3 py-2 text-right font-normal" title="Elo + modèle de buts, sans information de marché">Modèle brut</th>
              <th className="px-3 py-2 text-right font-normal" title="Après ancre exchange (5 %) et mouvement de ligne">Ajusté</th>
              <th className="px-3 py-2 text-right font-normal" title="Après calibration (échelle + décalages) et clamp">Final</th>
              <th className="px-3 py-2 text-right font-normal">Marché</th>
              <th className="px-3 py-2 text-right font-normal">Pinnacle</th>
              <th className="px-3 py-2 text-right font-normal">Edge</th>
              <th className="px-3 py-2 text-right font-normal">EV</th>
              <th className="px-4 py-2 font-normal">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {edges.map((e) => (
              <tr key={e.id} className={`border-t border-border ${e.isRecommended ? "bg-bg-row" : ""}`}>
                <td className="px-4 py-2 text-fg">{label(e)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-fg-muted">{formatPct(e.modelRawProb, 1)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-fg-muted">{formatPct(e.modelBaseProb, 1)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPct(e.modelProb, 1)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPct(e.marketProb, 1)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular text-fg-muted">{formatPct(e.sharpProb, 1)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPts(e.edge)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatSignedPct(e.ev)}</td>
                <td className="px-4 py-2">
                  <TierBadge tier={e.tier} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">
        Calibration appliquée : échelle {signals.calibration.scale.toFixed(2)} (part du désaccord modèle/marché conservée),
        décalage {formatPts(signals.calibration.offset)} — issus du journal des picks gradés.
      </p>

      <MarketSignals edge={recommended} bookTitles={bookTitles} />
      <BooksTable edge={recommended} bookTitles={bookTitles} />
    </section>
  );
}

type Components = {
  homeMatches?: number;
  awayMatches?: number;
  eloDiff?: number | null;
  formHome?: number | null;
  formAway?: number | null;
  rest?: number | null;
  restDaysHome?: number | null;
  restDaysAway?: number | null;
  goalsFitted?: boolean;
  league?: { homeAdvantage: number; drawBase: number; drawWidth: number; eloTuned: boolean };
};

function ModelBreakdown({ prediction, match }: { prediction: MatchPrediction; match: MatchDetail }) {
  const c = (prediction.components ?? {}) as Components;
  const three = (h: number | null, d: number | null, a: number | null) =>
    h === null || d === null || a === null ? "—" : `${formatPct(h)} / ${formatPct(d)} / ${formatPct(a)}`;
  const elo = (x: number | null) => (x === null ? "—" : Math.round(x).toString());
  const signedElo = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`);
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Le modèle, pièce par pièce</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg-row px-4 py-3 text-sm">
          <span className="font-mono-tabular text-[11px] uppercase tracking-wide text-fg-muted">
            Colonne vertébrale : Elo {c.league?.eloTuned ? "(K et avantage terrain ajustés sur la ligue)" : "(constantes par défaut)"}
          </span>
          <span>
            {match.homeTeam} {elo(prediction.eloHomeRating)} · {match.awayTeam} {elo(prediction.eloAwayRating)}
          </span>
          <span className="text-fg-muted">
            Avantage terrain {signedElo(c.league?.homeAdvantage)} · forme (10 derniers) {signedElo(c.formHome)} / {signedElo(c.formAway)} · repos{" "}
            {signedElo(c.rest)}
            {c.restDaysHome != null && c.restDaysAway != null
              ? ` (${c.restDaysHome.toFixed(0)} j / ${c.restDaysAway.toFixed(0)} j)`
              : ""}
          </span>
          <span>Écart Elo effectif {signedElo(c.eloDiff)} → 1 / X / 2 : {three(prediction.eloHomeWin, prediction.eloDraw, prediction.eloAwayWin)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg-row px-4 py-3 text-sm">
          <span className="font-mono-tabular text-[11px] uppercase tracking-wide text-fg-muted">
            Modèle de buts {c.goalsFitted ? "(Dixon-Coles ajusté sur les résultats)" : "(Poisson sur le classement, repli)"}
          </span>
          <span>
            Buts attendus {prediction.expectedHomeGoals?.toFixed(2) ?? "—"} – {prediction.expectedAwayGoals?.toFixed(2) ?? "—"} · ρ ={" "}
            {prediction.rho.toFixed(2)}
          </span>
          <span>1 / X / 2 : {three(prediction.goalsHomeWin, prediction.goalsDraw, prediction.goalsAwayWin)}</span>
          <span className="text-fg-muted">Seul le modèle de buts sait pricer les totaux de buts.</span>
        </div>
      </div>
      <p className="text-sm text-fg">
        Mélange {Math.round(ELO_BLEND_WEIGHT * 100)} % Elo / {Math.round((1 - ELO_BLEND_WEIGHT) * 100)} % buts → modèle brut{" "}
        {three(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability)}.
      </p>
      <p className="text-xs text-fg-muted">
        Données : {DATA_QUALITY_LABELS[prediction.dataQuality] ?? prediction.dataQuality} ({c.homeMatches ?? 0} et {c.awayMatches ?? 0}{" "}
        matchs notés). Calculé {formatKickoff(prediction.computedAt)}, version {prediction.modelVersion}.
      </p>
    </section>
  );
}

export function Analysis({ match, picks, bookTitles }: { match: MatchDetail; picks: Pick[]; bookTitles: BookTitles }) {
  const byMarket = new Map<string, Edge[]>();
  for (const edge of match.edges) {
    const key = `${edge.marketKey}|${edge.point ?? ""}`;
    const list = byMarket.get(key) ?? [];
    list.push(edge);
    byMarket.set(key, list);
  }
  const outcomeOrder = [match.homeTeam, "Draw", match.awayTeam, "Over", "Under"];
  const markets = Array.from(byMarket.values())
    .map((edges) => edges.sort((a, b) => outcomeOrder.indexOf(a.outcomeName) - outcomeOrder.indexOf(b.outcomeName)))
    .sort((a, b) => (a[0].marketKey === "h2h" ? -1 : b[0].marketKey === "h2h" ? 1 : 0));

  return (
    <div className="flex flex-col gap-10">
      {markets.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Pas de verdict pour ce match : il faut à la fois un modèle (équipes reconnues côté football-data.org) et des cotes
          récentes. Les verdicts sont recalculés après chaque synchro, jusqu&apos;à {STAKING.publishWindowHours} h avant le
          coup d&apos;envoi pour la publication dans le journal.
        </p>
      ) : (
        markets.map((edges) => (
          <MarketAnalysis
            key={`${edges[0].marketKey}|${edges[0].point ?? ""}`}
            match={match}
            edges={edges}
            pick={picks.find((p) => p.marketKey === edges[0].marketKey)}
            bookTitles={bookTitles}
          />
        ))
      )}
      {match.predictionDetail ? <ModelBreakdown prediction={match.predictionDetail} match={match} /> : null}
    </div>
  );
}
