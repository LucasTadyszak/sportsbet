# ⚽ SportsBet Analytics — Outil d'analyse de paris sportifs & détection de value bets

Application complète d'analyse de matchs de football, de prédiction statistique/ML,
et de détection de value bets par comparaison probabilité modèle vs cotes bookmaker.

> ⚠️ **Avertissement** : outil éducatif et exploratoire. Les paris sportifs comportent
> un risque réel de perte d'argent. Aucun modèle ne garantit un résultat futur.
> Les données par défaut sont **synthétiques** (championnat fictif généré par simulation).

---

## 1. Architecture du projet

```
sportsbet/
├── app.py                     # Dashboard Streamlit (interface principale)
├── api.py                     # API REST FastAPI (intégration externe)
├── requirements.txt
├── data/
│   └── sportsbet.db           # Base SQLite (créée automatiquement)
├── models/                    # Modèles ML entraînés (.joblib) + dataset d'entraînement
└── src/
    ├── database.py            # Schéma SQLite (teams, matches, odds, predictions, value_bets, bankroll)
    ├── generate_sample_data.py# Générateur de championnat fictif réaliste (pour tester sans API)
    ├── data_sources.py        # Connecteurs API-Football / Football-Data.org (données réelles)
    ├── features.py            # Feature engineering : forme, dom/ext, xG, H2H, variance
    ├── poisson_model.py       # Modèle statistique (distribution de Poisson bivariée)
    ├── ml_model.py            # Régression logistique + Gradient Boosting, backtesting du modèle
    ├── value_betting.py       # Probabilité implicite, value score, Kelly Criterion, bankroll
    └── backtest.py            # Backtest de la stratégie complète sur l'historique
```

## 2. Installation

```bash
python -m venv venv
source venv/bin/activate        # Windows : venv\Scripts\activate
pip install -r requirements.txt
```

## 3. Démarrage rapide (données réelles)

Ce projet fonctionne uniquement avec des données réelles — aucun jeu de données
fictif n'est généré ni utilisé par l'application.

```bash
cd src
python database.py              # Initialise la base SQLite (vide)
export FOOTBALL_DATA_API_KEY="ta_clé_gratuite"   # https://www.football-data.org/
python data_sources.py --provider football-data --competition PL
python ml_model.py              # Entraîne les modèles ML une fois assez de matchs importés
cd ..
streamlit run app.py            # Lance le dashboard -> http://localhost:8501
```

L'import de matchs réels est aussi disponible directement depuis la barre latérale
du dashboard (code compétition + bouton « Importer les matchs réels »).

L'API REST (optionnelle, pour intégration externe) :
```bash
uvicorn api:app --reload --port 8000   # Documentation : http://localhost:8000/docs
```

## 4. Sources de données réelles

Deux connecteurs prêts à l'emploi dans `src/data_sources.py` :

```bash
export FOOTBALL_DATA_API_KEY="ta_clé_gratuite"   # https://www.football-data.org/
python src/data_sources.py --provider football-data --competition PL
```
> Plan gratuit : pas de xG (remplacé par la moyenne de ligue via `DEFAULT_XG`),
> pas de cotes bookmaker historiques. Les cotes bookmaker doivent être saisies
> manuellement dans l'onglet « Comparateur libre » ou via l'endpoint `/value-bets`.

Ou avec API-Football (xG réel, cotes multi-marchés, historique — plan payant recommandé) :
```bash
export API_FOOTBALL_KEY="ta_clé"
python src/data_sources.py --provider api-football --league-id 39 --season 2025
```

