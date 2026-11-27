// =============================================================
// utils/threatAnalyzer.js — Orkestrator deteksi ancaman
//
// Pipeline:
//   rules (spam/phishing/social engineering) + ML -> risk score
//   -> LLM hanya untuk kasus ambigu (mode hybrid)
//   -> kategori, severity, indikator, rekomendasi aksi
// =============================================================

const config = require('../config');
const { classifyWithML } = require('./mlClient');
const { classifyWithLLM, SECURITY_MODE } = require('./llmSecurity');
const { recordMessage, analyzeSpam } = require('./spamAnalyzer');
const { analyzePhishing } = require('./phishingAnalyzer');
const { analyzeSocialEngineering } = require('./socialEngineeringAnalyzer');
const { normalizeText, unique, clamp01 } = require('./securityText');

const MODE = SECURITY_MODE;
const USE_ML = MODE === 'ml' || MODE === 'hybrid';
const USE_LLM = MODE === 'llm' || MODE === 'hybrid';

const RULE_THRESHOLD = clamp01(config.RULE_THRESHOLD, 0.6);
const RULE_STRONG = clamp01(config.RULE_STRONG, 0.8);
const ML_CONFIDENCE = clamp01(config.ML_CONFIDENCE, 0.65);
const ML_SAFE_CONFIDENCE = clamp01(config.ML_SAFE_CONFIDENCE, 0.85);
const LLM_CONFIDENCE = clamp01(config.GROK_CONFIDENCE, 0.75);

// Konteks aman: mengurangi false positive pada obrolan kampus/grup.
const SAFE_CONTEXT_RE = /\b(kuliah|tugas|kelas|krs|ukt|dosen|mahasiswa|praktikum|ujian|rapat|organisasi|himpunan|beasiswa|kampus|grup|admin|shalat|ibadah)\b/i;
const SAFE_CONTEXT_BLOCK_RE = /\b(otp|kode verifikasi|password|sandi|pin|judi|slot|togel|pinjol|pinjaman online|promo|diskon|murah|order sekarang|followers|hadiah|menang|undian|giveaway|klaim|akun diblokir|klik link|segera|mendesak|terakhir)\b|transfer\s+(uang|dana|rp|ke rekening|ke acc|dp)|kirim uang|nomor rekening|biaya administrasi|https?:\/\//i;

const stats = {
  analyzed: 0,
  safe: 0,
  spam: 0,
  phishing: 0,
  social_engineering: 0,
  low: 0,
  medium: 0,
  high: 0,
  ruleHits: 0,
  mlHits: 0,
  llmHits: 0,
  errors: 0,
};

function round4(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function severityFor(category, confidence) {
  if (category === 'spam') {
    if (confidence >= 0.9) return 'high';
    if (confidence >= 0.7) return 'medium';
    return 'low';
  }
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.65) return 'medium';
  return 'low';
}

function recommendedAction(severity) {
  if (severity === 'high') return 'delete+warn+notify_owner';
  if (severity === 'medium') return 'delete+warn';
  return 'log';
}

function safeResult(reason, source = 'rules', ml = null, details = {}) {
  return {
    is_threat: false,
    category: 'safe',
    confidence: 1,
    severity: 'low',
    score: 0,
    indicators: [],
    reason,
    source,
    action: 'allow',
    details: {
      ...details,
      ml: ml ? { category: ml.category, confidence: ml.confidence } : null,
    },
  };
}

function finalize({ category, confidence, source, indicators, details, severity }) {
  const finalSeverity = severity || severityFor(category, confidence);
  stats[category] = (stats[category] || 0) + 1;
  stats[finalSeverity] = (stats[finalSeverity] || 0) + 1;
  if (source === 'rules') stats.ruleHits++;
  else if (source === 'ml') stats.mlHits++;
  else if (source === 'llm') stats.llmHits++;
  else if (source === 'hybrid') {
    stats.ruleHits++;
    stats.mlHits++;
  }

  return {
    is_threat: true,
    category,
    confidence: round4(confidence),
    severity: finalSeverity,
    score: Math.round(clamp01(confidence) * 100),
    indicators: unique(indicators || []).slice(0, 10),
    reason: `${category} terdeteksi (${Math.round(clamp01(confidence) * 100)}%)`,
    source,
    action: recommendedAction(finalSeverity),
    details,
  };
}

function ruleDetails(spam, phishing, socialEngineering) {
  return {
    rules: {
      spam: round4(spam.score),
      phishing: round4(phishing.score),
      social_engineering: round4(socialEngineering.score),
    },
  };
}

/**
 * Analisis satu pesan. `recordMessage` harus dipanggil lebih dulu untuk
 * membangun baseline rate/duplikasi spam.
 */
