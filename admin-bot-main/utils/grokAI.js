// =============================================================
// utils/grokAI.js — Validasi konten via Groq AI (Substitusi Grok)
// DIOPTIMALKAN: Zero-cost semaksimal mungkin
//   • Model    : llama-3.3-70b-versatile (via Groq)
//   • Input    : Potong pesan maks 120 karakter
//   • Output   : JSON format
//   • Cache    : TTL 24 jam per teks unik
//   • Pre-filter lokal : ~80% pesan biasa lolos tanpa API call
// =============================================================

const axios  = require('axios');
const config = require('../config');

const GROK_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ─── Cache 24 jam (key = teks ternormalisasi) ───────────────
const responseCache = new Map();
const CACHE_TTL     = 24 * 60 * 60 * 1000; // 24 jam

// ─── Daily request counter ──────────────────────────────────
let dailyCallCount = 0;
let dailyResetDate = new Date().toDateString();
const DAILY_API_CAP = 40; // Maks 40 panggilan per hari

// ─── Kata kasar lokal (pre-filter tanpa API) ────────────────
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
  /^[\d\s\+\-\.\,\!\?\%\(\)\:\;]+$/, // Hanya angka/simbol
  /^(ok|oke|iya|ya|sip|siap|makasih|thanks|nuhun|suwun|noted|done|y|g|ga|tdk|tidak|udah|sudah|belom|belum)+$/i,
  /^(haha|hehe|wkwk|huhu|hihi|ckck|wk+)+$/i, // Ketawa
  /^(assalamualaikum|waalaikumsalam|halo|hallo|hi|hey|p|pagi|siang|sore|malam)+$/i, // Salam
  /^(bot-bangun|bot-tidur|!status|!help|!apistats|!groups)$/i, // Perintah bot
  /^https?:\/\//i, // Link
  /^@\d+/, // Hanya mention
  /^\s*$/, // Kosong
  /^[A-Z0-9]{5,}$/, // Kode/Serial
  /^(left|join|masuk|keluar|ijin|izin|bisa|boleh|lagi|hehe|siap)+$/i, // Kata umum
];

const SAFE_RESULT = {
  is_violation: false, category: 'none', confidence: 1, reason: 'Lolos filter lokal'
};

function normalizeText(text) {
  // Bersihkan mention agar tidak mengganggu analisis kata
  return text.toLowerCase().replace(/@\d+/g, '').replace(/\s+/g, ' ').trim().substring(0, 120);
}

function checkDailyCap() {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyCallCount = 0;
    dailyResetDate = today;
    console.log('[GroqAI] Daily counter direset.');
  }
  return dailyCallCount < DAILY_API_CAP;
}

function localFilter(normalized) {
  for (const pat of SAFE_PATTERNS) {
    if (pat.test(normalized)) return { skip: true, result: SAFE_RESULT };
  }

  const words = normalized.split(/\s+/);
  for (const w of words) {
    if (LOCAL_BLOCKLIST.has(w)) {
      return {
        skip: true,
        result: { is_violation: true, category: 'rude', confidence: 0.95, reason: `Kata kasar terdeteksi: "${w}"` }
      };
    }
  }

  for (const pat of RUDE_PATTERNS) {
    if (pat.test(normalized)) {
      return {
        skip: true,
        result: { is_violation: true, category: 'rude', confidence: 0.95, reason: 'Pola kata kasar terdeteksi' }
      };
    }
  }

  if (normalized.length < 8) return { skip: true, result: SAFE_RESULT };

  return { skip: false };
}

/**
 * Validasi pesan dengan Groq AI
 * STRATEGI BARU: Hanya panggil AI jika terdeteksi indikasi awal secara lokal
 */
async function checkViolation(messageText) {
  const normalized = normalizeText(messageText);

  // 1. Cek apakah pesan masuk kategori "Pasti Aman" (Salam, ketawa, dll)
  for (const pat of SAFE_PATTERNS) {
    if (pat.test(normalized)) return SAFE_RESULT;
  }

  // 2. Cek apakah ada indikasi kata kasar (Trigger untuk AI)
  let hasIndication = false;
  
  // Cek kata per kata
  const words = normalized.split(/\s+/);
  for (const w of words) {
    if (LOCAL_BLOCKLIST.has(w)) {
      hasIndication = true;
      break;
    }
  }

  // Cek pola regex (misal: b.a.n.g.s.a.t)
  if (!hasIndication) {
    for (const pat of RUDE_PATTERNS) {
      if (pat.test(normalized)) {
        hasIndication = true;
        break;
      }
    }
  }

  // JIKA TIDAK ADA INDIKASI KASAR -> LANGSUNG LOLOS (TIDAK PANGGIL AI)
  if (!hasIndication) {
    return SAFE_RESULT;
  }

  // 3. JIKA ADA INDIKASI -> Gunakan AI untuk validasi (Second Opinion)
  // Ini mencegah salah tangkap (False Positive)
  
  if (responseCache.has(normalized)) {
    const cached = responseCache.get(normalized);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[GroqAI] Cache hit: "${normalized.substring(0,40)}"`);
      return cached.result;
    }
  }

  if (!checkDailyCap()) {
    console.warn(`[GroqAI] Daily cap (${DAILY_API_CAP}) tercapai.`);
    return SAFE_RESULT;
  }

  try {
    if (!process.env.GROK_API_KEY || process.env.GROK_API_KEY.includes('xxx')) {
      throw new Error('GROK_API_KEY belum dikonfigurasi di .env');
    }

    dailyCallCount++;
    console.log(`[GroqAI] 🔍 Memvalidasi indikasi pelanggaran #${dailyCallCount}: "${normalized.substring(0,50)}"`);

    let model = config.GROK_MODEL || 'llama-3.3-70b-versatile';
    if (model.includes('grok')) {
        model = 'llama-3.3-70b-versatile';
    }

    const response = await axios.post(
      GROK_API_URL,
      {
        model:      model,
        max_tokens: 60,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content:
              'Anda adalah moderator grup WhatsApp Indonesia yang sangat ketat dan akurat. ' +
              'Tugas: Identifikasi HANYA pelanggaran eksplisit (rude/racist/sara). ' +
              'Pesan biasa, diskusi santai, atau typo yang tidak kasar HARUS dianggap "none". ' +
              'Jawab dalam JSON: {"is_violation":bool,"category":"rude|racist|sara|none","confidence":0.0-1.0,"reason":"singkat"}'
          },
          {
            role: 'user',
            content: normalized
          }
        ]
      },
      {
        headers: {
          Authorization:  `Bearer ${process.env.GROK_API_KEY.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 12000
      }
    );

    const result = response.data.choices[0].message.content;
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    if (!parsed.reason) parsed.reason = parsed.category !== 'none' ? 'Terdeteksi oleh AI' : 'Tidak ada pelanggaran';

    if ((parsed.confidence || 0) < config.GROK_CONFIDENCE) {
      parsed.is_violation = false;
      parsed.category     = 'none';
    }

    responseCache.set(normalized, { result: parsed, timestamp: Date.now() });

    return parsed;

  } catch (error) {
    if (error.response) {
      console.error('[GroqAI] Error Details:', JSON.stringify(error.response.data, null, 2));
    }
    console.error('[GroqAI] Error:', error.message);
    dailyCallCount = Math.max(0, dailyCallCount - 1);
    return { is_violation: false, category: 'none', confidence: 0, reason: 'API error' };
  }
}

function getUsageStats() {
  return { used: dailyCallCount, cap: DAILY_API_CAP, date: dailyResetDate };
}

module.exports = { checkViolation, getUsageStats };
