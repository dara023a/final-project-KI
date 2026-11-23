// =============================================================
// utils/grokAI.js — Validasi konten via OLLAMA (LLM lokal)
// Pengganti versi Groq. Nama file & export dipertahankan agar
// index.js, moderationHandler.js, dan test-bot.js tetap jalan.
//
// MODE (env MODERATION_MODE):
//   baseline : hanya blocklist + regex (TANPA LLM)  -> pembanding eksperimen
//   gated    : LLM hanya dipanggil jika blocklist/regex kena (perilaku lama)
//   llm      : semua pesan non-trivial dikirim ke LLM (menangkap SARA tanpa kata kasar)
// =============================================================

const axios  = require('axios');
const config = require('../config');

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const MODE         = (process.env.MODERATION_MODE || 'gated').toLowerCase();
const MAX_CHARS    = 500;                       // sebelumnya 120
const CONFIDENCE   = config.GROK_CONFIDENCE || 0.75;
const TIMEOUT_MS   = 60000;                     // model lokal bisa lambat saat pertama dimuat
const VALID_CATS   = new Set(['rude', 'racist', 'sara', 'none']);

// ─── Cache 24 jam (key = teks ternormalisasi) ───────────────
const responseCache = new Map();
const CACHE_TTL     = 24 * 60 * 60 * 1000;

// ─── Statistik (tanpa batas harian, hanya penghitung) ───────
let callCount = 0;
let errorCount = 0;
const startedAt = new Date().toDateString();

// ─── Kata kasar lokal ───────────────────────────────────────
const LOCAL_BLOCKLIST = new Set([
  'anjing','anjir','anj','bangsat','bgs','brengsek',
  'kampret','keparat','bajingan','bedebah','setan',
  'goblok','goblog','tolol','idiot','bodoh bgt',
  'kontol','memek','ngentot','jancok','dancok',
  'cok','jancuk','asu','asuu',
  'b4ngsat','k0ntol','g0blok','t0lol','peler',
  'itil','jembut','lonte','ajig','anying',
]);

const RUDE_PATTERNS = [
  /\b(f+u+c+k|s+h+i+t|d+a+m+n)\b/i,
  /b+a+n+g+s+a+t/i,
  /k+o+n+t+o+l/i,
  /n+g+e+n+t+o+t/i,
  /g+o+b+l+o+k/i,
  /t+o+l+o+l/i,
];

const SAFE_PATTERNS = [
  /^[\d\s\+\-\.\,\!\?\%\(\)\:\;]+$/,
  /^(ok|oke|iya|ya|sip|siap|makasih|thanks|nuhun|suwun|noted|done|y|g|ga|tdk|tidak|udah|sudah|belom|belum)+$/i,
  /^(haha|hehe|wkwk|huhu|hihi|ckck|wk+)+$/i,
  /^(assalamualaikum|waalaikumsalam|halo|hallo|hi|hey|p|pagi|siang|sore|malam)+$/i,
  /^(bot-bangun|bot-tidur|!status|!help|!apistats|!groups)$/i,
  /^https?:\/\//i,
  /^@\d+/,
  /^\s*$/,
  /^[A-Z0-9]{5,}$/,
  /^(left|join|masuk|keluar|ijin|izin|bisa|boleh|lagi|hehe|siap)+$/i,
];

const SAFE_RESULT = {
  is_violation: false, category: 'none', confidence: 1, reason: 'Lolos filter lokal'
};

