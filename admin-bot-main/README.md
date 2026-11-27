# 🛡️ Safety-Bot — WhatsApp Admin Bot

Bot admin otomatis WhatsApp untuk moderasi grup dengan **moderasi hybrid
(model ML + LLM lokal Ollama)**, pengingat shalat, dan jam operasional grup.

> Dokumentasi lengkap (training model, evaluasi, arsitektur) ada di
> [`../README.md`](../README.md).

---

## ✨ Fitur Utama

| No | Fitur | Keterangan |
|----|-------|------------|
| 1 | **Sambutan Anggota Baru** | Menyambut otomatis + deskripsi & aturan grup |
| 2 | **Moderasi Hybrid** | Filter lokal → model ML → LLM (Ollama) untuk kasus ambigu |
| 3 | **Pengingat Shalat 5 Waktu** | Reminder, notifikasi adzan, pesan selesai ibadah |
| 4 | **Kunci Otomatis Saat Shalat** | Kunci 5 menit sebelum adzan, buka 10 menit setelahnya (Jumat 30 menit) |
| 5 | **Jam Operasional Grup** | Buka 03:00–22:00 WIB, kunci otomatis di luar jam |
| 6 | **Sistem Moderasi** | Peringatan hingga 3x, pelanggaran ke-4 → kick otomatis |
| 7 | **Dashboard Web** | Statistik ML/LLM, jadwal shalat, log, editor konfigurasi |

---

## 🗂️ Struktur Proyek

```
admin-bot-main/
├── index.js                    # Entry point bot + dashboard
├── config.js                   # Konfigurasi & teks pesan
├── test-bot.js                 # Uji storage, waktu shalat, ML, pipeline
├── package.json
├── .env.example                # Template environment
├── handlers/
│   ├── welcomeHandler.js       # Sambutan anggota baru
│   ├── securityHandler.js      # Handler mitigasi ancaman real-time
│   └── prayerHandler.js        # Jadwal shalat + lock/unlock grup
├── utils/
│   ├── threatAnalyzer.js       # Orkestrasi rules + ML + LLM
│   ├── spamAnalyzer.js         # Deteksi spam/flood
│   ├── phishingAnalyzer.js     # Deteksi phishing URL
│   ├── socialEngineeringAnalyzer.js # Deteksi rekayasa sosial
│   ├── securityText.js         # Helper teks/URL
│   ├── mlClient.js             # Klien HTTP ke ML service
│   ├── llmSecurity.js          # Validator konteks LLM (Ollama)
│   └── incidents.js            # Penyimpanan insiden
├── public/
│   └── index.html              # Dashboard web
└── data/                       # JSON runtime (auto-generated)
```

---

## 📋 Prasyarat

- **Node.js** ≥ 18.0.0
- **npm** ≥ 9.0.0
- **Python** ≥ 3.9 (untuk ML service)
- **Ollama** + model `qwen2.5:3b`
- **Google Chrome / Chromium** (opsional; Puppeteer punya Chromium bawaan)
- Nomor WhatsApp khusus untuk bot

---

## 🚀 Instalasi & Menjalankan

### 1. Siapkan model ML (dari root proyek)

```bash
python -m venv venv
# Windows: .\venv\Scripts\Activate.ps1
# Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
python train_ml.py
python ml_service.py        # biarkan berjalan di port 5001
```

### 2. Install dependensi bot

```bash
cd admin-bot-main
npm install
```

### 3. Konfigurasi `.env`

```bash
copy .env.example .env      # Windows
# cp .env.example .env      # Linux/macOS
```

Isi minimal:

```env
OLLAMA_URL=http://localhost:11434/api/chat
OLLAMA_MODEL=qwen2.5:3b
ML_URL=http://127.0.0.1:5001/predict
MODERATION_MODE=hybrid
OWNER_NUMBER=628xxxxxxxxxx
BOT_NUMBER=628xxxxxxxxxx
```

### 4. Jalankan Ollama

```bash
ollama pull qwen2.5:3b
ollama serve
```

### 5. Jalankan bot

```bash
npm start          # produksi
npm run dev        # development (nodemon)
```

Scan QR di `http://localhost:7860/qr` atau dari terminal menggunakan
WhatsApp nomor bot → *Perangkat Tertaut* → *Tautkan Perangkat*.

### 6. Uji logika bot

```bash
node test-bot.js
```

---

## ⚙️ Konfigurasi Utama (`config.js`)

```js
BOT_NAME: 'Safety-Bot',
OWNER_NUMBER: '6282254513920',
BOT_NUMBER: '62895416132949',

OPEN_HOUR: 3,      // buka 03:00 WIB
CLOSE_HOUR: 22,    // tutup 22:00 WIB
BEFORE_PRAYER: 5,  // kunci N menit sebelum adzan
AFTER_PRAYER: 10,  // buka N menit setelah adzan

MAX_WARNINGS: 3,        // pelanggaran ke-4 -> kick
LLM_CONFIDENCE: 0.75,  // threshold LLM
ML_CONFIDENCE: 0.65,    // threshold violation ML
ML_SAFE_CONFIDENCE: 0.85, // threshold aman ML
ML_URL: 'http://127.0.0.1:5001/predict'
```

