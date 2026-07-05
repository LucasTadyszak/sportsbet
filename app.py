"""
app.py
-------
Dashboard Streamlit — Sports Analytics & Value Betting Tool.

Lancer avec :  streamlit run app.py
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go
import plotly.express as px

from database import get_conn, init_db, DB_PATH
from features import load_matches_df, build_match_features, rolling_form, head_to_head
from poisson_model import predict_match_poisson
from value_betting import detect_value_bets, BankrollSimulator
from backtest import run_backtest

st.set_page_config(page_title="SportsBet Analytics", layout="wide", page_icon="⚽")

# ---------------------------------------------------------------------------
# Setup initial (première exécution)
# ---------------------------------------------------------------------------
if not DB_PATH.exists():
    init_db()
    st.warning("Base de données vide. Génère des données d'exemple depuis la barre latérale.")

try:
    ml_available = (Path(__file__).resolve().parent / "models" / "gbc.joblib").exists()
except Exception:
    ml_available = False


@st.cache_data(ttl=60)
def get_upcoming_matches():
    with get_conn() as conn:
        df = pd.read_sql_query(
            """SELECT m.match_id, m.date, m.home_team, m.away_team,
                      o.odds_home, o.odds_draw, o.odds_away,
                      o.odds_over25, o.odds_under25, o.odds_btts_yes, o.odds_btts_no
               FROM matches m LEFT JOIN odds o ON m.match_id = o.match_id
               WHERE m.status = 'scheduled' ORDER BY m.date ASC""",
            conn,
        )
    return df


@st.cache_data(ttl=60)
def get_all_teams():
    with get_conn() as conn:
        return pd.read_sql_query("SELECT DISTINCT name FROM teams ORDER BY name", conn)["name"].tolist()


def analyze_and_predict(home_team, away_team, odds=None, min_value_pct=5.0, kelly_frac=0.25):
    df_hist = load_matches_df(status="played")
    feats = build_match_features(df_hist, home_team, away_team)
    poisson_pred = predict_match_poisson(feats)

    model_probs = {
        "1": poisson_pred["prob_home"], "X": poisson_pred["prob_draw"], "2": poisson_pred["prob_away"],
        "over25": poisson_pred["prob_over25"], "under25": poisson_pred["prob_under25"],
        "btts_yes": poisson_pred["prob_btts_yes"], "btts_no": poisson_pred["prob_btts_no"],
    }

    value_bets = []
    if odds:
        value_bets = detect_value_bets(model_probs, odds, min_value_pct, kelly_frac)

    return feats, poisson_pred, model_probs, value_bets


# ---------------------------------------------------------------------------
# Barre latérale
# ---------------------------------------------------------------------------
st.sidebar.title("⚽ SportsBet Analytics")
st.sidebar.markdown("---")

if st.sidebar.button("🔄 Générer / régénérer les données d'exemple"):
    from generate_sample_data import main as gen_main
    with st.spinner("Génération d'un championnat fictif (2 saisons + journée à venir)..."):
        gen_main()
    st.cache_data.clear()
    st.sidebar.success("Données générées !")

if st.sidebar.button("🧠 Entraîner les modèles ML"):
    from ml_model import train_models
    with st.spinner("Entraînement régression logistique + gradient boosting..."):
        metrics = train_models()
    st.session_state["ml_metrics"] = metrics
    st.sidebar.success("Modèles entraînés !")

st.sidebar.markdown("---")
min_value_pct = st.sidebar.slider("Seuil de value bet (%)", 1.0, 30.0, 5.0, 0.5)
kelly_frac = st.sidebar.slider("Fraction de Kelly appliquée", 0.05, 1.0, 0.25, 0.05)
initial_bankroll = st.sidebar.number_input("Bankroll initiale (€)", value=1000.0, step=100.0)

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
        st.info("Aucun match à venir en base. Génère des données depuis la barre latérale.")
    else:
        options = [f"{r.home_team} vs {r.away_team} ({r.date})" for r in upcoming.itertuples()]
        choice = st.selectbox("Choisir un match à venir", options)
        row = upcoming.iloc[options.index(choice)]

        feats, poisson_pred, model_probs, value_bets = analyze_and_predict(
            row["home_team"], row["away_team"],
            odds={
                "1": row["odds_home"], "X": row["odds_draw"], "2": row["odds_away"],
                "over25": row["odds_over25"], "under25": row["odds_under25"],
                "btts_yes": row["odds_btts_yes"], "btts_no": row["odds_btts_no"],
            },
            min_value_pct=min_value_pct, kelly_frac=kelly_frac,
        )

        col1, col2, col3 = st.columns(3)
        col1.metric("Buts attendus (dom.)", poisson_pred["expected_home_goals"])
        col2.metric("Buts attendus (ext.)", poisson_pred["expected_away_goals"])
        col3.metric("Score le + probable", poisson_pred["top_scores"][0]["score"],
                    f"{poisson_pred['top_scores'][0]['probability']*100:.1f}%")

        st.subheader("Probabilités 1X2 (modèle de Poisson)")
        fig = go.Figure(go.Bar(
            x=["Victoire domicile", "Match nul", "Victoire extérieur"],
            y=[poisson_pred["prob_home"], poisson_pred["prob_draw"], poisson_pred["prob_away"]],
            marker_color=["#2563eb", "#94a3b8", "#dc2626"],
            text=[f"{v*100:.1f}%" for v in [poisson_pred["prob_home"], poisson_pred["prob_draw"], poisson_pred["prob_away"]]],
            textposition="outside",
        ))
        fig.update_layout(yaxis_tickformat=".0%", height=350, margin=dict(t=20))
        st.plotly_chart(fig, use_container_width=True)

        colA, colB, colC = st.columns(3)
        with colA:
            st.markdown("**Over/Under 2.5 buts**")
            st.write(f"Over 2.5 : `{poisson_pred['prob_over25']*100:.1f}%`")
            st.write(f"Under 2.5 : `{poisson_pred['prob_under25']*100:.1f}%`")
        with colB:
            st.markdown("**BTTS (les 2 équipes marquent)**")
            st.write(f"Oui : `{poisson_pred['prob_btts_yes']*100:.1f}%`")
            st.write(f"Non : `{poisson_pred['prob_btts_no']*100:.1f}%`")
        with colC:
            st.markdown("**Top 3 scores probables**")
            for s in poisson_pred["top_scores"]:
                st.write(f"{s['score']} — `{s['probability']*100:.1f}%`")

        if ml_available:
            from ml_model import predict_match_ml
            ml_pred = predict_match_ml(feats, model_choice="gradient_boosting")
            st.subheader("Comparaison avec le modèle Machine Learning (Gradient Boosting)")
            comp_df = pd.DataFrame({
                "Issue": ["Domicile", "Nul", "Extérieur"],
                "Poisson": [poisson_pred["prob_home"], poisson_pred["prob_draw"], poisson_pred["prob_away"]],
                "ML (Gradient Boosting)": [ml_pred["prob_home"], ml_pred["prob_draw"], ml_pred["prob_away"]],
            })
            st.dataframe(comp_df.style.format({"Poisson": "{:.1%}", "ML (Gradient Boosting)": "{:.1%}"}),
                        use_container_width=True)
            st.caption(f"Score de confiance du modèle ML : **{ml_pred['confidence']*100:.1f}%** "
                       "(écart entre la probabilité la plus forte et la 2e — plus c'est haut, plus le modèle est tranché)")
        else:
            st.info("💡 Entraîne les modèles ML depuis la barre latérale pour voir la comparaison Poisson vs ML.")

        st.subheader("🔎 Contexte : forme, domicile/extérieur, H2H")
        colF1, colF2 = st.columns(2)
        with colF1:
            st.markdown(f"**{row['home_team']} (domicile)**")
            st.write(f"- Forme (5 derniers matchs) : `{feats['home_form_points']:.2f} pts/match`")
            st.write(f"- Buts marqués/encaissés (moy.) : `{feats['home_goals_for_avg']:.2f}` / `{feats['home_goals_against_avg']:.2f}`")
            st.write(f"- xG pour/contre (moy.) : `{feats['home_xg_for_avg']:.2f}` / `{feats['home_xg_against_avg']:.2f}`")
            st.write(f"- Points à domicile (moy.) : `{feats['home_at_home_points']:.2f}`")
        with colF2:
            st.markdown(f"**{row['away_team']} (extérieur)**")
            st.write(f"- Forme (5 derniers matchs) : `{feats['away_form_points']:.2f} pts/match`")
            st.write(f"- Buts marqués/encaissés (moy.) : `{feats['away_goals_for_avg']:.2f}` / `{feats['away_goals_against_avg']:.2f}`")
            st.write(f"- xG pour/contre (moy.) : `{feats['away_xg_for_avg']:.2f}` / `{feats['away_xg_against_avg']:.2f}`")
            st.write(f"- Points à l'extérieur (moy.) : `{feats['away_at_away_points']:.2f}`")

        st.markdown(f"**Confrontations directes (H2H)** — taux de victoire domicile historique : "
                    f"`{feats['h2h_home_win_rate']*100:.1f}%`")

        st.subheader("🎯 Value bets détectés sur ce match")
        if value_bets:
            vb_df = pd.DataFrame(value_bets)
            vb_df.columns = ["Marché", "Prob. modèle", "Cote bookmaker", "Prob. implicite", "Value (%)", "Mise Kelly (%)"]
            st.dataframe(
                vb_df.style.format({
                    "Prob. modèle": "{:.1%}", "Prob. implicite": "{:.1%}",
                    "Value (%)": "{:+.2f}%", "Mise Kelly (%)": "{:.2f}%",
                }).background_gradient(subset=["Value (%)"], cmap="Greens"),
                use_container_width=True,
            )
        else:
            st.info("Aucun value bet détecté sur ce match au seuil actuel.")

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
                _, _, _, vbs = analyze_and_predict(
                    row["home_team"], row["away_team"],
                    odds={
                        "1": row["odds_home"], "X": row["odds_draw"], "2": row["odds_away"],
                        "over25": row["odds_over25"], "under25": row["odds_under25"],
                        "btts_yes": row["odds_btts_yes"], "btts_no": row["odds_btts_no"],
                    },
                    min_value_pct=min_value_pct, kelly_frac=kelly_frac,
                )
                for vb in vbs:
                    vb["match"] = f"{row['home_team']} vs {row['away_team']}"
                    vb["date"] = row["date"]
                    all_value_bets.append(vb)

        if all_value_bets:
            top_df = pd.DataFrame(all_value_bets).sort_values("value_pct", ascending=False)
            top_df = top_df[["date", "match", "market", "model_prob", "bookmaker_odds",
                              "implied_prob", "value_pct", "kelly_stake_pct"]]
            top_df.columns = ["Date", "Match", "Marché", "Prob. modèle", "Cote", "Prob. implicite",
                              "Value (%)", "Mise Kelly (%)"]
            st.success(f"{len(top_df)} value bet(s) détecté(s) sur {len(upcoming)} matchs analysés.")
            st.dataframe(
                top_df.style.format({
                    "Prob. modèle": "{:.1%}", "Prob. implicite": "{:.1%}",
                    "Value (%)": "{:+.2f}%", "Mise Kelly (%)": "{:.2f}%",
                }).background_gradient(subset=["Value (%)"], cmap="Greens"),
                use_container_width=True, height=400,
            )
        else:
            st.info("Aucun value bet détecté sur les matchs à venir, au seuil actuel.")

# ============================== TAB 3 ==============================
with tab3:
    st.header("📈 Backtest de la stratégie & simulation de bankroll")
    st.caption(
        "Le backtest rejoue tout l'historique de matchs joués : à chaque match, le modèle de Poisson "
        "prédit les probabilités, on compare à des cotes de marché simulées (bruitées), et on ne mise "
        "que si un value bet est détecté, avec une taille de mise calculée par Kelly fractionnaire."
    )

    if st.button("▶️ Lancer le backtest"):
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
            fig = px.line(bankroll_df, x="bet_n", y="bankroll", title="Évolution de la bankroll simulée")
            fig.update_layout(height=400, xaxis_title="N° de pari", yaxis_title="Bankroll (€)")
            st.plotly_chart(fig, use_container_width=True)

        if not log_df.empty:
            st.subheader("Historique des paris simulés")
            st.dataframe(log_df, use_container_width=True, height=350)
    else:
        st.info("Clique sur « Lancer le backtest » pour voir les résultats.")

# ============================== TAB 4 ==============================
with tab4:
    st.header("🔬 Comparateur libre — choisis n'importe quelle affiche")
    teams = get_all_teams()

    if len(teams) < 2:
        st.info("Génère d'abord des données d'exemple depuis la barre latérale.")
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
            feats, poisson_pred, model_probs, value_bets = analyze_and_predict(
                home_team, away_team,
                odds={"1": odds_home, "X": odds_draw, "2": odds_away},
                min_value_pct=min_value_pct, kelly_frac=kelly_frac,
            )
            st.write(f"**Probabilités modèle** — Domicile: `{poisson_pred['prob_home']*100:.1f}%` · "
                    f"Nul: `{poisson_pred['prob_draw']*100:.1f}%` · "
                    f"Extérieur: `{poisson_pred['prob_away']*100:.1f}%`")
            st.write(f"**Score probable** : {poisson_pred['top_scores'][0]['score']}")

            if value_bets:
                st.success("Value bet(s) détecté(s) :")
                st.table(pd.DataFrame(value_bets))
            else:
                st.info("Pas de value bet sur ces cotes au seuil actuel.")
