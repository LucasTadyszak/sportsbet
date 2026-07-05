"""
api.py
-------
API REST (FastAPI) exposant le moteur d'analyse pour une intégration externe
(front React, app mobile, cron job d'alertes, etc.)

Lancer avec :  uvicorn api:app --reload --port 8000
Documentation interactive : http://localhost:8000/docs
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

from database import get_conn, init_db, DB_PATH
from features import load_matches_df, build_match_features
from poisson_model import predict_match_poisson
from value_betting import detect_value_bets

app = FastAPI(
    title="SportsBet Analytics API",
    description="API d'analyse de matchs, prédiction 1X2/over-under/BTTS et détection de value bets.",
    version="1.0.0",
)

if not DB_PATH.exists():
    init_db()


class OddsInput(BaseModel):
    market_1: Optional[float] = None
    market_X: Optional[float] = None
    market_2: Optional[float] = None
    over25: Optional[float] = None
    under25: Optional[float] = None
    btts_yes: Optional[float] = None
    btts_no: Optional[float] = None


@app.get("/")
def root():
    return {"status": "ok", "message": "SportsBet Analytics API — voir /docs"}


@app.get("/teams")
def list_teams():
    with get_conn() as conn:
        rows = conn.execute("SELECT name, league FROM teams ORDER BY name").fetchall()
    return [dict(r) for r in rows]


@app.get("/matches/upcoming")
def upcoming_matches():
    with get_conn() as conn:
        rows = conn.execute(
            """SELECT m.match_id, m.date, m.home_team, m.away_team,
                      o.odds_home, o.odds_draw, o.odds_away
               FROM matches m LEFT JOIN odds o ON m.match_id = o.match_id
               WHERE m.status = 'scheduled' ORDER BY m.date ASC"""
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/predict")
def predict(home_team: str = Query(...), away_team: str = Query(...)):
    df = load_matches_df(status="played")
    if home_team not in df["home_team"].values and home_team not in df["away_team"].values:
        raise HTTPException(status_code=404, detail=f"Équipe inconnue : {home_team}")
    if away_team not in df["home_team"].values and away_team not in df["away_team"].values:
        raise HTTPException(status_code=404, detail=f"Équipe inconnue : {away_team}")

    feats = build_match_features(df, home_team, away_team)
    pred = predict_match_poisson(feats)
    return {"home_team": home_team, "away_team": away_team, "features": feats, "prediction": pred}


@app.post("/value-bets")
def value_bets(home_team: str, away_team: str, odds: OddsInput, min_value_pct: float = 5.0, kelly_frac: float = 0.25):
    df = load_matches_df(status="played")
    feats = build_match_features(df, home_team, away_team)
    pred = predict_match_poisson(feats)

    model_probs = {
        "1": pred["prob_home"], "X": pred["prob_draw"], "2": pred["prob_away"],
        "over25": pred["prob_over25"], "under25": pred["prob_under25"],
        "btts_yes": pred["prob_btts_yes"], "btts_no": pred["prob_btts_no"],
    }
    bookmaker_odds = {
        "1": odds.market_1, "X": odds.market_X, "2": odds.market_2,
        "over25": odds.over25, "under25": odds.under25,
        "btts_yes": odds.btts_yes, "btts_no": odds.btts_no,
    }
    bookmaker_odds = {k: v for k, v in bookmaker_odds.items() if v is not None}

    results = detect_value_bets(model_probs, bookmaker_odds, min_value_pct, kelly_frac)
    return {"home_team": home_team, "away_team": away_team, "value_bets": results}
