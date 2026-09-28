import type { ReactNode } from "react";
import type { Edge, MatchPrediction, Pick } from "@/generated/prisma/client";
import type { MatchDetail } from "@/lib/board";
import { isFrenchBook } from "@/lib/bookmakers";
import { formatKickoff } from "@/lib/dates";
import {
  DATA_QUALITY_LABELS,
  competitionLabel,
  formatOdds,
  formatPct,
  formatPts,
  formatSignedPct,
  formatUnits,
  marketLabel,
  outcomeLabel,
} from "@/lib/labels";
import { ELO_BLEND_WEIGHT, SIGNALS, STAKING, isStakedTier } from "@/lib/methodology/config";
import type { StoredEdgeSignals } from "@/lib/refreshEdges";
import { Icon, type IconName } from "@/components/Icon";
import { ReasonList, TierBadge } from "@/components/Verdict";

type BookTitles = Map<string, string>;

function signalsOf(edge: Edge): StoredEdgeSignals {
  return edge.signals as unknown as StoredEdgeSignals;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2.5 font-display text-sm font-semibold uppercase tracking-widest text-fg">
      <span className="h-4 w-1 rounded-full bg-fg-muted" aria-hidden />
      {children}
    </h3>
  );
}

type Tone = "for" | "against" | "neutral";

const TONE_CHIP: Record<Tone, { label: string; icon: IconName; className: string }> = {
  for: { label: "Pour", icon: "check", className: "bg-rise/10 text-rise" },
  against: { label: "Contre", icon: "x", className: "bg-fall/10 text-fall" },
  neutral: { label: "Neutre", icon: "minus", className: "bg-bg-row text-fg-muted" },
};

/** One market signal, with an explicit for / against / neutral read — never color alone. */
function SignalCard({ index, title, icon, tone, children }: { index: number; title: string; icon: IconName; tone: Tone; children: ReactNode }) {
  const chip = TONE_CHIP[tone];
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-bg-row text-fg">
            <Icon name={icon} className="h-3.5 w-3.5" />
          </span>
          {index} · {title}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
          <Icon name={chip.icon} className="h-3 w-3" />
          {chip.label}
        </span>
      </div>
      <div className="text-sm leading-relaxed text-fg">{children}</div>
    </div>
  );
}

const toneOf = (value: number | null | undefined, threshold: number): Tone =>
  value === null || value === undefined ? "neutral" : value >= threshold ? "for" : value <= -threshold ? "against" : "neutral";

/** Books that moved together, naming only the French ones: "Winamax, Betclic et 2 autres bookmakers". */
function steamBooks(books: string[], title: (key: string) => string): string {
  const french = books.filter(isFrenchBook).map(title);
  const others = books.length - french.length;
  if (french.length === 0) return `${books.length} bookmakers`;
  return others === 0 ? french.join(", ") : `${french.join(", ")} et ${others} autre${others > 1 ? "s" : ""} bookmaker${others > 1 ? "s" : ""}`;
}

