"""ML inference service untuk Security-Bot.

Service HTTP ringan berbasis standard library Python (tanpa Flask/FastAPI)
yang memuat model hasil train_ml.py dan menyediakan endpoint:

    GET  /health   -> status model
    POST /predict  -> klasifikasi satu teks

Kelas: safe | spam | phishing | social_engineering

Jalankan dari root proyek:
    python ml_service.py

Konfigurasi environment:
    ML_HOST (default 127.0.0.1)
    ML_PORT (default 5001)
"""

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import joblib

from ml_text import clean_text

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "security_model.joblib")

HOST     = os.environ.get("ML_HOST", "127.0.0.1")
PORT     = int(os.environ.get("ML_PORT", "5001"))
MAX_BODY = 32 * 1024  # 32 KB cukup untuk satu pesan WhatsApp


class ModelStore:
    """Wrapper model + metadata, dimuat sekali saat service start."""

    def __init__(self):
        self.artifact = None
        self.error = None
        self.loaded_at = None
        self.started_at = time.time()
        self.load()

    def load(self):
        try:
            self.artifact = joblib.load(MODEL_PATH)
            self.loaded_at = time.time()
            self.error = None
            labels = ", ".join(self.artifact.get("labels", []))
            print(f"[ML] Model dimuat dari {MODEL_PATH}")
            print(f"[ML] Label: {labels}")
        except Exception as exc:  # noqa: BLE001
            self.artifact = None
            self.error = str(exc)
            print(f"[ML] GAGAL memuat model: {exc}")
            print("[ML] Jalankan `python train_ml.py` terlebih dahulu.")

    @property
    def ready(self) -> bool:
        return self.artifact is not None

    def info(self) -> dict:
        artifact = self.artifact or {}
        return {
            "status": "ok" if self.ready else "model_not_loaded",
            "model": "tfidf_word_char+logistic_regression",
            "model_path": MODEL_PATH,
            "labels": artifact.get("labels", []),
            "trained_at": artifact.get("trained_at"),
            "sklearn_version": artifact.get("sklearn_version"),
            "dataset": artifact.get("dataset"),
            "metrics": artifact.get("metrics"),
            "manual_metrics": artifact.get("manual_metrics"),
            "cv_macro_f1": artifact.get("cv_macro_f1"),
            "loaded_at": self.loaded_at,
            "uptime_seconds": round(time.time() - self.started_at, 1),
            "error": self.error,
        }

    def predict(self, text: str) -> dict:
        artifact = self.artifact
        features = artifact["features"]
        classifier = artifact["classifier"]

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

        matrix = features.transform([cleaned])
        probabilities = classifier.predict_proba(matrix)[0]
        best_index = int(probabilities.argmax())
        label = str(classifier.classes_[best_index])
        confidence = float(probabilities[best_index])

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


MODEL = ModelStore()


class MLHandler(BaseHTTPRequestHandler):
    server_version = "SafetyBotML/1.0"

    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.path in ("/", "/health"):
            self._send_json(200, MODEL.info())
        else:
            self._send_json(404, {"error": "Endpoint tidak ditemukan. Gunakan /health atau /predict."})

    def do_POST(self):  # noqa: N802
        if self.path != "/predict":
            self._send_json(404, {"error": "Endpoint tidak ditemukan. Gunakan /predict."})
            return

        if not MODEL.ready:
            self._send_json(503, {"error": "Model belum dimuat. Jalankan train_ml.py."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0

        if length <= 0 or length > MAX_BODY:
            self._send_json(400, {"error": f"Body harus 1-{MAX_BODY} byte."})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"error": "Body harus JSON valid."})
            return

        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str) or not text.strip():
            self._send_json(400, {"error": "Field 'text' wajib diisi dan berupa string."})
            return

        try:
            result = MODEL.predict(text)
        except Exception as exc:  # noqa: BLE001
            print(f"[ML] Prediction error: {exc}")
            self._send_json(500, {"error": f"Gagal memprediksi: {exc}"})
            return

        self._send_json(200, result)

    def log_message(self, fmt, *args):  # noqa: A003
        # Log ringkas: cukup method + path, tanpa timestamp bawaan yang panjang.
        print(f"[ML] {self.command} {self.path} -> {fmt % args}")


def main():
    print("=" * 60)
    print("  SECURITY-BOT ML SERVICE")
    print("=" * 60)
    print(f"  Model : {MODEL_PATH}")
    print(f"  Listen: http://{HOST}:{PORT}")
    print("  Endpoint: GET /health | POST /predict")
    print("=" * 60)

    server = ThreadingHTTPServer((HOST, PORT), MLHandler)
    server.daemon_threads = True

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[ML] Service dihentikan.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
