// utils/phishingAnalyzer.js — Analisis URL & indikasi phishing
const axios = require('axios');
const config = require('../config');
const {
  normalizeText, extractUrls, parseUrl, hostnameOf, isIpHost,
  levenshtein, unique, clamp01,
} = require('./securityText');

const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 's.id', 'cutt.ly', 'rb.gy', 'shorturl.at',
  't.co', 'linktr.ee', 'rebrand.ly', 'is.gd', 'v.gd', 'ow.ly',
  'buff.ly', 'bl.ink', 'short.io', 'snip.ly',
]);

const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'link', 'online', 'site', 'shop', 'icu',
  'buzz', 'rest', 'cf', 'tk', 'ml', 'ga', 'gq', 'work', 'loan',
  'download', 'stream', 'racing', 'win', 'bid', 'review',
]);

const SENSITIVE_PATHS = [
  'login', 'signin', 'verifikasi', 'verify', 'verification', 'akun',
  'account', 'confirm', 'konfirmasi', 'reset-password', 'reset',
  'password', 'otp', 'pin', 'secure', 'security', 'klaim', 'hadiah',
  'pembayaran', 'payment', 'wallet', 'dompet', 'transfer', 'update',
];

const BRANDS = {
  bca: ['bca.co.id'],
  bri: ['bri.co.id'],
  bni: ['bni.co.id'],
  mandiri: ['bankmandiri.co.id', 'mandiri.co.id'],
  dana: ['dana.id'],
  ovo: ['ovo.id'],
  gopay: ['gopay.co.id', 'gopay.com'],
  shopee: ['shopee.co.id'],
  tokopedia: ['tokopedia.com'],
  whatsapp: ['whatsapp.com', 'wa.me'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com'],
  google: ['google.com'],
  pln: ['pln.co.id'],
  lazada: ['lazada.co.id'],
  bukalapak: ['bukalapak.com'],
};

const TEXT_CUES = [
  'klik link', 'verifikasi', 'login', 'akun diblokir', 'akun anda',
  'data pribadi', 'konfirmasi', 'klaim', 'hadiah', 'reset password',
  'otp', 'pin', 'rekening', 'pembayaran', 'tagihan', 'paket tertahan',
  'undian', 'cashback', 'voucher', 'email kampus', 'dinonaktifkan',
];

const expansionCache = new Map();
const EXPANSION_TTL = 60 * 60 * 1000;

function isOfficial(hostname, brand) {
  return (BRANDS[brand] || []).some(
    (domain) => hostname === domain || hostname.endsWith('.' + domain)
  );
}

function analyzeUrl(raw) {
  const parsed = parseUrl(raw);
  if (!parsed) return { score: 0.15, indicators: ['URL tidak valid / rusak'], hostname: '' };

  const hostname = hostnameOf(raw);
  const tld = hostname.split('.').pop() || '';
  const path = (parsed.pathname + parsed.search).toLowerCase();
  const rawLower = String(raw).toLowerCase();
  const indicators = [];
  let score = 0;

  if (isIpHost(hostname)) {
    score += 0.55;
    indicators.push(`Host berupa alamat IP (${hostname})`);
  }
  if (SHORTENERS.has(hostname)) {
    score += 0.25;
    indicators.push(`URL shortener (${hostname})`);
  }
  if (SUSPICIOUS_TLDS.has(tld)) {
    score += 0.25;
    indicators.push(`TLD mencurigakan (.${tld})`);
  }
  if (hostname.includes('xn--') || rawLower.includes('xn--')) {
    score += 0.5;
    indicators.push('Domain punycode (berpotensi homograph)');
  }
  if (rawLower.includes('@')) {
    score += 0.2;
    indicators.push('URL mengandung karakter @');
  }
  if (raw.length > 120) {
    score += 0.1;
    indicators.push('URL sangat panjang');
  }
  if (hostname.split('.').length > 4) {
    score += 0.15;
    indicators.push('Subdomain berlapis berlebihan');
  }
  if (parsed.port && !['80', '443', ''].includes(parsed.port)) {
    score += 0.1;
    indicators.push(`Port non-standar (${parsed.port})`);
  }

  const pathHit = SENSITIVE_PATHS.find((word) => path.includes(word));
  if (pathHit) {
    score += 0.2;
    indicators.push(`Path sensitif: "${pathHit}"`);
    if (parsed.protocol === 'http:') {
      score += 0.15;
      indicators.push('Halaman sensitif tanpa HTTPS');
    }
  }

  for (const brand of Object.keys(BRANDS)) {
    const official = isOfficial(hostname, brand);
    const tokens = hostname.split(/[.-]/);
    if ((tokens.includes(brand) || hostname.startsWith(brand)) && !official) {
      score += 0.5;
      indicators.push(`Domain menyerupai brand "${brand}" tetapi bukan domain resmi`);
      break;
    }
    for (const domain of BRANDS[brand]) {
      const distance = levenshtein(hostname, domain);
      if (!official && distance > 0 && distance <= 2) {
        score += 0.4;
        indicators.push(`Domain mirip "${domain}" (jarak edit ${distance})`);
        break;
      }
    }
  }

  return { score: clamp01(score), indicators: unique(indicators), hostname, url: raw };
}

async function expandShortener(raw) {
  if (!SHORTENERS.has(hostnameOf(raw))) return null;
  const cached = expansionCache.get(raw);
  if (cached && Date.now() - cached.timestamp < EXPANSION_TTL) return cached.finalUrl;

  try {
    const res = await axios.get(raw, {
      timeout: config.PHISHING_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      maxContentLength: 1024,
      headers: { 'User-Agent': 'SecurityBot/1.0' },
    });
    const finalUrl = res.request?.res?.responseUrl || res.config?.url || raw;
    expansionCache.set(raw, { finalUrl, timestamp: Date.now() });
    return finalUrl;
  } catch {
    return null;
  }
}

async function analyzePhishing(text) {
  const normalized = normalizeText(text);
  const urls = extractUrls(text);
  const indicators = [];
  let score = 0;

  for (const raw of urls) {
    const result = analyzeUrl(raw);
    score = Math.max(score, result.score);
    indicators.push(...result.indicators);

    if (config.PHISHING_EXPAND_SHORTENERS && SHORTENERS.has(result.hostname)) {
      const finalUrl = await expandShortener(raw);
      if (finalUrl && finalUrl !== raw) {
        const finalResult = analyzeUrl(finalUrl);
        indicators.push(`Shortener mengarah ke ${finalResult.hostname || 'domain lain'}`);
        score = Math.max(score, Math.min(1, finalResult.score + 0.2));
        indicators.push(...finalResult.indicators);
      }
    }
  }

  const cueHits = TEXT_CUES.filter((cue) => normalized.includes(cue));
  if (cueHits.length) {
    score += Math.min(0.3, cueHits.length * 0.08);
    indicators.push(`Konteks phishing: ${cueHits.slice(0, 4).join(', ')}`);
  }
  if (urls.length >= 2) {
    score += 0.1;
    indicators.push(`Beberapa link dalam pesan (${urls.length})`);
  }
  if (urls.length === 0 && cueHits.length >= 3) {
    score += 0.15;
    indicators.push('Permintaan verifikasi/klaim tanpa link eksplisit');
  }

  return { category: 'phishing', score: clamp01(score), indicators: unique(indicators), urls };
}

module.exports = { analyzePhishing, analyzeUrl };
