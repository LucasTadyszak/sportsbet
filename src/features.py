"""
features.py
------------
Feature engineering pour l'analyse de match :
- forme récente (moyenne mobile sur les N derniers matchs)
- performance domicile / extérieur
- confrontations directes (H2H)
- xG pour / contre
- variance de performance (régularité de l'équipe)
"""

import numpy as np
import pandas as pd
from database import get_conn

DEFAULT_XG = 1.35


def load_matches_df(status="played"):
    with get_conn() as conn:
        df = pd.read_sql_query(
            "SELECT * FROM matches WHERE status = ? ORDER BY date ASC",
            conn, params=(status,),
        )
    df["date"] = pd.to_datetime(df["date"])
    df["home_xg"] = df["home_xg"].fillna(DEFAULT_XG)
    df["away_xg"] = df["away_xg"].fillna(DEFAULT_XG)
    return df


def team_match_history(df, team, before_date=None):
    """Retourne l'historique d'une équipe (dom + ext), trié par date, avant une date donnée."""
    mask = (df["home_team"] == team) | (df["away_team"] == team)
    hist = df[mask].copy()
    if before_date is not None:
        hist = hist[hist["date"] < before_date]
    hist = hist.sort_values("date")
    return hist


def _match_outcome_for_team(row, team):
    """Retourne (buts_pour, buts_contre, xg_pour, xg_contre, points, is_home)."""
    if row["home_team"] == team:
        gf, ga = row["home_goals"], row["away_goals"]
        xgf, xga = row["home_xg"], row["away_xg"]
        is_home = 1
    else:
        gf, ga = row["away_goals"], row["home_goals"]
        xgf, xga = row["away_xg"], row["home_xg"]
        is_home = 0

    if gf > ga:
        pts = 3
    elif gf == ga:
        pts = 1
    else:
        pts = 0
    return gf, ga, xgf, xga, pts, is_home


def rolling_form(df, team, n=5, before_date=None):
    """
    Moyenne mobile sur les n derniers matchs :
    - forme_points (0-3 moyenne), buts marqués/encaissés moyens, xG moyens, variance des points.
    """
    hist = team_match_history(df, team, before_date)
    if hist.empty:
        return {
            "form_points_avg": 1.5, "goals_for_avg": 1.2, "goals_against_avg": 1.2,
            "xg_for_avg": 1.2, "xg_against_avg": 1.2, "form_variance": 0.5, "n_matches": 0,
        }

    last_n = hist.tail(n)
    stats = last_n.apply(lambda r: _match_outcome_for_team(r, team), axis=1, result_type="expand")
    stats.columns = ["gf", "ga", "xgf", "xga", "pts", "is_home"]

    return {
        "form_points_avg": float(stats["pts"].mean()),
        "goals_for_avg": float(stats["gf"].mean()),
        "goals_against_avg": float(stats["ga"].mean()),
        "xg_for_avg": float(stats["xgf"].mean()),
        "xg_against_avg": float(stats["xga"].mean()),
        "form_variance": float(stats["pts"].std(ddof=0)) if len(stats) > 1 else 0.0,
        "n_matches": int(len(stats)),
    }


def home_away_split(df, team, before_date=None, n=10):
    """Performance spécifique à domicile vs à l'extérieur sur les n derniers matchs de chaque type."""
    hist = team_match_history(df, team, before_date)
    home_hist = hist[hist["home_team"] == team].tail(n)
    away_hist = hist[hist["away_team"] == team].tail(n)

    def summarize(sub, is_home):
        if sub.empty:
            return {"points_avg": 1.5, "goals_for_avg": 1.2, "goals_against_avg": 1.2}
        if is_home:
            gf, ga = sub["home_goals"], sub["away_goals"]
        else:
            gf, ga = sub["away_goals"], sub["home_goals"]
        pts = np.where(gf > ga, 3, np.where(gf == ga, 1, 0))
        return {
            "points_avg": float(pts.mean()),
            "goals_for_avg": float(gf.mean()),
            "goals_against_avg": float(ga.mean()),
        }

    return {
        "home": summarize(home_hist, True),
        "away": summarize(away_hist, False),
    }


def head_to_head(df, team_a, team_b, before_date=None, n=5):
    """Confrontations directes récentes entre deux équipes."""
    mask = (
        ((df["home_team"] == team_a) & (df["away_team"] == team_b)) |
        ((df["home_team"] == team_b) & (df["away_team"] == team_a))
    )
    hist = df[mask].sort_values("date")
    if before_date is not None:
        hist = hist[hist["date"] < before_date]
    hist = hist.tail(n)

    if hist.empty:
        return {"n_matches": 0, "team_a_wins": 0, "draws": 0, "team_b_wins": 0,
                "avg_goals_a": 1.2, "avg_goals_b": 1.2}

    a_wins = d = b_wins = 0
    goals_a, goals_b = [], []
    for _, row in hist.iterrows():
        if row["home_team"] == team_a:
            ga, gb = row["home_goals"], row["away_goals"]
        else:
            ga, gb = row["away_goals"], row["home_goals"]
        goals_a.append(ga)
        goals_b.append(gb)
        if ga > gb:
            a_wins += 1
        elif ga == gb:
            d += 1
        else:
            b_wins += 1

    return {
        "n_matches": len(hist), "team_a_wins": a_wins, "draws": d, "team_b_wins": b_wins,
        "avg_goals_a": float(np.mean(goals_a)), "avg_goals_b": float(np.mean(goals_b)),
    }


def build_match_features(df, home_team, away_team, match_date=None):
    """Assemble toutes les features pour un match donné (utilisé en prédiction et en training)."""
    form_h = rolling_form(df, home_team, n=5, before_date=match_date)
    form_a = rolling_form(df, away_team, n=5, before_date=match_date)
    ha_h = home_away_split(df, home_team, before_date=match_date)
    ha_a = home_away_split(df, away_team, before_date=match_date)
    h2h = head_to_head(df, home_team, away_team, before_date=match_date)

    return {
        "home_form_points": form_h["form_points_avg"],
        "away_form_points": form_a["form_points_avg"],
        "home_goals_for_avg": form_h["goals_for_avg"],
        "home_goals_against_avg": form_h["goals_against_avg"],
        "away_goals_for_avg": form_a["goals_for_avg"],
        "away_goals_against_avg": form_a["goals_against_avg"],
        "home_xg_for_avg": form_h["xg_for_avg"],
        "home_xg_against_avg": form_h["xg_against_avg"],
        "away_xg_for_avg": form_a["xg_for_avg"],
        "away_xg_against_avg": form_a["xg_against_avg"],
        "home_form_variance": form_h["form_variance"],
        "away_form_variance": form_a["form_variance"],
        "home_at_home_points": ha_h["home"]["points_avg"],
        "away_at_away_points": ha_a["away"]["points_avg"],
        "h2h_home_win_rate": (h2h["team_a_wins"] / h2h["n_matches"]) if h2h["n_matches"] else 0.4,
        "h2h_avg_goals_home": h2h["avg_goals_a"],
        "h2h_avg_goals_away": h2h["avg_goals_b"],
        "home_matches_played": form_h["n_matches"],
        "away_matches_played": form_a["n_matches"],
    }
