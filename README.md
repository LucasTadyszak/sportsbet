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

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) — front + API routes dans un seul déployable
- **Tailwind CSS v4** pour le style
- **Prisma 7** (avec `@prisma/adapter-pg`) comme ORM
- **PostgreSQL** comme base de données
- **The Odds API** comme source de cotes
- **football-data.org** comme source de statistiques (classements, forme, buts)

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
src/lib/footballDataApi.ts  # client football-data.org (standings, matches) + espacement 10 req/min
src/lib/footballDataStats.ts # throttle -> fetch classement -> upsert TeamStats
src/lib/footballDataMatches.ts # tous les matchs des compétitions suivies -> Fixture (score à 90 min)
src/lib/leagueMapping.ts    # sport_key (Odds API) -> code compétition (football-data.org)
src/lib/teamNameMatch.ts    # rapproche les noms d'équipe entre les deux APIs
src/lib/ratings.ts          # rejoue l'Elo (réglé par ligue) + ajuste le modèle de buts, depuis les Fixture
src/lib/predictions.ts      # Poisson sur le classement (repli quand le modèle de buts manque de données)
src/lib/refreshStats.ts     # classements + résultats -> notes -> MatchPrediction (modèle brut)
scripts/refresh-stats.ts    # point d'entrée CLI pour un cron (Render Cron Job)
src/app/api/refresh-stats/  # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh

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

# Verdicts, journal, gradation, calibration
src/lib/bookmakers.ts       # rôle de chaque book : sharp (Pinnacle), exchange, grand public ; jouables
src/lib/oddsHistory.ts      # historique des cotes (points de changement seulement, en SQL)
src/lib/refreshEdges.ts     # verdict de chaque issue + publication des picks (snapshot figé)
src/lib/grading.ts          # score à 90 min, ligne de clôture, CLV, règlement des picks
src/lib/reflect.ts          # calibration nocturne (décalages + échelle) -> CalibrationBucket
src/lib/nightly.ts          # résultats récents -> gradation -> calibration -> verdicts
scripts/nightly.ts, src/app/api/nightly/  # CLI + endpoint du job nocturne
scripts/refresh-edges.ts    # recalcule les verdicts sans appel API (après un changement de paramètre)

# UI
src/lib/dates.ts            # jours/formatage ancrés sur Europe/Paris
src/lib/probability.ts      # de-vig d'une cote -> probabilité implicite, consensus multi-bookmaker
src/lib/board.ts            # requêtes Prisma -> BoardEvent/MatchDetail (liste + détail d'un match)
src/lib/journal.ts, src/lib/modelHealth.ts, src/lib/labels.ts  # lectures + libellés FR
src/app/page.tsx            # liste des matchs groupée par compétition, avec les verdicts
src/app/match/[id]/         # détail : cotes, Analyse (verdict, 5 signaux, modèle pièce par pièce), probabilités
src/app/picks/              # picks à venir (paliers misés)
src/app/passes/             # centre des passes : chaque marché non misé et pourquoi
src/app/historique/         # track record : chaque pick gradé, CLV, ROI
src/app/modele/             # santé du modèle : calibration, Brier vs marché, fiabilité, couverture
src/app/methodologie/       # la méthodologie, avec les valeurs de config.ts
```

Board inspiré de [ZoneStat](https://www.zonestat.fr/football) : liste des matchs
groupée par compétition (repliable), navigation par jour, filtres Tout /
À venir / En cours, recherche par équipe, et une page détail par match
(`/match/[id]`) avec un onglet **Résumé** (comparatif de cotes par
bookmaker, marchés 1X2 et totaux, la cote que le modèle prendrait surlignée), un
onglet **Analyse** (verdict de chaque marché, raisons, les cinq signaux, écart de
chaque bookmaker au consensus, et le modèle pièce par pièce) et un onglet
**Probabilités** qui affiche deux lectures côte à côte : les probabilités
*implicites* (retirer la marge de chaque bookmaker puis moyenner —
`src/lib/probability.ts`) et le *modèle brut* (voir plus bas). Les pages
`/picks`, `/passes`, `/historique`, `/modele` et `/methodologie` reprennent les
écrans de Lakeshore Edge (slate, No-Bet Center, Track Record, Model Health,
Methodology).

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

- `ODDS_REGIONS` (défaut `eu`, qui contient Pinnacle et Betfair) : régions The
  Odds API à interroger, séparées par des virgules. Chaque région coûte un crédit
  par marché et par appel — ajouter celle des bookmakers où tu paries si elle n'est
  pas couverte (vérifier la liste des bookmakers par région sur the-odds-api.com).
- `BETTABLE_BOOKMAKERS` : clés The Odds API des bookmakers où tu as un compte
  (ex. `winamax_fr,betclic_fr,unibet_fr`). Seuls leurs prix sont proposés comme
  « meilleure cote » ; par défaut, tous les books sauf Pinnacle et les exchanges.
- `FOOTBALL_DATA_SEASONS_BACK` (défaut 1) : saisons passées à récupérer une fois
  pour ne pas démarrer les notes Elo de zéro.

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
     de toute façon un fetch trop rapproché de gaspiller du quota).
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
