# Final Project KI — Safety-Bot

Proyek akhir mata kuliah **Kecerdasan Buatan** yang menggabungkan dua komponen:

1. **ML Hate Speech Classifier** — model klasifikasi teks Bahasa Indonesia (kata kasar, rasis, dan SARA) menggunakan **TF-IDF + Logistic Regression**.
2. **Safety-Bot** — bot admin WhatsApp otomatis untuk moderasi grup, dilengkapi **LLM lokal (Ollama)** sebagai validator konten, penjadwal shalat, jam operasional grup, dan **dashboard web** real-time.

---

## Daftar Isi

- [Fitur](#fitur)
- [Arsitektur](#arsitektur)
- [Struktur Proyek](#struktur-proyek)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan Model ML](#menjalankan-model-ml)
- [Menjalankan Bot](#menjalankan-bot)
- [Dashboard](#dashboard)
- [Perintah Bot](#perintah-bot)
- [Mode Moderasi](#mode-moderasi)
- [REST API](#rest-api)
- [Docker](#docker)
- [Troubleshooting](#troubleshooting)
- [Lisensi](#lisensi)

---

## Fitur

### Komponen ML
- Klasifikasi teks otomatis ke 3 label: `sara`, `rude`, `none`.
- Menggunakan dataset **13.000+ tweet** Bahasa Indonesia (`data/re_dataset.csv`).
- Evaluasi model dengan `classification_report` (precision, recall, F1) dan `confusion_matrix`.

### Komponen Bot WhatsApp
| No | Fitur | Keterangan |
|----|-------|------------|
| 1 | **Sambutan Anggota Baru** | Menyambut otomatis + deskripsi & aturan grup |
| 2 | **Moderasi Otomatis** | Deteksi kata kasar / rasis / SARA, peringatan 3x lalu kick otomatis |
| 3 | **Validasi LLM Lokal** | Deteksi konteks SARA tanpa kata kasar menggunakan **Ollama** |
| 4 | **Pengingat Shalat 5 Waktu** | Reminder, notifikasi adzan, dan pesan selesai ibadah |
| 5 | **Jam Operasional Grup** | Buka 03:00–22:00 WIB, otomatis kunci saat waktu istirahat |
| 6 | **Dashboard Web** | Statistik bot, AI, jadwal shalat, log, dan editor konfigurasi |
| 7 | **Kontrol Owner** | Bangun/tidurkan bot, reset warning, lock/unlock grup |

---

## Arsitektur

```
┌────────────────────────────────────────────────────────────┐
│                    DASHBOARD (Express + HTML)               │
│            http://localhost:7860  —  /api/stats             │
└───────────────────────────┬────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────┐
│                  SAFETY-BOT (Node.js)                       │
│  whatsapp-web.js  │  node-cron  │  express                  │
│                                                            │
│  index.js ──► handlers/ (welcome, moderation, prayer)       │
│            └► utils/ (grokAI -> Ollama, storage)            │
└──────────────┬───────────────────────────────┬─────────────┘
               │                               │
      ┌────────▼────────┐            ┌─────────▼──────────┐
      │  Ollama (lokal) │            │  Aladhan API       │
      │  qwen2.5:3b     │            │  (jadwal shalat)   │
      └─────────────────┘            └────────────────────┘

┌────────────────────────────────────────────────────────────┐
│         MODEL ML (Python) — train_ml.py                    │
│  TF-IDF (1-2 gram) + Logistic Regression (balanced)        │
│  Dataset: data/re_dataset.csv  ->  label: sara/rude/none   │
└────────────────────────────────────────────────────────────┘
```

---

## Struktur Proyek

```
final-project-ai/
├── README.md                   # Dokumentasi ini
├── train_ml.py                 # Script training model ML
├── data/
│   └── re_dataset.csv          # Dataset tweet (13rb+ baris)
├── .env                        # Env LLM (lokal, tidak di-commit)
├── venv/                       # Virtual environment Python (lokal)
└── admin-bot-main/
    ├── index.js                # Entry point bot + server dashboard
    ├── config.js               # Konfigurasi utama & teks pesan
    ├── test-bot.js             # Script uji logika bot
    ├── package.json
    ├── .env.example            # Template environment
    ├── Dockerfile
    ├── handlers/
    │   ├── welcomeHandler.js   # Sambutan anggota baru
    │   ├── moderationHandler.js# Peringatan & kick
    │   └── prayerHandler.js    # Jadwal shalat
    ├── utils/
    │   ├── grokAI.js           # Validasi konten via Ollama
    │   └── storage.js          # Simpan warning & status (JSON)
    └── public/
        └── index.html          # Dashboard web
```

---

## Prasyarat

| Kebutuhan | Versi / Catatan |
|-----------|-----------------|
| **Node.js** | >= 18.0.0 |
| **npm** | >= 9.0.0 |
| **Python** | >= 3.9 |
| **Ollama** | Untuk LLM lokal — [ollama.com](https://ollama.com) |
| **Google Chrome / Chromium** | Dibutuhkan oleh Puppeteer |
| **Nomor WhatsApp** | Nomor khusus untuk bot |

---

## Instalasi

### 1. Clone repository

```bash
git clone https://github.com/dara023a/final-project-KI.git
cd final-project-KI
```

### 2. Setup environment Python (untuk ML)

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install pandas scikit-learn
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
pip install pandas scikit-learn
```

### 3. Install dependensi bot

```bash
cd admin-bot-main
npm install
```

### 4. Siapkan Ollama (LLM lokal)

```bash
# Install Ollama terlebih dahulu dari https://ollama.com
ollama pull qwen2.5:3b
ollama serve
```

Verifikasi Ollama berjalan:

```bash
curl http://localhost:11434/api/tags
```

---

## Konfigurasi

### File `.env` (root maupun `admin-bot-main/.env`)

Salin template lalu sesuaikan:

```bash
cd admin-bot-main
copy .env.example .env      # Windows
# cp .env.example .env      # Linux / macOS
```

Isi file `.env`:

```env
OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:3b
MODERATION_MODE=llm
OWNER_NUMBER=628xxxxxxxxxx
BOT_NUMBER=628xxxxxxxxxx
TZ=Asia/Jakarta
```

> Peringatan: file `.env` **tidak pernah di-commit** ke Git (sudah masuk `.gitignore`). Jangan bagikan API key/rahasia.

### `admin-bot-main/config.js`

| Field | Default | Keterangan |
|-------|---------|------------|
| `BOT_NAME` | `Safety-Bot` | Nama tampilan bot |
| `OWNER_NUMBER` | `6282254513920` | Nomor owner (bisa lebih dari satu, pisahkan koma) |
| `BOT_NUMBER` | `62895416132949` | Nomor bot (format 62...) |
| `OPEN_HOUR` / `CLOSE_HOUR` | `3` / `22` | Jam operasional grup (WIB) |
| `BEFORE_PRAYER` / `AFTER_PRAYER` | `5` / `10` | Menit sebelum/sesudah adzan |
| `CITY` / `COUNTRY` | `Jakarta` / `Indonesia` | Lokasi jadwal shalat |
| `PRAYER_METHOD` | `11` | Metode Kemenag RI |
| `MAX_WARNINGS` | `3` | Peringatan sebelum kick |
| `GROK_CONFIDENCE` | `0.75` | Threshold confidence LLM (0–1) |

---

## Menjalankan Model ML

Jalankan dari **root proyek** (pastikan venv aktif):

```bash
python train_ml.py
```

Script akan:
1. Membaca `data/re_dataset.csv` (encoding `latin-1`).
2. Melabeli setiap baris: `sara` (agama/ras), `rude` (abusive), atau `none`.
3. Split data 80/20 dengan stratifikasi.
4. Melatih **TF-IDF (1–2 gram)** + **Logistic Regression** (class-balanced).
5. Menampilkan `classification_report` dan `confusion_matrix`.

Contoh output:

```
              precision    recall  f1-score   support

        none      0.9xx     0.9xx     0.9xx      xxxx
        rude      0.8xx     0.8xx     0.8xx      xxxx
        sara      0.8xx     0.8xx     0.8xx      xxxx

    accuracy                          0.9xx      xxxx
```

---

## Menjalankan Bot

Jalankan dari folder `admin-bot-main`:

```bash
cd admin-bot-main
npm start          # mode produksi
# atau
npm run dev        # mode development (auto-reload via nodemon)
```

Saat pertama kali dijalankan, bot akan meminta autentikasi WhatsApp:

1. **Lewat dashboard:** buka `http://localhost:7860/qr` lalu scan QR.
2. **Lewat terminal:** QR juga ditampilkan di console (fallback).

Scan menggunakan **WhatsApp nomor bot** -> *Perangkat Tertaut* -> *Tautkan Perangkat*.

Setelah terhubung:

```
Safety-Bot Aktif!
Memantau N grup
Dashboard aktif di: http://localhost:7860
```

### Uji logika bot (opsional)

```bash
cd admin-bot-main
node test-bot.js
```

Menguji storage, perhitungan waktu shalat, dan filter moderasi lokal.

---

## Dashboard

Buka **`http://localhost:7860`** setelah bot berjalan. Dashboard menyediakan:

- **Status koneksi & statistik** — status bot, penggunaan AI, jumlah grup, uptime.
- **Jadwal shalat hari ini**.
- **Log sistem** real-time.
- **Editor konfigurasi** — ubah nama bot, nomor owner, jam operasional, lokasi, threshold, aturan grup, dsb. (disimpan langsung ke `config.js`).

---

## Perintah Bot

Kirim via grup atau DM ke bot.

### Umum
| Perintah | Keterangan |
|----------|-----------|
| `!help` | Daftar perintah |
| `!status` | Cek status aktif bot |
| `!apistats` | Statistik penggunaan AI hari ini |

### Khusus Owner / Admin Grup
| Perintah | Keterangan |
|----------|-----------|
| `bot-bangun` | Aktifkan moderasi bot |
| `bot-tidur` | Nonaktifkan moderasi bot |
| `!groups` | Daftar ID grup yang dikelola |
| `!reset <groupId> <nomor>` | Reset peringatan member |
| `!lock <groupId>` | Kunci grup manual |
| `!unlock <groupId>` | Buka grup manual |

**Contoh:**

```
!reset 120363xxxxxxxx@g.us 6281234567890
!lock 120363xxxxxxxx@g.us
!unlock 120363xxxxxxxx@g.us
```

---

## Mode Moderasi

Diatur lewat `MODERATION_MODE` pada `.env`:

| Mode | Perilaku |
|------|----------|
| `baseline` | Hanya blocklist kata kasar + regex. **Tanpa LLM** — berguna sebagai pembanding eksperimen. |
| `gated` | LLM hanya dipanggil jika blocklist/regex terpicu (default lama). |
| `llm` | Semua pesan non-trivial dikirim ke LLM — menangkap SARA tanpa kata kasar. |

Kategori yang terdeteksi: `rude` (kata kasar/makian), `racist` (rasis), `sara` (SARA).

Alur moderasi:

```
Pesan masuk -> filter aman -> blocklist/regex -> LLM (Ollama)
     │
     ├── AMAN ─────────────► tidak ada tindakan
     └── PELANGGARAN
           ├─ Peringatan 1 -> 1/3
           ├─ Peringatan 2 -> 2/3
           ├─ Peringatan 3 -> TERAKHIR 3/3
           └─ Peringatan 4 -> KICK otomatis
```

> Hasil LLM di-cache 24 jam. Jika Ollama gagal, pesan tidak dihukum tetapi error tercatat pada statistik.

---

## REST API

Server Express menyediakan endpoint berikut:

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/stats` | Status bot, statistik AI, grup, jadwal shalat, config, uptime |
| `POST` | `/api/config` | Simpan konfigurasi (menulis ulang `config.js`) |
| `GET` | `/api/qr-status` | Cek ketersediaan file QR |
| `GET` | `/qr` | Tampilkan QR Code (PNG) untuk scan |

---

## Docker

```bash
cd admin-bot-main

# Build image
docker build -t safety-bot .

# Jalankan container (port dashboard 7860)
docker run -d --name safety-bot \
  -p 7860:7860 \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  safety-bot
```

> Jika memakai Ollama di host, set `OLLAMA_URL=http://host.docker.internal:11434/api/chat` (Docker Desktop) pada `.env`.

Lihat log:

```bash
docker logs -f safety-bot
```

---

## Troubleshooting

**Bot tidak bisa menghapus pesan / kick member**
> Jadikan bot **admin grup** dengan izin penuh (kirim pesan, edit info grup, hapus pesan, keluarkan anggota).

**Ollama error / moderasi tidak jalan**
> Pastikan `ollama serve` aktif dan model sudah di-pull (`ollama pull qwen2.5:3b`). Cek `OLLAMA_URL` & `OLLAMA_MODEL` di `.env`. Model lokal bisa lambat saat pertama dimuat (timeout 60 detik).

**Jadwal shalat tidak muncul**
> Periksa koneksi internet. Bot memakai [Aladhan API](https://aladhan.com/prayer-times-api).

**Session expired / harus scan ulang**
> Hapus folder `.wwebjs_auth/` lalu jalankan ulang bot.

**Pipeline Puppeteer gagal di server**
> Gunakan **Docker** (Dockerfile sudah menyiapkan Chromium) atau pastikan dependensi Chromium terpasang.

**Dashboard tidak bisa diakses**
> Pastikan port `7860` (atau `PORT`) tidak dipakai proses lain dan sudah di-*expose*.

---

## Lisensi

MIT License — bebas digunakan dan dimodifikasi.
