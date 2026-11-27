// =============================================================
// utils/spamAnalyzer.js — Deteksi spam & flood di grup WhatsApp
// =============================================================

const { normalizeText, extractUrls, clamp01, unique } = require('./securityText');

const WINDOW_10S = 10_000;
const WINDOW_60S = 60_000;
const MAX_TEXTS = 10;
const MAX_KEYS = 3000;

const history = new Map();
let lastCleanup = 0;

const GAMBLING_RE = /\b(judi|slot|slot88|gacor|maxwin|togel|toto|casino|taruhan|bandar|joker123|pragmatic|deposit|withdraw|jackpot)\b/i;
const LOAN_RE = /\b(pinjol|pinjaman online|pinjaman cair|tanpa jaminan|kredit cepat|dana tunai|bunga rendah|cair cepat)\b/i;
const PROMO_RE = /\b(promo|diskon|murah|order|ready stock|open order|reseller|giveaway|voucher|cashback|bonus|followers|subscribe|investasi|profit|gaji|lowongan online|kuota murah|beli 1 gratis 1|stok terbatas)\b/i;
const CHAIN_RE = /\b(sebarkan|sebar|share|broadcast|kirim ke \d+ grup|jangan putus rantai|forward ke)\b/i;

function cleanup(now) {
  lastCleanup = now;
  for (const [key, entry] of history.entries()) {
    const fresh = entry.timestamps.filter((t) => now - t <= WINDOW_60S);
    if (fresh.length === 0) history.delete(key);
    else entry.timestamps = fresh;
  }
  if (history.size > MAX_KEYS) {
    const keys = [...history.keys()].slice(0, history.size - MAX_KEYS);
    for (const key of keys) history.delete(key);
  }
}

function historyKey(context) {
  return `${context.groupId || 'unknown'}:${context.senderId || 'unknown'}`;
}

function recordMessage(context) {
  const text = normalizeText(context.text).slice(0, 500);
  if (!text) return;

  const now = Date.now();
  const key = historyKey(context);
  const entry = history.get(key) || { timestamps: [], texts: [] };

  entry.timestamps.push(now);
  entry.timestamps = entry.timestamps.filter((t) => now - t <= WINDOW_60S);
  entry.texts.push(text);
  entry.texts = entry.texts.slice(-MAX_TEXTS);
  history.set(key, entry);

  if (now - lastCleanup > WINDOW_60S) cleanup(now);
}

function analyzeSpam(text, context = {}) {
  const normalized = normalizeText(text);
  const key = historyKey(context);
  const entry = history.get(key) || { timestamps: [], texts: [] };
  const now = Date.now();

  const in10s = entry.timestamps.filter((t) => now - t <= WINDOW_10S).length;
  const in60s = entry.timestamps.filter((t) => now - t <= WINDOW_60S).length;
  const duplicates = entry.texts.filter((t) => t === normalized).length;
  const urls = extractUrls(text);
  const mentionCount = (text.match(/@\d+/g) || []).length;
  const emojiCount = (text.match(/\p{Extended_Pictographic}/gu) || []).length;
  const letters = text.replace(/[^A-Za-z]/g, '');
  const uppercaseRatio = letters.length
    ? letters.replace(/[^A-Z]/g, '').length / letters.length
    : 0;

  let score = 0;
  const indicators = [];

  if (in60s >= 10) {
    score += 0.45;
    indicators.push(`Flood: ${in60s} pesan dalam 60 detik`);
  } else if (in10s >= 5) {
    score += 0.35;
    indicators.push(`Flood: ${in10s} pesan dalam 10 detik`);
  }

  if (duplicates >= 3) {
    score += 0.4;
    indicators.push(`Pesan duplikat berulang (${duplicates}x)`);
  } else if (duplicates >= 2) {
    score += 0.18;
    indicators.push(`Pesan serupa berulang (${duplicates}x)`);
  }

  if (urls.length >= 3) {
    score += 0.3;
    indicators.push(`Terlalu banyak link (${urls.length})`);
  } else if (urls.length >= 2) {
    score += 0.15;
    indicators.push(`Beberapa link dalam satu pesan (${urls.length})`);
  }

  if (mentionCount >= 5) {
    score += 0.3;
    indicators.push(`Mention massal (${mentionCount} mention)`);
  } else if (mentionCount >= 3) {
    score += 0.15;
    indicators.push(`Mention berlebihan (${mentionCount} mention)`);
  }

  if (context.message && (context.message.isForwarded || context.message.forwardingScore >= 3)) {
    score += 0.15;
    indicators.push('Pesan diteruskan (forwarded)');
  }

  if (GAMBLING_RE.test(normalized)) {
    score += 0.5;
    indicators.push('Kata kunci judi online');
  }
  if (LOAN_RE.test(normalized)) {
    score += 0.45;
    indicators.push('Kata kunci pinjaman online');
  }
  if (PROMO_RE.test(normalized)) {
    score += 0.22;
    indicators.push('Kata kunci promosi/iklan');
  }
  if (CHAIN_RE.test(normalized)) {
    score += 0.3;
    indicators.push('Pola chain message / sebar ke banyak grup');
  }

  if (letters.length >= 20 && uppercaseRatio > 0.7) {
    score += 0.1;
    indicators.push('Proporsi huruf kapital berlebihan');
  }
  if (emojiCount >= 8) {
    score += 0.1;
    indicators.push(`Emoji berlebihan (${emojiCount})`);
  }
  if (/!{3,}/.test(text)) {
    score += 0.05;
    indicators.push('Tanda seru berulang');
  }

  return {
    category: 'spam',
    score: clamp01(score),
    indicators: unique(indicators),
    metrics: { in10s, in60s, duplicates, links: urls.length, mentions: mentionCount },
  };
}

module.exports = { recordMessage, analyzeSpam };
