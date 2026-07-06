"""
app.py
-------
Dashboard Streamlit — Sports Analytics & Value Betting Tool.

Lancer avec :  streamlit run app.py
"""

import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go
from dotenv import load_dotenv

load_dotenv()

from database import get_conn, init_db, DB_PATH
from features import load_matches_df, build_match_features
from poisson_model import predict_match_poisson
from value_betting import detect_value_bets
from ensemble import blend_probabilities, market_implied_probs, data_reliability
from backtest import run_backtest
from data_sources import FetchThrottled, minutes_since_last_fetch

st.set_page_config(page_title="SportsBet Analytics", layout="wide", page_icon="⚽")

# ---------------------------------------------------------------------------
# Setup initial — init_db est idempotent (CREATE IF NOT EXISTS + migrations)
# ---------------------------------------------------------------------------
first_run = not DB_PATH.exists()
init_db()
if first_run:
    st.warning("Base de données vide. Importe des données réelles depuis la barre latérale.")

try:
    ml_available = (Path(__file__).resolve().parent / "models" / "gbc.joblib").exists()
except Exception:
    ml_available = False

# ---------------------------------------------------------------------------
# Identité visuelle — style bookmaker (inspiration Winamax / Betclic)
# ---------------------------------------------------------------------------
C_HOME, C_DRAW, C_AWAY = "#3d8bfd", "#8b93a3", "#ff5860"
C_ACCENT, C_GOLD = "#e7282d", "#f4c430"

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow:ital,wght@0,500;0,600;0,700;0,800;1,800&display=swap');

html, body, [data-testid="stAppViewContainer"] * { font-family: 'Barlow', sans-serif; }
/* Ne pas écraser la police des icônes Material de Streamlit (flèches d'expander, etc.) */
[data-testid="stIconMaterial"] { font-family: 'Material Symbols Rounded' !important; }

