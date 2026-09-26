# SportsBet — Live Odds Board

MVP : site Next.js qui affiche les cotes bookmaker en direct (récupérées via
[The Odds API](https://the-odds-api.com/)), stockées dans une base Postgres,
et les enrichit avec les statistiques de classement de
[football-data.org](https://www.football-data.org/) pour estimer une
probabilité de résultat (modèle de Poisson) et repérer les cotes qui
paient plus que cette probabilité ne le justifie ("value bets") — l'ancien
prototype Python/Streamlit a été retiré du repo.

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

# Statistiques + probabilités (football-data.org)
src/lib/footballDataApi.ts  # client football-data.org (standings)
src/lib/leagueMapping.ts    # sport_key (Odds API) -> code compétition (football-data.org)
src/lib/teamNameMatch.ts    # rapproche les noms d'équipe entre les deux APIs
src/lib/predictions.ts      # modèle de Poisson : TeamStats -> probabilités 1N2
src/lib/footballDataStats.ts # throttle -> fetch classement -> upsert TeamStats
src/lib/refreshStats.ts     # orchestration : refreshTeamStats() puis recalcule les MatchPrediction
scripts/refresh-stats.ts    # point d'entrée CLI pour un cron (Render Cron Job)
src/app/api/refresh-stats/  # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh

src/app/page.tsx            # tableau des cotes + probabilités modèle (server component)
```

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

### Statistiques et probabilités

`refreshStats()` récupère le classement de chaque compétition suivie
(`GET /competitions/{code}/standings`, table `TOTAL`) et le stocke dans
`TeamStats` (matchs joués, buts pour/contre, forme, position). À partir de
ces stats, `computeMatchProbabilities` (dans `src/lib/predictions.ts`) calcule
une probabilité 1N2 pour chaque match à venir avec un modèle de Poisson
simplifié : force offensive/défensive de chaque équipe relative à la moyenne
de buts de la compétition, avantage du terrain fixe (×1.35), puis somme de la
grille de scores Poisson indépendants. Le résultat (`MatchPrediction`) est
affiché sous chaque cote sur le tableau, et une cote est surlignée comme
*value bet* quand `cote × probabilité modèle ≥ 1.05`.

C'est un modèle simple et volontairement transparent (pas de corrélation
de score à la Dixon-Coles, pas de séparation domicile/extérieur dans les
stats sources) : à prendre comme indicateur, pas comme conseil de pari.

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
npm run refresh:odds    # cotes (The Odds API)
npm run refresh:stats   # classements + probabilités (football-data.org)
```

ou en HTTP (utile pour tester les endpoints que le cron appellera) :

```bash
curl "http://localhost:3000/api/refresh-odds?secret=$CRON_SECRET"
curl "http://localhost:3000/api/refresh-stats?secret=$CRON_SECRET"
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
     journée ; aligner avec `FOOTBALL_DATA_REFRESH_INTERVAL_MINUTES`).

## Roadmap (phase 2, pas dans ce MVP)

- Séparer les classements domicile/extérieur (`standings[].type` `HOME`/`AWAY`
  sur football-data.org) pour un modèle de Poisson plus précis que
  l'avantage du terrain fixe actuel.
- Kelly criterion / dimensionnement de mise sur les value bets détectés.
- Historique/graphique de mouvement de cotes par match (la table `Odds`
  est déjà pensée pour ça).
- Alerting (Slack/Telegram) sur value bet au-dessus d'un seuil.
- Correction manuelle des faux négatifs de `teamNameMatch` : permettre de
  fixer à la main `Team.footballDataTeamId` pour une équipe que les
  heuristiques ne rapprochent jamais correctement (nouveau championnat,
  nom trop différent), plutôt que d'attendre qu'un futur alias la corrige.
