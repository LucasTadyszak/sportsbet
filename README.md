# SportsBet — Live Odds Board

Site Next.js qui affiche les cotes bookmaker en direct (récupérées via
[The Odds API](https://the-odds-api.com/)), stockées dans une base Postgres,
et les confronte à un modèle maison (Elo + modèle de buts Dixon-Coles, nourri par
les résultats et classements de [football-data.org](https://www.football-data.org/) pour
les clubs, et par le jeu de données public
[international_results](https://github.com/martj42/international_results) pour les
sélections nationales) selon la méthodologie de [Lakeshore Edge](https://www.lakeshore-edge.com/methodology)
adaptée au football : cotes sans marge et consensus multi-bookmakers, cinq signaux
de marché, verdicts par paliers, mise Kelly fractionnée, journal de picks figés,
gradation nocturne contre la cote de clôture (CLV) et boucle de calibration.
Le détail, avec les valeurs exactes des paramètres, est sur la page `/methodologie`
du site et dans `src/lib/methodology/config.ts`.

Le tableau affiche **tous les matchs** des cinq grands championnats européens (Premier
League, LaLiga, Serie A, Bundesliga, Ligue 1), des coupes d'Europe et des compétitions de
sélections — Coupe du monde, Euro, Ligue des nations, qualifications, phases finales
continentales et amicaux internationaux —, avec leur score en direct, grâce à
[Free API Live Football Data](https://rapidapi.com/Creativesdev/api/free-api-live-football-data)
(RapidAPI) ; ceux que The Odds API cote ont en plus leurs cotes et le verdict du modèle.

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
- **international_results** (domaine public, CSV sur GitHub) pour les résultats des sélections nationales
- **TheSportsDB** comme source des logos des clubs et des compétitions (clé publique gratuite)
- **Free API Live Football Data** (RapidAPI, données FotMob) : calendrier, résultats et
  scores en direct de toutes les compétitions suivies, plafonné à 1000 requêtes par heure

> Next build/dev tournent avec `--webpack` : la version de Turbopack livrée
> avec Next 16.3.6 casse le chargement de `next/font/google` dans cet
> environnement. À retirer si un futur upgrade de Next corrige le problème.

## Architecture

```
prisma/schema.prisma        # Sport, Event, Team, Bookmaker, Odds, ApiUsageLog, FetchLog,
                             # TeamStats, MatchPrediction, LiveMatch…
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
src/lib/leagueMapping.ts    # sport_key (Odds API) -> code compétition (football-data.org), id de ligue (TheSportsDB) ; compétitions de sélections
src/lib/teamNames.ts        # normalisation des noms d'équipe (accents, suffixes « FC », alias), commune aux rapprochements
src/lib/teamNameMatch.ts    # rapproche les noms d'équipe entre The Odds API et football-data.org
src/lib/crests.ts           # nom d'équipe The Odds API -> logo du club (Team.logo, sinon TeamStats.crest, sinon FotMob par Team.fotmobTeamId) et ses couleurs (TeamStats.clubColors)
src/lib/teamColors.ts       # couleurs d'un club ("Red / White") -> couleurs hex des blocs de match
src/lib/ratings.ts          # rejoue l'Elo (réglé par ligue) + ajuste le modèle de buts, depuis les Fixture
src/lib/predictions.ts      # Poisson sur le classement (repli quand le modèle de buts manque de données)
src/lib/refreshStats.ts     # classements + résultats -> notes -> MatchPrediction (modèle brut)
scripts/refresh-stats.ts    # point d'entrée CLI pour un cron (Render Cron Job)
src/app/api/refresh-stats/  # endpoint HTTP protégé par CRON_SECRET pour déclencher un refresh

# Sélections nationales (international_results)
src/lib/internationalResultsApi.ts # lecture des CSV : noms actuels, classe de match, score à 90' reconstitué
src/lib/internationalResults.ts    # synchro en base, rapprochement des noms, repos, résultat d'un match de sélections
src/lib/nationalTeamNames.ts       # noms The Odds API <-> jeu de données (variantes connues, jamais de sous-chaîne)
src/lib/eventResults.ts            # score à 90' d'un événement : football-data.org (clubs) ou international (sélections)

# Logos (TheSportsDB)
src/lib/theSportsDbApi.ts   # client TheSportsDB v1 (clé gratuite « 123 » par défaut) + espacement 30 req/min
src/lib/logoMatch.ts        # quelle équipe TheSportsDB est la nôtre (sport, nom exact ou alternatif) + URLs de logo servables
src/lib/refreshLogos.ts     # logo de chaque compétition (Sport.logo) et de chaque club des matchs récents/à venir (Team.logo), id FotMob de chaque club (Team.fotmobTeamId)
scripts/refresh-logos.ts    # point d'entrée CLI : tous les logos dus d'un coup (npm run refresh:logos)

# Tous les matchs et scores en direct (Free API Live Football Data, RapidAPI)
src/lib/liveFootballApi.ts  # client (x-rapidapi-key/host) + plafond de requêtes par heure glissante, partagé via la base
src/lib/liveCompetitions.ts # compétitions suivies : id de ligue FotMob -> clé de compétition du tableau
src/lib/liveMatches.ts      # lecture des réponses (où qu'y soient les matchs), statut d'un match, quand relire
src/lib/refreshLiveMatches.ts # listes des jours affichés + de chaque ligue dues + flux live -> LiveMatch (réservé dans FetchLog)
src/lib/matchPairing.ts     # quel LiveMatch est le même match qu'un Event coté (compétition, horaire, noms) ; l'id FotMob de chaque équipe qu'on en déduit
scripts/refresh-live-matches.ts # point d'entrée CLI (npm run refresh:matches)
src/app/api/refresh-matches/ # endpoint HTTP protégé par CRON_SECRET, pour un pinger
scripts/live-football.ts    # appelle un endpoint et affiche le JSON (tester la clé, voir une vraie réponse)

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
src/components/MatchCard.tsx # bloc de match : bandeau de la compétition, cadre aux couleurs des clubs, tuiles 1/N/2, score en direct
src/components/LiveRefresh.tsx # rafraîchit le tableau chaque minute tant qu'un match suivi est en cours
src/components/RemoteLogo.tsx # logo distant, remplacé par le bouclier (club) ou sport + drapeau (compétition) s'il ne charge pas
src/lib/selection.ts        # « Ma sélection » : une cote cliquée + le verdict du modèle sur son issue, les mises tapées
src/lib/betSlip.ts          # état de la sélection, de la bankroll et des mises, dans le localStorage du navigateur
src/components/OddsButton.tsx # une cote cliquable (tuiles 1/N/2, tableau de cotes, picks), flamme d'erreur de cote comprise
src/components/BetSlip.tsx  # champ bankroll, encart d'invitation, bouton flottant + panneau « Ma sélection » (mises, enregistrement)
src/lib/savedBets.ts        # « Mes paris » : un pari enregistré, son règlement au score à 90 min (simple ou combiné), le bilan
src/lib/myBets.ts           # les paris enregistrés, dans le localStorage du navigateur
src/lib/betResults.ts       # où en sont les matchs des paris enregistrés : score à 90 min, score en direct, annulation
src/lib/liveSync.ts         # mise à jour des matchs (ce qui est dû) au service d'une page ou d'une action, 3 s d'attente au plus
src/app/mes-paris/          # « Mes paris » : chaque pari enregistré, ce qu'il aurait rapporté, le bilan (profit, ROI)
src/app/page.tsx            # blocs de matchs groupés par compétition, barre latérale des compétitions, jours, filtres
src/app/match/[id]/         # détail : cotes, Analyse (verdict, 5 signaux, modèle pièce par pièce), probabilités, matrice des scores
src/app/picks/              # picks à venir (paliers misés)
src/app/passes/             # centre des passes : chaque marché non misé et pourquoi
src/app/historique/         # track record : chaque pick gradé, CLV, ROI
src/app/modele/             # santé du modèle : calibration, Brier vs marché, fiabilité, couverture
src/app/methodologie/       # la méthodologie, avec les valeurs de config.ts
src/app/not-found.tsx       # la page 404 de tout le site (URL inconnue comme vestiaire fermé)

# Vestiaire : console cachée (voir « Vestiaire » plus bas)
src/lib/commands.ts         # les jobs des scripts npm (un log(line) par ligne de sortie), partagés par scripts/*.ts et la console
src/lib/commandRuns.ts      # exécution d'une commande en arrière-plan du serveur -> CommandRun (sortie, heartbeat), une à la fois par commande
src/lib/runState.ts         # statut d'une exécution (interrompue si son heartbeat s'arrête), sortie plafonnée, erreurs affichées
src/lib/adminSession.ts     # le code (ADMIN_SECRET, sinon CRON_SECRET), cookie de session signé HMAC, limite d'essais
src/lib/secretKnock.ts      # l'easter egg : code Konami ou 7 tapes sur le logo -> cookie de passage
src/components/SecretKnock.tsx # l'écoute de l'easter egg sur toutes les pages
src/proxy.ts                # /vestiaire sans passage ni session : la même 404 qu'une URL inconnue
src/app/vestiaire/          # la console (boutons des commandes, sortie en direct, historique) et ses Server Actions
src/app/vestiaire/requetes/ # le tableau de bord des requêtes par API
src/lib/apiProviders.ts     # chaque API appelée (clé `provider` d'ApiUsageLog), son rôle et sa limite
src/lib/apiUsage.ts, src/lib/usagePeriods.ts # comptes par API, par heure ou jour de Paris, par endpoint, quotas
```

Board inspiré de Winamax et Betclic, en thème clair : chaque match est un **bloc**
habillé aux couleurs de sa compétition (bandeau en dégradé avec son motif —
chevrons, étoiles ou bandes — et son logo, sinon son drapeau) et de ses deux clubs
(cadre rayé aux couleurs du maillot de chaque équipe, logo cerclé de ces mêmes
couleurs), avec les cotes principales 1 / N / 2 en grandes tuiles cliquables et, sous
chacune, la probabilité du marché marge retirée. Les couleurs des clubs viennent de
football-data.org (`clubColors`, un appel par compétition au rythme du classement) ;
un club sans couleurs connues prend celles de sa compétition. Les blocs, un par
ligne, sont groupés par compétition (repliable, les plus grandes d'abord), avec une barre
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
Methodology) ; `/mes-paris` suit les paris que l'utilisateur a enregistrés (voir
« Mes paris » plus bas).

### Tous les matchs (Free API Live Football Data)

The Odds API ne cote qu'une poignée de compétitions sur son plan gratuit : le calendrier vient
donc de [Free API Live Football Data](https://rapidapi.com/Creativesdev/api/free-api-live-football-data),
qui relaie les données de FotMob (identifiants de ligue et d'équipe compris). Compétitions
suivies (`LIVE_COMPETITIONS` dans `src/lib/liveCompetitions.ts`, par id de ligue FotMob) :

| Compétitions | Ids |
| --- | --- |
| Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 | 47, 87, 55, 54, 53 |
| Ligue des champions, Ligue Europa, Ligue Conférence | 42, 73, 10216 |
| Coupe du monde, Euro | 77, 50 |
| Ligue des nations A, B, C, D | 9806, 9807, 9808, 9809 |
| Qualifs Mondial Europe, Amérique du Sud, Afrique, Asie, CONCACAF | 10195, 10199, 10196, 10197, 10198 |
| Qualifs Euro | 10607 |
| Copa América, CAN, Coupe d'Asie, Gold Cup | 44, 289, 290, 298 |
| Amicaux internationaux (sélections) | 114 |

Chaque compétition s'affiche sous la clé The Odds API quand celle-ci l'a (`soccer_epl`…), sinon
sous une clé du même style (`soccer_international_friendlies`…), avec son nom et son bandeau
(`src/lib/competitions.ts`). `LIVE_FOOTBALL_LEAGUE_IDS` restreint la liste (ex. `47,87,55,54,53`
pour les cinq championnats seuls ; vide pour aucune) ; ajouter une compétition, c'est une ligne
de plus dans la table (l'id est dans l'URL de sa page sur fotmob.com).

Trois sortes de requêtes, stockées dans `LiveMatch` :
- la **liste d'un jour** (`/football-get-matches-by-date`) : tous les matchs d'une date UTC, toutes
  ligues confondues, dont on garde ceux des compétitions suivies (par l'id de ligue du match, ou
  celui de son groupe : une phase de groupes a parfois son propre id). Elle est lue pour les jours
  que montre le tableau — aujourd'hui, les deux jours suivants et le jour affiché (deux dates UTC
  chacun : un jour de Paris commence la veille au soir en UTC) —, si bien que ces jours sont
  complets et à jour quoi que disent les listes des ligues ;
- la **liste d'une ligue** (`/football-get-all-matches-by-league`) : toute sa saison, calendrier
  et résultats, en une requête, pour le reste du calendrier. Une liste sans aucun match à venir
  (compétition entre deux éditions, ou liste encore sur la saison passée) n'est plus relue qu'une
  fois par jour ;
- le **flux live** (`/football-current-live`) : tous les matchs en cours dans le monde, en une
  requête, lu au plus une fois par minute et seulement quand un match suivi est en cours ou va
  commencer. Il donne le score et la minute ; les matchs non suivis sont ignorés.

Une liste (d'un jour ou d'une ligue) est relue toutes les 12 h, toutes les heures quand elle a des
matchs aujourd'hui ou demain (les horaires bougent), toutes les 10 min quand un match aurait dû
commencer, toutes les 3 min quand un match en cours a quitté le flux live (il vient de finir :
score final). Une journée chargée coûte donc quelques dizaines de requêtes par heure, loin du
plafond. Tout passe par le chargement du tableau : ce qui est dû est lu en parallèle (les jours
affichés d'abord), la page attend au plus 3 s puis s'affiche avec ce qu'elle a, et la lecture se
termine après la réponse (`after()`). Chaque lecture est réservée dans `FetchLog` avant de
partir : plusieurs pages ouvertes en même temps (ou un cron) ne font jamais deux fois la même
requête. Une lecture qui échoue est retentée 5 min plus tard ; au plafond horaire, plus rien ne
part jusqu'à ce qu'une place se libère. Le tableau affiche les matchs en base même quand le site
n'a pas `RAPIDAPI_KEY` (seul `npm run refresh:matches` l'a, par exemple) : il ne les met alors
simplement pas à jour lui-même, et le signale une fois dans les logs du serveur. À côté de l'heure
des cotes, il indique l'heure de la dernière lecture réussie (« Matchs mis à jour … »).

Un match que les deux sources connaissent n'apparaît qu'une fois (`src/lib/matchPairing.ts`) :
même compétition, coups d'envoi à moins de 6 h d'écart, et noms d'équipe qui concordent après
normalisation (alias des clubs, variantes des pays : « USA » / « United States »), dans un sens
ou dans l'autre (terrain neutre : le score est alors remis dans le bon sens). À défaut de noms
reconnus, deux matchs seuls dans le même créneau de la même compétition sont appariés ; jamais
sur une supposition quand plusieurs matchs partagent ce créneau. Le bloc garde alors ses cotes,
ses picks et sa page, et gagne le score en direct.

Un match sans cotes a le même bloc (bandeau de la compétition, logos), sans tuiles 1/N/2 ni page
de détail. Tous affichent, selon l'état donné par l'API : l'heure du coup d'envoi, le score et
la minute (ou « Mi-temps ») en direct, le score final (« Terminé », « Après prol. », « Tirs au
but »), ou l'heure barrée d'un match « Reporté » / « Annulé ». Le filtre **En cours** suit cet
état (plus seulement l'heure du coup d'envoi), et tant qu'un match suivi est en cours ou commence
dans les 10 min, le tableau se rafraîchit tout seul chaque minute. Les logos viennent du CDN
d'images de FotMob (`images.fotmob.com`, par id d'équipe et de ligue, sans requête à l'API) ;
un logo qui ne charge pas laisse place au bouclier neutre.

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
sélection doit valoir une mise seule, une seule par match. La bankroll, la
sélection et les mises tapées restent dans le `localStorage` du navigateur : rien
n'est envoyé au serveur.

### Mes paris : et si je l'avais joué ?

Sous chaque cote (en simples) ou pour le combiné, le panneau a un champ **Ma mise**,
pré-rempli avec le montant conseillé quand il y en a un (il faut une bankroll), et le
**gain potentiel**. « Enregistrer » range la sélection dans **Mes paris** (`/mes-paris`)
comme si elle avait été jouée — un pari par cote en simples, un seul en combiné —, avec
la cote et le bookmaker du moment, la mise et le conseil du modèle, puis vide le
panneau. Un combiné de deux sélections du même match n'est pas enregistrable, et une
sélection dont le match a commencé est retirée au lieu d'être enregistrée.

Mes paris règle chaque pari comme un bookmaker, avec les règles des picks du journal
(`src/lib/methodology/settlement.ts`) : sur le score à 90 minutes, lignes entières et
quarts de ligne compris (remboursé, ½ gagné, ½ perdu). Un combiné est perdu dès qu'une
sélection l'est ; une sélection remboursée y compte pour une cote de 1. Un match annulé
ou arrêté est remboursé. La page affiche pour chaque pari le score ou l'état de ses
matchs (à venir, minute et score en direct, « en attente » après une prolongation), ce
qu'il aurait rapporté, et en tête le bilan : profit, ROI, gagnés-perdus-remboursés,
mises encore en jeu.

Le score vient de `src/lib/betResults.ts` : celui qui grade le journal (football-data.org,
international_results) dès qu'il est connu, sinon le score final de Free API Live Football
Data quand le match s'est fini dans le temps réglementaire (« FT ») — quelques minutes
après le coup de sifflet ; après une prolongation, il faut attendre le premier. La page
demande ces résultats au serveur (une Server Action, qui met d'abord à jour les matchs
comme le tableau), de nouveau chaque minute tant qu'un match est en cours, et chaque
fois que l'onglet revient au premier plan. Les paris restent dans le `localStorage` du
navigateur, comme la sélection : le serveur ne reçoit que les identifiants de leurs
matchs. Un résultat définitif est gardé sur le pari et n'est plus redemandé. Un
navigateur ou un appareil ne voit donc que ses propres paris.

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

Des garde-fous pour ne pas cramer le quota gratuit des API :
- **`FetchLog`** : chaque sport n'est re-fetché que toutes les
  `ODDS_REFRESH_INTERVAL_MINUTES` (30 min par défaut) côté cotes, et chaque
  compétition que toutes les `FOOTBALL_DATA_REFRESH_INTERVAL_MINUTES` (6h par
  défaut — un classement bouge beaucoup moins vite qu'une cote) côté stats.
  Ce throttle limite le nombre d'*appels API*, pas ce qui est enregistré une
  fois l'appel fait : à chaque fetch réellement exécuté, tout son contenu est
  persisté (voir ci-dessus).
- **`ApiUsageLog`** : une ligne par appel à une API externe, site et crons confondus
  (The Odds API, football-data.org, Free API Live Football Data, TheSportsDB et les
  fichiers d'international_results), avec les headers de quota quand l'API en renvoie
  (`x-requests-used` / `x-requests-remaining` / `x-requests-last` pour The Odds API,
  `x-requests-available-minute` pour football-data.org, `x-ratelimit-requests-*` pour
  RapidAPI), pour surveiller la conso des plans : c'est ce que lit le tableau de bord des
  requêtes du vestiaire.
- **Plafond horaire** (Free API Live Football Data) : au plus
  `LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR` appels (1000 par défaut) sur les 60
  dernières minutes, site et crons confondus. Chaque appel est inscrit dans
  `ApiUsageLog` *avant* de partir, sous verrou Postgres pour que deux processus ne
  prennent pas la dernière place, et compte même s'il échoue. Au-delà, l'appel est
  refusé sans toucher l'API (`LiveFootballRateLimitError`, avec l'heure à laquelle
  une place se libère).

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

### Sélections nationales

Les compétitions de sélections de The Odds API sont suivies en plus des clubs : Ligue des
nations, qualifications pour la Coupe du monde (Europe, Amérique du Sud) et pour l'Euro,
Coupe du monde, Euro, Copa América, CAN et Gold Cup (`NATIONAL_TEAM_COMPETITIONS` dans
`src/lib/leagueMapping.ts`). Elles ne jouent que quelques semaines par an : à chaque
refresh, la liste des sports de The Odds API (gratuite, hors quota) dit lesquelles sont en
saison, et seules celles-là sont interrogées. Pendant une fenêtre internationale, compter
donc un appel de plus par compétition active, au même coût que pour un championnat.

Le plan gratuit de football-data.org n'ayant ni la Ligue des nations, ni les
qualifications, ni les amicaux, le modèle des sélections tourne sur
[international_results](https://github.com/martj42/international_results) : tous les
matchs internationaux masculins depuis 1872 (lieu, compétition, minute des buts), trois
fichiers CSV sans clé ni quota. `refreshStats()` les synchronise (`NationalTeam`,
`InternationalMatch`, même throttle que les stats), rejoue une note Elo par sélection sur
tout l'historique — K, avantage du terrain et nul réglés par type de match, pas de retour
vers la moyenne, aucun avantage du terrain en phase finale (terrain neutre) — et ajuste un
modèle de buts sur les quatre dernières années. Les notes des sélections sont stockées dans
`TeamRating` sous l'opposé de leur id (`-NationalTeam.id`), qui ne peut pas croiser un id
de club.

Le score publié compte la prolongation : le score à 90 minutes, celui des bookmakers, est
reconstitué à partir de la minute des buts, en tenant compte des matchs retour (la
prolongation y suit une égalité sur les deux matchs). Quand un doute subsiste — un but à la
95e peut être du temps additionnel comme de la prolongation, un 3-0 sans buteurs peut être
un match gagné sur tapis vert —, le pick reste en attente plutôt que d'être mal gradé. Le
jeu de données n'étant mis à jour que quelques jours après chaque fenêtre, `npm run
nightly` le re-télécharge à chaque passage et la gradation remonte jusqu'à 60 jours.

Les noms de pays diffèrent entre les deux sources ("USA" / "United States", "Czechia" /
"Czech Republic") : `nationalTeamNames.ts` les compare après normalisation et avec une
table de variantes, jamais par sous-chaîne ("Ireland" n'est pas "Northern Ireland"). Un
nom inconnu n'a simplement pas de modèle, et `npm run refresh:stats` l'affiche
(`unmatched national teams: …`) : il suffit alors d'ajouter la variante à la table.

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
(`TeamStats.crest`, via le rapprochement décrit plus haut), sinon celui de FotMob, sinon un
bouclier neutre. Le logo FotMob se déduit de l'id FotMob du club (`Team.fotmobTeamId`), lu
sur les matchs de Free API Live Football Data appariés à ses matchs cotés (comme sur le
tableau, voir « Tous les matchs ») : `refreshLogos()` le relit à chaque passage, sans aucune
requête, pour chaque club des matchs des 180 derniers jours et à venir, en ne retenant que
les appariements où son nom concorde et l'id que donnent la plupart d'entre eux. C'est ce
qui donne un logo, sur toutes les pages, aux sélections que la recherche TheSportsDB
(quelques résultats seulement avec la clé gratuite, tous sports confondus) ne trouve pas. Les
images sont servies par `next/image`, qui n'accepte que les domaines listés dans
`next.config.ts` (`r2.thesportsdb.com`, `www.thesportsdb.com/images`,
`crests.football-data.org`, `images.fotmob.com`).

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
- `ODDS_NATIONAL_SPORT_KEYS` : compétitions de sélections suivies en plus de
  `ODDS_SPORT_KEYS` (par défaut toutes celles de `NATIONAL_TEAM_COMPETITIONS` ; vide pour
  n'en suivre aucune). Une clé absente de cette table a ses cotes mais pas de modèle.
- `THESPORTSDB_API_KEY` (facultatif, défaut `123`, la clé publique gratuite) : une clé
  personnelle TheSportsDB (Patreon) si la clé partagée est trop limitée.
- `LIVE_FOOTBALL_MAX_REQUESTS_PER_HOUR` (défaut 1000) : plafond d'appels à Free API
  Live Football Data sur une heure glissante.
- `LIVE_FOOTBALL_LEAGUE_IDS` : ids de ligue FotMob des compétitions dont le tableau affiche
  tous les matchs, parmi celles de `src/lib/liveCompetitions.ts` (par défaut toutes : voir
  « Tous les matchs » ; vide pour aucune).
- `ADMIN_SECRET` : le code du vestiaire (voir plus bas). Sans lui, c'est `CRON_SECRET` qui
  ouvre le vestiaire ; sans aucun des deux, le vestiaire reste fermé.

Sports suivis par défaut : `soccer_epl,soccer_uefa_champs_league` côté clubs, plus
les compétitions de sélections (voir « Sélections nationales »). Pour suivre d'autres
championnats, ajoute `ODDS_SPORT_KEYS="soccer_epl,soccer_france_ligue_one,basketball_nba"`
(clés valides via `GET https://api.the-odds-api.com/v4/sports?apiKey=...`)
dans `.env`. Les probabilités ne sont calculées que pour les sports mappés
vers une compétition football-data.org dans `src/lib/leagueMapping.ts` (Premier
League, Champions League, Bundesliga, Liga, Serie A, Ligue 1, etc. — le plan
gratuit de football-data.org ne couvre qu'un sous-ensemble de compétitions), et pour
les compétitions de sélections de `NATIONAL_TEAM_COMPETITIONS`.

Clé football-data.org gratuite : à récupérer sur
[football-data.org/client/register](https://www.football-data.org/client/register).

Clé RapidAPI (`RAPIDAPI_KEY`, la même pour toutes les API RapidAPI du compte) : s'abonner
au plan gratuit de
[Free API Live Football Data](https://rapidapi.com/Creativesdev/api/free-api-live-football-data)
puis copier la valeur `x-rapidapi-key` de ses exemples de code, dans `.env` (le site et les
scripts la lisent de là ; redémarrer `npm run dev` après l'avoir ajoutée). Sans elle, rien n'est
récupéré. `npm run refresh:matches -- --force` récupère d'un coup la semaine à venir et toutes les
compétitions suivies, puis affiche ce que la base contient pour chacune — nombre de matchs,
première et dernière date, matchs à venir, matchs du jour —, c'est-à-dire ce que le tableau peut
afficher. Une ligne « no match found » signale une réponse dont aucun match n'a pu être lu (`npm
run live-football -- /football-get-all-matches-by-league leagueid=47` montre la réponse brute) ;
« none to come » une liste sans match à venir, que les listes des jours complètent.

### Déclencher un refresh manuellement

```bash
npm run refresh:odds    # cotes (The Odds API), puis verdicts
npm run refresh:stats   # classements + résultats + notes + probabilités (football-data.org), puis verdicts
npm run nightly         # résultats récents, gradation des picks, calibration, verdicts
npm run refresh:edges   # verdicts seuls, sans appel API (après un changement dans config.ts)
npm run refresh:logos   # logos des compétitions et des clubs (TheSportsDB), tous ceux qui sont dus
npm run refresh:matches # matchs des compétitions suivies + scores en direct (Free API Live Football Data), ce qui est dû
npm run refresh:matches -- --force   # toutes les listes (semaine à venir, chaque compétition), même fraîches, puis le contenu de la base
npm test                # tests unitaires de la méthodologie
npm run live-football -- /football-current-live   # un endpoint de Free API Live Football Data, JSON brut (compte dans le plafond)
```

ou d'un bouton, depuis le vestiaire (ci-dessous), ou en HTTP (utile pour tester les endpoints
que le cron appellera) :

```bash
curl "http://localhost:3000/api/refresh-odds?secret=$CRON_SECRET"
curl "http://localhost:3000/api/refresh-stats?secret=$CRON_SECRET"
curl "http://localhost:3000/api/nightly?secret=$CRON_SECRET"
curl "http://localhost:3000/api/refresh-matches?secret=$CRON_SECRET"
```

### Vestiaire : la console cachée

Une page que le site ne montre nulle part, avec un bouton pour chaque script npm et le
tableau de bord des requêtes envoyées à chaque API.

**L'ouvrir.** Sur n'importe quelle page du site, taper le code Konami au clavier
(↑ ↑ ↓ ↓ ← → ← → B A, hors d'un champ de saisie), ou, sur un téléphone, toucher 7 fois de
suite le logo SPORTSBET (en moins de 4 s). Le site va alors sur `/vestiaire`, qui demande
le code : `ADMIN_SECRET` (à défaut `CRON_SECRET`). Une fois entré, la session dure 30
jours sur cet appareil (cookie `httpOnly`, signé avec le code : changer le code
déconnecte partout), et `/vestiaire` s'ouvre alors directement ; « Fermer » y met fin.

**Ce qui la protège.** L'easter egg ne fait que cacher la porte : quelqu'un qui lit le
JavaScript du site peut la retrouver. Le verrou, c'est le code, vérifié sur le serveur
par chaque page et chaque action : choisir un code long et aléatoire
(`openssl rand -base64 24`), distinct de `CRON_SECRET`, que les pingers connaissent. Après
10 codes faux en 15 min, plus aucun essai n'est accepté jusqu'à ce que le plus ancien ait
15 min. Pour tous les autres visiteurs, `/vestiaire` n'existe pas : `src/proxy.ts` y
répond exactement la même 404 que pour une URL inconnue.

**Commandes** (`/vestiaire`). Chaque bouton lance, sur le serveur web, ce que fait sa
commande dans un terminal : `refresh:matches` (avec ou sans `--force`), `refresh:odds`,
`refresh:stats`, `nightly`, `refresh:edges`, `refresh:logos` et `live-football` (avec
l'endpoint et ses paramètres dans un champ). Le code et les lignes de sortie sont les
mêmes que ceux des scripts (`src/lib/commands.ts`). La commande tourne en arrière-plan
(`after()`) : sa sortie s'affiche en direct et reste dans l'historique 30 jours
(`CommandRun`, 60 000 caractères gardés par exécution). Une commande ne tourne qu'une fois
à la fois (un deuxième clic la retrouve), plusieurs commandes différentes peuvent tourner
ensemble. Une commande qui ne logue qu'à la fin (`refresh:stats`, `nightly`) reste « En
cours » jusque-là, comme dans un terminal. Un redémarrage ou un déploiement pendant une
exécution la coupe : elle est alors marquée « Interrompue » (son heartbeat s'est arrêté),
ce qu'elle a enregistré avant reste en base, il suffit de la relancer.

**Requêtes API** (`/vestiaire/requetes`). Pour chaque API : où en est son quota (le
plafond horaire du site et le quota du plan RapidAPI pour Free API Live Football Data,
les crédits du mois de The Odds API, la dernière minute pour football-data.org et
TheSportsDB), puis, sur 24 h, 7 jours ou 30 jours, les requêtes par heure ou par jour de
Paris, les endpoints les plus appelés et les derniers appels avec le quota que chaque
réponse a renvoyé. Tout vient d'`ApiUsageLog`, qui compte aussi les appels des crons.

## Déploiement sur Render

1. **Base de données** : créer un service **PostgreSQL** sur Render, copier
   son *Internal Database URL*.
2. **Web Service** (le site) :
   - Build command : `npm install && npm run build`
   - Start command : `npm run start`
   - Variables d'environnement : `DATABASE_URL` (l'URL interne ci-dessus),
     `ODDS_API_KEY`, `FOOTBALL_DATA_API_KEY`, `RAPIDAPI_KEY`, `CRON_SECRET`, `ADMIN_SECRET`
     (le code du vestiaire), `NODE_ENV=production`.
     Le site met lui-même à jour les matchs et les scores en direct quand on le consulte ; pour
     qu'ils avancent aussi quand personne n'y est, un pinger HTTP (cron-job.org, UptimeRobot…)
     peut appeler `/api/refresh-matches?secret=…` toutes les 1–2 min : il ne fait une requête
     que quand quelque chose est dû.
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

- Page de détail pour les matchs sans cotes, et compositions, stats et événements du match
  (buteurs, cartons) sur la page match, via Free API Live Football Data : ses matchs sont
  déjà en base (`LiveMatch`) et rapprochés des `Event`.
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
