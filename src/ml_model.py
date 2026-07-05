"""
ml_model.py
------------
Modèles supervisés pour la prédiction 1X2 :
- Régression logistique multinomiale (baseline interprétable)
- Gradient Boosting (meilleure performance attendue, non-linéarités)

Construit son propre jeu d'entraînement en reconstruisant, pour chaque
match historique, les features "telles qu'elles étaient avant le match"
(pas de fuite de données / data leakage).
"""

import numpy as np
import pandas as pd
import joblib
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, log_loss, classification_report

from features import load_matches_df, build_match_features

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_DIR.mkdir(exist_ok=True)

FEATURE_COLUMNS = [
    "home_form_points", "away_form_points",
    "home_goals_for_avg", "home_goals_against_avg",
    "away_goals_for_avg", "away_goals_against_avg",
    "home_xg_for_avg", "home_xg_against_avg",
    "away_xg_for_avg", "away_xg_against_avg",
    "home_form_variance", "away_form_variance",
    "home_at_home_points", "away_at_away_points",
    "h2h_home_win_rate", "h2h_avg_goals_home", "h2h_avg_goals_away",
]

LABEL_MAP = {0: "away", 1: "draw", 2: "home"}  # ordonné pour sklearn (classes triées)


def _outcome_label(row):
    if row["home_goals"] > row["away_goals"]:
        return 2  # home win
    elif row["home_goals"] == row["away_goals"]:
        return 1  # draw
    return 0      # away win


def build_training_dataset(min_matches_played=3):
    """
    Reconstruit un dataset d'entraînement en ne gardant que les matchs pour lesquels
    chaque équipe avait déjà joué au moins `min_matches_played` matchs (features fiables).
    """
    df = load_matches_df(status="played")
    records = []
    for _, row in df.iterrows():
        feats = build_match_features(df, row["home_team"], row["away_team"], match_date=row["date"])
        if feats["home_matches_played"] < min_matches_played or feats["away_matches_played"] < min_matches_played:
            continue
        feats["label"] = _outcome_label(row)
        records.append(feats)

    return pd.DataFrame(records)


def train_models(test_size=0.2, random_state=42):
    """Entraîne régression logistique + gradient boosting, sauvegarde les artefacts, retourne les métriques."""
    data = build_training_dataset()
    X = data[FEATURE_COLUMNS]
    y = data["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    logreg = LogisticRegression(max_iter=2000)
    logreg.fit(X_train_s, y_train)

    gbc = GradientBoostingClassifier(
        n_estimators=150, learning_rate=0.05, max_depth=3, random_state=random_state
    )
    gbc.fit(X_train, y_train)  # gradient boosting : pas besoin de scaler

    metrics = {}
    for name, model, X_te in [("logistic_regression", logreg, X_test_s), ("gradient_boosting", gbc, X_test)]:
        preds = model.predict(X_te)
        probs = model.predict_proba(X_te)
        metrics[name] = {
            "accuracy": round(float(accuracy_score(y_test, preds)), 4),
            "log_loss": round(float(log_loss(y_test, probs, labels=model.classes_)), 4),
            "n_test_samples": int(len(y_test)),
        }

    joblib.dump(logreg, MODEL_DIR / "logreg.joblib")
    joblib.dump(gbc, MODEL_DIR / "gbc.joblib")
    joblib.dump(scaler, MODEL_DIR / "scaler.joblib")
    data.to_csv(MODEL_DIR / "training_dataset.csv", index=False)

    return metrics


def load_models():
    try:
        logreg = joblib.load(MODEL_DIR / "logreg.joblib")
        gbc = joblib.load(MODEL_DIR / "gbc.joblib")
        scaler = joblib.load(MODEL_DIR / "scaler.joblib")
    except Exception as exc:
        print(f"Model loading failed: {exc}. Re-training models with the current environment.")
        train_models()
        logreg = joblib.load(MODEL_DIR / "logreg.joblib")
        gbc = joblib.load(MODEL_DIR / "gbc.joblib")
        scaler = joblib.load(MODEL_DIR / "scaler.joblib")
    return logreg, gbc, scaler


def predict_match_ml(features: dict, model_choice="gradient_boosting"):
    """
    Prédit P(away), P(draw), P(home) avec le modèle choisi, et calcule un
    score de confiance basé sur l'écart entre la probabilité la plus forte
    et la deuxième (plus l'écart est grand, plus le modèle est "sûr").
    """
    logreg, gbc, scaler = load_models()
    X = pd.DataFrame([features])[FEATURE_COLUMNS]

    if model_choice == "logistic_regression":
        X_in = scaler.transform(X)
        model = logreg
        raw_probs = logreg.predict_proba(X_in)[0]
    else:
        model = gbc
        raw_probs = gbc.predict_proba(X)[0]

    # Le modèle peut avoir été entraîné sans voir toutes les classes (ex: pas de nul
    # dans le jeu d'entraînement) : on replace chaque proba à son index réel (0/1/2).
    probs = np.zeros(3)
    for cls, p in zip(model.classes_, raw_probs):
        probs[cls] = p

    sorted_probs = sorted(probs, reverse=True)
    confidence = float(sorted_probs[0] - sorted_probs[1])  # 0 = incertain, ~1 = quasi certain

    return {
        "prob_away": round(float(probs[0]), 4),
        "prob_draw": round(float(probs[1]), 4),
        "prob_home": round(float(probs[2]), 4),
        "confidence": round(confidence, 4),
        "model_used": model_choice,
    }


if __name__ == "__main__":
    m = train_models()
    print("Métriques d'entraînement :")
    for name, vals in m.items():
        print(f"  {name}: {vals}")
