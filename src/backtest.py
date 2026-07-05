"""
backtest.py
------------
Backtest la stratégie complète (modèle + value betting) sur l'historique :
pour chaque match joué, on reconstruit les features "avant match", on prédit,
on simule des cotes de marché bruitées (proxy en l'absence d'historique de cotes réelles),
on détecte les value bets, et on simule la bankroll pari après pari.

Objectif : vérifier si la stratégie de value betting est profitable dans la durée
(ROI, drawdown, taux de réussite) avant de la déployer sur des matchs réels.
"""

import numpy as np
import pandas as pd

from features import load_matches_df, build_match_features
from poisson_model import predict_match_poisson
from value_betting import detect_value_bets, BankrollSimulator, value_score

RNG = np.random.default_rng(7)


def simulate_market_odds(true_probs: dict, margin=0.06, noise_std=0.02):
    """
    Simule des cotes de marché bruitées à partir des probabilités Poisson (proxy backtest).

    LIMITE IMPORTANTE : en l'absence d'historique de cotes réelles, ce backtest compare
    le modèle à une version BRUITÉE DE SES PROPRES PROBABILITÉS. Sélectionner à chaque match
    le "meilleur" value bet parmi plusieurs marchés introduit un biais de sélection
    (proche du "winner's curse") qui surestime mécaniquement la rentabilité. Les résultats
    de ce backtest ne doivent donc être interprétés que comme une démonstration de la
    MÉTHODOLOGIE (pipeline détection + Kelly + suivi bankroll), PAS comme une preuve de
    rentabilité réelle. Pour un backtest fiable, remplacer `simulate_market_odds` par un
    historique réel de cotes bookmaker (voir data_sources.py / odds table)."""
    keys = list(true_probs.keys())
    noise = RNG.normal(1.0, noise_std, size=len(keys))
    noisy = {k: max(0.02, true_probs[k] * n) for k, n in zip(keys, noise)}
    total = sum(noisy.values())
    normed = {k: v / total for k, v in noisy.items()}
    return {k: round((1 + margin) / v, 2) for k, v in normed.items()}


def run_backtest(min_matches_played=5, min_value_pct=5.0, kelly_frac=0.25, initial_bankroll=1000.0):
    df = load_matches_df(status="played")
    sim = BankrollSimulator(initial_bankroll=initial_bankroll)

    log = []
    for _, row in df.iterrows():
        feats = build_match_features(df, row["home_team"], row["away_team"], match_date=row["date"])
        if feats["home_matches_played"] < min_matches_played or feats["away_matches_played"] < min_matches_played:
            continue

        pred = predict_match_poisson(feats)
        model_probs = {
            "1": pred["prob_home"], "X": pred["prob_draw"], "2": pred["prob_away"],
            "over25": pred["prob_over25"], "under25": pred["prob_under25"],
            "btts_yes": pred["prob_btts_yes"], "btts_no": pred["prob_btts_no"],
        }
        market_odds = simulate_market_odds(model_probs)
        value_bets = detect_value_bets(model_probs, market_odds, min_value_pct, kelly_frac)

        if not value_bets:
            continue

        best = value_bets[0]  # on ne prend qu'un pari (le meilleur value) par match, discipline de bankroll
        outcome = _actual_outcome(row)
        won = _market_won(best["market"], outcome, row)

        sim.place_bet(best["kelly_stake_pct"], best["bookmaker_odds"], won)
        log.append({
            "date": row["date"], "home_team": row["home_team"], "away_team": row["away_team"],
            "market": best["market"], "value_pct": best["value_pct"],
            "stake_pct": best["kelly_stake_pct"], "odds": best["bookmaker_odds"],
            "won": won, "bankroll_after": sim.bankroll,
        })

    log_df = pd.DataFrame(log)
    results = {
        "n_bets": len(log_df),
        "n_wins": int(log_df["won"].sum()) if not log_df.empty else 0,
        "win_rate_pct": round(float(log_df["won"].mean() * 100), 2) if not log_df.empty else 0.0,
        "final_bankroll": round(sim.bankroll, 2),
        "roi_pct": sim.roi(),
        "max_drawdown_pct": _max_drawdown(sim.as_dataframe()["bankroll"]) if not log_df.empty else 0.0,
    }
    return results, log_df, sim.as_dataframe()


def _actual_outcome(row):
    if row["home_goals"] > row["away_goals"]:
        return "1"
    elif row["home_goals"] == row["away_goals"]:
        return "X"
    return "2"


def _market_won(market, outcome_1x2, row):
    total_goals = row["home_goals"] + row["away_goals"]
    both_scored = row["home_goals"] > 0 and row["away_goals"] > 0
    if market in ("1", "X", "2"):
        return market == outcome_1x2
    if market == "over25":
        return total_goals > 2.5
    if market == "under25":
        return total_goals < 2.5
    if market == "btts_yes":
        return both_scored
    if market == "btts_no":
        return not both_scored
    return False


def _max_drawdown(bankroll_series):
    peak = bankroll_series.cummax()
    drawdown = (bankroll_series - peak) / peak * 100
    return round(float(drawdown.min()), 2)


if __name__ == "__main__":
    results, log_df, bankroll_df = run_backtest()
    print("Résultats du backtest :")
    for k, v in results.items():
        print(f"  {k}: {v}")
