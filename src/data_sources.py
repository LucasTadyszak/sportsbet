"""
data_sources.py
-----------------
Connecteurs vers des sources de données RÉELLES, pour remplacer le générateur
de données d'exemple (generate_sample_data.py) en production.

Trois intégrations prêtes à l'emploi :
1. Football-Data.org  (gratuit, quota limité, très simple)
2. API-Football (RapidAPI / api-sports.io) (plus complet : xG, blessures, cotes)
3. The Odds API (the-odds-api.com) (cotes bookmaker en direct, multi-bookmakers)

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
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

from database import get_conn, init_db

load_dotenv()

FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4"
API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io"
ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4"


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


def _record_odds_api_usage(resp, endpoint):
    """
    The Odds API renvoie sa consommation de crédits dans les en-têtes de CHAQUE réponse
    (x-requests-used, x-requests-remaining, x-requests-last). On les archive à chaque appel
    pour avoir un petit historique de consommation, sans endpoint dédié côté fournisseur.
    """
    used = resp.headers.get("x-requests-used")
    remaining = resp.headers.get("x-requests-remaining")
    last_cost = resp.headers.get("x-requests-last")
    if used is None and remaining is None:
        return  # pas d'en-têtes de quota (ex: erreur réseau avant d'atteindre l'API)

    with get_conn() as conn:
        conn.execute(
            """INSERT INTO api_usage (provider, endpoint, requests_used, requests_remaining, requests_last_cost)
               VALUES (?,?,?,?,?)""",
            (
                "the-odds-api", endpoint,
                int(used) if used is not None else None,
                int(remaining) if remaining is not None else None,
                int(last_cost) if last_cost is not None else None,
            ),
        )


def list_odds_api_sports(api_key=None):
    """Liste les sports/compétitions disponibles sur The Odds API (pour trouver le bon `sport_key`).
    Ne compte pas dans le quota de crédits (endpoint gratuit côté The Odds API)."""
    api_key = api_key or os.environ.get("ODDS_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "Variable d'environnement ODDS_API_KEY manquante. "
            "Crée une clé gratuite sur https://the-odds-api.com/"
        )
    resp = requests.get(f"{ODDS_API_BASE_URL}/sports", params={"apiKey": api_key}, timeout=30)
    resp.raise_for_status()
    _record_odds_api_usage(resp, "/sports")
    return resp.json()


def get_odds_api_usage_history():
    """Historique de consommation de crédits The Odds API archivé localement (voir `_record_odds_api_usage`)."""
    with get_conn() as conn:
        return pd.read_sql_query(
            """SELECT captured_at, endpoint, requests_used, requests_remaining, requests_last_cost
               FROM api_usage WHERE provider = 'the-odds-api' ORDER BY captured_at ASC""",
            conn,
        )


def _average_odds_from_bookmakers(bookmakers, home_team, away_team, bookmaker_filter=None):
    """Moyenne les cotes 1X2 / totals 2.5 / BTTS sur tous les bookmakers renvoyés par un event."""
    h2h = {"home": [], "draw": [], "away": []}
    totals = {"over25": [], "under25": []}
    btts = {"btts_yes": [], "btts_no": []}

    for bm in bookmakers:
        if bookmaker_filter and bm.get("key") != bookmaker_filter:
            continue
        for market in bm.get("markets", []):
            key = market.get("key")
            outcomes = market.get("outcomes", [])
            if key == "h2h":
                for o in outcomes:
                    name, price = o.get("name"), o.get("price")
                    if name == home_team:
                        h2h["home"].append(price)
                    elif name == away_team:
                        h2h["away"].append(price)
                    elif name and name.lower() == "draw":
                        h2h["draw"].append(price)
            elif key == "totals":
                for o in outcomes:
                    if o.get("point") != 2.5:
                        continue
                    name, price = o.get("name"), o.get("price")
                    if name == "Over":
                        totals["over25"].append(price)
                    elif name == "Under":
                        totals["under25"].append(price)
            elif key == "btts":
                for o in outcomes:
                    name, price = o.get("name"), o.get("price")
                    if name == "Yes":
                        btts["btts_yes"].append(price)
                    elif name == "No":
                        btts["btts_no"].append(price)

    if not (h2h["home"] and h2h["draw"] and h2h["away"]):
        return None

    def avg(lst):
        return round(sum(lst) / len(lst), 3) if lst else None

    return {
        "home": avg(h2h["home"]), "draw": avg(h2h["draw"]), "away": avg(h2h["away"]),
        "over25": avg(totals["over25"]), "under25": avg(totals["under25"]),
        "btts_yes": avg(btts["btts_yes"]), "btts_no": avg(btts["btts_no"]),
    }


def fetch_odds_api(sport_key="soccer_fifa_world_cup", regions="eu", markets="h2h,totals,btts", bookmaker=None):
    """
    The Odds API (https://the-odds-api.com/) : cotes bookmaker en direct, moyennées sur
    les bookmakers de la région choisie. Nécessite une clé API (offre gratuite dispo).
    Crée les matchs à venir s'ils n'existent pas encore, et met à jour leurs cotes
    (bookmaker='the-odds-api') dans la table `odds` — ré-exécutable sans doublons.
    """
    api_key = os.environ.get("ODDS_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "Variable d'environnement ODDS_API_KEY manquante. "
            "Crée une clé gratuite sur https://the-odds-api.com/"
        )

    url = f"{ODDS_API_BASE_URL}/sports/{sport_key}/odds"
    market_list = [m.strip() for m in markets.split(",") if m.strip()]

    # Certains marchés (ex: btts) ne sont pas disponibles selon le sport/la région/le plan :
    # on les retire un par un plutôt que de faire planter tout l'import.
    while True:
        params = {"apiKey": api_key, "regions": regions, "markets": ",".join(market_list), "oddsFormat": "decimal"}
        resp = requests.get(url, params=params, timeout=30)
        if resp.status_code == 422:
            try:
                err = resp.json()
            except ValueError:
                err = {}
            if err.get("error_code") == "INVALID_MARKET":
                invalid = {m.strip() for m in err.get("message", "").rsplit(":", 1)[-1].split(",")}
                remaining = [m for m in market_list if m not in invalid]
                if remaining != market_list and remaining:
                    market_list = remaining
                    continue
        resp.raise_for_status()
        events = resp.json()
        break

    _record_odds_api_usage(resp, f"/sports/{sport_key}/odds")

    inserted, updated = 0, 0
    with get_conn() as conn:
        for event in events:
            home_team = event.get("home_team") or "TBD"
            away_team = event.get("away_team") or "TBD"
            commence_date = (event.get("commence_time") or "")[:10]

            odds = _average_odds_from_bookmakers(event.get("bookmakers", []), home_team, away_team, bookmaker)
            if odds is None:
                continue

            row = conn.execute(
                "SELECT match_id FROM matches WHERE home_team=? AND away_team=? AND date=?",
                (home_team, away_team, commence_date),
            ).fetchone()

            if row:
                match_id = row["match_id"]
            else:
                cur = conn.execute(
                    """INSERT INTO matches (date, league, home_team, away_team, status)
                       VALUES (?,?,?,?, 'scheduled')""",
                    (commence_date, event.get("sport_title", sport_key), home_team, away_team),
                )
                match_id = cur.lastrowid
                inserted += 1

            # On garde un historique : on n'ajoute une nouvelle ligne que si les cotes ont
            # bougé depuis la dernière capture (évite de spammer la table à chaque clic).
            last = conn.execute(
                """SELECT odds_home, odds_draw, odds_away, odds_over25, odds_under25,
                          odds_btts_yes, odds_btts_no
                   FROM odds WHERE match_id=? AND bookmaker='the-odds-api'
                   ORDER BY odds_id DESC LIMIT 1""",
                (match_id,),
            ).fetchone()

            if last and (
                last["odds_home"] == odds["home"] and last["odds_draw"] == odds["draw"]
                and last["odds_away"] == odds["away"] and last["odds_over25"] == odds["over25"]
                and last["odds_under25"] == odds["under25"] and last["odds_btts_yes"] == odds["btts_yes"]
                and last["odds_btts_no"] == odds["btts_no"]
            ):
                continue

            conn.execute(
                """INSERT INTO odds (match_id, bookmaker, odds_home, odds_draw, odds_away,
                   odds_over25, odds_under25, odds_btts_yes, odds_btts_no, captured_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    match_id, "the-odds-api",
                    odds["home"], odds["draw"], odds["away"],
                    odds["over25"], odds["under25"], odds["btts_yes"], odds["btts_no"],
                    datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            updated += 1

    print(f"The Odds API : {inserted} match(s) créé(s), {updated} cote(s) enregistrée(s) en historique ({sport_key}).")
    return inserted, updated


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Importer des données réelles de football.")
    parser.add_argument("--provider", choices=["football-data", "api-football", "odds-api"], required=True)
    parser.add_argument("--competition", default="PL", help="Code compétition (football-data.org)")
    parser.add_argument("--league-id", type=int, help="ID ligue (api-football)")
    parser.add_argument("--season", default=None, help="Saison (ex: 2024)")
    parser.add_argument("--sport-key", default="soccer_fifa_world_cup", help="Sport key (the-odds-api.com)")
    args = parser.parse_args()

    init_db()
    if args.provider == "football-data":
        fetch_football_data_org(competition_code=args.competition, season=args.season)
    elif args.provider == "odds-api":
        fetch_odds_api(sport_key=args.sport_key)
    else:
        if not args.league_id:
            raise SystemExit("--league-id est requis pour api-football")
        fetch_api_football(league_id=args.league_id, season=args.season)
