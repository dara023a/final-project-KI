"""Training model klasifikasi ancaman grup WhatsApp.

Kelas:
    safe | spam | phishing | social_engineering

Alur:
1. Baca dataset sintetis data/security_dataset.csv.
2. Tambahkan data spam dari Kaggle SMS Spam Collection (data/spam.csv).
3. Bersihkan teks dengan clean_text() (sama dengan saat inference).
4. Ekstraksi fitur TF-IDF word (1-2 gram) + char (3-5 gram).
5. Latih Logistic Regression class-balanced.
6. Evaluasi pada test set sintetis + test set manual.
7. Simpan artefak ke model/security_model.joblib dan metrik ke
   model/security_metrics.json.

Jalankan dari root proyek:
    python train_ml.py
"""

import json
import os
from datetime import datetime, timezone

import joblib
import pandas as pd
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import FeatureUnion, Pipeline

from ml_text import clean_text

DATA_PATH = os.path.join("data", "security_dataset.csv")
SYNTHETIC_TEST_PATH = os.path.join("data", "security_test_synthetic.csv")
MANUAL_TEST_PATH = os.path.join("data", "security_test_manual.csv")
KAGGLE_SPAM_PATH = os.path.join("data", "spam.csv")
MODEL_DIR = "model"
MODEL_PATH = os.path.join(MODEL_DIR, "security_model.joblib")
METRICS_PATH = os.path.join(MODEL_DIR, "security_metrics.json")

LABELS = ["safe", "spam", "phishing", "social_engineering"]
RANDOM_STATE = 42
CV_FOLDS = 5


def load_kaggle_spam() -> pd.DataFrame:
    """Muat spam tambahan dari Kaggle SMS Spam Collection (data/spam.csv)."""
    if not os.path.exists(KAGGLE_SPAM_PATH):
        print(f"[Data] Dataset Kaggle tidak ditemukan di {KAGGLE_SPAM_PATH} — lanjut tanpa data spam tambahan.")
        return pd.DataFrame(columns=["text", "label"])

    kaggle = pd.read_csv(KAGGLE_SPAM_PATH, encoding="latin-1")
    spam_rows = []
    for _, row in kaggle.iterrows():
        label = str(row.get("v1") or "").strip().lower()
        text = str(row.get("v2") or "").strip()
        if label != "spam" or not text:
            continue
        spam_rows.append({"text": text, "label": "spam"})

    kaggle_df = pd.DataFrame(spam_rows, columns=["text", "label"])
    kaggle_df["clean"] = kaggle_df["text"].map(clean_text)
    kaggle_df = kaggle_df[kaggle_df["clean"].str.len() > 0]
    kaggle_df = kaggle_df.drop_duplicates(subset=["clean"]).reset_index(drop=True)

    print(f"[Data] Kaggle SMS Spam        : {len(kaggle_df)} baris")
    return kaggle_df[["text", "label"]]


def load_dataset() -> pd.DataFrame:
    if not os.path.exists(DATA_PATH):
        raise SystemExit(
            f"Dataset tidak ditemukan di {DATA_PATH}.\n"
            "Jalankan `python generate_security_dataset.py` terlebih dahulu."
        )

    df = pd.read_csv(DATA_PATH, encoding="utf-8")
    required = {"text", "label"}
    if not required.issubset(df.columns):
        raise SystemExit(f"Kolom dataset harus berisi {required}, ditemukan {set(df.columns)}")

    df = df[["text", "label"]].copy()
    kaggle_spam = load_kaggle_spam()
    df = pd.concat([df, kaggle_spam], ignore_index=True)

    df["clean"] = df["text"].map(clean_text)

    before = len(df)
    df = df[df["clean"].str.len() > 0].copy()
    empty_removed = before - len(df)

    before_dedup = len(df)
    df = df.drop_duplicates(subset=["clean"]).reset_index(drop=True)
    duplicates_removed = before_dedup - len(df)

    unknown = sorted(set(df["label"]) - set(LABELS))
    if unknown:
        raise SystemExit(f"Label tidak dikenal: {unknown}. Label yang valid: {LABELS}")

    print(f"[Data] Baris awal          : {before}")
    print(f"[Data] Teks kosong dibuang : {empty_removed}")
    print(f"[Data] Duplikat dibuang    : {duplicates_removed}")
    print(f"[Data] Baris dipakai       : {len(df)}")
    print("[Data] Distribusi label:")
    print(df["label"].value_counts().reindex(LABELS).to_string())
    print()

    return df