function MarketSignals({ edge, bookTitles }: { edge: Edge; bookTitles: BookTitles }) {
  const s = signalsOf(edge);
  const title = (key: string) => bookTitles.get(key) ?? key;
  const sharpTone: Tone =
    (s.predictedMove ?? 0) <= -SIGNALS.predictedMoveAgainst ? "against" : toneOf(s.sharpDivergence, SIGNALS.sharpDivergence);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <SignalCard index={1} title="Mouvement de ligne" icon="trending-up" tone={toneOf(s.nudge, 0.0005)}>
        {s.open === null ? (
          <span className="text-fg-muted">Pas assez d&apos;historique pour une cote d&apos;ouverture.</span>
        ) : (
          <>
            Consensus {formatPct(s.open, 1)} à l&apos;ouverture → {formatPct(s.consensus, 1)} maintenant ({formatPts(s.delta)}).
            <span className="block text-xs text-fg-muted">Ajustement appliqué au modèle : {formatPts(s.nudge, 2)} (quadratique, plafonné à ±1,5 pt).</span>
          </>
        )}
      </SignalCard>
      <SignalCard index={2} title="Steam" icon="zap" tone={s.steam ? (s.steam.direction === 1 ? "for" : "against") : "neutral"}>
        {s.steam ? (
          <>
            {steamBooks(s.steam.books, title)} {s.steam.books.length > 1 ? "ont" : "a"} bougé{" "}
            {s.steam.direction === 1 ? "vers" : "contre"} ce côté, ensemble, en moins de 5 min ({formatKickoff(new Date(s.steam.at))}).
          </>
        ) : (
          <span className="text-fg-muted">Aucun mouvement synchronisé de plusieurs books sur les dernières heures.</span>
        )}
      </SignalCard>
      <SignalCard index={3} title="Reverse line movement" icon="swap" tone={s.rlm ? (s.rlm.sharpSide === 1 ? "for" : "against") : "neutral"}>
        {s.rlm ? (
          <>
            Pinnacle {formatPts(s.rlm.sharpMove)} contre {formatPts(s.rlm.publicMove)} pour les books grand public :
            {s.rlm.sharpSide === 1 ? " les sharps sont sur ce côté." : " les sharps sont de l'autre côté."}
          </>
        ) : (
          <span className="text-fg-muted">Pinnacle et les books grand public vont dans le même sens (ou ne bougent pas).</span>
        )}
      </SignalCard>
      <SignalCard
        index={4}
        title="Consensus multi-books"
        icon="scale"
        tone={s.best?.flag === "stale" ? "for" : s.best?.flag === "juiced" ? "against" : "neutral"}
      >
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
      <SignalCard index={5} title="Sharps & clôture prévue" icon="target" tone={sharpTone}>
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
  const all = signalsOf(edge).books;
  const books = all.filter((b) => isFrenchBook(b.bookmakerKey)).sort((a, b) => b.price - a.price);
  return (
    <div className="flex flex-col gap-2">
      {books.length === 0 ? (
        <p className="text-sm text-fg-muted">Aucun bookmaker français ne cote ce marché.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead className="bg-bg-row/60">
              <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-2 font-normal">Bookmaker</th>
                <th className="px-3 py-2 text-right font-normal">Cote</th>
                <th className="px-3 py-2 text-right font-normal">Proba sans marge</th>
                <th className="px-3 py-2 text-right font-normal">Consensus − book</th>
                <th className="px-4 py-2 font-normal">Signal</th>
              </tr>
            </thead>
            <tbody>
              {books.map((b) => (
                <tr key={b.bookmakerKey} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <td className="px-4 py-2 text-fg">
                    {bookTitles.get(b.bookmakerKey) ?? b.bookmakerKey}
                    {b.bettable ? "" : <span className="ml-1.5 text-xs text-fg-muted">(pas de compte)</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatOdds(b.price)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPct(b.fair, 1)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-right font-mono-tabular">{formatPts(b.divergence)}</td>
                  <td className="px-4 py-2 text-xs">
                    {b.flag === "stale" ? (
                      <span className="inline-flex items-center gap-1 font-medium text-rise">
                        <Icon name="arrow-up" className="h-3 w-3" /> en retard (+EV)
                      </span>
                    ) : b.flag === "juiced" ? (
                      <span className="inline-flex items-center gap-1 font-medium text-fall">
                        <Icon name="arrow-down" className="h-3 w-3" /> rabotée
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-fg-muted">
        Le consensus compte les {all.length} bookmakers de la dernière synchro, français ou non (Pinnacle compté double) ;
        seuls les bookmakers français sont listés.
      </p>
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

      <div
        className={`flex flex-col gap-4 rounded-xl border border-border px-5 py-4 ${
          staked ? "border-l-4 border-l-accent bg-accent-dim/40" : "bg-bg-row/50"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">{staked ? "Le modèle prend" : "Le modèle pencherait pour"}</span>
            <span className="font-display text-xl font-bold text-fg">{label(recommended)}</span>
          </div>
          <TierBadge tier={recommended.tier} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <span className="block text-xs text-fg-muted">Proba modèle / marché</span>
            <span className="font-mono-tabular text-[15px] font-semibold">
              {formatPct(recommended.modelProb, 1)} / {formatPct(recommended.marketProb, 1)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Edge</span>
            <span className="font-mono-tabular text-[15px] font-semibold">{formatPts(recommended.edge)}</span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Meilleure cote · EV</span>
            <span className="font-mono-tabular text-[15px] font-semibold">
              {formatOdds(recommended.bestPrice)} · {formatSignedPct(recommended.ev)}
            </span>
          </div>
          <div>
            <span className="block text-xs text-fg-muted">Mise conseillée</span>
            <span className="font-mono-tabular text-[15px] font-semibold">
              {staked ? `${formatUnits(recommended.stakeUnits)} (¼ Kelly)` : "aucune"}
            </span>
          </div>
        </div>
        {pick ? (
          <p className="flex items-start gap-1.5 text-xs text-fg-muted">
            <Icon name="clock" className="mt-px h-3.5 w-3.5" />
            <span>
            Journalisé {formatKickoff(pick.publishedAt)} : {outcomeLabel(pick.marketKey, pick.outcomeName, pick.point, match.homeTeam, match.awayTeam)} @
            {formatOdds(pick.price)} chez {bookTitles.get(pick.bookmakerKey) ?? pick.bookmakerKey} ({pick.tier.replace("_", " ")},{" "}
            {formatUnits(pick.stakeUnits)}) — ce snapshot ne change plus.
            </span>
          </p>
        ) : null}
        <ReasonList reasons={recommended.reasons} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="bg-bg-row/60">
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
              <tr
                key={e.id}
                className={`border-t border-border transition-colors duration-150 hover:bg-bg-row/50 ${e.isRecommended ? "font-medium" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-2 text-fg">{label(e)}</td>
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
  competitionCode?: string;
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
  /** National-team match on neutral ground. */
  neutral?: boolean;
};

function ModelBreakdown({ prediction, match }: { prediction: MatchPrediction; match: MatchDetail }) {
  const c = (prediction.components ?? {}) as Components;
  const national = c.competitionCode?.startsWith("INT-") ?? false;
  const three = (h: number | null, d: number | null, a: number | null) =>
    h === null || d === null || a === null ? "—" : `${formatPct(h)} / ${formatPct(d)} / ${formatPct(a)}`;
  const elo = (x: number | null) => (x === null ? "—" : Math.round(x).toString());
  const signedElo = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`);
  const tuning = !c.league?.eloTuned
    ? "(constantes par défaut)"
    : national
      ? `(K et avantage terrain réglés par type de match : ${competitionLabel(c.competitionCode ?? "")})`
      : "(K et avantage terrain ajustés sur la ligue)";
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle>Le modèle, pièce par pièce</SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg-row/50 px-4 py-3.5 text-sm leading-relaxed">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Colonne vertébrale : Elo {tuning}</span>
          <span>
            {match.homeTeam} {elo(prediction.eloHomeRating)} · {match.awayTeam} {elo(prediction.eloAwayRating)}
          </span>
          <span className="text-fg-muted">
            {c.neutral ? "Terrain neutre (pas d'avantage terrain)" : `Avantage terrain ${signedElo(c.league?.homeAdvantage)}`} · forme (10
            derniers) {signedElo(c.formHome)} / {signedElo(c.formAway)} · repos{" "}
            {signedElo(c.rest)}
            {c.restDaysHome != null && c.restDaysAway != null
              ? ` (${c.restDaysHome.toFixed(0)} j / ${c.restDaysAway.toFixed(0)} j)`
              : ""}
          </span>
          <span>Écart Elo effectif {signedElo(c.eloDiff)} → 1 / X / 2 : {three(prediction.eloHomeWin, prediction.eloDraw, prediction.eloAwayWin)}</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-bg-row/50 px-4 py-3.5 text-sm leading-relaxed">
          <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Modèle de buts{" "}
            {!c.goalsFitted
              ? "(Poisson sur le classement, repli)"
              : national
                ? "(Dixon-Coles ajusté sur tous les matchs internationaux récents)"
                : "(Dixon-Coles ajusté sur les résultats)"}
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
          Pas de verdict pour ce match : il faut à la fois un modèle (équipes reconnues dans les résultats : football-data.org
          pour les clubs, résultats internationaux pour les sélections) et des cotes
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
