// =============================================================
// config.js — Konfigurasi utama Safety-Bot
// =============================================================

module.exports = {
  // ─── Identitas Bot ──────────────────────────────────────────
  BOT_NAME: process.env.BOT_NAME || 'Security-Bot',

  // Format: 62 + nomor tanpa awalan 0  (contoh: 08xxx → 628xxx)
  OWNER_NUMBER: process.env.OWNER_NUMBER || '6282254513920',   // Pemilik
  BOT_NUMBER:   process.env.BOT_NUMBER   || '62895416132949', // Nomor bot

  // ─── Jam Operasional Grup ───────────────────────────────────
  OPEN_HOUR:  3,   // Buka pukul 03:00 WIB
  CLOSE_HOUR: 22,  // Tutup pukul 22:00 WIB

  // ─── Buffer Waktu Shalat (menit) ────────────────────────────
  BEFORE_PRAYER: 5,   // Kunci grup 5 menit SEBELUM adzan
  AFTER_PRAYER:  10,  // Buka grup 10 menit SETELAH adzan

  // ─── Lokasi untuk Jadwal Shalat ─────────────────────────────
  CITY:           'Jakarta',
  COUNTRY:        'Indonesia',
  PRAYER_METHOD:  11,  // Kemenag RI

  // ─── Sistem Peringatan ──────────────────────────────────────
  MAX_WARNINGS: 3, // Peringatan ke-4 langsung kick

  // ─── AI / Deteksi Ancaman ───────────────────────────────────
  // Mode pipeline: rules | ml | hybrid | llm
  //   rules  : heuristik lokal saja (pembanding baseline)
  //   ml     : rules + model ML, tanpa LLM
  //   llm    : rules + LLM, tanpa ML
  //   hybrid : rules + ML + LLM hanya untuk kasus ambigu (disarankan)
  SECURITY_MODE: (process.env.SECURITY_MODE || process.env.MODERATION_MODE || 'hybrid').toLowerCase(),

  // LLM lokal (Ollama) sebagai validator konteks.
  GROK_MODEL:      process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  GROK_CONFIDENCE: process.env.LLM_CONFIDENCE !== undefined
    ? Number(process.env.LLM_CONFIDENCE) : 0.75,

  // Model ML (TF-IDF word+char + Logistic Regression) via ml_service.py.
  // Endpoint bisa dioverride lewat env ML_URL.
  ML_URL: process.env.ML_URL || 'http://127.0.0.1:5001/predict',
  ML_CONFIDENCE: process.env.ML_CONFIDENCE !== undefined
    ? Number(process.env.ML_CONFIDENCE) : 0.65,
  ML_SAFE_CONFIDENCE: process.env.ML_SAFE_CONFIDENCE !== undefined
    ? Number(process.env.ML_SAFE_CONFIDENCE) : 0.85,

  // Ambang skor aturan lokal (0-1).
  RULE_THRESHOLD: process.env.RULE_THRESHOLD !== undefined
    ? Number(process.env.RULE_THRESHOLD) : 0.60,
  RULE_STRONG: process.env.RULE_STRONG !== undefined
    ? Number(process.env.RULE_STRONG) : 0.80,

  // Analisis URL phishing.
  PHISHING_EXPAND_SHORTENERS: process.env.PHISHING_EXPAND_SHORTENERS === 'true',
  PHISHING_TIMEOUT_MS: Number(process.env.PHISHING_TIMEOUT_MS || 2500),

  // Notifikasi & penyimpanan insiden.
  NOTIFY_OWNER_ON_THREAT: process.env.NOTIFY_OWNER_ON_THREAT !== 'false',
  INCIDENT_MAX: Number(process.env.INCIDENT_MAX || 500),
  HIGH_SEVERITY_WEIGHT: 2,

  // ─── Pesan Sambutan & Aturan ────────────────────────────────
  GROUP_DESCRIPTION: `
🛡️ *SELAMAT DATANG DI GRUP KAMI!*

Grup ini adalah komunitas mahasiswa muslim yang akan membantu temen-temen maba beradaptasi di kampus.
Kami menjunjung tinggi nilai-nilai kesopanan, toleransi, dan kebersamaan
dalam bingkai keberagaman Indonesia,, enjoy guys.🇮🇩
`.trim(),

  GROUP_RULES: `
📋 *PERATURAN KEAMANAN GRUP*

1️⃣  Dilarang mengirim *SPAM*: promosi berulang, judi online, pinjol, chain message
2️⃣  Dilarang menyebarkan *PHISHING*: link palsu, verifikasi akun, klaim hadiah
3️⃣  Dilarang melakukan *REKAYASA SOSIAL*: meminta OTP/PIN/password, transfer mendesak, impersonasi admin/bank
4️⃣  Dilarang menyebarkan hoaks, konten SARA, atau kata kasar
5️⃣  Verifikasi pengirim sebelum menuruti permintaan sensitif
6️⃣  Laporkan pesan mencurigakan ke admin grup

⚠️  *Konsekuensi Pelanggaran:*
     ├─ Pelanggaran ringan → pesan dihapus + peringatan
     ├─ Pelanggaran berat (phishing/rekayasa sosial) → bobot 2
     └─ Peringatan melebihi batas → *KICK* dari grup

🤖  Security-Bot aktif 24 jam memantau spam, phishing, dan rekayasa sosial.
`.trim(),

  // ─── Pesan Adzan per Waktu Shalat ───────────────────────────
  PRAYER_MESSAGES: {
    Fajr:    { emoji: '🌙', name: 'Subuh',   msg: 'Saatnya bangun dan awali hari dengan ibadah. Shalat Subuh menentukan keberkahan hari ini!' },
    Dhuhr:   { emoji: '☀️', name: 'Dzuhur',  msg: 'Istirahat sejenak dari kesibukan untuk memenuhi panggilan Allah. Yuk shalat Dzuhur!' },
    Asr:     { emoji: '🌤️', name: 'Ashar',   msg: 'Jangan sampai terlewat! Waktu Ashar sangat singkat, segera tunaikan shalat.' },
    Maghrib: { emoji: '🌅', name: 'Maghrib', msg: 'Alhamdulillah, hari masih diberi kesempatan. Segerakan shalat Maghrib sebelum terlambat!' },
    Isha:    { emoji: '🌙', name: 'Isya',    msg: 'Tutup malam ini dengan shalat Isya. Semoga kita semua mendapat istirahat yang berkah.' }
  }
};
