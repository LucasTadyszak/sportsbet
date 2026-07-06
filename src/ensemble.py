"""
ensemble.py
------------
Combinaison des sources de probabilités pour une prédiction finale plus robuste :

1. Poisson (Dixon-Coles) : le modèle statistique de base, disponible sur tous les marchés.
2. ML (gradient boosting) : sur le 1X2 uniquement, quand les modèles sont entraînés.
3. Marché (cotes bookmaker dé-margées) : les cotes agrègent l'information de milliers
   de parieurs et de modèles — les ignorer totalement rend le modèle sur-confiant et
   génère de faux value bets. On "ancre" donc les probabilités du modèle vers celles
   du marché avec un poids réglable (0 = modèle pur, 1 = marché pur).

Les marchés sont traités par groupes mutuellement exclusifs (1X2, over/under, BTTS) :
chaque groupe est renormalisé séparément pour sommer à 1.
"""

MARKET_GROUPS = [
    ("1", "X", "2"),
    ("over25", "under25"),
    ("btts_yes", "btts_no"),
]


def _normalize_group(probs: dict, keys) -> dict:
    total = sum(probs[k] for k in keys)
    if total <= 0:
        return {k: 1.0 / len(keys) for k in keys}
    return {k: probs[k] / total for k in keys}


def market_implied_probs(bookmaker_odds: dict) -> dict:
    """
    Probabilités implicites du marché, marge bookmaker retirée groupe par groupe.
    Ne retourne que les groupes dont toutes les cotes sont disponibles.
    """
    result = {}
    for group in MARKET_GROUPS:
        odds = [bookmaker_odds.get(k) for k in group]
        # o != o détecte les NaN (cotes manquantes venant d'un DataFrame pandas)
        if any(o is None or o != o or o <= 1.0 for o in odds):
            continue
        implied = [1.0 / o for o in odds]
        total = sum(implied)
        result.update({k: p / total for k, p in zip(group, implied)})
    return result


def blend_probabilities(poisson_probs: dict, ml_probs: dict = None, bookmaker_odds: dict = None,
                        w_ml=0.35, w_market=0.30) -> dict:
    """
    Probabilités finales de l'ensemble.

    - `poisson_probs` : dict complet {"1","X","2","over25","under25","btts_yes","btts_no"}
    - `ml_probs` : optionnel, {"1": p, "X": p, "2": p} (le ML ne couvre que le 1X2)
    - `bookmaker_odds` : optionnel, cotes décimales par marché (mêmes clés)
    - `w_ml` : poids du ML dans le mélange modèle (1X2 uniquement)
    - `w_market` : poids de l'ancrage marché appliqué à tous les groupes disponibles

    Chaque groupe est renormalisé après mélange.
    """
    blended = dict(poisson_probs)

    if ml_probs:
        for k in ("1", "X", "2"):
            if ml_probs.get(k) is not None:
                blended[k] = (1 - w_ml) * blended[k] + w_ml * ml_probs[k]

    market = market_implied_probs(bookmaker_odds) if bookmaker_odds else {}
    for k, p_market in market.items():
        blended[k] = (1 - w_market) * blended[k] + w_market * p_market

    for group in MARKET_GROUPS:
        keys = [k for k in group if k in blended and blended[k] is not None]
        if len(keys) == len(group):
            blended.update(_normalize_group(blended, keys))
    return blended


def data_reliability(features: dict, full_sample=8) -> float:
    """
    Score 0-1 de fiabilité des features : proportion de l'historique idéal disponible
    pour l'équipe la moins documentée. Sert à réduire la mise Kelly quand le modèle
    prédit sur peu de données (début de saison, équipe nouvellement importée).
    """
    n_min = min(features.get("home_matches_played", 0), features.get("away_matches_played", 0))
    return max(0.0, min(1.0, n_min / full_sample))
