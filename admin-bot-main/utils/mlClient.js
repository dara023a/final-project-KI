// =============================================================
// utils/mlClient.js — Klien untuk ML service (Python)
// Memanggil model TF-IDF word+char + Logistic Regression via HTTP.
// Kelas: safe | spam | phishing | social_engineering
// =============================================================

const axios = require('axios');

const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5001/predict';
const ML_HEALTH_URL =
  process.env.ML_HEALTH_URL || ML_URL.replace(/\/predict\/?$/i, '/health');
const TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS || 2500);
const RETRY_MS = Number(process.env.ML_RETRY_MS || 30000);

let available = null;          // null = belum dicek, true/false = status terakhir
let lastFailure = 0;
let lastError = '';
let lastLoggedFailure = 0;
let modelInfo = null;

// Counter untuk dashboard / laporan evaluasi.
let mlCallCount = 0;
let mlErrorCount = 0;

function isCoolingDown() {
  return available === false && Date.now() - lastFailure < RETRY_MS;
}

function logFailureOnce(message) {
  const now = Date.now();
  if (now - lastLoggedFailure > 60000) {
    lastLoggedFailure = now;
    console.warn(`[ML] Service tidak tersedia: ${message}. Fallback ke aturan/LLM.`);
  }
}

/**
 * Klasifikasi satu teks via ML service.
 * @returns {Promise<null|{is_threat:boolean,category:string,confidence:number,reason:string,source:'ml',probabilities?:object}>}
 */
async function classifyWithML(text) {
  if (!text || isCoolingDown()) return null;

  mlCallCount++;
  try {
    const res = await axios.post(
      ML_URL,
      { text },
      { timeout: TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } }
    );

    const data = res.data || {};
    const isThreat =
      typeof data.is_threat === 'boolean'
        ? data.is_threat
        : typeof data.is_violation === 'boolean'
          ? data.is_violation
          : null;

    if (isThreat === null || !data.category) {
      throw new Error('Respons ML tidak valid');
    }

    available = true;
    lastError = '';

    return {
      is_threat: isThreat,
      is_violation: isThreat, // kompatibilitas dengan kode lama
      category: data.category,
      confidence: Number(data.confidence) || 0,
      reason: data.reason || `ML: ${data.category}`,
      source: 'ml',
      probabilities: data.probabilities,
    };
  } catch (err) {
    mlErrorCount++;
    available = false;
    lastFailure = Date.now();
    lastError = err.message;
    logFailureOnce(err.message);
    return null;
  }
}

/**
 * Cek kesehatan service ML. Dipakai saat bot ready.
 */
async function checkHealth() {
  try {
    const res = await axios.get(ML_HEALTH_URL, { timeout: TIMEOUT_MS });
    modelInfo = res.data || null;
    available = modelInfo && modelInfo.status === 'ok';
    if (available) {
      lastError = '';
    } else {
      lastFailure = Date.now();
      lastError = (modelInfo && modelInfo.error) || 'Model belum dimuat';
    }
    return modelInfo;
  } catch (err) {
    available = false;
    lastFailure = Date.now();
    lastError = err.message;
    return null;
  }
}

function getMLStatus() {
  return {
    available,
    url: ML_URL,
    lastError,
    retryInMs: available === false ? Math.max(0, RETRY_MS - (Date.now() - lastFailure)) : 0,
    model: modelInfo,
  };
}

function getMLCounters() {
  return { calls: mlCallCount, errors: mlErrorCount };
}

module.exports = {
  classifyWithML,
  checkHealth,
  getMLStatus,
  getMLCounters,
};