/* ------- Barre de marque rouge (façon topbar bookmaker) ------- */
.topbar {
    display: flex; align-items: center; justify-content: space-between;
    background: linear-gradient(90deg, #b3151b 0%, #e7282d 60%, #f04348 100%);
    border-radius: 10px; padding: 14px 22px; margin-bottom: 10px;
    box-shadow: 0 4px 18px rgba(231, 40, 45, 0.25);
}
.topbar .brand { font-size: 1.7rem; font-weight: 800; font-style: italic; color: #fff; letter-spacing: 0.5px; text-transform: uppercase; }
.topbar .brand span { color: #ffd75e; }
.topbar .tagline { color: rgba(255,255,255,.85); font-size: .85rem; font-weight: 600; text-align: right; }

/* ------- Boutons de cotes (façon grille 1 N 2) ------- */
.odds-row { display: flex; gap: 8px; margin: 4px 0 10px 0; }
.odds-btn {
    flex: 1; min-width: 70px; display: flex; flex-direction: column; align-items: center;
    background: #262b37; border: 1px solid #363d4d; border-radius: 6px;
    padding: 7px 6px 6px 6px; transition: background .15s, border-color .15s;
}
.odds-btn:hover { background: #2f3543; border-color: #4a5266; }
.odds-btn .lbl {
    font-size: .7rem; font-weight: 700; color: #9aa3b2; text-transform: uppercase;
    letter-spacing: .3px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.odds-btn .val { font-size: 1.18rem; font-weight: 800; color: #fff; line-height: 1.25; }
.odds-btn.boost {
    border-color: #f4c430; background: linear-gradient(180deg, #38301b 0%, #262b37 90%);
    box-shadow: 0 0 10px rgba(244, 196, 48, 0.25);
}
.odds-btn.boost .val { color: #f4c430; }
.odds-btn.boost .lbl::after { content: " ⚡"; }
.odds-btn.off { opacity: .35; }

/* ------- Carte match (page match) ------- */
.match-hero {
    background: linear-gradient(180deg, #232837 0%, #1e222c 100%);
    border: 1px solid #2c3242; border-radius: 12px; padding: 18px 22px 12px 22px; margin-bottom: 12px;
}
.match-hero .kickoff { color: #e7282d; font-weight: 700; font-size: .82rem; text-transform: uppercase; letter-spacing: .8px; }
.match-hero .teams { font-size: 1.55rem; font-weight: 800; color: #fff; margin: 2px 0 10px 0; }
.match-hero .teams .vs { color: #6b7280; font-weight: 600; font-size: 1.05rem; font-style: italic; }
.market-title { font-size: .74rem; font-weight: 700; color: #9aa3b2; text-transform: uppercase; letter-spacing: .6px; margin: 10px 0 4px 0; }

/* ------- Liste de matchs (façon page d'accueil bookmaker) ------- */
.m-list { border: 1px solid #2c3242; border-radius: 10px; overflow: hidden; }
.m-head {
    background: #262b37; color: #fff; font-weight: 700; font-size: .85rem;
    text-transform: uppercase; letter-spacing: .5px; padding: 9px 14px;
    border-bottom: 2px solid #e7282d;
}
.m-row {
    display: flex; align-items: center; justify-content: space-between; gap: 14px;
    background: #1e222c; border-bottom: 1px solid #2c3242; padding: 9px 14px;
}
.m-row:last-child { border-bottom: none; }
.m-row:hover { background: #232837; }
.m-left { min-width: 0; }
.m-date { color: #e7282d; font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
.m-teams { color: #f2f4f8; font-weight: 700; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-odds { display: flex; gap: 6px; flex-shrink: 0; }
.m-odds .odds-btn { min-width: 64px; flex: none; padding: 5px 6px 4px 6px; }
.m-odds .odds-btn .val { font-size: 1rem; }

/* ------- Cartes value bet (façon "cotes boostées") ------- */
.vb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 12px; margin-bottom: 14px; }
.vb-card {
    background: linear-gradient(180deg, #2a2717 0%, #1e222c 55%);
    border: 1px solid #f4c430; border-radius: 10px; padding: 14px 16px;
    box-shadow: 0 0 14px rgba(244, 196, 48, 0.12);
}
.vb-tag {
    display: inline-block; background: #f4c430; color: #14161d; font-weight: 800;
    font-size: .68rem; text-transform: uppercase; letter-spacing: .6px;
    border-radius: 4px; padding: 2px 8px;
}
.vb-value { float: right; color: #f4c430; font-weight: 800; font-size: 1.05rem; }
.vb-date { color: #9aa3b2; font-size: .72rem; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
.vb-match { color: #fff; font-weight: 800; font-size: 1.02rem; margin: 1px 0 2px 0; }
.vb-market { color: #cbd2dd; font-weight: 600; font-size: .88rem; }
.vb-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.vb-odds { background: #262b37; border: 1px solid #f4c430; border-radius: 6px; color: #f4c430; font-weight: 800; font-size: 1.15rem; padding: 4px 14px; }
.vb-stake { color: #9aa3b2; font-size: .8rem; font-weight: 600; text-align: right; }
.vb-stake b { color: #fff; font-size: .95rem; }

/* ------- Cartes de métriques ------- */
[data-testid="stMetric"] {
    background: #1e222c; border: 1px solid #2c3242; border-left: 3px solid #e7282d;
    border-radius: 8px; padding: 12px 16px;
}
[data-testid="stMetricLabel"] { color: #9aa3b2; }

/* ------- Onglets façon nav bookmaker ------- */
.stTabs [data-baseweb="tab-list"] { gap: 0; background: #1e222c; border-radius: 8px; padding: 4px; border: 1px solid #2c3242; }
.stTabs [data-baseweb="tab"] {
    background: transparent; border-radius: 6px; padding: 9px 18px;
    font-weight: 700; text-transform: uppercase; font-size: .85rem; letter-spacing: .3px;
}
.stTabs [aria-selected="true"] { background: #e7282d !important; }
.stTabs [aria-selected="true"] * { color: #fff !important; }
.stTabs [data-baseweb="tab-highlight"], .stTabs [data-baseweb="tab-border"] { display: none; }

/* ------- Barre latérale ------- */
section[data-testid="stSidebar"] { border-right: 1px solid #2c3242; }
section[data-testid="stSidebar"] .stButton button { width: 100%; }

/* ------- Pastille de fiabilité ------- */
.pill { display:inline-block; padding: 2px 12px; border-radius: 4px; font-weight: 700; font-size: .78rem; text-transform: uppercase; letter-spacing: .4px; }
.pill.good { background: rgba(52,211,153,.15); color:#34d399; border: 1px solid rgba(52,211,153,.4); }
.pill.mid  { background: rgba(244,196,48,.15); color:#f4c430; border: 1px solid rgba(244,196,48,.4); }
.pill.low  { background: rgba(255,88,96,.15); color:#ff5860; border: 1px solid rgba(255,88,96,.4); }

/* ------- Titres de sections façon bookmaker ------- */
[data-testid="stMain"] h1 { text-transform: uppercase; font-style: italic; font-weight: 800; letter-spacing: .3px; }
[data-testid="stMain"] h2, [data-testid="stMain"] h3 {
    text-transform: uppercase; font-style: italic; font-weight: 800; letter-spacing: .3px;
    border-left: 4px solid #e7282d; padding-left: 10px;
}

/* ------- Expanders ------- */
[data-testid="stMain"] [data-testid="stExpander"] {
    background: #1e222c; border: 1px solid #2c3242; border-radius: 10px;
}
[data-testid="stMain"] [data-testid="stExpander"] summary { font-weight: 700; }

/* ------- Tableaux façon bookmaker ------- */
.bc-wrap { border: 1px solid #2c3242; border-radius: 10px; overflow-x: auto; margin: 6px 0 10px 0; }
.bc-table { width: 100%; border-collapse: collapse; background: #1e222c; font-size: .88rem; }
.bc-table th {
    background: #262b37; color: #9aa3b2; text-transform: uppercase; font-size: .7rem;
    letter-spacing: .5px; font-weight: 700; padding: 9px 12px;
    border-bottom: 2px solid #e7282d; text-align: center; white-space: nowrap;
}
.bc-table td { padding: 8px 12px; color: #f2f4f8; font-weight: 600; text-align: center; border-bottom: 1px solid #262b37; }
.bc-table tr:last-child td { border-bottom: none; }
.bc-table tbody tr:nth-child(even) td { background: #20252f; }
.bc-table tbody tr:hover td { background: #272d3a; }
.bc-table td:first-child, .bc-table th:first-child { text-align: left; }
.bc-table .gold { color: #f4c430; font-weight: 800; }
.bc-table .em { color: #fff; font-weight: 800; }
.bc-table .pos { color: #22c55e; font-weight: 700; }
.bc-table .neg { color: #ff5860; font-weight: 700; }
.bc-table .dim { color: #6b7280; }

/* ------- Barre de probabilités 1X2 (façon "chances de victoire") ------- */
.prob-bar { display: flex; height: 48px; border-radius: 8px; overflow: hidden; border: 1px solid #2c3242; margin: 8px 0 4px 0; }
.prob-seg { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 40px; }
.prob-seg .pct { font-size: 1.05rem; font-weight: 800; color: #fff; line-height: 1.1; }
.prob-seg .plbl { font-size: .62rem; font-weight: 700; color: rgba(255,255,255,.85); text-transform: uppercase; letter-spacing: .3px; max-width: 95%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.prob-legend { display: flex; gap: 16px; color: #9aa3b2; font-size: .75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 10px; }
.prob-legend .dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: baseline; }
</style>
""", unsafe_allow_html=True)

st.markdown("""
<div class="topbar">
  <div class="brand">⚽ SportsBet <span>Analytics</span></div>
  <div class="tagline">Dixon-Coles + ML ancrés sur le marché<br/>Value bets · Kelly fractionnaire</div>
</div>
""", unsafe_allow_html=True)


def style_fig(fig, height=350):
    fig.update_layout(
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#cbd2dd", family="Barlow, sans-serif"),
        height=height,
        margin=dict(t=36, b=10, l=10, r=10),
        xaxis=dict(gridcolor="#262b37", zerolinecolor="#2c3242"),
        yaxis=dict(gridcolor="#262b37", zerolinecolor="#2c3242"),
        hoverlabel=dict(bgcolor="#262b37", bordercolor="#e7282d",
                        font=dict(color="#f2f4f8", family="Barlow, sans-serif")),
        legend=dict(bgcolor="rgba(0,0,0,0)", font=dict(size=12)),
        title_font=dict(size=14, color="#9aa3b2", family="Barlow, sans-serif"),
    )
    return fig


def reliability_pill(reliability: float) -> str:
    pct = int(round(reliability * 100))
    cls = "good" if reliability >= 0.7 else ("mid" if reliability >= 0.4 else "low")
    label = "élevée" if cls == "good" else ("moyenne" if cls == "mid" else "faible")
    return f'<span class="pill {cls}">Fiabilité des données : {label} ({pct}%)</span>'


# ---------------------------------------------------------------------------
# Rendu façon bookmaker : dates FR, boutons de cotes, cartes match / value bet
# ---------------------------------------------------------------------------
FR_DAYS = ["LUN.", "MAR.", "MER.", "JEU.", "VEN.", "SAM.", "DIM."]
FR_MONTHS = ["JANV.", "FÉVR.", "MARS", "AVR.", "MAI", "JUIN", "JUIL.", "AOÛT", "SEPT.", "OCT.", "NOV.", "DÉC."]


def fmt_date_fr(date_str) -> str:
    try:
        d = pd.to_datetime(str(date_str))
        return f"{FR_DAYS[d.weekday()]} {d.day} {FR_MONTHS[d.month - 1]}"
    except Exception:
        return str(date_str)


def market_label(market, home_team="", away_team=""):
    labels = {
        "1": home_team or "Domicile", "X": "Match nul", "2": away_team or "Extérieur",
        "over25": "+ de 2,5 buts", "under25": "- de 2,5 buts",
        "btts_yes": "BTTS : Oui", "btts_no": "BTTS : Non",
    }
    return labels.get(market, market)


def odds_box(label, odds, boosted=False) -> str:
    if odds is None or odds != odds:
        return f'<div class="odds-btn off"><span class="lbl">{label}</span><span class="val">—</span></div>'
    cls = "odds-btn boost" if boosted else "odds-btn"
    return f'<div class="{cls}"><span class="lbl">{label}</span><span class="val">{float(odds):.2f}</span></div>'


def match_hero_html(home, away, date_str, odds: dict, value_markets=frozenset()) -> str:
    """Carte match façon page de pari : équipes + grille de cotes 1N2 / totaux / BTTS.
    Les marchés détectés comme value bets sont mis en avant façon « cote boostée »."""
    def box(lbl, key):
        return odds_box(lbl, odds.get(key), key in value_markets)

    html = '<div class="match-hero">'
    html += f'<div class="kickoff">⚽ Football · {fmt_date_fr(date_str)}</div>'
    html += f'<div class="teams">{home} <span class="vs">vs</span> {away}</div>'
    html += '<div class="market-title">Résultat du match</div>'
    html += f'<div class="odds-row">{box(home, "1")}{box("Nul", "X")}{box(away, "2")}</div>'

    has_totals = any(odds.get(k) is not None and odds.get(k) == odds.get(k) for k in ("over25", "under25"))
    has_btts = any(odds.get(k) is not None and odds.get(k) == odds.get(k) for k in ("btts_yes", "btts_no"))
    if has_totals:
        html += '<div class="market-title">Nombre de buts (2,5)</div>'
        html += f'<div class="odds-row">{box("+ de 2,5", "over25")}{box("- de 2,5", "under25")}</div>'
    if has_btts:
        html += '<div class="market-title">Les deux équipes marquent</div>'
        html += f'<div class="odds-row">{box("Oui", "btts_yes")}{box("Non", "btts_no")}</div>'
    html += '</div>'
    return html


def match_list_html(df, title="Prochains matchs") -> str:
    """Liste de matchs avec cotes 1N2, façon page d'accueil d'un site de paris."""
    rows = [f'<div class="m-list"><div class="m-head">⚽ {title}</div>']
    for r in df.itertuples():
        odds_html = (odds_box("1", r.odds_home) + odds_box("N", r.odds_draw) + odds_box("2", r.odds_away))
        rows.append(
            f'<div class="m-row"><div class="m-left">'
            f'<div class="m-date">{fmt_date_fr(r.date)}</div>'
            f'<div class="m-teams">{r.home_team} — {r.away_team}</div>'
            f'</div><div class="m-odds">{odds_html}</div></div>'
        )
    rows.append('</div>')
    return "".join(rows)


def bc_table_html(df: pd.DataFrame) -> str:
    """Tableau HTML stylé façon bookmaker. Les valeurs doivent déjà être formatées
    en chaînes (du HTML inline comme <span class="gold"> est accepté)."""
    head = "".join(f"<th>{c}</th>" for c in df.columns)
    body = "".join(
        "<tr>" + "".join(f"<td>{v}</td>" for v in row) + "</tr>"
        for row in df.itertuples(index=False)
    )
    return (f'<div class="bc-wrap"><table class="bc-table">'
            f'<thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>')


def prob_bar_html(p1, px, p2, home="Domicile", away="Extérieur") -> str:
    """Barre segmentée des probabilités 1X2, façon « chances de victoire » des sites de paris."""
    segs = ""
    for p, lbl, color in [(p1, home, C_HOME), (px, "Nul", C_DRAW), (p2, away, C_AWAY)]:
        segs += (f'<div class="prob-seg" style="width:{p*100:.1f}%;background:{color};">'
                 f'<span class="pct">{p*100:.0f}%</span><span class="plbl">{lbl}</span></div>')
    legend = "".join(
        f'<span><span class="dot" style="background:{c};"></span>{l}</span>'
        for l, c in [(home, C_HOME), ("Nul", C_DRAW), (away, C_AWAY)]
    )
    return f'<div class="prob-bar">{segs}</div><div class="prob-legend">{legend}</div>'


def fmt_pct(v, decimals=1):
    return "—" if v is None or v != v else f"{v*100:.{decimals}f}%"


def value_bet_card_html(vb, bankroll) -> str:
    """Carte « cote boostée » pour un value bet détecté."""
    stake = vb["kelly_stake_pct"] / 100 * bankroll
    home, away = "", ""
    if " vs " in vb.get("match", ""):
        home, away = vb["match"].split(" vs ", 1)
    return (
        '<div class="vb-card">'
        f'<span class="vb-tag">Value bet</span><span class="vb-value">+{vb["value_pct"]:.1f}%</span>'
        f'<div class="vb-date">{fmt_date_fr(vb.get("date", ""))}</div>'
        f'<div class="vb-match">{vb.get("match", "")}</div>'
        f'<div class="vb-market">{market_label(vb["market"], home, away)} · prob. modèle {vb["model_prob"]*100:.0f}%</div>'
        '<div class="vb-bottom">'
        f'<span class="vb-odds">{vb["bookmaker_odds"]:.2f}</span>'
        f'<span class="vb-stake">Mise conseillée<br/><b>{stake:.2f} €</b> ({vb["kelly_stake_pct"]:.2f}%)</span>'
        '</div></div>'
    )


# ---------------------------------------------------------------------------
# Accès données (cache local — aucune de ces fonctions n'appelle d'API externe)
# ---------------------------------------------------------------------------
@st.cache_data(ttl=300)
def get_upcoming_matches():
    with get_conn() as conn:
        df = pd.read_sql_query(
            """SELECT m.match_id, m.date, m.home_team, m.away_team,
                      o.odds_home, o.odds_draw, o.odds_away,
                      o.odds_over25, o.odds_under25, o.odds_btts_yes, o.odds_btts_no
               FROM matches m
               LEFT JOIN odds o ON o.odds_id = (
                   SELECT o2.odds_id FROM odds o2 WHERE o2.match_id = m.match_id
                   ORDER BY CASE WHEN o2.bookmaker = 'the-odds-api' THEN 0 ELSE 1 END, o2.odds_id DESC
                   LIMIT 1
               )
               WHERE m.status = 'scheduled' ORDER BY m.date ASC""",
            conn,
        )
    return df


@st.cache_data(ttl=3600)
def get_all_teams():
    # Dérivé de `matches` : les imports réels (Football-Data, The Odds API) ne
    # remplissent pas la table `teams`, seule la table des matchs fait foi.
    with get_conn() as conn:
        return pd.read_sql_query(
            """SELECT DISTINCT home_team AS name FROM matches
               UNION SELECT DISTINCT away_team FROM matches ORDER BY name""",
            conn,
        )["name"].tolist()


@st.cache_data(ttl=300)
def get_odds_history(match_id):
    with get_conn() as conn:
        return pd.read_sql_query(
            """SELECT captured_at, bookmaker, odds_home, odds_draw, odds_away,
                      odds_over25, odds_under25, odds_btts_yes, odds_btts_no
               FROM odds WHERE match_id = ? ORDER BY captured_at ASC""",
            conn, params=(match_id,),
        )


@st.cache_data(ttl=300)
def get_odds_api_usage_history():
    from data_sources import get_odds_api_usage_history as _get_usage
    return _get_usage()


@st.cache_data(ttl=300)
def get_history_df():
    """Historique des matchs joués, chargé une seule fois par fenêtre de cache."""
    return load_matches_df(status="played")


def _clean_odds(odds: dict) -> dict:
    """Écarte les cotes manquantes (None / NaN) avant analyse."""
    if not odds:
        return {}
    return {k: float(v) for k, v in odds.items() if v is not None and v == v and v > 1.0}


def analyze_and_predict(home_team, away_team, odds=None, min_value_pct=5.0, kelly_frac=0.25,
                        w_ml=0.35, w_market=0.30):
    """
    Pipeline complet : features → Poisson (Dixon-Coles) → ML (si dispo) → ensemble
    ancré sur le marché → value bets avec Kelly ajusté à la fiabilité des données.
    """
    df_hist = get_history_df()
    feats = build_match_features(df_hist, home_team, away_team)
    poisson_pred = predict_match_poisson(feats)

    poisson_probs = {
        "1": poisson_pred["prob_home"], "X": poisson_pred["prob_draw"], "2": poisson_pred["prob_away"],
        "over25": poisson_pred["prob_over25"], "under25": poisson_pred["prob_under25"],
        "btts_yes": poisson_pred["prob_btts_yes"], "btts_no": poisson_pred["prob_btts_no"],
    }

    ml_pred = None
    ml_probs = None
    if ml_available:
        from ml_model import predict_match_ml
        try:
            ml_pred = predict_match_ml(feats, model_choice="gradient_boosting")
            ml_probs = {"1": ml_pred["prob_home"], "X": ml_pred["prob_draw"], "2": ml_pred["prob_away"]}
        except Exception:
            ml_pred = None

    clean_odds = _clean_odds(odds)
    final_probs = blend_probabilities(poisson_probs, ml_probs, clean_odds, w_ml=w_ml, w_market=w_market)

    # Kelly prudent : mise réduite quand l'historique est mince (début de saison, équipe inconnue)
    reliability = data_reliability(feats)
    effective_kelly = kelly_frac * (0.4 + 0.6 * reliability)

    value_bets = detect_value_bets(final_probs, clean_odds, min_value_pct, effective_kelly) if clean_odds else []

    return {
        "feats": feats, "poisson": poisson_pred, "ml": ml_pred,
        "final_probs": final_probs, "value_bets": value_bets, "reliability": reliability,
        "market_probs": market_implied_probs(clean_odds) if clean_odds else {},
    }


# ---------------------------------------------------------------------------
# Barre latérale
# ---------------------------------------------------------------------------
st.sidebar.title("⚽ SportsBet Analytics")

# --- Contrôle des appels API ---
st.sidebar.subheader("🛡️ Contrôle des appels API")
throttle_min = st.sidebar.number_input(
    "Intervalle minimum entre 2 appels (minutes)", min_value=0, max_value=1440, value=60, step=15,
    help="Un appel API n'est refait que si les dernières données sont plus vieilles que cet intervalle. "
         "Protège les quotas (Odds API : 500 requêtes/mois). 0 = aucun blocage.",
)
force_fetch = st.sidebar.checkbox(
    "Forcer l'appel (ignorer l'intervalle)", value=False,
    help="À cocher ponctuellement pour rafraîchir immédiatement malgré l'intervalle.",
)


def last_fetch_caption(provider, resource):
    age = minutes_since_last_fetch(provider, resource)
    if age is None:
        st.sidebar.caption("🕒 Jamais appelé pour cette ressource.")
    elif age < 60:
        st.sidebar.caption(f"🕒 Dernier appel : il y a {int(age)} min.")
    else:
        st.sidebar.caption(f"🕒 Dernier appel : il y a {age/60:.1f} h.")


st.sidebar.markdown("---")
st.sidebar.subheader("📥 Import de données réelles")
st.sidebar.caption("Football-Data.org — codes courants : PL, FL1, BL1, SA, PD, DED, PPL, CL")
competition_code = st.sidebar.text_input("Code compétition", value="PL")
season_input = st.sidebar.text_input("Saison (optionnel, ex. 2024)", value="")

if not os.environ.get("FOOTBALL_DATA_API_KEY"):
    st.sidebar.warning(
        "Variable d'environnement `FOOTBALL_DATA_API_KEY` absente. "
        "Crée une clé gratuite sur football-data.org puis exporte-la avant de lancer Streamlit."
    )

last_fetch_caption("football-data.org", f"{competition_code}:{season_input or 'current'}")

if st.sidebar.button("⬇️ Importer les matchs réels", type="primary"):
    from data_sources import fetch_football_data_org
    try:
        with st.spinner(f"Import des matchs {competition_code} depuis Football-Data.org..."):
            n = fetch_football_data_org(
                competition_code=competition_code, season=season_input or None,
                max_age_minutes=throttle_min or None, force=force_fetch,
            )
        st.cache_data.clear()
        st.sidebar.success(f"{n} matchs importés.")
    except FetchThrottled as exc:
        st.sidebar.info(f"⏳ {exc}")
    except Exception as exc:
        st.sidebar.error(f"Échec de l'import : {exc}")

if st.sidebar.button("🧠 Entraîner les modèles ML"):
    from ml_model import train_models
    try:
        with st.spinner("Entraînement régression logistique + gradient boosting..."):
            metrics = train_models()
        st.session_state["ml_metrics"] = metrics
        st.sidebar.success("Modèles entraînés !")
    except Exception as exc:
        st.sidebar.error(
            f"Échec de l'entraînement : {exc}. Il faut suffisamment de matchs joués "
            "importés (avec au moins quelques matchs par équipe) avant d'entraîner les modèles ML."
        )

st.sidebar.markdown("---")
st.sidebar.subheader("🌍 Cotes en direct — The Odds API")
st.sidebar.caption("the-odds-api.com — clé gratuite (500 requêtes/mois)")

if not os.environ.get("ODDS_API_KEY"):
    st.sidebar.warning(
        "Variable d'environnement `ODDS_API_KEY` absente. "
        "Crée une clé gratuite sur the-odds-api.com puis exporte-la avant de lancer Streamlit."
    )

if st.sidebar.button("🔍 Lister les sports/compétitions dispo"):
    from data_sources import list_odds_api_sports
    try:
        sports = list_odds_api_sports()
        st.session_state["odds_api_sports"] = sorted(
            s["key"] for s in sports if s.get("key", "").startswith("soccer")
        )
        st.cache_data.clear()
        st.sidebar.success(f"{len(st.session_state['odds_api_sports'])} compétitions foot trouvées.")
    except Exception as exc:
        st.sidebar.error(f"Échec : {exc}")

if st.session_state.get("odds_api_sports"):
    odds_sport_key = st.sidebar.selectbox(
        "Compétition (sport key)", st.session_state["odds_api_sports"],
        index=st.session_state["odds_api_sports"].index("soccer_fifa_world_cup")
        if "soccer_fifa_world_cup" in st.session_state["odds_api_sports"] else 0,
    )
else:
    odds_sport_key = st.sidebar.text_input(
        "Sport key (The Odds API)", value="soccer_fifa_world_cup",
        help="Ex: soccer_fifa_world_cup, soccer_epl... Utilise « Lister les sports » pour voir toutes les clés disponibles.",
    )

last_fetch_caption("the-odds-api", odds_sport_key)

if st.sidebar.button("⬇️ Récupérer les cotes", type="primary"):
    from data_sources import fetch_odds_api
    try:
        with st.spinner(f"Récupération des cotes ({odds_sport_key})..."):
            n_new, n_odds = fetch_odds_api(
                sport_key=odds_sport_key,
                max_age_minutes=throttle_min or None, force=force_fetch,
            )
        st.cache_data.clear()
        st.sidebar.success(f"{n_new} match(s) ajouté(s), {n_odds} cote(s) mise(s) à jour.")
    except FetchThrottled as exc:
        st.sidebar.info(f"⏳ {exc}")
    except Exception as exc:
        st.sidebar.error(f"Échec de la récupération des cotes : {exc}")

usage_hist = get_odds_api_usage_history()
if not usage_hist.empty:
    last = usage_hist.iloc[-1]
    st.sidebar.caption(
        f"🔋 Crédits : **{int(last['requests_used'])} utilisés** / "
        f"**{int(last['requests_remaining'])} restants** "
        f"(dernier appel : {int(last['requests_last_cost'])} crédit(s) — {last['captured_at']})"
    )
    with st.sidebar.expander("Historique de consommation"):
        st.dataframe(
            usage_hist.rename(columns={
                "captured_at": "Date", "endpoint": "Endpoint", "requests_used": "Utilisés",
                "requests_remaining": "Restants", "requests_last_cost": "Coût dernier appel",
            }),
            use_container_width=True, height=200,
        )

st.sidebar.markdown("---")
st.sidebar.subheader("🎛️ Stratégie & modèle")
min_value_pct = st.sidebar.slider("Seuil de value bet (%)", 1.0, 30.0, 5.0, 0.5)
kelly_frac = st.sidebar.slider("Fraction de Kelly appliquée", 0.05, 1.0, 0.25, 0.05)
initial_bankroll = st.sidebar.number_input("Bankroll actuelle (€)", value=30.83, step=1.0, format="%.2f")

with st.sidebar.expander("⚙️ Paramètres avancés de l'ensemble"):
    w_market = st.slider(
        "Ancrage sur le marché", 0.0, 0.8, 0.30, 0.05,
        help="Poids des probabilités implicites du marché (cotes dé-margées) dans la prédiction finale. "
             "0 = modèle pur (sur-confiant), plus haut = plus proche du consensus du marché.",
    )
    w_ml = st.slider(
        "Poids du modèle ML (1X2)", 0.0, 0.8, 0.35, 0.05,
        help="Poids du gradient boosting dans le mélange avec le Poisson, sur le 1X2 uniquement.",
    )

st.sidebar.markdown("---")
st.sidebar.caption(
    "⚠️ Outil d'analyse statistique à but éducatif. Les paris sportifs comportent un risque "
    "de perte financière. Aucune prédiction ne garantit un résultat."
)

# ---------------------------------------------------------------------------
# Onglets principaux
# ---------------------------------------------------------------------------
tab1, tab2, tab3, tab4 = st.tabs([
    "📊 Analyse de match", "🎯 Value Bets du jour", "📈 Backtest & ROI", "🔬 Comparateur libre"
])

# ============================== TAB 1 ==============================
with tab1:
    st.header("Analyse de match")
    upcoming = get_upcoming_matches()

    if upcoming.empty:
        st.info("Aucun match à venir en base. Importe des données depuis la barre latérale.")
    else:
        with st.expander("📋 Prochains matchs — vue bookmaker", expanded=False):
            st.markdown(match_list_html(upcoming.head(15), title="Football · Prochains matchs"),
                        unsafe_allow_html=True)

        options = [f"{r.home_team} vs {r.away_team} ({r.date})" for r in upcoming.itertuples()]
        choice = st.selectbox("Choisir un match à venir", options)
        row = upcoming.iloc[options.index(choice)]

        match_odds = {
            "1": row["odds_home"], "X": row["odds_draw"], "2": row["odds_away"],
            "over25": row["odds_over25"], "under25": row["odds_under25"],
            "btts_yes": row["odds_btts_yes"], "btts_no": row["odds_btts_no"],
        }
        res = analyze_and_predict(
            row["home_team"], row["away_team"], odds=match_odds,
            min_value_pct=min_value_pct, kelly_frac=kelly_frac, w_ml=w_ml, w_market=w_market,
        )
        feats, poisson_pred, final_probs = res["feats"], res["poisson"], res["final_probs"]
        value_markets = {vb["market"] for vb in res["value_bets"]}

        st.markdown(
            match_hero_html(row["home_team"], row["away_team"], row["date"], match_odds, value_markets),
            unsafe_allow_html=True,
        )
        if value_markets:
            st.caption("⚡ Les cotes dorées sont des value bets détectés par le modèle au seuil actuel.")

        st.markdown(reliability_pill(res["reliability"]), unsafe_allow_html=True)
        st.write("")

        col1, col2, col3 = st.columns(3)
        col1.metric("Buts attendus (dom.)", poisson_pred["expected_home_goals"])
        col2.metric("Buts attendus (ext.)", poisson_pred["expected_away_goals"])
        col3.metric("Score le + probable", poisson_pred["top_scores"][0]["score"],
                    f"{poisson_pred['top_scores'][0]['probability']*100:.1f}%")

        st.subheader("Probabilités 1X2 — prédiction finale (ensemble)")
        st.markdown(
            prob_bar_html(final_probs["1"], final_probs["X"], final_probs["2"],
                          row["home_team"], row["away_team"]),
            unsafe_allow_html=True,
        )

        # Comparaison des sources de probabilité
        st.subheader("Ce que dit chaque source")
        comp = {
            "Issue": ["Domicile", "Nul", "Extérieur"],
            "Poisson (Dixon-Coles)": [fmt_pct(p) for p in
                (poisson_pred["prob_home"], poisson_pred["prob_draw"], poisson_pred["prob_away"])],
        }
        if res["ml"]:
            comp["ML (Gradient Boosting)"] = [fmt_pct(p) for p in
                (res["ml"]["prob_home"], res["ml"]["prob_draw"], res["ml"]["prob_away"])]
        if res["market_probs"].get("1") is not None:
            comp["Marché (cotes dé-margées)"] = [fmt_pct(res["market_probs"].get(k)) for k in ("1", "X", "2")]
        comp["Ensemble (final)"] = [f'<span class="gold">{fmt_pct(final_probs[k])}</span>' for k in ("1", "X", "2")]
        st.markdown(bc_table_html(pd.DataFrame(comp)), unsafe_allow_html=True)
        if res["ml"]:
            st.caption(f"Confiance du modèle ML : **{res['ml']['confidence']*100:.1f}%** "
                       "(écart entre la probabilité la plus forte et la 2e).")
        else:
            st.info("💡 Entraîne les modèles ML depuis la barre latérale pour enrichir l'ensemble (Poisson seul actuellement).")

        colA, colB, colC = st.columns(3)
        with colA:
            with st.container(border=True):
                st.markdown("**Over/Under 2.5 buts**")
                st.write(f"Over 2.5 : `{final_probs['over25']*100:.1f}%`")
                st.write(f"Under 2.5 : `{final_probs['under25']*100:.1f}%`")
        with colB:
            with st.container(border=True):
                st.markdown("**BTTS (les 2 équipes marquent)**")
                st.write(f"Oui : `{final_probs['btts_yes']*100:.1f}%`")
                st.write(f"Non : `{final_probs['btts_no']*100:.1f}%`")
        with colC:
            with st.container(border=True):
                st.markdown("**Top 3 scores probables**")
                for s in poisson_pred["top_scores"]:
                    st.write(f"{s['score']} — `{s['probability']*100:.1f}%`")

        st.subheader("🔎 Contexte : forme, domicile/extérieur, H2H")
        colF1, colF2 = st.columns(2)
        with colF1:
            with st.container(border=True):
                st.markdown(f"**{row['home_team']} (domicile)**")
                st.write(f"- Forme pondérée (8 derniers, récence) : `{feats['home_form_points']:.2f} pts/match`")
                st.write(f"- Buts marqués/encaissés (moy.) : `{feats['home_goals_for_avg']:.2f}` / `{feats['home_goals_against_avg']:.2f}`")
                st.write(f"- xG pour/contre (moy.) : `{feats['home_xg_for_avg']:.2f}` / `{feats['home_xg_against_avg']:.2f}`")
                st.write(f"- Points à domicile (moy.) : `{feats['home_at_home_points']:.2f}`")
        with colF2:
            with st.container(border=True):
                st.markdown(f"**{row['away_team']} (extérieur)**")
                st.write(f"- Forme pondérée (8 derniers, récence) : `{feats['away_form_points']:.2f} pts/match`")
                st.write(f"- Buts marqués/encaissés (moy.) : `{feats['away_goals_for_avg']:.2f}` / `{feats['away_goals_against_avg']:.2f}`")
                st.write(f"- xG pour/contre (moy.) : `{feats['away_xg_for_avg']:.2f}` / `{feats['away_xg_against_avg']:.2f}`")
                st.write(f"- Points à l'extérieur (moy.) : `{feats['away_at_away_points']:.2f}`")

        st.markdown(f"**Confrontations directes (H2H)** — taux de victoire domicile historique : "
                    f"`{feats['h2h_home_win_rate']*100:.1f}%`")

        st.subheader("🎯 Value bets détectés sur ce match")
        if res["value_bets"]:
            top_bet = max(res["value_bets"], key=lambda x: x["value_pct"])
            top_stake_eur = round(top_bet["kelly_stake_pct"] / 100 * initial_bankroll, 2)
            st.success(
                f"💰 **Mise recommandée : {top_stake_eur} €** sur "
                f"« {market_label(top_bet['market'], row['home_team'], row['away_team'])} » "
                f"(cote {top_bet['bookmaker_odds']}) — {top_bet['kelly_stake_pct']}% de la bankroll "
                f"({initial_bankroll:.2f} €)"
            )

            vb_rows = pd.DataFrame([{
                "Marché": market_label(vb["market"], row["home_team"], row["away_team"]),
                "Prob. modèle": fmt_pct(vb["model_prob"]),
                "Cote": f'<span class="em">{vb["bookmaker_odds"]:.2f}</span>',
                "Prob. implicite": fmt_pct(vb["implied_prob"]),
                "Value": f'<span class="gold">+{vb["value_pct"]:.2f}%</span>',
                "Mise Kelly": f'{vb["kelly_stake_pct"]:.2f}%',
                "Mise": f'<span class="em">{vb["kelly_stake_pct"] / 100 * initial_bankroll:.2f} €</span>',
            } for vb in res["value_bets"]])
            st.markdown(bc_table_html(vb_rows), unsafe_allow_html=True)
        else:
            st.info("Aucun value bet détecté sur ce match au seuil actuel.")

        st.subheader("📜 Historique des cotes")
        odds_hist = get_odds_history(int(row["match_id"]))
        if len(odds_hist) >= 1:
            def _odd(v):
                return '<span class="dim">—</span>' if v is None or v != v else f'<span class="em">{v:.2f}</span>'

            hist_df = pd.DataFrame({
                "Capturé le": odds_hist["captured_at"],
                "Bookmaker": odds_hist["bookmaker"],
                "1": odds_hist["odds_home"].map(_odd),
                "N": odds_hist["odds_draw"].map(_odd),
                "2": odds_hist["odds_away"].map(_odd),
                "+ 2,5": odds_hist["odds_over25"].map(_odd),
                "- 2,5": odds_hist["odds_under25"].map(_odd),
                "BTTS oui": odds_hist["odds_btts_yes"].map(_odd),
                "BTTS non": odds_hist["odds_btts_no"].map(_odd),
            })
            st.markdown(bc_table_html(hist_df), unsafe_allow_html=True)

            if len(odds_hist) >= 2:
                fig_hist = go.Figure()
                for col, label, color in [
                    ("odds_home", "Domicile", C_HOME),
                    ("odds_draw", "Nul", C_DRAW),
                    ("odds_away", "Extérieur", C_AWAY),
                ]:
                    fig_hist.add_trace(go.Scatter(
                        x=odds_hist["captured_at"], y=odds_hist[col], mode="lines+markers",
                        name=label, line=dict(color=color),
                    ))
                fig_hist.update_layout(yaxis_title="Cote", title="Évolution des cotes 1X2 dans le temps")
                st.plotly_chart(style_fig(fig_hist, height=300), use_container_width=True)
        else:
            st.info(
                "Aucun historique pour ce match. Récupère les cotes via « ⬇️ Récupérer les cotes » "
                "(barre latérale) pour commencer à en construire un — chaque nouvelle capture avec des "
                "cotes différentes s'ajoute à l'historique."
            )

# ============================== TAB 2 ==============================
with tab2:
    st.header("🎯 Value Bets du jour — tous les matchs à venir")
    upcoming = get_upcoming_matches()

    if upcoming.empty:
        st.info("Aucun match à venir en base.")
    else:
        all_value_bets = []
        with st.spinner("Analyse de tous les matchs à venir..."):
            for _, row in upcoming.iterrows():
                res = analyze_and_predict(
                    row["home_team"], row["away_team"],
                    odds={
                        "1": row["odds_home"], "X": row["odds_draw"], "2": row["odds_away"],
                        "over25": row["odds_over25"], "under25": row["odds_under25"],
                        "btts_yes": row["odds_btts_yes"], "btts_no": row["odds_btts_no"],
                    },
                    min_value_pct=min_value_pct, kelly_frac=kelly_frac, w_ml=w_ml, w_market=w_market,
                )
                for vb in res["value_bets"]:
                    vb["match"] = f"{row['home_team']} vs {row['away_team']}"
                    vb["date"] = row["date"]
                    vb["reliability"] = res["reliability"]
                    all_value_bets.append(vb)

        if all_value_bets:
            sorted_bets = sorted(all_value_bets, key=lambda x: x["value_pct"], reverse=True)
            st.success(f"{len(sorted_bets)} value bet(s) détecté(s) sur {len(upcoming)} matchs analysés.")

            cards = "".join(value_bet_card_html(vb, initial_bankroll) for vb in sorted_bets[:12])
            st.markdown(f'<div class="vb-grid">{cards}</div>', unsafe_allow_html=True)
            if len(sorted_bets) > 12:
                st.caption(f"Top 12 affichés — les {len(sorted_bets)} sont dans le tableau détaillé ci-dessous.")

            with st.expander("📑 Tableau détaillé", expanded=False):
                top_df = pd.DataFrame(sorted_bets)
                top_df["stake_eur"] = (top_df["kelly_stake_pct"] / 100 * initial_bankroll).round(2)
                top_df = top_df[["date", "match", "market", "model_prob", "bookmaker_odds",
                                  "implied_prob", "value_pct", "kelly_stake_pct", "stake_eur", "reliability"]]
                top_df.columns = ["Date", "Match", "Marché", "Prob. modèle", "Cote", "Prob. implicite",
                                  "Value (%)", "Mise Kelly (%)", "Mise (€)", "Fiabilité"]
                st.dataframe(
                    top_df.style.format({
                        "Prob. modèle": "{:.1%}", "Prob. implicite": "{:.1%}", "Fiabilité": "{:.0%}",
                        "Value (%)": "{:+.2f}%", "Mise Kelly (%)": "{:.2f}%", "Mise (€)": "{:.2f} €",
                    }).background_gradient(subset=["Value (%)"], cmap="Greens"),
                    use_container_width=True, height=400,
                )
        else:
            st.info("Aucun value bet détecté sur les matchs à venir, au seuil actuel. "
                    "Note : l'ancrage marché (barre latérale) réduit volontairement les faux positifs — "
                    "baisse-le pour un modèle plus agressif.")

# ============================== TAB 3 ==============================
with tab3:
    st.header("📈 Backtest de la stratégie & simulation de bankroll")
    st.caption(
        "Le backtest rejoue tout l'historique de matchs joués : à chaque match, le modèle de Poisson "
        "prédit les probabilités, on compare à des cotes de marché simulées (bruitées), et on ne mise "
        "que si un value bet est détecté, avec une taille de mise calculée par Kelly fractionnaire."
    )

    if st.button("▶️ Lancer le backtest", type="primary"):
        with st.spinner("Backtest en cours sur tout l'historique..."):
            results, log_df, bankroll_df = run_backtest(
                min_value_pct=min_value_pct, kelly_frac=kelly_frac, initial_bankroll=initial_bankroll
            )
        st.session_state["backtest_results"] = (results, log_df, bankroll_df)

    if "backtest_results" in st.session_state:
        results, log_df, bankroll_df = st.session_state["backtest_results"]

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Paris placés", results["n_bets"])
        c2.metric("Taux de réussite", f"{results['win_rate_pct']}%")
        c3.metric("Bankroll finale", f"{results['final_bankroll']} €")
        c4.metric("ROI", f"{results['roi_pct']}%")
        c5.metric("Drawdown max", f"{results['max_drawdown_pct']}%")

        if not bankroll_df.empty:
            fig = go.Figure()
            fig.add_trace(go.Scatter(
                x=bankroll_df["bet_n"], y=bankroll_df["bankroll"],
                mode="lines", name="Bankroll",
                line=dict(color=C_ACCENT, width=2.5, shape="spline", smoothing=0.6),
                fill="tozeroy", fillcolor="rgba(231, 40, 45, 0.10)",
            ))
            fig.add_hline(y=initial_bankroll, line_dash="dot", line_color="#9aa3b2",
                          annotation_text="Bankroll initiale",
                          annotation_font=dict(color="#9aa3b2", family="Barlow, sans-serif"))
            fig.update_layout(
                title="Évolution de la bankroll simulée",
                xaxis_title="N° de pari", yaxis_title="Bankroll (€)",
                yaxis_range=[
                    float(bankroll_df["bankroll"].min()) * 0.97,
                    float(bankroll_df["bankroll"].max()) * 1.03,
                ],
            )
            st.plotly_chart(style_fig(fig, height=400), use_container_width=True)

        if not log_df.empty:
            st.subheader("Historique des paris simulés")
            if len(log_df) > 60:
                st.caption(f"{len(log_df)} paris simulés — affichage des 60 derniers.")
                log_df = log_df.tail(60)
            disp = pd.DataFrame({
                "Date": log_df["date"].map(fmt_date_fr),
                "Match": log_df["home_team"] + " — " + log_df["away_team"],
                "Marché": log_df["market"].map(market_label),
                "Value": log_df["value_pct"].map(lambda v: f'<span class="gold">+{v:.1f}%</span>'),
                "Mise": log_df["stake_pct"].map(lambda v: f"{v:.2f}%"),
                "Cote": log_df["odds"].map(lambda v: f'<span class="em">{v:.2f}</span>'),
                "Résultat": log_df["won"].map(
                    lambda w: '<span class="pos">✔ Gagné</span>' if w else '<span class="neg">✘ Perdu</span>'),
                "Bankroll": log_df["bankroll_after"].map(lambda v: f"{v:.2f} €"),
            })
            st.markdown(bc_table_html(disp), unsafe_allow_html=True)
    else:
        st.info("Clique sur « Lancer le backtest » pour voir les résultats.")

# ============================== TAB 4 ==============================
with tab4:
    st.header("🔬 Comparateur libre — choisis n'importe quelle affiche")
    teams = get_all_teams()

    if len(teams) < 2:
        st.info("Importe d'abord des données depuis la barre latérale.")
    else:
        col1, col2 = st.columns(2)
        home_team = col1.selectbox("Équipe à domicile", teams, index=0)
        away_team = col2.selectbox("Équipe à l'extérieur", teams, index=1)

        st.markdown("**Cotes bookmaker (optionnel — pour détecter les value bets)**")
        colo1, colo2, colo3 = st.columns(3)
        odds_home = colo1.number_input("Cote victoire domicile", value=2.00, step=0.05)
        odds_draw = colo2.number_input("Cote match nul", value=3.30, step=0.05)
        odds_away = colo3.number_input("Cote victoire extérieur", value=3.80, step=0.05)

        if home_team == away_team:
            st.error("Choisis deux équipes différentes.")
        else:
            sim_odds = {"1": odds_home, "X": odds_draw, "2": odds_away}
            res = analyze_and_predict(
                home_team, away_team, odds=sim_odds,
                min_value_pct=min_value_pct, kelly_frac=kelly_frac, w_ml=w_ml, w_market=w_market,
            )
            final_probs = res["final_probs"]
            value_markets = {vb["market"] for vb in res["value_bets"]}

            st.markdown(
                match_hero_html(home_team, away_team, "Simulation", sim_odds, value_markets),
                unsafe_allow_html=True,
            )
            st.markdown(reliability_pill(res["reliability"]), unsafe_allow_html=True)
            st.write("")

            st.markdown(prob_bar_html(final_probs["1"], final_probs["X"], final_probs["2"],
                                      home_team, away_team), unsafe_allow_html=True)

            c1, c2, c3 = st.columns(3)
            c1.metric("Buts attendus (dom.)", res["poisson"]["expected_home_goals"])
            c2.metric("Buts attendus (ext.)", res["poisson"]["expected_away_goals"])
            c3.metric("Score le + probable", res["poisson"]["top_scores"][0]["score"],
                      f"{res['poisson']['top_scores'][0]['probability']*100:.1f}%")

            if res["value_bets"]:
                cards = "".join(
                    value_bet_card_html(
                        {**vb, "match": f"{home_team} vs {away_team}", "date": ""},
                        initial_bankroll,
                    )
                    for vb in res["value_bets"]
                )
                st.markdown(f'<div class="vb-grid">{cards}</div>', unsafe_allow_html=True)
            else:
                st.info("Pas de value bet sur ces cotes au seuil actuel.")
