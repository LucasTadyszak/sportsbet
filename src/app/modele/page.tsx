import type { ReactNode } from "react";
import { getModelHealth, type CoverageRow, type ForecastScores } from "@/lib/modelHealth";
import { formatKickoff } from "@/lib/dates";
import { TIER_INFO, formatPct, formatPts, formatSignedPct, marketLabel } from "@/lib/labels";
import { CALIBRATION } from "@/lib/methodology/config";
import { calibrationBand, type CalibrationBand } from "@/lib/methodology/metrics";
import { PageFooter, PageIntro, SiteHeader } from "@/components/SiteHeader";
import { StatTile } from "@/components/Verdict";
import { ReliabilityChart } from "./ReliabilityChart";

export const dynamic = "force-dynamic";

export const metadata = { title: "Santé du modèle — SportsBet" };

const BAND_STYLE: Record<CalibrationBand, { color: string; icon: string; label: string }> = {
  good: { color: "bg-status-good", icon: "✓", label: "OK" },
  warning: { color: "bg-status-warning", icon: "△", label: "À surveiller" },
  critical: { color: "bg-status-critical", icon: "✕", label: "À corriger" },
};

/** Status is never color alone: a dot, an icon and a word. */
function StatusPill({ band, text }: { band: CalibrationBand; text?: string }) {
  const style = BAND_STYLE[band];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg">
      <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${style.color}`} />
      <span aria-hidden className="font-mono-tabular">{style.icon}</span>
      {text ?? style.label}
    </span>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold text-fg">
          <span className="h-5 w-1 rounded-full bg-accent" aria-hidden />
          {title}
        </h2>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children, minWidth = 640 }: { head: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-bg-elevated shadow-card">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <thead className="bg-bg-row/60">
          <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
            {head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-normal ${i === 0 ? "pl-4" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Cell = ({ children, first = false, muted = false }: { children: ReactNode; first?: boolean; muted?: boolean }) => (
  <td className={`px-3 py-2 ${first ? "pl-4 text-fg" : "whitespace-nowrap text-right font-mono-tabular"} ${muted ? "text-fg-muted" : ""}`}>{children}</td>
);

function coverageBand(share: number): CalibrationBand {
  return share >= 0.9 ? "good" : share >= 0.5 ? "warning" : "critical";
}

function CoverageCell({ count, row }: { count: number; row: CoverageRow }) {
  const share = row.events > 0 ? count / row.events : 0;
  return (
    <td className="px-3 py-2 text-right">
      <span className="inline-flex items-center justify-end gap-2">
        <span className="font-mono-tabular">{formatPct(share)}</span>
        <StatusPill band={coverageBand(share)} text="" />
      </span>
    </td>
  );
}

function ScoreRow({ label, scores, best }: { label: string; scores: ForecastScores | null; best: boolean }) {
  return (
    <tr className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
      <Cell first>
        {label}
        {best ? <span className="ml-2 text-xs text-fg-muted">(meilleur Brier)</span> : null}
      </Cell>
      <Cell>{scores ? scores.brier.toFixed(4) : "—"}</Cell>
      <Cell>{scores ? scores.rps.toFixed(4) : "—"}</Cell>
      <Cell>{scores ? scores.logLoss.toFixed(4) : "—"}</Cell>
      <Cell muted>{scores?.n ?? 0}</Cell>
    </tr>
  );
}

export default async function ModelHealthPage() {
  const health = await getModelHealth();
  const { journal, scores } = health;
  const scoreRows: { label: string; scores: ForecastScores | null }[] = [
    { label: "Modèle brut (avant calibration)", scores: scores.model },
    { label: "Modèle final (calibré)", scores: scores.final },
    { label: "Marché — consensus à la clôture", scores: scores.market },
    { label: "Pinnacle à la clôture", scores: scores.sharp },
  ];
  const bestBrier = Math.min(...scoreRows.map((r) => r.scores?.brier ?? Infinity));

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="model" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6">
        <PageIntro title="Santé du modèle">
            Le bulletin que le modèle se rédige lui-même chaque nuit : est-il calibré, bat-il la clôture, et quelles données
            lui manquent. Chaque pick gradé ajuste les prévisions du lendemain.{" "}
            {health.lastCalibration ? `Dernière calibration : ${formatKickoff(health.lastCalibration)}.` : "Pas encore de calibration calculée."}
        </PageIntro>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile
            label="CLV moyenne"
            value={formatSignedPct(journal.avgClv)}
            hint="la mesure qui compte"
            tone={journal.avgClv === null ? undefined : journal.avgClv >= 0 ? "rise" : "fall"}
          />
          <StatTile label="Bat la clôture" value={formatPct(journal.beatClose)} icon="target" />
          <StatTile label="ROI" value={formatSignedPct(journal.roi)} tone={journal.roi === null ? undefined : journal.roi >= 0 ? "rise" : "fall"} />
          <StatTile label="Brier des picks" value={journal.brier === null ? "—" : journal.brier.toFixed(3)} hint="0.250 = pile ou face" />
          <StatTile label="Picks gradés" icon="check" value={String(health.gradedPicks)} hint={journal.gap === null ? undefined : `écart de calibration ${formatPts(journal.gap)}`} />
        </div>

        <Section
          title="Modèle contre marché"
          description="Scores sur le 1X2 de chaque match gradé où le modèle et le marché avaient un prix (plus bas = meilleur). Le marché à la clôture est la référence à battre : un modèle qui s'en approche sans l'égaler apporte quand même de l'information, c'est ce que mesure l'échelle de calibration plus bas."
        >
          <Table head={["Prévision", "Brier", "RPS", "Log-loss", "Matchs"]}>
            {scoreRows.map((row) => (
              <ScoreRow key={row.label} label={row.label} scores={row.scores} best={row.scores !== null && row.scores.brier === bestBrier} />
            ))}
          </Table>
        </Section>

        <Section
          title="Fiabilité des probabilités"
          description="Chaque issue (1, X, 2) de chaque match gradé, regroupée par tranche de 10 points de probabilité prédite. Sous la diagonale, le modèle est trop confiant ; au-dessus, pas assez."
        >
          {health.reliability.model.length === 0 && health.reliability.market.length === 0 ? (
            <p className="text-sm text-fg-muted">Pas encore de match gradé.</p>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-2 rounded-xl border border-border bg-bg-elevated p-4 shadow-card">
                <ReliabilityChart model={health.reliability.model} market={health.reliability.market} />
                <p className="text-xs text-fg-muted">
                  Tant que peu de matchs sont gradés, chaque point ne repose que sur quelques issues (colonne « Issues ») et la
                  courbe zigzague : il en faut plusieurs centaines pour la lire.
                </p>
              </div>
              <Table head={["Tranche", "Modèle prédit", "Modèle observé", "Issues", "Marché prédit", "Marché observé"]} minWidth={520}>
                {Array.from(new Set([...health.reliability.model, ...health.reliability.market].map((b) => b.lo)))
                  .sort((a, b) => a - b)
                  .map((lo) => {
                    const m = health.reliability.model.find((b) => b.lo === lo);
                    const k = health.reliability.market.find((b) => b.lo === lo);
                    return (
                      <tr key={lo} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                        <Cell first>
                          {Math.round(lo * 100)}–{Math.round(lo * 100) + 10} %
                        </Cell>
                        <Cell>{formatPct(m?.avgPredicted, 1)}</Cell>
                        <Cell>{formatPct(m?.observed, 1)}</Cell>
                        <Cell muted>{m?.n ?? 0}</Cell>
                        <Cell>{formatPct(k?.avgPredicted, 1)}</Cell>
                        <Cell>{formatPct(k?.observed, 1)}</Cell>
                      </tr>
                    );
                  })}
              </Table>
            </div>
          )}
        </Section>

        <Section
          title="Calibration du journal, par championnat et marché"
          description="Écart = taux de réussite − probabilité annoncée des picks. Négatif = trop confiant (le cas le plus fréquent). Dans ±2 pts : bien calibré ; au-delà de ±10 pts : le modèle est à corriger. Le décalage appliqué est la correction, réduite et plafonnée selon la taille de l'échantillon, que la calibration nocturne applique aux prévisions suivantes."
        >
          {health.bySportMarket.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun pick gradé pour l&apos;instant.</p>
          ) : (
            <Table head={["Championnat · marché", "Picks", "Proba annoncée", "Réussite", "Écart", "État", "Décalage appliqué", "ROI", "CLV"]} minWidth={900}>
              {health.bySportMarket.map((row) => (
                <tr key={`${row.sportKey}|${row.marketKey}`} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <Cell first>
                    {row.sportTitle} · {marketLabel(row.marketKey)}
                  </Cell>
                  <Cell muted>{row.n}</Cell>
                  <Cell>{formatPct(row.avgPredicted, 1)}</Cell>
                  <Cell>{formatPct(row.hitRate, 1)}</Cell>
                  <Cell>{formatPts(row.gap)}</Cell>
                  <td className="px-3 py-2 text-right">
                    {row.gap === null || row.n < CALIBRATION.minSample ? (
                      <span className="text-xs text-fg-muted">échantillon trop petit</span>
                    ) : (
                      <StatusPill band={calibrationBand(row.gap)} />
                    )}
                  </td>
                  <Cell>{formatPts(row.offsetApplied)}</Cell>
                  <Cell>{formatSignedPct(row.roi)}</Cell>
                  <Cell>{formatSignedPct(row.avgClv)}</Cell>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Par verdict" description="Un bon système voit sa CLV et son ROI monter avec le verdict ; sinon, les paliers ne trient rien.">
          {health.byTier.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun pick gradé pour l&apos;instant.</p>
          ) : (
            <Table head={["Verdict", "Picks", "Proba annoncée", "Réussite", "Écart", "Brier", "ROI", "CLV", "Bat la clôture"]} minWidth={860}>
              {health.byTier.map((row) => (
                <tr key={row.tier} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <Cell first>{TIER_INFO[row.tier]?.name ?? row.tier}</Cell>
                  <Cell muted>{row.n}</Cell>
                  <Cell>{formatPct(row.avgPredicted, 1)}</Cell>
                  <Cell>{formatPct(row.hitRate, 1)}</Cell>
                  <Cell>{formatPts(row.gap)}</Cell>
                  <Cell>{row.brier === null ? "—" : row.brier.toFixed(3)}</Cell>
                  <Cell>{formatSignedPct(row.roi)}</Cell>
                  <Cell>{formatSignedPct(row.avgClv)}</Cell>
                  <Cell>{formatPct(row.beatClose)}</Cell>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section
          title="Échelle de calibration"
          description="Part du désaccord entre le modèle et le marché de clôture qui s'est révélée réelle, ajustée sur tous les matchs gradés (1 = le modèle voit juste quand il diverge, 0 = pur bruit). Elle part de 0,5 et ne bouge qu'avec les preuves ; elle multiplie chaque écart modèle − marché avant le calcul de l'edge."
        >
          {health.edgeScales.length === 0 ? (
            <p className="text-sm text-fg-muted">Pas encore de match gradé : l&apos;échelle par défaut (0,50) s&apos;applique partout.</p>
          ) : (
            <Table head={["Championnat · marché", "Matchs", "Échelle appliquée", "Pente brute"]} minWidth={520}>
              {health.edgeScales.map((row) => (
                <tr key={`${row.sportKey}|${row.marketKey}`} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <Cell first>
                    {row.sportTitle} · {marketLabel(row.marketKey)}
                  </Cell>
                  <Cell muted>{row.n}</Cell>
                  <Cell>{row.scale.toFixed(2)}</Cell>
                  <Cell muted>{row.raw.toFixed(2)}</Cell>
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section
          title="Couverture des données (7 prochains jours)"
          description="Ce à quoi le modèle a accès en ce moment, par championnat. Vert : au moins 90 % des matchs ; orange : partiel ; rouge : la donnée manque et le modèle tourne en mode dégradé."
        >
          {health.coverage.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun match à venir en base.</p>
          ) : (
            <Table head={["Championnat", "Matchs", "Modèle", "Données complètes", "Pinnacle", "Exchange", "Totaux"]} minWidth={760}>
              {health.coverage.map((row) => (
                <tr key={row.sportKey} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <Cell first>{row.sportTitle}</Cell>
                  <Cell muted>{row.events}</Cell>
                  <CoverageCell count={row.withModel} row={row} />
                  <CoverageCell count={row.fullData} row={row} />
                  <CoverageCell count={row.withSharp} row={row} />
                  <CoverageCell count={row.withExchange} row={row} />
                  <CoverageCell count={row.withTotals} row={row} />
                </tr>
              ))}
            </Table>
          )}
        </Section>

        <Section title="Paramètres par ligue" description="Constantes Elo ajustées sur l'historique de chaque compétition (à partir de 300 matchs, sinon valeurs par défaut) et modèle de buts ajusté.">
          {health.leagues.length === 0 ? (
            <p className="text-sm text-fg-muted">Aucun résultat en base : lance npm run refresh:stats.</p>
          ) : (
            <Table head={["Compétition", "Matchs", "K", "Avantage terrain", "Nul (base / largeur)", "Buts/équipe", "Avantage buts", "Rho", "Réglage"]} minWidth={860}>
              {health.leagues.map((l) => (
                <tr key={l.competitionCode} className="border-t border-border transition-colors duration-150 hover:bg-bg-row/50">
                  <Cell first>{l.competitionCode}</Cell>
                  <Cell muted>{l.matchesUsed}</Cell>
                  <Cell>{l.kFactor}</Cell>
                  <Cell>{l.homeAdvantage} pts</Cell>
                  <Cell>
                    {formatPct(l.drawBase)} / {l.drawWidth}
                  </Cell>
                  <Cell>{l.goalsBase === null ? "—" : l.goalsBase.toFixed(2)}</Cell>
                  <Cell>{l.goalsHomeAdv === null ? "—" : `×${l.goalsHomeAdv.toFixed(2)}`}</Cell>
                  <Cell>{l.rho.toFixed(2)}</Cell>
                  <Cell muted>{l.eloTuned ? "Ajusté" : "Défaut"}</Cell>
                </tr>
              ))}
            </Table>
          )}
        </Section>
      </main>
      <PageFooter />
    </div>
  );
}
