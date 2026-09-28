// "Matrice" tab: the probability of every exact score, rebuilt from what the raw prediction
// stores for its goals model (expected goals + Dixon-Coles ρ) — the grid itself isn't
// stored. Once the results source has it, the 90-minute score is ticked in the grid.
import type { MatchDetail } from "@/lib/board";
import { formatPct } from "@/lib/labels";
import { rankedScores, scoreGrid } from "@/lib/methodology/goals";
import { PREDICTION_WINDOW_DAYS } from "@/lib/refreshStats";
import { Icon } from "@/components/Icon";

const DAY_MS = 24 * 60 * 60 * 1000;

// 0 to 5 goals a side, the usual score grid.
const SHOWN_GOALS = 5;
const GOALS_AXIS = Array.from({ length: SHOWN_GOALS + 1 }, (_, goals) => goals);
const FAVORITES = 3;

// Sequential scale on the probability itself rather than relative to the likeliest score,
// so an open match reads fainter than a lopsided one. Below 1% a score recedes into the surface.
const STEPS: { from: number; className: string }[] = [
  { from: 0.14, className: "bg-seq-7 text-seq-ink-high" },
  { from: 0.11, className: "bg-seq-6 text-seq-ink-high" },
  { from: 0.09, className: "bg-seq-5 text-seq-ink-high" },
  { from: 0.07, className: "bg-seq-4 text-seq-ink-low" },
  { from: 0.05, className: "bg-seq-3 text-seq-ink-low" },
  { from: 0.03, className: "bg-seq-2 text-seq-ink-low" },
  { from: 0.01, className: "bg-seq-1 text-seq-ink-low" },
  { from: 0, className: "bg-bg-row text-fg-muted" },
];

function stepClass(probability: number): string {
  return (STEPS.find((step) => probability >= step.from) ?? STEPS[STEPS.length - 1]).className;
}

/** "8.6%", and "<0.1%" rather than a misleading "0.0%". */
function scorePct(probability: number): string {
  return probability < 0.0005 ? "<0.1%" : formatPct(probability, 1);
}

/** Further out than this, the model simply hasn't priced the match yet. */
function beyondPredictionWindow(kickoff: Date): boolean {
  return kickoff.getTime() - Date.now() > PREDICTION_WINDOW_DAYS * DAY_MS;
}

function Ordinal({ rank }: { rank: number }) {
  return (
    <>
      {rank}
      <sup>{rank === 1 ? "er" : "e"}</sup>
    </>
  );
}

function CheckBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center bg-rise text-on-rise ${className}`}
    >
      <Icon name="check" className="h-3 w-3" />
    </span>
  );
}

const SECTION_TITLE = "flex items-center gap-2.5 font-display text-xl uppercase leading-none tracking-wide text-fg";

export function ScoreMatrix({ match }: { match: MatchDetail }) {
  const prediction = match.predictionDetail;
  if (!prediction) {
    return (
      <p className="text-sm text-fg-muted">
        {beyondPredictionWindow(match.commenceTime)
          ? `Le modèle ne chiffre que les matchs des ${PREDICTION_WINDOW_DAYS} prochains jours : la matrice apparaîtra à l'approche de celui-ci.`
          : "Pas de modèle pour ce match : compétition non couverte, ou équipe non reconnue."}
      </p>
    );
  }
  const lambdaHome = prediction.expectedHomeGoals;
  const lambdaAway = prediction.expectedAwayGoals;
  if (lambdaHome === null || lambdaAway === null) {
    return (
      <p className="text-sm text-fg-muted">
        Seul l&apos;Elo a pu tourner pour ce match : sans modèle de buts, pas de probabilité par score.
      </p>
    );
  }

  const grid = scoreGrid(lambdaHome, lambdaAway, prediction.rho);
  const ranked = rankedScores(grid);
  const final = match.finalScore;
  const isFinal = (home: number, away: number) => final !== null && final.home === home && final.away === away;
  const finalRank = final ? ranked.findIndex((score) => isFinal(score.home, score.away)) + 1 : 0;
  const finalInMatrix = final !== null && final.home <= SHOWN_GOALS && final.away <= SHOWN_GOALS;
  const components = prediction.components as { goalsFitted?: boolean; competitionCode?: string } | null;
  const goalsFitted = components?.goalsFitted === true;
  const national = components?.competitionCode?.startsWith("INT-") ?? false;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div>
          <h3 className={SECTION_TITLE}>
            <span aria-hidden className="h-5 w-2 shrink-0 -skew-x-12 bg-slate" />
            Probabilité du score
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-fg-muted">
            {goalsFitted
              ? `Modèle de buts Dixon-Coles, ajusté sur ${national ? "tous les matchs internationaux récents" : "les résultats de la compétition"} (les plus récents pèsent davantage)`
              : "Loi de Poisson sur le classement (repli, faute d'assez de résultats pour ajuster le modèle Dixon-Coles)"}
            {" · "}buts attendus {match.homeTeam} {lambdaHome.toFixed(2)} – {lambdaAway.toFixed(2)} {match.awayTeam}.
          </p>
        </div>

        <figure className="mx-auto w-full max-w-md">
          <table className="w-full table-fixed border-separate border-spacing-1">
            <caption className="sr-only">
              Probabilité de chaque score exact : en ligne les buts marqués par {match.homeTeam}, en colonne ceux marqués par{" "}
              {match.awayTeam}.
            </caption>
            <colgroup>
              <col className="w-6" />
              {GOALS_AXIS.map((away) => (
                <col key={away} />
              ))}
            </colgroup>
            <tbody>
              {[...GOALS_AXIS].reverse().map((home) => (
                <tr key={home}>
                  <th
                    scope="row"
                    id={`score-h${home}`}
                    className="figures pr-1 text-right text-sm font-bold text-fg-muted"
                  >
                    <span className="sr-only">{match.homeTeam} </span>
                    {home}
                  </th>
                  {GOALS_AXIS.map((away) => {
                    const probability = grid[home][away];
                    const finalCell = isFinal(home, away);
                    const label = scorePct(probability);
                    return (
                      <td key={away} headers={`score-h${home} score-a${away}`} className="p-0">
                        <div
                          title={`${match.homeTeam} ${home} – ${away} ${match.awayTeam} : ${label}`}
                          className={`figures relative flex h-9 items-center justify-center text-[13px] font-bold sm:h-10 sm:text-[15px] ${stepClass(probability)} ${
                            finalCell
                              ? "z-10 ring-2 ring-fg ring-offset-1 ring-offset-bg-elevated"
                              : "transition-shadow duration-150 hover:ring-2 hover:ring-fg/40"
                          }`}
                        >
                          {label.slice(0, -1)}
                          <span className="text-[0.75em]">%</span>
                          {finalCell ? (
                            <>
                              <CheckBadge className="absolute -right-2 -top-2 ring-2 ring-bg-elevated" />
                              <span className="sr-only"> — score final</span>
                            </>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                {GOALS_AXIS.map((away) => (
                  <th
                    key={away}
                    scope="col"
                    id={`score-a${away}`}
                    className="figures pt-1 text-sm font-bold text-fg-muted"
                  >
                    <span className="sr-only">{match.awayTeam} </span>
                    {away}
                  </th>
                ))}
              </tr>
            </tfoot>
          </table>
          <figcaption className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="arrow-up" className="h-3.5 w-3.5 text-fg" />
              Buts {match.homeTeam}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="arrow-right" className="h-3.5 w-3.5 text-fg" />
              Buts {match.awayTeam}
            </span>
            {finalInMatrix ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckBadge />
                Score final (90 min)
              </span>
            ) : null}
          </figcaption>
        </figure>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className={SECTION_TITLE}>
          <span aria-hidden className="h-5 w-2 shrink-0 -skew-x-12 bg-slate" />
          Scores favoris du modèle
        </h3>
        <ol className="grid grid-cols-3 gap-2 sm:gap-3">
          {ranked.slice(0, FAVORITES).map((score, index) => {
            const hit = isFinal(score.home, score.away);
            return (
              <li
                key={`${score.home}-${score.away}`}
                className={`flex flex-col items-center gap-1 border-2 bg-bg-row px-2 py-3.5 text-center ${hit ? "border-rise" : "border-transparent"}`}
              >
                <span className="text-balance font-cond text-xs font-bold uppercase tracking-wider text-fg-muted">
                  <Ordinal rank={index + 1} /> score favori
                </span>
                <span className="font-display text-3xl leading-none tracking-wide text-fg sm:text-4xl">
                  {score.home} – {score.away}
                </span>
                <span className="figures text-base font-bold text-fg">{formatPct(score.probability, 1)}</span>
                {hit ? (
                  <span className="inline-flex items-center gap-1 font-cond text-xs font-bold uppercase tracking-wider text-rise">
                    <Icon name="check" className="h-3 w-3" /> Score final
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
        {final ? (
          <p className="flex items-start gap-2 text-sm text-fg">
            <CheckBadge className="mt-px" />
            <span>
              Score final à 90 min : {match.homeTeam} {final.home} – {final.away} {match.awayTeam}
              {finalRank === 1 ? (
                ", le score le plus probable pour le modèle"
              ) : finalRank > 1 ? (
                <>
                  , <Ordinal rank={finalRank} /> score le plus probable pour le modèle
                </>
              ) : (
                ", hors de la grille du modèle"
              )}
              {finalRank > 0 ? ` (${scorePct(ranked[finalRank - 1].probability)}${finalInMatrix ? "" : ", hors matrice"})` : ""}.
            </span>
          </p>
        ) : null}
      </section>
    </div>
  );
}