const SYSTEM_PROMPT =
  'Anda adalah moderator grup WhatsApp Indonesia. Tugas Anda adalah mengklasifikasikan PELANGGARAN NYATA, bukan mencari-cari masalah. ' +
  'Kategori: "rude" HANYA jika ada makian/kata kasar yang jelas ditujukan ke orang (anjing, bangsat, goblok, tolol, kontol, dll). ' +
  '"racist" jika merendahkan suku/ras. "sara" jika menyerang agama/antar-golongan. Jika ragu, jawab "none". ' +
  'Yang HARUS "none": salam, tawa, emoji, basa-basi, pertanyaan biasa, keluhan, menyebut nama seseorang, diskusi tugas/kampus, obrolan santai, typo, dan kalimat yang tidak mengandung serangan langsung. ' +
  'Contoh: "halo🙂"=none; "buka pc hhe"=none; "ini adalah fitur yang tidak masuk kriteria tugas :v"=none; "kok nyebut nama aku juga ngaruh"=none; "mana ga ngerespon wkwk"=none; "bangsat"=rude; "anjing kamu"=rude. ' +
  'JANGAN mengubah kategori menjadi rude hanya karena nada bicara, emosi, atau kata "melawan". ' +
  'Jawab HANYA JSON: {"is_violation":bool,"category":"rude|racist|sara|none","confidence":0.0-1.0,"reason":"singkat"}';

function normalizeText(text) {
  return text.toLowerCase().replace(/@\d+/g, '').replace(/\s+/g, ' ').trim().substring(0, MAX_CHARS);
}

// Mengembalikan alasan jika blocklist/regex kena, atau null
function localHit(normalized) {
  for (const w of normalized.split(/\s+/)) {
    if (LOCAL_BLOCKLIST.has(w)) return `Kata kasar terdeteksi: "${w}"`;
  }
  for (const pat of RUDE_PATTERNS) {
    if (pat.test(normalized)) return 'Pola kata kasar terdeteksi';
  }
  return null;
}

async function checkViolation(messageText) {
  const normalized = normalizeText(messageText);

  // 1. Pesan yang pasti aman (abaikan emoji & tanda baca untuk pencocokan)
  const safeText = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  for (const pat of SAFE_PATTERNS) {
    if (pat.test(normalized) || pat.test(safeText)) return SAFE_RESULT;
  }

  const hit = localHit(normalized);

  // 2. Mode baseline: tanpa LLM
  if (MODE === 'baseline') {
    return hit
      ? { is_violation: true, category: 'rude', confidence: 0.95, reason: hit }
      : SAFE_RESULT;
  }

  // 3. Mode gated: tanpa indikasi lokal -> lolos. Mode llm: lanjut ke LLM.
  if (MODE === 'gated' && !hit) return SAFE_RESULT;
  if (normalized.length < 3) return SAFE_RESULT;

  // 4. Cache
  const cached = responseCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.result;

  // 5. Panggil Ollama
  try {
    callCount++;
    const response = await axios.post(
      OLLAMA_URL,
      {
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: normalized }
        ]
      },
      { timeout: TIMEOUT_MS }
    );

    const raw    = response.data.message.content;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!VALID_CATS.has(parsed.category)) parsed.category = 'none';
    parsed.is_violation = parsed.category !== 'none';
    if (!parsed.reason) parsed.reason = parsed.is_violation ? 'Terdeteksi oleh AI' : 'Tidak ada pelanggaran';

    if ((parsed.confidence || 0) < CONFIDENCE) {
      parsed.is_violation = false;
      parsed.category     = 'none';
    }

    responseCache.set(normalized, { result: parsed, timestamp: Date.now() });
    return parsed;

  } catch (error) {
    errorCount++;
    console.error(`[Ollama] Error (${OLLAMA_MODEL}):`, error.message,
      '— pastikan Ollama berjalan & model sudah di-pull.');
    // Tidak menghukum anggota saat LLM gagal, tapi error TERCATAT di log & statistik.
    return { is_violation: false, category: 'none', confidence: 0, reason: 'API error', error: true };
  }
}

// Format kompatibel dengan index.js (used, cap, date). cap besar = praktis tanpa batas.
function getUsageStats() {
  return { used: callCount, cap: 999999, date: startedAt, errors: errorCount, mode: MODE, model: OLLAMA_MODEL };
}

module.exports = { checkViolation, getUsageStats };
