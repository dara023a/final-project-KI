"""Preprocessing teks bersama untuk training dan inference.

Fokus: klasifikasi ancaman grup WhatsApp
    safe | spam | phishing | social_engineering

Fungsi clean_text() WAJIB dipakai di train_ml.py dan ml_service.py agar
distribusi fitur saat training sama dengan saat prediksi.
"""

import re
import unicodedata

URL_RE      = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
EMAIL_RE    = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
MENTION_RE  = re.compile(r"@\w+")
HASHTAG_RE  = re.compile(r"#(\w+)")
RT_RE       = re.compile(r"\brt\b\s*:?", re.IGNORECASE)
NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
SPACE_RE    = re.compile(r"\s+")
REPEAT_RE   = re.compile(r"(.)\1{2,}")  # bangsaaat -> bangsaa

# Normalisasi singkatan/istilah yang umum di chat Indonesia.
SLANG_MAP = {
    "gak": "tidak", "ga": "tidak", "gk": "tidak", "tdk": "tidak",
    "engga": "tidak", "enggak": "tidak",
    "bgt": "banget", "bngt": "banget",
    "lu": "kamu", "loe": "kamu", "lo": "kamu", "elu": "kamu",
    "gw": "saya", "gue": "saya", "gua": "saya",
    "udh": "sudah", "udah": "sudah", "sdh": "sudah",
    "blm": "belum", "blum": "belum",
    "dgn": "dengan", "utk": "untuk", "krn": "karena", "karna": "karena",
    "yg": "yang", "jd": "jadi", "jg": "juga", "aja": "saja", "aj": "saja",
    "bkn": "bukan", "gmn": "bagaimana", "gimana": "bagaimana",
    "knp": "kenapa", "org": "orang", "orng": "orang",
    "tp": "tapi", "tpi": "tapi", "sm": "sama", "sma": "sama",
    "dr": "dari", "dri": "dari", "lg": "lagi", "lgi": "lagi",
    "bs": "bisa", "bsa": "bisa", "hrs": "harus", "hrus": "harus",
    "skrg": "sekarang", "skrng": "sekarang", "bener": "benar", "bnr": "benar",
    "rek": "rekening", "trf": "transfer", "tf": "transfer",
    "verif": "verifikasi", "konfirm": "konfirmasi",
    "wkwk": "", "wkwkwk": "", "hehe": "", "haha": "", "hihi": "",
}


def normalize_text(text) -> str:
    """Normalisasi ringan: lowercase, NFKC, rapikan spasi."""
    if text is None:
        return ""
    text = unicodedata.normalize("NFKC", str(text)).lower()
    return SPACE_RE.sub(" ", text).strip()


def clean_text(text) -> str:
    """Bersihkan teks mentah menjadi bentuk stabil untuk TF-IDF."""
    text = normalize_text(text)

    # Ganti URL/email dengan token agar sinyal tetap ada tanpa noise domain.
    text = URL_RE.sub(" urltoken ", text)
    text = EMAIL_RE.sub(" emailtoken ", text)
    text = MENTION_RE.sub(" ", text)
    text = HASHTAG_RE.sub(r"\1", text)
    text = RT_RE.sub(" ", text)

    # Buang HTML entity & tanda baca, sisakan huruf/angka.
    text = text.replace("&amp;", " dan ").replace("&lt;", " ").replace("&gt;", " ")
    text = NON_WORD_RE.sub(" ", text)

    # Rapikan karakter berulang berlebihan, lalu normalisasi slang.
    text = REPEAT_RE.sub(r"\1\1", text)
    tokens = [SLANG_MAP.get(tok, tok) for tok in text.split()]
    tokens = [tok for tok in tokens if tok]

    return SPACE_RE.sub(" ", " ".join(tokens)).strip()
