"""
generate_sample_data.py
------------------------
Génère un jeu de données réaliste (championnat fictif de 16 équipes,
2 saisons jouées + 1 journée à venir avec cotes bookmaker) pour permettre
de tester tout le pipeline sans dépendre d'une API externe.

En production, ce module serait remplacé par un connecteur vers
API-Football / Football-Data.org (voir data_sources.py).
"""

import math
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from database import get_conn, init_db, reset_db

RNG = np.random.default_rng(42)

TEAMS = [
    ("Olympia FC", 1.55, 1.05),   # (nom, force_attaque, force_defense) - >1 = plus fort que la moyenne
    ("Real Aurora", 1.48, 1.10),
    ("Atletico Verde", 1.20, 1.15),
    ("FC Nordvik", 1.15, 0.95),
    ("Stella Rossa", 1.10, 1.00),
    ("Union Bastia", 1.05, 0.90),
    ("Dynamo Lys", 1.00, 1.00),
    ("Sporting Kessel", 0.98, 0.98),
    ("AC Fortuna", 0.95, 0.92),
    ("Celta Nova", 0.90, 0.88),
    ("Panthera SC", 0.88, 0.85),
    ("FC Meridian", 0.85, 0.82),
    ("Vulcan United", 0.80, 0.80),
    ("Grenat Torino", 0.75, 0.78),
    ("AS Solaris", 0.70, 0.75),
    ("Bruma City", 0.65, 0.70),
]

LEAGUE = "Ligue Fictive A"
AVG_GOALS = 1.35  # moyenne buts/équipe/match dans un championnat de foot réaliste
HOME_ADVANTAGE = 1.18


def team_strength(name):
    for n, atk, dfc in TEAMS:
        if n == name:
            return atk, dfc
    raise KeyError(name)


def simulate_match(home, away, date):
    """Simule un score avec un modèle de Poisson bivarié simplifié (xG puis buts réels)."""
    atk_h, def_h = team_strength(home)
    atk_a, def_a = team_strength(away)

    lambda_home = AVG_GOALS * atk_h * def_a * HOME_ADVANTAGE
    lambda_away = AVG_GOALS * atk_a * def_h

    # xG = intensité "vraie" + bruit de performance du jour
    xg_home = max(0.1, RNG.normal(lambda_home, 0.25))
    xg_away = max(0.1, RNG.normal(lambda_away, 0.25))

    goals_home = RNG.poisson(lambda_home)
    goals_away = RNG.poisson(lambda_away)

    return {
        "date": date.strftime("%Y-%m-%d"),
        "league": LEAGUE,
        "home_team": home,
        "away_team": away,
        "home_goals": int(goals_home),
        "away_goals": int(goals_away),
        "home_xg": round(float(xg_home), 2),
        "away_xg": round(float(xg_away), 2),
        "status": "played",
    }


def round_robin(teams):
    """Génère un calendrier aller-retour simple (chaque équipe joue chaque autre 2 fois)."""
    fixtures = []
    n = len(teams)
    for i in range(n):
        for j in range(n):
            if i != j:
                fixtures.append((teams[i], teams[j]))
    return fixtures


def bookmaker_odds_from_true_prob(p_home, p_draw, p_away, margin=0.06):
    """
    Simule des cotes de bookmaker à partir de probabilités "vraies" en ajoutant
    une marge (overround) et un léger bruit indépendant par issue,
    ce qui crée artificiellement quelques divergences modèle/marché (=value bets).
    """
    noise = RNG.normal(1.0, 0.05, size=3)
    raw = np.array([p_home, p_draw, p_away]) * noise
    raw = raw / raw.sum()
    overround = 1 + margin
    odds = (overround / raw)
    return [round(float(o), 2) for o in odds]


