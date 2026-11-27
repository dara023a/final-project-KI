// =============================================================
// utils/llmSecurity.js — Validator LLM untuk ancaman keamanan
//
// Ollama dipanggil HANYA untuk kasus ambigu (mode hybrid), atau sebagai
// classifier utama pada mode llm. Output divalidasi ketat agar tidak
// menghasilkan kategori di luar safe/spam/phishing/social_engineering.
// =============================================================

const axios = require('axios');
const config = require('../config');
const { getMLCounters, getMLStatus } = require('./mlClient');
const { normalizeText } = require('./securityText');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434/api/chat';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || config.GROK_MODEL || 'qwen2.5:3b';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 60000);
const MAX_CHARS = 800;
const VALID_CATEGORIES = new Set(['safe', 'spam', 'phishing', 'social_engineering']);
const VALID_SEVERITIES = new Set(['low', 'medium', 'high']);

const SECURITY_MODE = ['rules', 'ml', 'llm', 'hybrid'].includes(config.SECURITY_MODE)
  ? config.SECURITY_MODE
  : 'hybrid';

const responseCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

let llmCallCount = 0;
let llmErrorCount = 0;
let cacheHits = 0;
const startedAt = new Date().toDateString();

const SYSTEM_PROMPT = `Anda adalah analis keamanan grup WhatsApp berbahasa Indonesia.
Klasifikasikan pesan pengguna ke SATU kategori:
- "safe": obrolan normal, diskusi kuliah, salam, informasi umum, link resmi kampus.
- "spam": promosi/iklan berulang, judi online, pinjaman online, chain message, flood, jual beli agresif.
- "phishing": meminta klik link untuk verifikasi/login/klaim hadiah/data akun, link shortener/IP/domain mirip brand, akun diblokir, paket tertahan.
- "social_engineering": meminta OTP/PIN/password/kode verifikasi, transfer uang mendesak, impersonasi admin/dosen/bank/polisi, iming-iming hadiah dengan biaya, permintaan data pribadi/KTP, tekanan waktu/kerahasiaan.

Aturan penting:
- Bedakan phishing dan social_engineering: phishing fokus pada LINK/verifikasi akun; social_engineering fokus pada MANIPULASI ORANG (OTP, transfer, impersonasi).
- Jangan menandai obrolan normal sebagai ancaman hanya karena ada kata "transfer", "admin", "link", atau "verifikasi" jika konteksnya jelas aman.
- Jika ragu, pilih "safe".
- confidence 0.0-1.0, severity low/medium/high.
Jawab HANYA JSON valid:
{"category":"safe|spam|phishing|social_engineering","confidence":0.0,"severity":"low|medium|high","reason":"alasan singkat","indicators":["indikator"]}`;

function clamp01(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

function cacheResult(key, result) {
  responseCache.set(key, { result, timestamp: Date.now() });
  return result;
}

function normalizeResult(parsed) {
  const category = VALID_CATEGORIES.has(parsed.category) ? parsed.category : 'safe';
  const severity = VALID_SEVERITIES.has(parsed.severity)
    ? parsed.severity
    : category === 'safe'
      ? 'low'
      : 'medium';
  return {
    category,
    confidence: clamp01(parsed.confidence, 0),
    severity,
    reason: String(parsed.reason || (category === 'safe' ? 'Tidak ada indikasi ancaman' : 'Terdeteksi oleh LLM')).slice(0, 300),
    indicators: Array.isArray(parsed.indicators)
      ? parsed.indicators.map((item) => String(item)).slice(0, 10)
      : [],
    source: 'llm',
  };
}

async function classifyWithLLM(text, context = {}) {
  const normalized = normalizeText(text).slice(0, MAX_CHARS);
  if (!normalized) return null;

  const cached = responseCache.get(normalized);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    cacheHits++;
    return cached.result;
  }

  llmCallCount++;
  try {
    const response = await axios.post(
      OLLAMA_URL,
      {
        model: OLLAMA_MODEL,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content:
              `Konteks: grup WhatsApp${context.groupName ? ` "${context.groupName}"` : ''}.\n` +
              `Pesan:\n${normalized}`,
          },
        ],
      },
      { timeout: TIMEOUT_MS }
    );

    const raw = response.data?.message?.content;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') throw new Error('Output LLM bukan objek JSON');

    return cacheResult(normalized, normalizeResult(parsed));
  } catch (error) {
    llmErrorCount++;
    console.error(`[LLM] Error (${OLLAMA_MODEL}):`, error.message);
    return null;
  }
}

function getUsageStats() {
  const ml = getMLCounters();
  return {
    used: ml.calls + llmCallCount,
    cap: 999999,
    date: startedAt,
    mode: SECURITY_MODE,
    model: OLLAMA_MODEL,
    mlModel: 'tfidf_word_char+logistic_regression',
    mlUsed: ml.calls,
    mlErrors: ml.errors,
    llmUsed: llmCallCount,
    llmErrors: llmErrorCount,
    cacheHits,
    errors: llmErrorCount + ml.errors,
    ml: getMLStatus(),
  };
}

module.exports = {
  classifyWithLLM,
  getUsageStats,
  SECURITY_MODE,
};