async function analyzeMessage(text, context = {}) {
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < 2) {
    stats.analyzed++;
    stats.safe++;
    return safeResult('Teks terlalu pendek');
  }

  stats.analyzed++;

  const [spamRes, phishingRes, seRes] = await Promise.allSettled([
    Promise.resolve().then(() => analyzeSpam(text, context)),
    analyzePhishing(text, context),
    Promise.resolve().then(() => analyzeSocialEngineering(text, context)),
  ]);

  const spam = spamRes.status === 'fulfilled'
    ? spamRes.value
    : { category: 'spam', score: 0, indicators: [] };
  const phishing = phishingRes.status === 'fulfilled'
    ? phishingRes.value
    : { category: 'phishing', score: 0, indicators: [] };
  const socialEngineering = seRes.status === 'fulfilled'
    ? seRes.value
    : { category: 'social_engineering', score: 0, indicators: [] };

  const candidates = [spam, phishing, socialEngineering].sort((a, b) => b.score - a.score);
  const top = candidates[0];
  const details = ruleDetails(spam, phishing, socialEngineering);

  // Shortcut konteks aman: hanya jika tidak ada sinyal ancaman kuat.
  if (
    SAFE_CONTEXT_RE.test(normalized) &&
    !SAFE_CONTEXT_BLOCK_RE.test(normalized) &&
    top.score < 0.3
  ) {
    stats.safe++;
    return safeResult('Konteks aman terdeteksi', 'rules', null, details);
  }

  if (MODE === 'rules') {
    if (top.score >= RULE_THRESHOLD) {
      return finalize({
        category: top.category,
        confidence: top.score,
        source: 'rules',
        indicators: top.indicators,
        details,
      });
    }
    stats.safe++;
    return safeResult('Tidak ada indikasi ancaman kuat', 'rules', null, details);
  }

  let ml = null;
  if (USE_ML) {
    try {
      ml = await classifyWithML(normalized);
    } catch {
      stats.errors++;
    }
  }

  const mlThreat = ml && ml.is_threat && ml.confidence >= ML_CONFIDENCE;
  const mlSafe = ml && !ml.is_threat && ml.confidence >= ML_SAFE_CONFIDENCE;

  if (top.score >= RULE_STRONG) {
    return finalize({
      category: top.category,
      confidence: Math.max(top.score, ml && ml.category === top.category ? ml.confidence : 0),
      source: 'rules',
      indicators: unique([...(top.indicators || []), ...(ml?.category === top.category ? ml.indicators || [] : [])]),
      details: { ...details, ml: ml ? { category: ml.category, confidence: ml.confidence } : null },
    });
  }

  if (mlThreat) {
    const ruleMatch = candidates.find(
      (item) => item.category === ml.category && item.score >= RULE_THRESHOLD
    );
    return finalize({
      category: ml.category,
      confidence: ml.confidence,
      source: ruleMatch ? 'hybrid' : 'ml',
      indicators: unique([...(ruleMatch?.indicators || []), ...(ml.indicators || [])]),
      details: { ...details, ml: { category: ml.category, confidence: ml.confidence } },
    });
  }

  if (mlSafe && top.score < RULE_THRESHOLD) {
    stats.safe++;
    return safeResult('ML menilai pesan aman', 'ml', ml, details);
  }

  // Aturan lokal cukup kuat tetapi ML tidak yakin/menilai aman.
  if (top.score >= RULE_THRESHOLD) {
    if (!ml || top.score >= 0.7 || ml.category === top.category) {
      return finalize({
        category: top.category,
        confidence: top.score,
        source: 'rules',
        indicators: top.indicators,
        details: { ...details, ml: ml ? { category: ml.category, confidence: ml.confidence } : null },
      });
    }
  }

  if (USE_LLM) {
    let llm = null;
    try {
      llm = await classifyWithLLM(normalized, context);
    } catch {
      stats.errors++;
    }

    if (llm && llm.category !== 'safe' && llm.confidence >= LLM_CONFIDENCE) {
      return finalize({
        category: llm.category,
        confidence: llm.confidence,
        source: 'llm',
        indicators: unique([...(llm.indicators || []), ...(top.indicators || [])]),
        details: {
          ...details,
          ml: ml ? { category: ml.category, confidence: ml.confidence } : null,
          llm: { category: llm.category, confidence: llm.confidence, reason: llm.reason },
        },
        severity: llm.severity,
      });
    }
  }

  // Sinyal ML lemah: catat sebagai ancaman low severity, tanpa hapus pesan.
  if (ml && ml.is_threat && ml.confidence >= 0.55) {
    return finalize({
      category: ml.category,
      confidence: ml.confidence,
      source: 'ml',
      indicators: ml.indicators || [],
      details: { ...details, ml: { category: ml.category, confidence: ml.confidence } },
      severity: 'low',
    });
  }

  stats.safe++;
  return safeResult('Tidak ada indikasi ancaman kuat', ml ? 'ml' : 'rules', ml, details);
}

function getThreatStats() {
  return {
    ...stats,
    mode: MODE,
    thresholds: {
      rule: RULE_THRESHOLD,
      ruleStrong: RULE_STRONG,
      ml: ML_CONFIDENCE,
      mlSafe: ML_SAFE_CONFIDENCE,
      llm: LLM_CONFIDENCE,
    },
  };
}

module.exports = {
  analyzeMessage,
  recordMessage,
  getThreatStats,
  MODE,
};
