"""
data_sources.py
-----------------
Connecteurs vers des sources de données RÉELLES, pour remplacer le générateur
de données d'exemple (generate_sample_data.py) en production.

Deux intégrations prêtes à l'emploi :
1. Football-Data.org  (gratuit, quota limité, très simple)
2. API-Football (RapidAPI / api-sports.io) (plus complet : xG, blessures, cotes)

Utilisation :
    export FOOTBALL_DATA_API_KEY="ta_clé"
    python data_sources.py --provider football-data --competition PL

Les données récupérées sont insérées dans les mêmes tables SQLite que le
générateur de données d'exemple (matches, odds), donc tout le reste du
pipeline (features, poisson_model, ml_model, value_betting) fonctionne
sans aucune modification.
"""

import os
import argparse
import requests
from datetime import datetime

from database import get_conn, init_db

FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"
API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"


def extract_team_name(team_payload):
    """Extract a readable team name from various payload shapes."""
    if not team_payload:
        return "TBD"

    if isinstance(team_payload, dict):
        name = team_payload.get("name")
        if name:
            return name

        nested_team = team_payload.get("team")
        if isinstance(nested_team, dict):
            nested_name = nested_team.get("name")
            if nested_name:
                return nested_name

    return "TBD"


def extract_match_goals(match_payload):
    """Safely extract full-time goals from a match payload when present."""
    score_payload = match_payload.get("score") or {}
    if not isinstance(score_payload, dict):
        return None, None

    full_time = score_payload.get("fullTime") or {}
    if not isinstance(full_time, dict):
        return None, None

    return full_time.get("home"), full_time.get("away")


def fetch_football_data_org(competition_code="PL", season=None):
    """
    Football-Data.org : nécessite une clé API gratuite (https://www.football-data.org/).
    competition_code ex: PL (Premier League), FL1 (Ligue 1), SA (Serie A), BL1 (Bundesliga).
    """
    api_key = os.environ.get("FOOTBALL_DATA_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "Variable d'environnement FOOTBALL_DATA_API_KEY manquante. "
            "Crée une clé gratuite sur https://www.football-data.org/"
        )

    headers = {"X-Auth-Token": api_key}
    params = {"season": season} if season else {}
    url = f"{FOOTBALL_DATA_BASE_URL}/competitions/{competition_code}/matches"

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    inserted = 0
    with get_conn() as conn:
        for m in data.get("matches", []):
            status = "played" if str(m.get("status", "")).upper() == "FINISHED" else "scheduled"
            home_goals, away_goals = (None, None)
            if status == "played":
                home_goals, away_goals = extract_match_goals(m)

            conn.execute(
                """INSERT INTO matches (date, league, home_team, away_team,
                   home_goals, away_goals, home_xg, away_xg, status)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    (m.get("utcDate") or "")[:10],
                    (m.get("competition") or {}).get("name", "Unknown"),
                    extract_team_name(m.get("homeTeam")),
                    extract_team_name(m.get("awayTeam")),
                    home_goals, away_goals,
                    None, None,  # Football-Data.org (plan gratuit) n'inclut pas le xG
                    status,
                ),
            )
            inserted += 1

    print(f"{inserted} matchs importés depuis Football-Data.org ({competition_code}).")
    return inserted


def fetch_api_football(league_id, season, api_key=None):
    """
    API-Football (api-sports.io / RapidAPI) : plan payant recommandé pour le xG et les cotes,
    mais offre un essai gratuit limité. Fournit aussi les cotes bookmaker via /odds.
    """
    api_key = api_key or os.environ.get("API_FOOTBALL_KEY")
    if not api_key:
        raise EnvironmentError("Variable d'environnement API_FOOTBALL_KEY manquante.")

    headers = {"x-apisports-key": api_key}
    url = f"{API_FOOTBALL_BASE_URL}/fixtures"
    params = {"league": league_id, "season": season}

    resp = requests.get(url, headers=headers, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    inserted = 0
    with get_conn() as conn:
        for item in data.get("response", []):
            fixture = item.get("fixture") or {}
            teams = item.get("teams") or {}
            goals = item.get("goals") or {}
            status = "played" if str(fixture.get("status", {}).get("short", "")).upper() == "FT" else "scheduled"

            conn.execute(
                """INSERT INTO matches (date, league, home_team, away_team,
                   home_goals, away_goals, home_xg, away_xg, status)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    (fixture.get("date") or "")[:10],
                    (item.get("league") or {}).get("name", "Unknown"),
                    extract_team_name(teams.get("home")),
                    extract_team_name(teams.get("away")),
                    goals.get("home"), goals.get("away"),
                    None, None,  # récupérable via l'endpoint /fixtures/statistics
                    status,
                ),
            )
            inserted += 1

    print(f"{inserted} matchs importés depuis API-Football (league={league_id}, saison={season}).")
    return inserted


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importer des données réelles de football.")
    parser.add_argument("--provider", choices=["football-data", "api-football"], required=True)
    parser.add_argument("--competition", default="PL", help="Code compétition (football-data.org)")
    parser.add_argument("--league-id", type=int, help="ID ligue (api-football)")
    parser.add_argument("--season", default=None, help="Saison (ex: 2024)")
    args = parser.parse_args()

    init_db()
    if args.provider == "football-data":
        fetch_football_data_org(competition_code=args.competition, season=args.season)
    else:
        if not args.league_id:
            raise SystemExit("--league-id est requis pour api-football")
        fetch_api_football(league_id=args.league_id, season=args.season)