def poisson_1x2_probs(lh, la, max_goals=10):
    from scipy.stats import poisson
    ph = poisson.pmf(np.arange(max_goals), lh)
    pa = poisson.pmf(np.arange(max_goals), la)
    matrix = np.outer(ph, pa)
    p_home = np.tril(matrix, -1).sum()
    p_draw = np.trace(matrix)
    p_away = np.triu(matrix, 1).sum()
    return p_home, p_draw, p_away


def main():
    reset_db()
    team_names = [t[0] for t in TEAMS]

    with get_conn() as conn:
        for name in team_names:
            conn.execute(
                "INSERT OR IGNORE INTO teams (name, league) VALUES (?, ?)",
                (name, LEAGUE),
            )

    # ---- Historique : 2 saisons jouées (aller-retour) ----
    fixtures = round_robin(team_names)
    RNG.shuffle(fixtures)
    start_date = datetime.today() - timedelta(days=365 * 2)

    rows = []
    current_date = start_date
    for season in range(2):
        season_fixtures = fixtures.copy()
        RNG.shuffle(season_fixtures)
        for k, (home, away) in enumerate(season_fixtures):
            current_date += timedelta(days=2)
            rows.append(simulate_match(home, away, current_date))

    with get_conn() as conn:
        for r in rows:
            conn.execute(
                """INSERT INTO matches (date, league, home_team, away_team,
                   home_goals, away_goals, home_xg, away_xg, status)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (r["date"], r["league"], r["home_team"], r["away_team"],
                 r["home_goals"], r["away_goals"], r["home_xg"], r["away_xg"], r["status"]),
            )

    # ---- Journée à venir : 8 matchs "scheduled" avec cotes bookmaker ----
    upcoming_date = datetime.today() + timedelta(days=2)
    shuffled = team_names.copy()
    RNG.shuffle(shuffled)
    upcoming_pairs = [(shuffled[i], shuffled[i + 1]) for i in range(0, len(shuffled), 2)]

    with get_conn() as conn:
        for home, away in upcoming_pairs:
            atk_h, def_h = team_strength(home)
            atk_a, def_a = team_strength(away)
            lh = AVG_GOALS * atk_h * def_a * HOME_ADVANTAGE
            la = AVG_GOALS * atk_a * def_h
            p_home, p_draw, p_away = poisson_1x2_probs(lh, la)

            cur = conn.execute(
                """INSERT INTO matches (date, league, home_team, away_team, status)
                   VALUES (?,?,?,?,?)""",
                (upcoming_date.strftime("%Y-%m-%d"), LEAGUE, home, away, "scheduled"),
            )
            match_id = cur.lastrowid

            odds_h, odds_d, odds_a = bookmaker_odds_from_true_prob(p_home, p_draw, p_away)

            # over/under & btts approximatifs pour la démo
            total_goals_exp = lh + la
            p_over25 = 1 - np.exp(-total_goals_exp) * sum(
                (total_goals_exp ** k) / math.factorial(k) for k in range(3)
            )
            p_over25 = float(np.clip(p_over25, 0.05, 0.95))
            p_under25 = 1 - p_over25
            odds_over25 = round((1 + margin_random()) / p_over25, 2)
            odds_under25 = round((1 + margin_random()) / p_under25, 2)

            p_btts = float(np.clip(1 - np.exp(-lh) - np.exp(-la) + np.exp(-(lh + la)), 0.05, 0.95))
            odds_btts_yes = round((1 + margin_random()) / p_btts, 2)
            odds_btts_no = round((1 + margin_random()) / (1 - p_btts), 2)

            conn.execute(
                """INSERT INTO odds (match_id, bookmaker, odds_home, odds_draw, odds_away,
                   odds_over25, odds_under25, odds_btts_yes, odds_btts_no)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (match_id, "BookmakerDemo", odds_h, odds_d, odds_a,
                 odds_over25, odds_under25, odds_btts_yes, odds_btts_no),
            )

    print(f"{len(rows)} matchs historiques + {len(upcoming_pairs)} matchs à venir insérés.")


def margin_random():
    return RNG.uniform(0.04, 0.08)


if __name__ == "__main__":
    main()
