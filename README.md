# SportsBet — Live Odds Board

MVP : site Next.js qui affiche les cotes bookmaker en direct (récupérées via
[The Odds API](https://the-odds-api.com/)), stockées dans une base Postgres.
Base posée pour ajouter plus tard un moteur de prédiction / value betting
(l'ancien prototype Python/Streamlit a été retiré du repo).

## Stack

- **Next.js 16** (App Router, TypeScript, React 19) — front + API routes dans un seul déployable
- **Tailwind CSS v4** pour le style
- **Prisma 7** (avec `@prisma/adapter-pg`) comme ORM
- **PostgreSQL** comme base de données
- **The Odds API** comme source de cotes

> Next build/dev tournent avec `--webpack` : la version de Turbopack livrée
> avec Next 16.3.6 casse le chargement de `next/font/google` dans cet
> environnement. À retirer si un futur upgrade de Next corrige le problème.

## Architecture

```
prisma/schema.prisma       # Sport, Event, Bookmaker, Odds, ApiUsageLog, FetchLog
src/lib/prisma.ts          # client Prisma (singleton, driver adapter pg)
src/lib/oddsApi.ts         # client The Odds API (+ log de quota via les headers x-requests-*)
src/lib/refreshOdds.ts     # orchestration : throttle -> fetch -> upsert -> insère seulement si le prix a bougé
scripts/refresh-odds.ts    # point d'entrée CLI pour un cron (Render Cron Job)
src/app/page.tsx           # tableau des cotes en direct (server component)
src/app/api/refresh-odds/  # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh
```

Board inspiré de [ZoneStat](https://www.zonestat.fr/football) : liste des matchs
groupée par compétition (repliable), navigation par jour, filtres Tout /
À venir / En cours, recherche par équipe, et une page détail par match
(`/match/[id]`) avec un onglet **Résumé** (comparatif de cotes par
bookmaker, marchés 1X2 et totaux) et un onglet **Probabilités** (probabilités
implicites 1X2 et plus/moins de X buts, calculées en retirant la marge de
chaque bookmaker puis en moyennant — `src/lib/probability.ts`). Contrairement
à ZoneStat, il n'y a pas de modèle statistique propriétaire (matrice de
score, classement, buteurs, compositions, votes) : ça nécessiterait une
source de données de résultats/statistiques en plus des cotes de The Odds
API — voir la roadmap plus bas.

Deux garde-fous repris de l'ancien prototype pour ne pas cramer le quota
gratuit de The Odds API :
- **`FetchLog`** : chaque sport n'est re-fetché que toutes les
  `ODDS_REFRESH_INTERVAL_MINUTES` (30 min par défaut).
- **`Odds`** : une nouvelle ligne n'est insérée que si le prix a réellement
  changé depuis la dernière capture — ça construit un historique de
  mouvement de cotes gratuitement, sans dupliquer les lignes identiques.
- **`ApiUsageLog`** : log les headers `x-requests-used` /
  `x-requests-remaining` / `x-requests-last` à chaque appel, pour surveiller
  la conso du plan.

## Installation locale

```bash
npm install
cp .env.example .env   # puis renseigner DATABASE_URL, ODDS_API_KEY, CRON_SECRET
npm run db:migrate     # crée les tables (prisma migrate dev)
npm run dev            # http://localhost:3000
```

Sports suivis par défaut : `soccer_epl,soccer_uefa_champs_league`. Pour en
suivre d'autres, ajoute `ODDS_SPORT_KEYS="soccer_epl,soccer_fifa_world_cup,basketball_nba"`
(clés valides via `GET https://api.the-odds-api.com/v4/sports?apiKey=...`)
dans `.env`.

### Déclencher un refresh manuellement

```bash
npm run refresh:odds
```

ou en HTTP (utile pour tester le endpoint que le cron appellera) :

```bash
curl "http://localhost:3000/api/refresh-odds?secret=$CRON_SECRET"
```

## Déploiement sur Render

1. **Base de données** : créer un service **PostgreSQL** sur Render, copier
   son *Internal Database URL*.
2. **Web Service** (le site) :
   - Build command : `npm install && npm run build`
   - Start command : `npm run start`
   - Variables d'environnement : `DATABASE_URL` (l'URL interne ci-dessus),
     `ODDS_API_KEY`, `CRON_SECRET`, `NODE_ENV=production`.
   - `npm run postinstall` (généré Prisma Client) et les migrations doivent
     être appliquées avant le premier démarrage — soit en lançant une fois
     `npm run db:migrate:deploy` depuis le shell Render, soit en l'ajoutant
     au build command : `npm install && npm run db:migrate:deploy && npm run build`.
3. **Cron Job** (refresh périodique des cotes) : un second service Render de
   type **Cron Job**, même repo, commande :
   ```bash
   npm install && npm run refresh:odds
   ```
   avec les mêmes variables d'environnement (`DATABASE_URL`, `ODDS_API_KEY`).
   Fréquence recommandée : toutes les 15–30 min (à aligner avec
   `ODDS_REFRESH_INTERVAL_MINUTES`, qui empêche de toute façon un fetch trop
   rapproché de gaspiller du quota).

## Roadmap (phase 2, pas dans ce MVP)

- Moteur de prédiction (Poisson / ML) réintégré proprement au-dessus de ce
  schéma, sans les biais de backtest identifiés dans l'ancien prototype
  (voir historique git avant le commit de nettoyage).
- Détection de value bets (comparaison probabilité modèle vs cote) + Kelly.
- Historique/graphique de mouvement de cotes par match (la table `Odds`
  est déjà pensée pour ça).
- Alerting (Slack/Telegram) sur value bet au-dessus d'un seuil.
- Fonctionnalités façon ZoneStat qui demandent une nouvelle source de
  données (scores, stats d'équipes/joueurs, compositions) en plus des cotes :
  matrice de score (modèle de buts sur l'historique des résultats),
  classement, forme récente, top buteurs, compositions probables, vote
  communautaire (nécessiterait aussi des comptes utilisateurs).