def build_pipeline() -> Pipeline:
    features = FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    ngram_range=(1, 2),
                    min_df=2,
                    max_features=80_000,
                    sublinear_tf=True,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=2,
                    max_features=120_000,
                    sublinear_tf=True,
                ),
            ),
        ]
    )
    classifier = LogisticRegression(
        max_iter=3_000,
        class_weight="balanced",
        C=3.0,
        solver="lbfgs",
    )
    return Pipeline([("features", features), ("classifier", classifier)])


def evaluate(y_true, y_pred, labels) -> dict:
    report_dict = classification_report(
        y_true, y_pred, labels=labels, digits=4, zero_division=0, output_dict=True
    )
    cm = confusion_matrix(y_true, y_pred, labels=labels)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
        "weighted_f1": round(float(f1_score(y_true, y_pred, average="weighted")), 4),
        "per_class": {
            label: {
                "precision": round(float(report_dict[label]["precision"]), 4),
                "recall": round(float(report_dict[label]["recall"]), 4),
                "f1": round(float(report_dict[label]["f1-score"]), 4),
                "support": int(report_dict[label]["support"]),
            }
            for label in labels
        },
        "confusion_matrix": {
            "labels": labels,
            "matrix": cm.tolist(),
        },
    }


def print_metrics(title: str, metrics: dict) -> None:
    print(f"\n=== {title} ===")
    print(f"Accuracy    : {metrics['accuracy']:.4f}")
    print(f"Macro F1    : {metrics['macro_f1']:.4f}")
    print(f"Weighted F1 : {metrics['weighted_f1']:.4f}")
    print("\nPer kelas:")
    print(
        f"{'label':20s} {'precision':>10s} {'recall':>10s} {'f1':>10s} {'support':>10s}"
    )
    for label, row in metrics["per_class"].items():
        print(
            f"{label:20s} {row['precision']:10.4f} {row['recall']:10.4f} "
            f"{row['f1']:10.4f} {row['support']:10d}"
        )
    labels = metrics["confusion_matrix"]["labels"]
    matrix = metrics["confusion_matrix"]["matrix"]
    print("\nConfusion matrix (baris = aktual, kolom = prediksi):")
    print(" " * 22 + " ".join(f"{label[:8]:>8s}" for label in labels))
    for label, row in zip(labels, matrix):
        print(f"{label:22s}" + " ".join(f"{value:8d}" for value in row))


def load_test_file(path: str, title: str) -> pd.DataFrame | None:
    if not os.path.exists(path):
        print(f"[Test] File {title} tidak ditemukan: {path}")
        return None

    df = pd.read_csv(path, encoding="utf-8")
    df["clean"] = df["text"].map(clean_text)
    df = df[df["clean"].str.len() > 0].copy()
    unknown = sorted(set(df["label"]) - set(LABELS))
    if unknown:
        raise SystemExit(f"Label tidak dikenal pada {path}: {unknown}")
    print(f"[Test] {title:20s}: {len(df)} baris")
    print("[Test] Distribusi label:")
    print(df["label"].value_counts().reindex(LABELS).to_string())
    return df


def top_features(pipeline: Pipeline, labels) -> dict:
    features = pipeline.named_steps["features"]
    classifier = pipeline.named_steps["classifier"]
    names = features.get_feature_names_out()
    result = {}
    for class_index, class_label in enumerate(classifier.classes_):
        coefs = classifier.coef_[class_index]
        top_idx = coefs.argsort()[-15:][::-1]
        result[str(class_label)] = [
            {"term": str(names[i]), "weight": round(float(coefs[i]), 4)}
            for i in top_idx
        ]
    return result


