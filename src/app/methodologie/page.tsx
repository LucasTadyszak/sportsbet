import type { ReactNode } from "react";
import Link from "next/link";
import {
  ANCHOR_WEIGHT,
  CALIBRATION,
  EDGE_THRESHOLDS,
  ELO,
  ELO_BLEND_WEIGHT,
  GOALS,
  MODEL_VERSION,
  PINNACLE_CONSENSUS_WEIGHT,
  SIGNALS,
  STAKING,
  sportProfile,
} from "@/lib/methodology/config";
import { TIER_INFO } from "@/lib/labels";
import { Icon } from "@/components/Icon";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";

export const metadata = { title: "Méthodologie — SportsBet" };

const pts = (x: number) => `${+(x * 100).toFixed(2)} pts`;
const pct = (x: number) => `${+(x * 100).toFixed(1)} %`;

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-4">
      <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-fg sm:text-2xl">
        <span className="h-5 w-1 rounded-full bg-accent" aria-hidden />
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[15px] leading-7 text-fg sm:text-base">{children}</div>
    </section>
  );
}

function Params({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-elevated text-sm shadow-card">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <dt className="text-fg-muted">{label}</dt>
          <dd className="font-mono-tabular font-medium text-fg sm:text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const SECTIONS = [
  ["principe", "Le principe"],
  ["modele", "1. Le modèle"],
  ["marche", "2. Le marché"],
  ["signaux", "3. Les cinq signaux du marché"],
  ["verdict", "4. Du modèle au verdict"],
  ["mise", "5. La mise"],
  ["calibration", "6. Le journal et la boucle de calibration"],
  ["cadence", "7. Cadence"],
  ["limites", "Limites connues"],
] as const;

export default function MethodologyPage() {
  const soccer = sportProfile("soccer_epl");
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="method" />
      <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Sommaire" className="rounded-xl border border-border bg-bg-elevated p-3 shadow-card">
            <p className="flex items-center gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
              <Icon name="book-open" className="h-3.5 w-3.5" /> Sommaire
            </p>
            <ol className="flex flex-col">
              {SECTIONS.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex min-h-9 items-center rounded-md px-2 text-sm text-fg-muted transition-colors duration-200 hover:bg-bg-row hover:text-fg"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <div className="flex min-w-0 max-w-3xl flex-col gap-12">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Méthodologie</h1>
          <p className="text-[15px] leading-relaxed text-fg-muted">
            Version du modèle : <span className="rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-sm text-fg">{MODEL_VERSION}</span>.
            Toutes les valeurs de cette page sont lues directement dans la configuration du pipeline : ce qui est écrit ici
            est ce qui tourne.
          </p>
        </div>

        <Block id="principe" title="Le principe">
          <p>
            La méthode reprend celle de{" "}
            <a href="https://www.lakeshore-edge.com/methodology" className="text-accent-strong underline underline-offset-2" rel="noreferrer" target="_blank">
              Lakeshore Edge
            </a>
            , adaptée au football : une notation Elo par ligue enrichie de la forme récente et de facteurs structurels, des
            cotes débarrassées de la marge et comparées entre bookmakers, cinq signaux lus sur le marché lui-même, des
            verdicts par paliers avec des garde-fous contre l&apos;excès de confiance, et une boucle de calibration nocturne
            qui note chaque pick contre la cote de clôture.
          </p>
          <p>
            L&apos;objectif n&apos;est pas d&apos;avoir raison sur un match, c&apos;est de prendre régulièrement un meilleur
            prix que celui auquel le marché finit par se fixer (la <strong>CLV</strong>). C&apos;est la seule mesure qui prédit
            la rentabilité à long terme ; un bilan victoires/défaites sur quelques dizaines de paris ne veut presque rien dire.
          </p>
        </Block>

        <Block id="modele" title="1. Le modèle">
          <p>
            <strong>La colonne vertébrale : Elo.</strong> Une note par équipe, partagée entre toutes les compétitions suivies
            (la Ligue des champions relie les championnats), rejouée de zéro sur tous les résultats stockés à chaque mise à
            jour. Les écarts de buts pèsent plus (multiplicateur de World Football Elo), les notes reviennent un peu vers la
            moyenne à chaque nouvelle saison, et un promu démarre sous la moyenne de son championnat. Le facteur K et
            l&apos;avantage du terrain sont <em>réglés par ligue</em> par recherche sur grille dès qu&apos;une compétition a
            assez d&apos;historique. L&apos;écart Elo est ensuite converti en 1 / N / 2 avec une probabilité de nul maximale
            entre équipes égales, elle aussi réglée par ligue.
          </p>
          <Params
            rows={[
              ["Facteur K / avantage terrain par défaut", `${ELO.kFactor} / ${ELO.homeAdvantage} pts Elo`],
              ["Réglage par ligue à partir de", `${ELO.tuneMinMatches} matchs`],
              ["Retour vers la moyenne entre saisons", pct(ELO.seasonRegression)],
              ["Décote d'un promu", `${ELO.promotedDiscount} pts Elo`],
              ["Nul entre équipes égales (défaut)", pct(ELO.drawBase)],
            ]}
          />
          <p>
            <strong>La forme (10 derniers matchs).</strong> Moyenne de la sur- ou sous-performance face à l&apos;attente Elo,
            convertie en points Elo et pondérée par la part de saison que représentent 10 matchs (10 sur 38 journées) — comme
            Lakeshore pondère plus la forme en NFL qu&apos;en MLB.
          </p>
          <Params
            rows={[
              ["Poids de la forme", pct(ELO.formBlend)],
              ["Ajustement maximal", `±${(ELO.formEloCap * ELO.formBlend).toFixed(0)} pts Elo`],
              ["Repos : si une équipe a ≤ " + ELO.restShortDays + " jours", `${ELO.restEloPerDay} pts Elo par jour d'écart, max ±${ELO.restEloCap}`],
            ]}
          />
          <p>
            <strong>Le modèle de buts (Dixon-Coles).</strong> Attaque et défense de chaque équipe ajustées sur les résultats
            avec une pondération temporelle, une correction des petits scores (0-0, 1-0, 0-1, 1-1) et quelques matchs fictifs
            « moyens » pour ne pas prendre cinq matchs de début de saison pour argent comptant. C&apos;est la seule partie du
            modèle qui sait pricer les totaux de buts. Sans assez de résultats, repli sur le Poisson du classement.
          </p>
          <Params
            rows={[
              ["Demi-vie des matchs passés", `${Math.round(Math.log(2) / GOALS.decayPerDay)} jours`],
              ["Matchs fictifs de départ", String(GOALS.priorGames)],
              ["Minimum pour ajuster une compétition", `${GOALS.minMatches} matchs`],
              ["Mélange 1X2", `${Math.round(ELO_BLEND_WEIGHT * 100)} % Elo / ${Math.round((1 - ELO_BLEND_WEIGHT) * 100)} % buts`],
            ]}
          />
          <p>
            <strong>Qualité des données.</strong> « Complètes » si les deux équipes ont au moins {ELO.fullMatches} matchs notés
            et un modèle de buts ajusté ; « insuffisantes » sous {ELO.thinMatches} matchs — le verdict est alors plafonné à
            MARGINAL.
          </p>
        </Block>

        <Block id="marche" title="2. Le marché">
          <p>
            Chaque cote est convertie en probabilité puis <strong>débarrassée de la marge</strong> par la méthode de Shin,
            qui charge davantage la marge sur les outsiders (biais favori-outsider) au lieu de la répartir uniformément. Le{" "}
            <strong>consensus</strong> est la moyenne de ces probabilités sur tous les bookmakers, Pinnacle (le book
            « sharp », à faible marge et clientèle professionnelle) compté {PINNACLE_CONSENSUS_WEIGHT} fois.
          </p>
          <p>
            Lakeshore mélange les marchés de prédiction à ~5 % comme ancre d&apos;argent réel. Pour le football,
            l&apos;équivalent disponible dans nos données, ce sont les <strong>exchanges</strong> (Betfair, Matchbook,
            Smarkets) : leur prix est mélangé au modèle à {pct(ANCHOR_WEIGHT)}.
          </p>
          <p>
            Pinnacle et les exchanges ne sont pas accessibles depuis la France : ils servent de référence et ne sont jamais
            proposés comme « meilleure cote ». Les bookmakers jouables se règlent avec la variable
            <code className="mx-1 rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-xs">BETTABLE_BOOKMAKERS</code>.
          </p>
        </Block>

        <Block id="signaux" title="3. Les cinq signaux du marché">
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              <strong>Mouvement de ligne</strong> — écart entre le consensus à l&apos;ouverture et maintenant, pondéré de façon
              quadratique (les petits mouvements ne comptent presque pas) et plafonné : il ajuste la probabilité du modèle d&apos;au
              plus ±{pts(SIGNALS.lineMoveCap)} ; le plafond est atteint pour un mouvement de {pts(SIGNALS.lineMoveFullAt)}.
            </li>
            <li>
              <strong>Steam</strong> — au moins {SIGNALS.steamMinBooks} bookmakers qui bougent de ≥ {pts(SIGNALS.steamMinMove)} dans
              le même sens en moins de {SIGNALS.steamWindowMinutes} minutes (horodaté par la mise à jour propre à chaque book),
              sur les {SIGNALS.steamLookbackHours} dernières heures.
            </li>
            <li>
              <strong>Reverse line movement</strong> — Pinnacle et les books grand public qui bougent en sens opposé (chacun
              d&apos;au moins {pts(SIGNALS.rlmMinMove)}) : le public pousse d&apos;un côté, les sharps sont de l&apos;autre.
            </li>
            <li>
              <strong>Consensus multi-books</strong> — un bookmaker à ≥ {pts(SIGNALS.staleThreshold)} du consensus des autres est
              « en retard » (sa cote est trop longue : +EV) ou « raboté ».
            </li>
            <li>
              <strong>Divergence sharp et CLV prévue</strong> — l&apos;écart entre Pinnacle et les books grand public (≥{" "}
              {pts(SIGNALS.sharpDivergence)} = les sharps sont d&apos;accord ou non), et une prévision de la clôture : les books
              grand public rattrapent {pct(SIGNALS.clvConvergence)} de leur écart avec Pinnacle, plus la tendance récente
              amortie ({SIGNALS.clvTrendHorizonHours} h max, plafonnée à {pts(SIGNALS.clvTrendCap)}).
            </li>
          </ol>
        </Block>

        <Block id="verdict" title="4. Du modèle au verdict">
          <p>
            Ordre des opérations : modèle brut → ancre exchange → mouvement de ligne → <em>échelle</em> de calibration (quelle
            part du désaccord avec le marché garder) → <em>décalage</em> de calibration → clamp dur. L&apos;
            <strong>edge</strong> est la probabilité finale moins le consensus sans marge.
          </p>
          <Params
            rows={[
              ["STRONG BET", `edge ≥ ${pts(EDGE_THRESHOLDS.strong)}`],
              ["GOOD BET", `${pts(EDGE_THRESHOLDS.good)} à ${pts(EDGE_THRESHOLDS.strong)}`],
              ["MARGINAL (jamais misé)", `${pts(EDGE_THRESHOLDS.marginal)} à ${pts(EDGE_THRESHOLDS.good)}`],
              ["PASS", `< ${pts(EDGE_THRESHOLDS.marginal)}`],
            ]}
          />
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <strong>HERO</strong> : {TIER_INFO.HERO.description} <strong>BOSS PICK</strong> : {TIER_INFO.BOSS_PICK.description}
            </li>
            <li>
              Rétrogradé en MARGINAL si : pas de cote jouable, EV &lt; +{pct(STAKING.minEv)} au meilleur prix (la marge mange
              l&apos;edge), steam ou reverse line movement contre, Pinnacle plus bas que les books grand public, ligne prévue en
              baisse d&apos;au moins {pts(SIGNALS.predictedMoveAgainst)}, ou données insuffisantes.
            </li>
            <li>Toute cote au-delà de {STAKING.maxPrice.toFixed(2)} est un longshot : PASS.</li>
            <li>
              Clamp dur à {pct(soccer.probClamp)} sur toute probabilité (football), et au-delà de {pct(soccer.demoteCeiling)} le
              verdict descend d&apos;un cran (HERO → STRONG BET, STRONG BET → GOOD BET, GOOD BET → MARGINAL) : c&apos;est sur les
              gros favoris que les modèles se trompent le plus.
            </li>
            <li>
              Pour l&apos;affichage, les six paliers deviennent trois étiquettes : <strong>Top pick</strong> (HERO, STRONG BET),{" "}
              <strong>Petite mise</strong> (BOSS PICK, GOOD BET) et <strong>Pas de pari</strong> (MARGINAL, PASS).
            </li>
          </ul>
        </Block>

        <Block id="mise" title="5. La mise">
          <p>
            Critère de Kelly fractionné ({STAKING.kellyFraction * 100} %) calculé sur la probabilité finale et la meilleure cote,
            en unités (1 u = 1 % de la bankroll), arrondi au quart d&apos;unité et plafonné par palier :
          </p>
          <Params rows={Object.entries(STAKING.tierCapUnits).map(([tier, cap]) => [TIER_INFO[tier]?.name ?? tier, `${cap} u max`])} />
          <p>
            <strong>Ta sélection.</strong> Indique ta bankroll (elle reste dans ton navigateur) et clique sur les cotes qui
            t&apos;intéressent — sur le tableau, la fiche d&apos;un match ou les picks : « Ma sélection » affiche pour chacune le
            pourcentage de ta bankroll à miser, et son montant. C&apos;est le même calcul que pour les picks, mais à la cote que tu
            as choisie : le verdict du modèle sur cette issue doit être misé (HERO à GOOD BET), la cote ne pas dépasser{" "}
            {STAKING.maxPrice.toFixed(2)} et l&apos;EV à cette cote atteindre +{pct(STAKING.minEv)} ; sinon, 0 %, avec la raison
            (et la cote minimale quand seule la marge bloque). Une cote que le modèle ne chiffre pas (compétition non couverte,
            ligne de totaux secondaire) n&apos;a pas de mise conseillée.
          </p>
          <p>
            En <strong>combiné</strong>, les cotes et les probabilités du modèle se multiplient (matchs supposés indépendants) et
            la mise est le même Kelly fractionné sur la probabilité jointe, plafonné par la sélection au palier le plus bas.
            Chaque sélection doit valoir une mise à elle seule, et deux sélections du même match ne se combinent pas.
          </p>
        </Block>

        <Block id="calibration" title="6. Le journal et la boucle de calibration">
          <p>
            Un marché qui passe tous les filtres dans les {STAKING.publishWindowHours} h avant le coup d&apos;envoi est{" "}
            <strong>journalisé</strong> : la cote, le bookmaker et chaque donnée qui a mené au verdict sont figés et ne changent
            plus. Chaque nuit, le job de gradation récupère le score à 90 minutes, calcule la cote de clôture (Pinnacle
            s&apos;il cotait, sinon le consensus) et la CLV de chaque pick, puis la calibration est recalculée :
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <strong>Décalage par championnat</strong> : taux de réussite − probabilité annoncée, sur les{" "}
              {CALIBRATION.journalWindow} derniers picks, réduit d&apos;un facteur n / (n + {CALIBRATION.shrinkK}) puis plafonné à{" "}
              {pts(CALIBRATION.sportOffsetCap(0))} sous 50 picks et {pts(CALIBRATION.sportOffsetCap(50))} au-delà.
            </li>
            <li>
              <strong>Résidu par championnat × marché</strong> : ce que le décalage du championnat ne corrige pas, plafonné selon
              l&apos;échantillon ({pts(CALIBRATION.sportMarketOffsetCap(0))} sous 30 picks, {pts(CALIBRATION.sportMarketOffsetCap(30))}{" "}
              sous 100, {pts(CALIBRATION.sportMarketOffsetCap(100))} sous 300, {pts(CALIBRATION.sportMarketOffsetCap(300))} au-delà).
              Aucun décalage sous {CALIBRATION.minSample} picks.
            </li>
            <li>
              <strong>Échelle</strong> : sur tous les matchs gradés, la part du désaccord modèle − marché de clôture qui
              s&apos;est révélée réelle (régression ridge vers {CALIBRATION.edgeScalePrior}) — si le modèle voit juste mais annonce
              des edges trop grands, la boucle resserre l&apos;annonce sans jeter le pick.
            </li>
          </ul>
          <p>
            Tout est visible sur{" "}
            <Link href="/modele" className="text-accent-strong underline underline-offset-2">
              la santé du modèle
            </Link>{" "}
            et{" "}
            <Link href="/historique" className="text-accent-strong underline underline-offset-2">
              l&apos;historique
            </Link>
            .
          </p>
        </Block>

        <Block id="cadence" title="7. Cadence">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <code className="font-mono-tabular text-xs">npm run refresh:odds</code> : cotes (limité par le quota The Odds API),
              puis recalcul de tous les verdicts et publication des picks.
            </li>
            <li>
              <code className="font-mono-tabular text-xs">npm run refresh:stats</code> : classements et résultats
              football-data.org, notes Elo et modèle de buts rejoués, probabilités recalculées, puis verdicts.
            </li>
            <li>
              <code className="font-mono-tabular text-xs">npm run nightly</code> : résultats récents, gradation, calibration,
              verdicts.
            </li>
          </ul>
        </Block>

        <Block id="limites" title="Limites connues">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              Pas encore de données de compositions, de blessures, d&apos;xG ni de météo : les « facteurs structurels » du
              football se limitent au modèle de buts, à la forme et au repos.
            </li>
            <li>
              Le steam et le mouvement de ligne ne voient que les synchros de cotes : avec une synchro toutes les 30 minutes,
              l&apos;ouverture réelle et les mouvements intermédiaires peuvent échapper au modèle.
            </li>
            <li>
              Les équipes qui ne jouent qu&apos;en Ligue des champions (championnat non suivi) ont peu de matchs notés : leurs
              verdicts restent le plus souvent en MARGINAL.
            </li>
            <li>
              Tant que peu de picks sont gradés, la calibration reste proche de ses valeurs de départ : il faut plusieurs
              centaines de picks avant que la CLV et les écarts de calibration disent quelque chose de solide.
            </li>
          </ul>
        </Block>
        </div>
      </main>
      <PageFooter />
    </div>
  );
}
