"""
poisson_model.py
------------------
Modèle de Dixon-Coles (Poisson bivarié corrigé) pour :
- estimer les lambdas (buts attendus) home/away à partir des features,
  avec shrinkage bayésien vers la moyenne de ligue quand l'échantillon est faible,
- calculer la matrice de probabilité des scores exacts, corrigée pour la
  dépendance des scores faibles (0-0, 1-0, 0-1, 1-1) — correction de Dixon-Coles,
- en dériver : 1X2, over/under X.5 buts, BTTS, score le plus probable.

C'est le modèle "statistique classique" du projet, complémentaire au
modèle ML (régression logistique / gradient boosting) du fichier ml_model.py.
"""

import numpy as np
from scipy.stats import poisson

LEAGUE_AVG_GOALS = 1.35
HOME_ADVANTAGE = 1.15
MAX_GOALS = 10
SHRINK_K = 6      # pseudo-matchs : avec n matchs observés, poids des données = n / (n + K)
DC_RHO = -0.13    # paramètre de Dixon-Coles (valeur typique estimée sur les grands championnats)


def _shrink(value, n_matches, prior, k=SHRINK_K):
    """
    Shrinkage bayésien : tire l'estimation vers le prior (moyenne de ligue) quand
    l'échantillon est petit. Avec 0 match on rend le prior, avec beaucoup de matchs
    on rend la valeur observée. Évite les prédictions extrêmes en début de saison.
    """
    w = n_matches / (n_matches + k)
    return w * value + (1 - w) * prior


def estimate_lambdas(features: dict, league_avg_goals=LEAGUE_AVG_GOALS, home_advantage=HOME_ADVANTAGE):
    """
    Combine la forme récente et les xG pour estimer les buts attendus (lambda)
    de chaque équipe, pondérés par la force offensive/défensive relative à la ligue,
    avec shrinkage vers la moyenne de ligue selon le volume de données disponible.
    """
    n_home = features.get("home_matches_played", 0)
    n_away = features.get("away_matches_played", 0)

    # force offensive/défensive relative (pondération xG 60% / buts réels 40% pour lisser la variance)
    home_attack = 0.6 * features["home_xg_for_avg"] + 0.4 * features["home_goals_for_avg"]
    home_defense = 0.6 * features["home_xg_against_avg"] + 0.4 * features["home_goals_against_avg"]
    away_attack = 0.6 * features["away_xg_for_avg"] + 0.4 * features["away_goals_for_avg"]
    away_defense = 0.6 * features["away_xg_against_avg"] + 0.4 * features["away_goals_against_avg"]

    league_avg = league_avg_goals

    # shrinkage : peu de matchs observés => on se rapproche de la moyenne de ligue
    home_attack = _shrink(home_attack, n_home, league_avg)
    home_defense = _shrink(home_defense, n_home, league_avg)
    away_attack = _shrink(away_attack, n_away, league_avg)
    away_defense = _shrink(away_defense, n_away, league_avg)

    attack_strength_home = home_attack / league_avg
    defense_strength_away = away_defense / league_avg
    attack_strength_away = away_attack / league_avg
    defense_strength_home = home_defense / league_avg

    lambda_home = league_avg * attack_strength_home * defense_strength_away * home_advantage
    lambda_away = league_avg * attack_strength_away * defense_strength_home

    # garde-fous : éviter des lambdas irréalistes si peu de données
    lambda_home = float(np.clip(lambda_home, 0.3, 4.5))
    lambda_away = float(np.clip(lambda_away, 0.3, 4.5))
    return lambda_home, lambda_away


def score_matrix(lambda_home, lambda_away, max_goals=MAX_GOALS, rho=DC_RHO):
    """
    Matrice des scores exacts : Poisson indépendant + correction de Dixon-Coles.

    Le Poisson indépendant sous-estime les scores faibles corrélés (0-0, 1-1) et
    surestime 1-0 / 0-1 : les équipes "se neutralisent" plus souvent que ne le prédit
    l'indépendance. La correction tau de Dixon-Coles (1997) réajuste ces 4 cases
    (avec rho < 0 : plus de 0-0 et 1-1, moins de 1-0 et 0-1), puis on renormalise.
    Améliore surtout la justesse des probabilités de match nul et d'under 2.5.
    """
    ph = poisson.pmf(np.arange(max_goals + 1), lambda_home)
    pa = poisson.pmf(np.arange(max_goals + 1), lambda_away)
    matrix = np.outer(ph, pa)  # matrix[i, j] = P(home=i, away=j)

    matrix[0, 0] *= 1 - lambda_home * lambda_away * rho
    matrix[0, 1] *= 1 + lambda_home * rho
    matrix[1, 0] *= 1 + lambda_away * rho
    matrix[1, 1] *= 1 - rho

    matrix = np.clip(matrix, 0.0, None)
    return matrix / matrix.sum()


def outcome_probs(matrix):
    p_home = np.tril(matrix, -1).sum()
    p_draw = np.trace(matrix)
    p_away = np.triu(matrix, 1).sum()
    total = p_home + p_draw + p_away
    return p_home / total, p_draw / total, p_away / total  # renormalisation (troncature max_goals)


def over_under_probs(matrix, line=2.5):
    max_goals = matrix.shape[0] - 1
    total_goals_probs = {}
    for i in range(max_goals + 1):
        for j in range(max_goals + 1):
            t = i + j
            total_goals_probs[t] = total_goals_probs.get(t, 0.0) + matrix[i, j]
    p_over = sum(p for t, p in total_goals_probs.items() if t > line)
    p_under = sum(p for t, p in total_goals_probs.items() if t < line)
    total = p_over + p_under
    return p_over / total, p_under / total


def btts_probs(matrix):
    max_goals = matrix.shape[0] - 1
    p_yes = 0.0
    for i in range(1, max_goals + 1):
        for j in range(1, max_goals + 1):
            p_yes += matrix[i, j]
    p_no = 1 - p_yes
    return p_yes, p_no


def most_likely_scores(matrix, top_n=3):
    flat = [((i, j), matrix[i, j]) for i in range(matrix.shape[0]) for j in range(matrix.shape[1])]
    flat.sort(key=lambda x: x[1], reverse=True)
    return [{"score": f"{i}-{j}", "probability": round(float(p), 4)} for (i, j), p in flat[:top_n]]


def predict_match_poisson(features: dict):
    """Point d'entrée principal : renvoie toutes les probabilités dérivées du modèle de Poisson."""
    lambda_home, lambda_away = estimate_lambdas(features)
    matrix = score_matrix(lambda_home, lambda_away)

    p_home, p_draw, p_away = outcome_probs(matrix)
    p_over25, p_under25 = over_under_probs(matrix, line=2.5)
    p_btts_yes, p_btts_no = btts_probs(matrix)
    top_scores = most_likely_scores(matrix, top_n=3)

    return {
        "expected_home_goals": round(lambda_home, 2),
        "expected_away_goals": round(lambda_away, 2),
        "prob_home": round(float(p_home), 4),
        "prob_draw": round(float(p_draw), 4),
        "prob_away": round(float(p_away), 4),
        "prob_over25": round(float(p_over25), 4),
        "prob_under25": round(float(p_under25), 4),
        "prob_btts_yes": round(float(p_btts_yes), 4),
        "prob_btts_no": round(float(p_btts_no), 4),
        "top_scores": top_scores,
    }
