"""
database.py
------------
Couche d'accès à la base SQLite du projet.
Stocke : équipes, matchs (historique + à venir), cotes bookmakers,
prédictions du modèle, value bets détectés, et historique bankroll.
"""

import sqlite3
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "sportsbet.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
    team_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    league TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
    match_id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    league TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_goals INTEGER,          -- NULL si le match n'est pas encore joué
    away_goals INTEGER,
    home_xg REAL,
    away_xg REAL,
    status TEXT DEFAULT 'scheduled'   -- 'scheduled' | 'played'
);

CREATE TABLE IF NOT EXISTS odds (
    odds_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    bookmaker TEXT NOT NULL,
    odds_home REAL NOT NULL,
    odds_draw REAL NOT NULL,
    odds_away REAL NOT NULL,
    odds_over25 REAL,
    odds_under25 REAL,
    odds_btts_yes REAL,
    odds_btts_no REAL,
    captured_at TEXT DEFAULT CURRENT_TIMESTAMP,  -- horodatage de la capture (historique de cotes)
    FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE TABLE IF NOT EXISTS predictions (
    pred_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    model_name TEXT NOT NULL,
    prob_home REAL,
    prob_draw REAL,
    prob_away REAL,
    prob_over25 REAL,
    prob_under25 REAL,
    prob_btts_yes REAL,
    prob_btts_no REAL,
    expected_home_goals REAL,
    expected_away_goals REAL,
    confidence REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE TABLE IF NOT EXISTS value_bets (
    vb_id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    market TEXT NOT NULL,        -- '1', 'X', '2', 'over25', 'under25', 'btts_yes', 'btts_no'
    model_prob REAL NOT NULL,
    bookmaker_odds REAL NOT NULL,
    implied_prob REAL NOT NULL,
    value_pct REAL NOT NULL,     -- (model_prob * odds - 1) * 100
    kelly_fraction REAL,
    stake_pct REAL,
    status TEXT DEFAULT 'open',  -- 'open' | 'won' | 'lost' | 'void'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(match_id) REFERENCES matches(match_id)
);

CREATE TABLE IF NOT EXISTS bankroll_history (
    bh_id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    bankroll REAL NOT NULL,
    change REAL,
    reason TEXT
);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _migrate(conn):
    """Applique les évolutions de schéma sur une base déjà créée avec une version antérieure."""
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(odds)")}
    if "captured_at" not in columns:
        # SQLite interdit un DEFAULT non constant (CURRENT_TIMESTAMP) sur ALTER TABLE ADD COLUMN :
        # on ajoute la colonne sans défaut puis on backfille les lignes existantes.
        conn.execute("ALTER TABLE odds ADD COLUMN captured_at TEXT")
        conn.execute("UPDATE odds SET captured_at = CURRENT_TIMESTAMP WHERE captured_at IS NULL")


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)


def reset_db():
    if DB_PATH.exists():
        DB_PATH.unlink()
    init_db()


if __name__ == "__main__":
    init_db()
    print(f"Base initialisée -> {DB_PATH}")
