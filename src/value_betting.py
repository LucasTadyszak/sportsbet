"""
value_betting.py
------------------
Logique de value betting :
- probabilité implicite d'une cote bookmaker (avec retrait de la marge / overround)
- value score = (prob_modèle * cote) - 1, exprimé en %
- Kelly Criterion (fractionnaire, pour limiter le risque de ruine)
- simulation de bankroll / ROI

Rappel de la formule Kelly pour une cote décimale `b+1` (b = gain net par unité) :
    f* = (p * (b) - (1-p)) / b   où b = odds - 1
Ici on utilise un Kelly "fractionnaire" (ex: 25% ou 50% du Kelly plein) car le
Kelly plein est très agressif et suppose que p (la probabilité du modèle) est exacte,
ce qui n'est jamais garanti en pratique -> risque de sur-mise si le modèle est biaisé.
"""

import numpy as np


def implied_probability(odds: float) -> float:
    """Probabilité implicite brute d'une cote décimale (inclut la marge bookmaker)."""
    return 1.0 / odds


def remove_overround(odds_list: list[float]) -> list[float]:
    """
    Retire la marge bookmaker (overround) d'un ensemble de cotes mutuellement exclusives
    (ex: [odds_home, odds_draw, odds_away]) pour obtenir des probabilités qui somment à 1.
    """
    implied = [implied_probability(o) for o in odds_list]
    total = sum(implied)
    return [p / total for p in implied]


def value_score(model_prob: float, bookmaker_odds: float) -> float:
    """
    Value score en % : edge du modèle par rapport au marché.
    value = (p_modèle * cote - 1) * 100
    > 0  => value bet potentiel (le modèle pense que la cote est "trop généreuse")
    """
    return (model_prob * bookmaker_odds - 1) * 100


def kelly_fraction(model_prob: float, bookmaker_odds: float, fraction=0.25) -> float:
    """
    Kelly fractionnaire. Retourne la fraction du bankroll à miser (0 si pas de value).
    `fraction` = fraction du Kelly plein appliquée (0.25 = quart de Kelly, prudent).
    """
    b = bookmaker_odds - 1
    if b <= 0:
        return 0.0
    q = 1 - model_prob
    full_kelly = (model_prob * b - q) / b
    if full_kelly <= 0:
        return 0.0
    return float(np.clip(full_kelly * fraction, 0.0, 0.03))  # cap dur à 3% du bankroll par pari


def detect_value_bets(model_probs: dict, bookmaker_odds: dict, min_value_pct=5.0, kelly_frac=0.25):
    """
    Compare les probabilités du modèle aux cotes bookmaker sur tous les marchés disponibles
    et retourne la liste des value bets détectés (value >= min_value_pct).

    model_probs : ex. {"1": 0.52, "X": 0.24, "2": 0.24, "over25": 0.55, ...}
    bookmaker_odds : ex. {"1": 2.10, "X": 3.40, "2": 3.80, "over25": 1.85, ...}
    """
    results = []
    for market, prob in model_probs.items():
        odds = bookmaker_odds.get(market)
        if odds is None or prob is None:
            continue
        v = value_score(prob, odds)
        if v >= min_value_pct:
            results.append({
                "market": market,
                "model_prob": round(prob, 4),
                "bookmaker_odds": odds,
                "implied_prob": round(implied_probability(odds), 4),
                "value_pct": round(v, 2),
                "kelly_stake_pct": round(kelly_fraction(prob, odds, kelly_frac) * 100, 2),
            })
    results.sort(key=lambda x: x["value_pct"], reverse=True)
    return results


class BankrollSimulator:
    """Simule l'évolution d'une bankroll à partir d'une liste de paris (mise en % + résultat)."""

    def __init__(self, initial_bankroll=1000.0):
        self.bankroll = initial_bankroll
        self.initial_bankroll = initial_bankroll
        self.history = [{"bet_n": 0, "bankroll": initial_bankroll, "change": 0.0}]

    def place_bet(self, stake_pct: float, odds: float, won: bool):
        stake = self.bankroll * (stake_pct / 100)
        if won:
            change = stake * (odds - 1)
        else:
            change = -stake
        self.bankroll += change
        self.history.append({
            "bet_n": len(self.history),
            "bankroll": round(self.bankroll, 2),
            "change": round(change, 2),
        })
        return self.bankroll

    def roi(self) -> float:
        return round((self.bankroll - self.initial_bankroll) / self.initial_bankroll * 100, 2)

    def as_dataframe(self):
        import pandas as pd
        return pd.DataFrame(self.history)
