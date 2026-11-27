# 🛡️ Security-Bot — WhatsApp Group Security Bot

Dukungan UAS mata kuliah **Keamanan Informasi**:

> **Pengembangan Bot Keamanan Grup WhatsApp Berbasis Kecerdasan Buatan untuk Mitigasi Ancaman Spam, Phishing, dan Rekayasa Sosial secara Real-Time**

## 1. Ringkasan Fitur

Bot WhatsApp ini mengamati grup yang dikelola dan melakukan **deteksi ancaman keamanan secara real-time**, termasuk:

| Ancaman | Deteksi | Aksi |
|---|---|---|
| **Spam** | Flood, duplikat, link massal, mention massal, kata judi/pinjol/promo | Log → hapus + peringatan → kick |
| **Phishing** | Shortener, IP host, TLD mencurigakan, lookalike domain, path sensitif, teks verifikasi | Log → hapus + peringatan → kick |
| **Rekayasa Sosial** | Permintaan OTP/PIN/password, transfer mendesak, impersonasi admin/bank/polisi, iming hadiah | Log → hapus + peringatan (berbobot 2) → kick |

Mode operasi mendukung:

- `rules` : heuristik lokal.
- `ml` : heuristik + model ML.
- `llm` : heuristik + LLM.
- `hybrid` : heuristik + ML + LLM untuk kasus ambigu (default).

Selain keamanan, bot juga menyediakan fitur pendukung:

- Lock/unlock jadwal shalat.
- Jam operasional grup.
- Dashboard statistik.

## 2. Arsitektur

```text
Pesan WhatsApp masuk
  → handleAllMessagesRaw
  → recordMessage() (baseline rate / duplikat)
  → rules:
      spamAnalyzer
      phishingAnalyzer
      socialEngineeringAnalyzer
  → ML service (TF-IDF word+char + Logistic Regression)
  → LLM (Ollama, kasus ambigu)
  → risk score → severity
  → securityHandler:
      hapus pesan
      → warning / kick
      → notifikasi owner
      → incident log
```

## 3. Persiapan Lingkungan

### 3.1 Python / ML

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

python generate_security_dataset.py
python train_ml.py
python ml_service.py          # http://127.0.0.1:5001
```

Output:

- `data/security_dataset.csv`
- `data/security_test_synthetic.csv`
- `data/security_test_manual.csv`
- `data/spam.csv` — data tambahan dari Kaggle SMS Spam Collection
- `model/security_model.joblib`
- `model/security_metrics.json`

### 3.2 Node / Bot

```bash
cd admin-bot-main
npm install
npm start
```

Dashboard: `http://localhost:7860`

ML service harus berjalan sebelum bot memproses.

### 3.3 Ollama (opsional)

Untuk mode `hybrid` / `llm`:

```bash
ollama serve
ollama pull qwen2.5:3b
```

## 4. Evaluasi

### 4.1 ML

| Metrik | Test sintetis (template ditahan) | Uji manual |
|---|---:|---:|
| Accuracy | 0.9530 | 0.9077 |
| Macro F1 | 0.9531 | 0.9096 |

Catatan: model saat ini dilatih dari dataset sintetis plus spam tambahan dari Kaggle SMS Spam Collection (`data/spam.csv`, 629 spam). Uji tetap menggunakan test sintetis dan uji manual.

### 4.2 Catatan Evaluasi

- Dataset sintetis dibuat dari template Bahasa Indonesia WhatsApp.
- Ditambah data spam asli dari Kaggle SMS Spam Collection untuk memperkuat kelas spam.
- Angka tidak boleh disangka seperti data real penuh.
- Hasil menunjukkan model mampu mengenali indikator kuat spam, phishing, dan rekayasa sosial, namun perlu validasi lebih lanjut pada korpus nyata.

## 5. Struktur Utama

```text
.
├── generate_security_dataset.py
├── train_ml.py
├── ml_service.py
├── predict_ml.py
├── ml_text.py
├── requirements.txt
├── data/
│   ├── security_dataset.csv
│   ├── security_test_synthetic.csv
│   ├── security_test_manual.csv
│   ├── spam.csv
│   └── re_dataset.csv
├── model/
│   ├── security_model.joblib
│   └── security_metrics.json
└── admin-bot-main/
    ├── index.js
    ├── config.js
    ├── test-bot.js
    ├── public/index.html
    ├── handlers/securityHandler.js
    ├── utils/
    │   ├── threatAnalyzer.js
    │   ├── spamAnalyzer.js
    │   ├── phishingAnalyzer.js
    │   ├── socialEngineeringAnalyzer.js
    │   ├── mlClient.js
    │   ├── llmSecurity.js
    │   └── incidents.js
    └── data/incidents.json
```

## 6. Perintah Utama

| Perintah | Fungsi |
|---|---|
| `!status` | Status bot & mode keamanan |
| `!apistats` | Statistik AI / ancaman / incident |
| `!incidents` | Insiden keamanan terbaru (owner) |
| `!help` | Daftar perintah |
| `!groups` | Daftar grup dikelola |
| `!warn <groupId> <number>` | Cek peringatan member |
| `!reset <groupId> <number>` | Reset peringatan |
| `!lock <groupId>` / `!unlock <groupId>` | Kontrol grup |

## 7. Status Implementasi

- ✅ Pipeline real-time untuk 3 ancaman.
- ✅ Model ML 4 kelas.
- ✅ Heuristik URL phishing.
- ✅ Peringatan, kick, notifikasi owner.
- ✅ Dashboard incident.
- ✅ Test bot.

## 8. Catatan Penting

- Gunakan mode `hybrid` untuk kasus ambigu.
- Model saat ini dilatih pada dataset sintetis plus data spam tambahan dari Kaggle SMS Spam Collection (`data/spam.csv`, 629 spam).
- Untuk produksi, sebaiknya dataset real + validasi domain/URL reputation.