---

## 🤖 Mode Moderasi

Diatur lewat `MODERATION_MODE`:

| Mode | Perilaku |
|------|----------|
| `baseline` | Blocklist + regex saja (tanpa AI) |
| `gated` | LLM hanya jika blocklist terpicu |
| `llm` | Semua pesan non-trivial ke LLM |
| `ml` | Hanya model ML, fallback blocklist |
| `hybrid` | ML dulu, LLM untuk kasus ambigu (**disarankan**) |

Alur:

```
Pesan -> filter aman -> blocklist -> ML -> LLM (jika ambigu)
   │
   ├── AMAN ──────────► tidak ada tindakan
   └── PELANGGARAN
         ├─ Warning 1 → 1/3
         ├─ Warning 2 → 2/3
         ├─ Warning 3 → TERAKHIR 3/3
         └─ Warning 4 → KICK
```

Jika ML service mati, mode `hybrid` otomatis fallback ke LLM.
Jika LLM gagal, pesan tidak dihukum tetapi error dicatat.

---

## 📱 Perintah Owner

Kirim via DM ke bot atau grup:

| Perintah | Keterangan |
|----------|-----------|
| `!help` | Daftar perintah |
| `!status` | Status bot |
| `!apistats` | Statistik ML/LLM/cache/error |
| `!groups` | Daftar ID grup |
| `!warn <groupId> <nomor>` | Cek peringatan member |
| `!reset <groupId> <nomor>` | Reset peringatan member |
| `!lock <groupId>` | Kunci grup manual |
| `!unlock <groupId>` | Buka grup manual |
| `bot-bangun` | Aktifkan moderasi |
| `bot-tidur` | Nonaktifkan moderasi |

---

## 🕌 Jam Operasional & Shalat

```
03:00  ─── Grup DIBUKA ─────────────────────────────┐
                                                     │
[Setiap waktu shalat]:                               │
  H-5 menit   -> Reminder + grup DIKUNCI             │
  Tepat adzan -> Notifikasi adzan                    │
  H+10 menit  -> Pesan selesai + grup DIBUKA ────────┘
  (Jumat: H+30 menit)

22:00  ─── Grup DIKUNCI ─────────────────────────────
```

- Perhitungan waktu memakai **WIB (UTC+7)**.
- Grup yang dikunci manual (`!lock`) tidak dibuka otomatis oleh scheduler shalat.

---

## 🔧 Syarat Bot Menjadi Admin

Agar semua fitur berjalan sempurna, bot **wajib dijadikan admin** di setiap grup dengan izin:
- ✅ Kirim pesan
- ✅ Edit info grup (untuk kunci/buka)
- ✅ Hapus pesan anggota
- ✅ Keluarkan anggota (kick)

---

## 📦 Dependensi

| Package | Kegunaan |
|---------|---------|
| `whatsapp-web.js` | Library WhatsApp Web automation |
| `qrcode-terminal` / `qrcode` | Tampilkan & simpan QR Code |
| `node-cron` | Scheduler jam operasional & refresh harian |
| `axios` | HTTP ke Ollama, ML service, dan Aladhan API |
| `dotenv` | Manajemen variabel environment |
| `express` | Server dashboard |

---

## ❓ Troubleshooting

**Bot tidak bisa kunci/hapus pesan/kick member:**
> Pastikan bot sudah dijadikan admin grup dengan izin penuh.

**ML service error / tidak terjangkau:**
> Jalankan `python ml_service.py` dari root proyek dan cek `http://127.0.0.1:5001/health`. Pastikan `ML_URL` benar. Mode `hybrid` akan fallback ke LLM jika ML mati.

**Model ML belum ada:**
> Jalankan `python train_ml.py` di root proyek.

**Ollama error:**
> Pastikan `ollama serve` aktif dan model sudah di-pull (`ollama pull qwen2.5:3b`). Cek `OLLAMA_URL` & `OLLAMA_MODEL`.

**Jadwal shalat tidak muncul:**
> Cek koneksi internet. Bot menggunakan [Aladhan API](https://aladhan.com/prayer-times-api).

**Session expired / harus scan ulang:**
> Hapus folder `.wwebjs_auth/session-safety-bot/` lalu jalankan ulang bot.

**Chrome gagal dibuka:**
> Kosongkan `CHROME_PATH` untuk memakai Chromium bawaan Puppeteer, atau isi path Chrome yang benar. Set `HEADLESS=false` untuk debugging.

---

## 📝 Lisensi

MIT License — bebas digunakan dan dimodifikasi.
