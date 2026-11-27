// =============================================================
// utils/securityText.js — Helper teks & URL untuk analisis ancaman
// =============================================================

const URL_RE = /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi;
const TRAILING_PUNCT_RE = /[),.!?;:'"]+$/;

function normalizeText(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUrls(text) {
  const matches = String(text || '').match(URL_RE) || [];
  return matches
    .map((raw) => raw.replace(TRAILING_PUNCT_RE, ''))
    .filter(Boolean);
}

function parseUrl(raw) {
  let candidate = String(raw || '').trim().replace(TRAILING_PUNCT_RE, '');
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function hostnameOf(raw) {
  const parsed = parseUrl(raw);
  if (!parsed) return '';
  return parsed.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

function isIpHost(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j];
  }
  return prev[t.length];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function truncate(text, max = 160) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

module.exports = {
  URL_RE,
  normalizeText,
  extractUrls,
  parseUrl,
  hostnameOf,
  isIpHost,
  levenshtein,
  unique,
  clamp01,
  truncate,
};