Ou avec The Odds API (cotes bookmaker en direct, moyennées multi-bookmakers — plan gratuit dispo) :
```bash
export ODDS_API_KEY="ta_clé_gratuite"   # https://the-odds-api.com/
python src/data_sources.py --provider odds-api --sport-key soccer_fifa_world_cup
```
> Crée le match s'il n'existe pas encore (ex. une affiche internationale comme Brésil - Norvège)
> et enregistre ses cotes (1X2, Over/Under 2.5, BTTS) à chaque exécution — une nouvelle ligne
> d'historique n'est ajoutée que si les cotes ont bougé depuis la dernière capture (pas de doublons
> si rien n'a changé). Disponible aussi depuis la barre latérale du dashboard
> (« Cotes en direct — The Odds API »), avec un bouton pour lister les `sport_key` disponibles
> si tu ne connais pas la bonne compétition. L'onglet « Analyse de match » affiche l'historique
> des cotes du match sélectionné (tableau + graphique d'évolution 1X2) une fois plusieurs
> captures effectuées.

Le reste du pipeline (features, prédiction, value betting) fonctionne sans
modification, puisqu'il consomme directement la table `matches` de SQLite.

> `src/generate_sample_data.py` (générateur de championnat fictif) n'est plus
> utilisé par l'application — conservé uniquement comme utilitaire de test local
> du pipeline, à ne jamais exécuter en usage normal.

## 5. Fonctionnement du moteur

### a) Feature engineering (`features.py`)
- **Forme récente** : moyenne mobile sur les 5 derniers matchs (points, buts, xG)
- **Domicile / extérieur** : performance spécifique selon le lieu
- **H2H** : confrontations directes historiques
- **Variance de forme** : régularité vs irrégularité d'une équipe

### b) Modèle de Poisson (`poisson_model.py`)
Estime les buts attendus (λ) de chaque équipe à partir de la force offensive/défensive
relative à la moyenne de la ligue, pondérée xG (60%) / buts réels (40%). Construit la
matrice de probabilité de tous les scores exacts, puis en dérive :
- Probabilités 1X2, Over/Under 2.5 buts, BTTS, top 3 scores les plus probables

### c) Machine Learning (`ml_model.py`)
- **Régression logistique** (baseline interprétable) et **Gradient Boosting** (non-linéarités)
- Dataset reconstruit *sans fuite de données* : les features de chaque match d'entraînement
  ne contiennent que l'information disponible **avant** le match
- Score de confiance = écart entre la probabilité la plus forte et la 2e

### d) Value betting (`value_betting.py`)
```
probabilité implicite = 1 / cote
value score (%) = (probabilité_modèle × cote − 1) × 100
```
- `remove_overround()` retire la marge bookmaker pour comparer des probabilités normalisées
- **Kelly fractionnaire** (par défaut 25% du Kelly plein, cap dur à 3% du bankroll/pari)
  pour limiter le risque de ruine en cas d'erreur du modèle
- `BankrollSimulator` simule l'évolution de bankroll pari après pari (ROI, historique)

### e) Backtest (`backtest.py`)
Rejoue tout l'historique de matchs joués avec le pipeline complet.

> ⚠️ **Limite méthodologique importante** : en l'absence d'historique de cotes réelles,
> le backtest compare le modèle à une version **bruitée de ses propres probabilités**
> (proxy). Sélectionner le "meilleur" value bet parmi plusieurs marchés à chaque match
> introduit un **biais de sélection** qui surestime mécaniquement la rentabilité
> (effet proche du *winner's curse*). Les résultats du backtest de démo ne doivent être
> lus que comme une **démonstration de la méthodologie** (pipeline détection → Kelly →
> suivi bankroll), pas comme une preuve de rentabilité. Pour un backtest fiable,
> connecter `data_sources.py` à un historique réel de cotes bookmaker.

## 6. Dashboard Streamlit — fonctionnalités

| Onglet | Contenu |
|---|---|
| 📊 Analyse de match | Prédictions 1X2/Poisson, comparaison ML, forme, H2H, value bets du match |
| 🎯 Value Bets du jour | Scan de tous les matchs à venir, tri par % de value |
| 📈 Backtest & ROI | Simulation bankroll sur l'historique, taux de réussite, drawdown |
| 🔬 Comparateur libre | Choisir deux équipes + cotes manuelles pour tester un scénario |

## 7. Extensions possibles

- Ajouter les données de blessures/suspensions comme feature supplémentaire
- Ajouter d'autres sports (basket, tennis) : le moteur Poisson convient surtout au foot/handball ;
  pour le tennis, remplacer par un modèle Elo + probabilité de set
- Alerting temps réel (webhook Slack/Telegram) quand un value bet dépasse un seuil
- Stocker un vrai historique de cotes (plusieurs bookmakers) pour un backtest non biaisé
- Ajouter le **Closing Line Value (CLV)** comme métrique de qualité du modèle, en
  complément du ROI brut (le CLV est plus robuste à la variance court-terme)