def main() -> None:
    print("=" * 68)
    print("  TRAINING MODEL KEAMANAN GRUP WHATSAPP")
    print("  TF-IDF word + char n-gram + Logistic Regression")
    print("=" * 68)

    df = load_dataset()
    synthetic_df = load_test_file(SYNTHETIC_TEST_PATH, "uji sintetis (held-out)")
    manual_df = load_test_file(MANUAL_TEST_PATH, "uji manual")

    X = df["clean"]
    y = df["label"]

    pipeline = build_pipeline()

    print("\n[Train] Cross-validation pada data training...")
    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    cv_scores = cross_val_score(
        pipeline, X, y, cv=cv, scoring="f1_macro", n_jobs=1
    )
    print(
        f"[Train] CV macro F1: {cv_scores.mean():.4f} "
        f"(+/- {cv_scores.std():.4f}) dari {CV_FOLDS} fold"
    )

    print("\n[Train] Fit model final pada seluruh data training...")
    pipeline.fit(X, y)

    metrics = None
    if synthetic_df is not None and len(synthetic_df) > 0:
        synthetic_pred = pipeline.predict(synthetic_df["clean"])
        metrics = evaluate(synthetic_df["label"], synthetic_pred, LABELS)
        print_metrics("HASIL TEST SET SINTETIS (template ditahan)", metrics)

    manual_metrics = None
    if manual_df is not None and len(manual_df) > 0:
        manual_pred = pipeline.predict(manual_df["clean"])
        manual_metrics = evaluate(manual_df["label"], manual_pred, LABELS)
        print_metrics("HASIL TEST SET MANUAL (termasuk hard-negative)", manual_metrics)

        print("\nDetail prediksi test manual:")
        for text, actual, pred in zip(
            manual_df["text"], manual_df["label"], manual_pred
        ):
            marker = "OK " if actual == pred else "SALAH"
            print(f"  [{marker}] aktual={actual:20s} prediksi={pred:20s} | {text[:90]}")

    features = pipeline.named_steps["features"]
    classifier = pipeline.named_steps["classifier"]
    top = top_features(pipeline, LABELS)

    artifact = {
        "features": features,
        "classifier": classifier,
        "labels": LABELS,
        "metrics": metrics,
        "manual_metrics": manual_metrics,
        "cv_macro_f1": {
            "mean": round(float(cv_scores.mean()), 4),
            "std": round(float(cv_scores.std()), 4),
            "folds": CV_FOLDS,
        },
        "top_features": top,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset": {
            "rows": int(len(df)),
            "random_state": RANDOM_STATE,
            "source": DATA_PATH,
            "kaggle_source": KAGGLE_SPAM_PATH,
            "kaggle_spam_rows": int(len(load_kaggle_spam())),
            "synthetic_test_rows": int(len(synthetic_df)) if synthetic_df is not None else 0,
            "manual_test_rows": int(len(manual_df)) if manual_df is not None else 0,
        },
        "sklearn_version": sklearn.__version__,
    }

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(artifact, MODEL_PATH, compress=3)

    with open(METRICS_PATH, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "trained_at": artifact["trained_at"],
                "dataset": artifact["dataset"],
                "cv_macro_f1": artifact["cv_macro_f1"],
                "metrics": metrics,
                "manual_metrics": manual_metrics,
                "top_features": top,
                "sklearn_version": artifact["sklearn_version"],
            },
            fh,
            ensure_ascii=False,
            indent=2,
        )

    print(f"\n[Model] Disimpan ke : {MODEL_PATH}")
    print(f"[Model] Metrik ke   : {METRICS_PATH}")
    print(f"[Model] Ukuran      : {os.path.getsize(MODEL_PATH) / (1024 * 1024):.2f} MB")
    print("\nSelesai. Jalankan `python ml_service.py` untuk inference.\n")


if __name__ == "__main__":
    main()
