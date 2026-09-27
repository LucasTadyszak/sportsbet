# SportsBet — Live Odds Board

Site Next.js qui affiche les cotes bookmaker en direct (récupérées via
[The Odds API](https://the-odds-api.com/)), stockées dans une base Postgres,
et les confronte à un modèle maison (Elo + modèle de buts Dixon-Coles, nourri par
les résultats et classements de [football-data.org](https://www.football-data.org/))
selon la méthodologie de [Lakeshore Edge](https://www.lakeshore-edge.com/methodology)
adaptée au football : cotes sans marge et consensus multi-bookmakers, cinq signaux
de marché, verdicts par paliers, mise Kelly fractionnée, journal de picks figés,
gradation nocturne contre la cote de clôture (CLV) et boucle de calibration.
Le détail, avec les valeurs exactes des paramètres, est sur la page `/methodologie`
du site et dans `src/lib/methodology/config.ts`.

Seuls les bookmakers français (agréés ANJ) sont affichés et proposés comme meilleure
cote ; Pinnacle, les exchanges et les autres books européens ne servent qu'au
consensus. Une flamme signale une **erreur de cote** : une cote française au moins 5 %
au-dessus de la cote juste que donnent tous les autres bookmakers. Chaque club et
chaque compétition sont affichés avec leur logo, fourni par
[TheSportsDB](https://www.thesportsdb.com/) (API gratuite, sans inscription), avec
football-data.org en secours pour les clubs.

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) — front + API routes dans un seul déployable
- **Tailwind CSS v4** pour le style
- **Prisma 7** (avec `@prisma/adapter-pg`) comme ORM
- **PostgreSQL** comme base de données
- **The Odds API** comme source de cotes
- **football-data.org** comme source de statistiques (classements, forme, buts)
- **TheSportsDB** comme source des logos des clubs et des compétitions (clé publique gratuite)

> Next build/dev tournent avec `--webpack` : la version de Turbopack livrée
> avec Next 16.3.6 casse le chargement de `next/font/google` dans cet
> environnement. À retirer si un futur upgrade de Next corrige le problème.

## Architecture

```
prisma/schema.prisma        # Sport, Event, Team, Bookmaker, Odds, ApiUsageLog, FetchLog,
                             # TeamStats, MatchPrediction
src/lib/prisma.ts           # client Prisma (singleton, driver adapter pg)

# Cotes (The Odds API)
src/lib/oddsApi.ts          # client The Odds API (+ log de quota via les headers x-requests-*)
src/lib/refreshOdds.ts      # orchestration : throttle -> fetch -> upsert Event/Team -> capture un snapshot complet des odds
scripts/refresh-odds.ts     # point d'entrée CLI pour un cron (Render Cron Job)
src/app/api/refresh-odds/   # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh

# Statistiques + modèle (football-data.org)
src/lib/footballDataApi.ts  # client football-data.org (standings, teams, matches) + espacement 10 req/min
src/lib/footballDataStats.ts # throttle -> fetch classement (logo de chaque club) + couleurs des clubs -> upsert TeamStats
src/lib/footballDataMatches.ts # tous les matchs des compétitions suivies -> Fixture (score à 90 min)
src/lib/leagueMapping.ts    # sport_key (Odds API) -> code compétition (football-data.org) et id de ligue (TheSportsDB)
src/lib/teamNames.ts        # normalisation des noms d'équipe (accents, suffixes « FC », alias), commune aux rapprochements
src/lib/teamNameMatch.ts    # rapproche les noms d'équipe entre The Odds API et football-data.org
src/lib/crests.ts           # nom d'équipe The Odds API -> logo du club (Team.logo, sinon TeamStats.crest) et ses couleurs (TeamStats.clubColors)
src/lib/teamColors.ts       # couleurs d'un club ("Red / White") -> couleurs hex des blocs de match
src/lib/ratings.ts          # rejoue l'Elo (réglé par ligue) + ajuste le modèle de buts, depuis les Fixture
src/lib/predictions.ts      # Poisson sur le classement (repli quand le modèle de buts manque de données)
src/lib/refreshStats.ts     # classements + résultats -> notes -> MatchPrediction (modèle brut)
scripts/refresh-stats.ts    # point d'entrée CLI pour un cron (Render Cron Job)
src/app/api/refresh-stats/  # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh

# Logos (TheSportsDB)
src/lib/theSportsDbApi.ts   # client TheSportsDB v1 (clé gratuite « 123 » par défaut) + espacement 30 req/min
src/lib/logoMatch.ts        # quelle équipe TheSportsDB est la nôtre (sport, nom exact ou alternatif) + URLs de logo servables
src/lib/refreshLogos.ts     # logo de chaque compétition (Sport.logo) et de chaque club des matchs récents/à venir (Team.logo)
scripts/refresh-logos.ts    # point d'entrée CLI : tous les logos dus d'un coup (npm run refresh:logos)

# Méthodologie (fonctions pures, testées : npm test)
src/lib/methodology/config.ts      # TOUS les paramètres (seuils, plafonds, poids), commentés [LE]/[adapt]
src/lib/methodology/devig.ts       # de-vig Shin / puissance / proportionnel, consensus pondéré
src/lib/methodology/elo.ts         # Elo (K, avantage terrain, nul réglés par ligue), forme last-10, repos
src/lib/methodology/goals.ts       # Dixon-Coles pondéré dans le temps, grille de scores, totaux
src/lib/methodology/model.ts       # mélange Elo + buts, qualité des données
src/lib/methodology/signals.ts     # les 5 signaux de marché (mouvement, steam, RLM, consensus, sharp/CLV)
src/lib/methodology/verdict.ts     # edge, paliers, garde-fous, Kelly
src/lib/methodology/calibration.ts # décalages (plafonnés selon l'échantillon) + échelle de calibration
src/lib/methodology/settlement.ts  # règlement 1X2/totaux (lignes .5, entières, quarts), CLV
src/lib/methodology/metrics.ts     # Brier, RPS, log-loss, diagrammes de fiabilité
src/lib/methodology/oddsErrors.ts  # erreurs de cote : cote française vs consensus sans marge des autres books
src/lib/methodology/stake.ts       # mise d'une sélection de l'utilisateur (à sa cote) et d'un combiné

# Verdicts, journal, gradation, calibration
src/lib/bookmakers.ts       # rôle de chaque book : sharp (Pinnacle), exchange, grand public ; français (seuls affichés/jouables)
src/lib/oddsHistory.ts      # historique des cotes (points de changement seulement, en SQL)
src/lib/refreshEdges.ts     # verdict de chaque issue + publication des picks (snapshot figé)
src/lib/grading.ts          # score à 90 min, ligne de clôture, CLV, règlement des picks
src/lib/reflect.ts          # calibration nocturne (décalages + échelle) -> CalibrationBucket
src/lib/nightly.ts          # résultats récents -> gradation -> calibration -> verdicts
scripts/nightly.ts, src/app/api/nightly/  # CLI + endpoint du job nocturne
scripts/refresh-edges.ts    # recalcule les verdicts sans appel API (après un changement de paramètre)

# UI
src/lib/dates.ts            # jours/formatage ancrés sur Europe/Paris
src/lib/board.ts            # requêtes Prisma -> BoardEvent/MatchDetail (cotes françaises, probabilités du marché, erreurs de cote, logos)
src/lib/journal.ts, src/lib/modelHealth.ts, src/lib/labels.ts  # lectures + libellés FR
src/lib/competitions.ts     # identité de chaque compétition : nom FR, drapeau, dégradé et motif de son bandeau
src/components/TeamCrest.tsx # logo d'un club à côté de son nom (bouclier neutre s'il n'y en a pas), logo d'une compétition
src/components/Competition.tsx # logo de la compétition (sinon icône sport + drapeau rond), bandeau et motif d'une compétition
src/components/MatchCard.tsx # bloc de match : bandeau de la compétition, cadre aux couleurs des clubs, tuiles 1/N/2
src/lib/selection.ts        # « Ma sélection » : une cote cliquée + le verdict du modèle sur son issue
src/lib/betSlip.ts          # état de la sélection et de la bankroll, dans le localStorage du navigateur
src/components/OddsButton.tsx # une cote cliquable (tuiles 1/N/2, tableau de cotes, picks), flamme d'erreur de cote comprise
src/components/BetSlip.tsx  # champ bankroll, encart d'invitation, bouton flottant + panneau « Ma sélection »
src/app/page.tsx            # blocs de matchs groupés par compétition, barre latérale des compétitions, jours, filtres
src/app/match/[id]/         # détail : cotes, Analyse (verdict, 5 signaux, modèle pièce par pièce), probabilités, matrice des scores
src/app/picks/              # picks à venir (paliers misés)
src/app/passes/             # centre des passes : chaque marché non misé et pourquoi
src/app/historique/         # track record : chaque pick gradé, CLV, ROI
src/app/modele/             # santé du modèle : calibration, Brier vs marché, fiabilité, couverture
src/app/methodologie/       # la méthodologie, avec les valeurs de config.ts
```

Board inspiré de Winamax et Betclic, en thème clair : chaque match est un **bloc**
habillé aux couleurs de sa compétition (bandeau en dégradé avec son motif —
chevrons, étoiles ou bandes — et son logo, sinon son drapeau) et de ses deux clubs
(cadre rayé aux couleurs du maillot de chaque équipe, logo cerclé de ces mêmes
couleurs), avec les cotes principales 1 / N / 2 en grandes tuiles cliquables et, sous
chacune, la probabilité du marché marge retirée. Les couleurs des clubs viennent de
football-data.org (`clubColors`, un appel par compétition au rythme du classement) ;
un club sans couleurs connues prend celles de sa compétition. Les blocs sont
groupés par compétition (repliable, les plus grandes d'abord), avec une barre
latérale des compétitions (des puces sur mobile) qui filtre le tableau
(`?comp=<sport_key>`), une navigation par jour, les filtres Tout / À venir /
En cours, une recherche par équipe, et une page détail par
match (`/match/[id]`) avec un onglet **Résumé** (comparatif de cotes des
bookmakers français, marchés 1X2 et totaux, la cote que le modèle prendrait
surlignée, une flamme sur chaque erreur de cote), un onglet **Analyse** (verdict
de chaque marché, raisons, les cinq signaux, écart de chaque bookmaker français au
consensus, et le modèle pièce par pièce), un onglet **Probabilités** qui affiche
deux lectures côte à côte : les probabilités *implicites* (retirer la marge de
chaque bookmaker par la méthode de Shin puis moyenner sur tous les books suivis,
Pinnacle compté double — la référence des erreurs de cote) et le *modèle brut*
(voir plus bas), et un onglet **Matrice** : la probabilité de chaque score exact
de 0-0 à 5-5, les trois scores favoris du modèle et, une fois le match terminé, le
score à 90 minutes coché dans la grille. La matrice est recalculée à l'affichage à
partir des buts attendus et du ρ Dixon-Coles déjà stockés dans `MatchPrediction` :
rien de plus en base. Les pages
`/picks`, `/passes`, `/historique`, `/modele` et `/methodologie` reprennent les
écrans de Lakeshore Edge (slate, No-Bet Center, Track Record, Model Health,
Methodology).

### Ma sélection : combien miser

Le tableau et les picks invitent l'utilisateur à indiquer sa **bankroll**, puis à
cliquer sur les cotes qui l'intéressent : une case 1/X/2 du tableau (meilleure cote
chez un bookmaker jouable, voir `BETTABLE_BOOKMAKERS`), n'importe quelle cellule du
tableau de cotes d'un match, ou la cote d'un pick. Le panneau « Ma sélection »
affiche pour chaque cote le **pourcentage de la bankroll à miser** et son montant en
euros, avec les règles de mise des picks appliquées à la cote choisie
(`src/lib/methodology/stake.ts`) : ¼ Kelly sur la probabilité finale du modèle,
plafonné selon le palier, et 0 % — avec la raison — quand le modèle passe l'issue,
quand la cote dépasse 5.00 ou quand la marge du bookmaker mange l'edge à ce prix
(la cote minimale est alors indiquée). En **combiné**, cotes et probabilités se
multiplient et la mise est plafonnée par la sélection au palier le plus bas ; chaque
sélection doit valoir une mise seule, une seule par match. La bankroll et la
sélection restent dans le `localStorage` du navigateur : rien n'est envoyé au serveur.

Tout ce qu'un sync ramène est conservé en base, y compris ce qui ne change
pas d'un appel à l'autre :
- **`Event`** : upserté à chaque sync (nom des équipes, horaire) — donc
  toujours à jour même si l'API ne renvoie rien de nouveau par ailleurs.
- **`Team`** : chaque nom d'équipe vu côté The Odds API est enregistré une
  fois pour toutes (`firstSeenAt`/`lastSeenAt`), plutôt que de n'exister que
  comme texte dupliqué sur chaque `Event`. Sert aussi de cache pour le
  rapprochement avec football-data.org (voir plus bas).
- **`Odds`** : une ligne est écrite à **chaque** sync pour chaque
  bookmaker/marché/issue, que le prix ait bougé ou non — la table est un
  historique complet de toutes les observations, pas seulement des
  changements.

Un seul garde-fou pour ne pas cramer le quota gratuit des deux API :
- **`FetchLog`** : chaque sport n'est re-fetché que toutes les
  `ODDS_REFRESH_INTERVAL_MINUTES` (30 min par défaut) côté cotes, et chaque
  compétition que toutes les `FOOTBALL_DATA_REFRESH_INTERVAL_MINUTES` (6h par
  défaut — un classement bouge beaucoup moins vite qu'une cote) côté stats.
  Ce throttle limite le nombre d'*appels API*, pas ce qui est enregistré une
  fois l'appel fait : à chaque fetch réellement exécuté, tout son contenu est
  persisté (voir ci-dessus).
- **`ApiUsageLog`** : log les headers de quota à chaque appel (`x-requests-used`
  / `x-requests-remaining` / `x-requests-last` pour The Odds API,
  `x-requests-available-minute` pour football-data.org), pour surveiller la
  conso des deux plans.

### Statistiques, modèle et verdicts

`refreshStats()` récupère le classement de chaque compétition suivie
(`TeamStats`) et tous ses matchs (`Fixture`, score à 90 minutes ; la saison
précédente est récupérée une fois si le plan le permet —
`FOOTBALL_DATA_SEASONS_BACK`, 1 par défaut). `recomputeRatings()` rejoue alors,
sans appel API, une note **Elo** par équipe sur tous les résultats stockés (K,
avantage du terrain et modèle de nul réglés par ligue dès 300 matchs) et ajuste un
**modèle de buts Dixon-Coles** par compétition. Le modèle brut d'un match
(`MatchPrediction`) mélange les deux (50/50 sur le 1X2 ; les totaux viennent du
modèle de buts), ajusté de la forme sur 10 matchs et du repos.

Après chaque refresh de cotes ou de stats, `refreshEdges()` lit l'historique des
cotes, calcule le consensus sans marge (Shin, Pinnacle compté double) et les cinq
signaux, puis le verdict de chaque issue (HERO / STRONG BET / BOSS PICK / GOOD BET /
MARGINAL / PASS) avec sa mise (¼ Kelly). Les verdicts misés à moins de 48 h du
coup d'envoi sont **journalisés** dans `Pick` avec toutes leurs entrées, et ne
changent plus. Chaque nuit, `npm run nightly` récupère les résultats, grade les
picks (score à 90 min, ligne de clôture Pinnacle ou consensus, CLV), écrit un
`EventGrade` par match (modèle vs marché à la clôture) et recalcule la
calibration (`CalibrationBucket`) utilisée par les verdicts suivants.

Tout reste indicatif : un verdict n'est pas un conseil de pari, et la calibration
ne devient fiable qu'après plusieurs centaines de picks gradés (voir `/modele`).

Comme The Odds API et football-data.org n'utilisent pas les mêmes noms
d'équipe (ex. "Wolves" vs "Wolverhampton Wanderers FC"), `teamNameMatch.ts`
normalise les noms (accents, suffixes "FC"/"AFC"/…) et connaît quelques alias
courants ; un match sans correspondance n'affiche simplement pas de
probabilité plutôt que d'en afficher une fausse. Le nom d'une équipe ne
changeant pas d'une saison à l'autre, `resolveTeamStats` n'a besoin de
réussir cette recherche floue qu'une seule fois par équipe : dès qu'une
correspondance est trouvée, elle est mémorisée sur la ligne `Team`
(`competitionCode` + `footballDataTeamId`), et tous les refresh suivants la
réutilisent directement au lieu de refaire tourner les heuristiques.

### Logos des clubs et des compétitions

Les logos viennent de [TheSportsDB](https://www.thesportsdb.com/documentation), une
base collaborative gratuite qui couvre tous les championnats (pas seulement ceux du
plan gratuit de football-data.org) : sans inscription, la clé publique `123` suffit.
`refreshLogos()` récupère :
- le logo de chaque **compétition** synchronisée (`Sport.logo`), par l'id de ligue
  TheSportsDB de son `sport_key` (`SPORT_KEY_TO_THESPORTSDB_LEAGUE` dans
  `src/lib/leagueMapping.ts` : une compétition absente de la table n'a pas de logo) ;
- le logo de chaque **club** des matchs récents et à venir (`Team.logo`), cherché
  d'abord dans les équipes de ses compétitions, puis par son nom. Seule une équipe du
  même sport dont le nom (ou un de ses noms alternatifs) est identique une fois
  normalisé est retenue : mieux vaut pas de logo qu'un logo faux. L'id TheSportsDB
  trouvé est mémorisé sur la ligne `Team` (`sportsDbTeamId`) ; pour un club que le
  rapprochement ne trouve jamais, il suffit de renseigner cet id à la main (visible
  dans l'URL de sa page sur thesportsdb.com) : son logo sera cherché par cet id.

Un logo trouvé est revérifié tous les 30 jours, un logo introuvable recherché de
nouveau tous les 7 jours. La synchro des cotes s'en charge à chaque passage (20
requêtes TheSportsDB au plus, soit ~45 s, les plus proches matchs d'abord) ;
`npm run refresh:logos` fait tout d'un coup, par exemple juste après le déploiement.
Un club sans logo TheSportsDB garde celui du classement football-data.org
(`TeamStats.crest`, via le rapprochement décrit plus haut), sinon un bouclier neutre. Les
images sont servies par `next/image`, qui n'accepte que les domaines listés dans
`next.config.ts` (`r2.thesportsdb.com`, `www.thesportsdb.com/images`,
`crests.football-data.org`).

## Installation locale

```bash
npm install
cp .env.example .env   # puis renseigner DATABASE_URL, ODDS_API_KEY, FOOTBALL_DATA_API_KEY, CRON_SECRET
npm run db:migrate     # crée les tables (prisma migrate dev)
npm run dev            # http://localhost:3000
```

Après un `git pull` qui touche `prisma/schema.prisma`, arrêter `npm run dev`
puis :

```bash
npm install                 # dépendances + client Prisma régénéré (src/generated/prisma, hors git)
npm run db:migrate:deploy   # applique les nouvelles migrations (ne réinitialise jamais la base)
npm run dev
```

Le client Prisma n'est pas versionné et Prisma 7 ne le régénère plus pendant
`migrate` : sans ces étapes, le serveur tourne avec l'ancien client et plante sur
les nouveaux modèles (« Unknown field … for include statement »). `predev` et les
deux scripts `db:migrate*` le régénèrent désormais d'office.

Variables utiles en plus des clés :

- `ODDS_REGIONS` (défaut `eu,fr` : `eu` contient Pinnacle et Betfair, `fr` les
  bookmakers français) : régions The Odds API à interroger, séparées par des
  virgules. Chaque région coûte un crédit par marché et par appel : `eu,fr` coûte
  donc deux fois plus que `eu` seul (vérifier la liste des bookmakers par région
  sur the-odds-api.com).
- `BETTABLE_BOOKMAKERS` : clés The Odds API des bookmakers où tu as un compte
  (ex. `winamax_fr,betclic_fr,unibet_fr`). Seuls leurs prix sont proposés comme
  « meilleure cote » ; par défaut, tous les bookmakers français (clés en `_fr`).
  L'affichage, lui, montre toujours tous les bookmakers français.
- `FOOTBALL_DATA_SEASONS_BACK` (défaut 1) : saisons passées à récupérer une fois
  pour ne pas démarrer les notes Elo de zéro.
- `THESPORTSDB_API_KEY` (facultatif, défaut `123`, la clé publique gratuite) : une clé
  personnelle TheSportsDB (Patreon) si la clé partagée est trop limitée.

Sports suivis par défaut : `soccer_epl,soccer_uefa_champs_league`. Pour en
suivre d'autres, ajoute `ODDS_SPORT_KEYS="soccer_epl,soccer_fifa_world_cup,basketball_nba"`
(clés valides via `GET https://api.the-odds-api.com/v4/sports?apiKey=...`)
dans `.env`. Les probabilités ne sont calculées que pour les sports mappés
vers une compétition football-data.org dans `src/lib/leagueMapping.ts` (Premier
League, Champions League, Bundesliga, Liga, Serie A, Ligue 1, etc. — le plan
gratuit de football-data.org ne couvre qu'un sous-ensemble de compétitions).

Clé football-data.org gratuite : à récupérer sur
[football-data.org/client/register](https://www.football-data.org/client/register).

### Déclencher un refresh manuellement

```bash
npm run refresh:odds    # cotes (The Odds API), puis verdicts
npm run refresh:stats   # classements + résultats + notes + probabilités (football-data.org), puis verdicts
npm run nightly         # résultats récents, gradation des picks, calibration, verdicts
npm run refresh:edges   # verdicts seuls, sans appel API (après un changement dans config.ts)
npm run refresh:logos   # logos des compétitions et des clubs (TheSportsDB), tous ceux qui sont dus
npm test                # tests unitaires de la méthodologie
```

ou en HTTP (utile pour tester les endpoints que le cron appellera) :

```bash
curl "http://localhost:3000/api/refresh-odds?secret=$CRON_SECRET"
curl "http://localhost:3000/api/refresh-stats?secret=$CRON_SECRET"
curl "http://localhost:3000/api/nightly?secret=$CRON_SECRET"
```

## Déploiement sur Render

1. **Base de données** : créer un service **PostgreSQL** sur Render, copier
   son *Internal Database URL*.
2. **Web Service** (le site) :
   - Build command : `npm install && npm run build`
   - Start command : `npm run start`
   - Variables d'environnement : `DATABASE_URL` (l'URL interne ci-dessus),
     `ODDS_API_KEY`, `FOOTBALL_DATA_API_KEY`, `CRON_SECRET`, `NODE_ENV=production`.
   - `npm run postinstall` (généré Prisma Client) et les migrations doivent
     être appliquées avant le premier démarrage — soit en lançant une fois
     `npm run db:migrate:deploy` depuis le shell Render, soit en l'ajoutant
     au build command : `npm install && npm run db:migrate:deploy && npm run build`.
3. **Cron Jobs** (refresh périodique) : deux services Render de type
   **Cron Job**, même repo :
   - Cotes, commande `npm install && npm run refresh:odds`, variables
     `DATABASE_URL` + `ODDS_API_KEY`. Fréquence recommandée : toutes les
     15–30 min (à aligner avec `ODDS_REFRESH_INTERVAL_MINUTES`, qui empêche
     de toute façon un fetch trop rapproché de gaspiller du quota). Ce job récupère
     aussi, quelques-uns à chaque passage, les logos manquants (TheSportsDB, aucune
     clé à fournir) ; `npm run refresh:logos` depuis le shell Render les récupère
     tous d'un coup après le premier déploiement.
   - Statistiques/probabilités, commande `npm install && npm run refresh:stats`,
     variables `DATABASE_URL` + `FOOTBALL_DATA_API_KEY`. Fréquence recommandée :
     toutes les 3–6h (un classement de championnat ne bouge qu'après chaque
     journée ; aligner avec `FOOTBALL_DATA_REFRESH_INTERVAL_MINUTES`). Le premier
     passage récupère aussi la saison précédente : compter ~7 s par appel (plan
     gratuit à 10 req/min), d'où le cron plutôt que l'endpoint HTTP.
   - Gradation + calibration, commande `npm install && npm run nightly`, mêmes
     variables que les deux autres. Une fois par nuit (ex. 04:00 Europe/Paris,
     après les derniers matchs).

## Roadmap

- Données qui manquent au modèle pour les « facteurs structurels » : compositions
  probables et absents, xG, calendrier complet (coupes nationales) pour le repos,
  météo. Voir la section « Limites connues » de `/methodologie`.
- Synchro des cotes plus fréquente à l'approche du coup d'envoi (steam et
  mouvement de ligne) et vraie cote d'ouverture — demande un plan The Odds API
  payant.
- Ancre marché de prédiction (Polymarket / Kalshi, comme Lakeshore Edge) en plus
  des exchanges.
- Historique/graphique de mouvement de cotes par match (la table `Odds`
  est déjà pensée pour ça).
- Alerting (Slack/Telegram) sur un nouveau pick journalisé.
- Correction manuelle des faux négatifs de `teamNameMatch` : permettre de
  fixer à la main `Team.footballDataTeamId` pour une équipe que les
  heuristiques ne rapprochent jamais correctement (nouveau championnat,
  nom trop différent), plutôt que d'attendre qu'un futur alias la corrige.
- Fonctionnalités façon ZoneStat qui demandent encore plus de données que ce
  que `TeamStats` couvre déjà (classement, forme, buts pour/contre) : top
  buteurs, compositions probables, vote communautaire (nécessiterait aussi
  des comptes utilisateurs).
