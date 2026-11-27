require('dotenv').config({ path: './.env' });

// Test pipeline tanpa LLM agar deterministik. Set SECURITY_MODE=hybrid di .env
// jika ingin menguji fallback LLM secara manual.
if (!process.env.SECURITY_MODE) process.env.SECURITY_MODE = 'ml';

const { loadStatus, loadWarnings } = require('./utils/storage');
const { msUntil, isWithinOperationalHours } = require('./handlers/prayerHandler');
const { checkHealth, classifyWithML } = require('./utils/mlClient');
const { analyzeSpam, recordMessage } = require('./utils/spamAnalyzer');
const { analyzePhishing } = require('./utils/phishingAnalyzer');
const { analyzeSocialEngineering } = require('./utils/socialEngineeringAnalyzer');
const { analyzeMessage, getThreatStats, MODE } = require('./utils/threatAnalyzer');
const { getIncidentStats } = require('./utils/incidents');

function printPipelineResult(label, result) {
  const verdict = result && result.is_threat ? 'THREAT' : 'SAFE';
  const category = result ? result.category : '-';
  const severity = result ? result.severity : '-';
  const score = result && result.score != null ? String(result.score).padStart(3, ' ') : '-';
  const source = result ? (result.source || '-') : '-';
  console.log(
    `   ${label.padEnd(46)} -> ${verdict.padEnd(6)} | ${String(category).padEnd(19)} | ` +
    `${String(severity).padEnd(6)} | ${score} | ${source}`
  );
  if (result && result.indicators && result.indicators.length) {
    console.log(`      indikator: ${result.indicators.slice(0, 3).join('; ')}`);
  }
}

async function runTests() {
  console.log('🧪 Starting Security-Bot Logic Tests...\n');

  console.log('📂 Testing Storage...');
  console.log('✅ Status loaded:', loadStatus());
  console.log('✅ Warnings loaded (grup):', Object.keys(loadWarnings()).length);
  console.log('');

  console.log('🕌 Testing Prayer Logic (WIB)...');
  for (const t of ['03:00', '12:00', '23:59']) {
    const ms = msUntil(t);
    console.log(`   msUntil(${t}) = ${ms > 0 ? `${Math.round(ms / 60000)} menit` : 'sudah lewat'}`);
  }
  console.log(`   Dalam jam operasional: ${isWithinOperationalHours() ? 'ya' : 'tidak'}`);
  console.log('');

  console.log('🧠 Testing ML Service...');
  const health = await checkHealth();
  if (!health || health.status !== 'ok') {
    console.log('⚠️  ML service tidak siap. Jalankan `python train_ml.py` lalu `python ml_service.py`.');
  } else {
    console.log(`✅ Model: ${health.model || '-'} | labels: ${(health.labels || []).join(', ')}`);
    if (health.metrics) {
      console.log(`✅ Held-out: accuracy ${health.metrics.accuracy} | macro F1 ${health.metrics.macro_f1}`);
    }
    if (health.manual_metrics) {
      console.log(`✅ Manual  : accuracy ${health.manual_metrics.accuracy} | macro F1 ${health.manual_metrics.macro_f1}`);
    }
  }
  console.log('');

  if (health && health.status === 'ok') {
    console.log('🔎 Testing ML Predictions...');
    const samples = [
      'Akun BCA Anda diblokir, verifikasi di http://bca-verifikasi.xyz/login',
      'PROMO kuota murah, order sekarang WA 081234567890',
      'Halo admin, tolong kirim kode OTP yang masuk ke HP saya',
      'Besok kuliah jam 8 di ruang A101 ya',
    ];
    for (const text of samples) {
      const result = await classifyWithML(text);
      const label = result ? `${result.category} (${result.confidence})` : 'null';
      console.log(`   ${text.slice(0, 55).padEnd(57)} -> ${label}`);
    }
    console.log('');
  }

  console.log('📢 Testing Spam Rules...');
  const spamCtx = { groupId: 'test@g.us', senderId: 'spam@c.us' };
  for (let i = 0; i < 6; i++) recordMessage({ ...spamCtx, text: 'PROMO MURAH ORDER SEKARANG' });
  console.log('   rate test:', analyzeSpam('PROMO MURAH ORDER SEKARANG', spamCtx));
  console.log('');

  console.log('🎣 Testing Phishing Rules...');
  for (const text of [
    'Akun BCA diblokir, verifikasi di http://bca-verifikasi.xyz/login',
    'Cek resi di https://bit.ly/abc123',
    'Info beasiswa di https://www.ui.ac.id/beasiswa',
  ]) {
    const result = await analyzePhishing(text);
    console.log(`   ${text.slice(0, 58).padEnd(60)} -> score ${result.score.toFixed(2)} | ${result.indicators.slice(0, 2).join('; ')}`);
  }
  console.log('');

  console.log('🎭 Testing Social Engineering Rules...');
  for (const text of [
    'Ini admin grup, kirim kode OTP yang baru masuk ke nomor Anda',
    'Saya dari bank BRI, sebutkan PIN dan OTP Anda sekarang',
    'Tolong transfer catatan kuliah ke folder shared drive',
  ]) {
    const result = analyzeSocialEngineering(text);
    console.log(`   ${text.slice(0, 58).padEnd(60)} -> score ${result.score.toFixed(2)} | ${result.indicators.slice(0, 2).join('; ')}`);
  }
  console.log('');

  console.log(`🤖 Testing Threat Pipeline (MODE=${MODE})...`);
  const pipelineSamples = [
    'Besok kuliah jam 8 di ruang A101, jangan lupa bawa laptop',
    'Akun BCA Anda diblokir, verifikasi di http://bca-verifikasi.xyz/login',
    'PROMO kuota murah, order sekarang WA 081234567890',
    'Ini admin grup, tolong kirim kode OTP yang baru masuk',
    'Tolong transfer catatan kuliah ke folder shared drive',
    'Judi online bonus 100 persen, daftar di http://slot88-gacor.top',
  ];
  for (const text of pipelineSamples) {
    const context = { groupId: 'pipeline@g.us', senderId: `user-${Math.random()}@c.us`, text };
    recordMessage(context);
    const result = await analyzeMessage(text, context);
    printPipelineResult(`"${text.slice(0, 42)}"`, result);
  }
  console.log('');

  console.log('📊 Threat stats:', getThreatStats());
  console.log('🚨 Incident stats:', {
    total: getIncidentStats().total,
    last24h: getIncidentStats().last24h,
    byCategory: getIncidentStats().byCategory,
  });
  console.log('');
  console.log('✨ Tests completed!');
}

runTests().catch((err) => {
  console.error('❌ Test error:', err);
  process.exitCode = 1;
});
