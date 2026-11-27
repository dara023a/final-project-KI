"""Uji cepat model keamanan tanpa menjalankan service.

Contoh:
    python predict_ml.py "akun bca anda diblokir, verifikasi di bit.ly/abc"
    python predict_ml.py            # mode interaktif
"""

import json
import os
import sys

import joblib

from ml_text import clean_text

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "model", "security_model.joblib"
)


def load_model():
    if not os.path.exists(MODEL_PATH):
        raise SystemExit(
            f"Model tidak ditemukan di {MODEL_PATH}.\n"
            "Jalankan `python train_ml.py` terlebih dahulu."
        )
    return joblib.load(MODEL_PATH)


def predict(artifact, text):
    cleaned = clean_text(text)
    if not cleaned:
        return {
            "is_threat": False,
            "category": "safe",
            "confidence": 1.0,
            "reason": "Teks kosong setelah preprocessing",
            "clean_text": "",
            "probabilities": {},
        }

    features = artifact["features"]
    classifier = artifact["classifier"]
    probabilities = classifier.predict_proba(features.transform([cleaned]))[0]
    best = int(probabilities.argmax())
    label = str(classifier.classes_[best])
    confidence = float(probabilities[best])

    return {
        "is_threat": label != "safe",
        "category": label,
        "confidence": round(confidence, 4),
        "reason": f"ML: {label} ({confidence:.2f})",
        "clean_text": cleaned,
        "probabilities": {
            str(cls): round(float(prob), 4)
            for cls, prob in zip(classifier.classes_, probabilities)
        },
    }


def main():
    artifact = load_model()

    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
        print(json.dumps(predict(artifact, text), ensure_ascii=False, indent=2))
        return

    print("Mode interaktif — ketik teks lalu Enter (kosong untuk keluar).")
    while True:
        try:
            text = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            break
        print(json.dumps(predict(artifact, text), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
