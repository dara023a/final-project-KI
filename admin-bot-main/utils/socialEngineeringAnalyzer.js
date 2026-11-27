// =============================================================
// utils/socialEngineeringAnalyzer.js — Deteksi rekayasa sosial
//
// Pola: permintaan OTP/PIN/password, transfer mendesak, impersonasi
// admin/bank/instansi, iming-iming hadiah, permintaan data pribadi,
// dan tekanan waktu.
// =============================================================

const { normalizeText, clamp01, unique } = require('./securityText');

const GROUPS = [
  {
    key: 'credential',
    weight: 0.55,
    label: 'Permintaan kredensial',
    re: /\b(otp|kode otp|kode verifikasi|kode rahasia|password|sandi|pin|token|kode 6 digit|kode 8 digit)\b/i,
  },
  {
    key: 'request',
    weight: 0.15,
    label: 'Permintaan tindakan',
    re: /\b(kirim|berikan|sebutkan|balas|isi|masukkan|konfirmasi|verifikasi|serahkan)\b/i,
  },
  {
    key: 'financial',
    weight: 0.35,
    label: 'Permintaan finansial',
    re: /\b(transfer|rekening|nomor rekening|kirim uang|bayar|pembayaran|dp|uang muka|donasi|top up|saldo|biaya administrasi|ongkir)\b/i,
  },
  {
    key: 'authority',
    weight: 0.2,
    label: 'Klaim otoritas',
    re: /\b(admin|owner|dosen|kaprodi|pak rt|bu rt|bank|customer service|cs|polisi|pengacara|panitia|kurir|pihak kampus|tim keamanan)\b/i,
  },
  {
    key: 'urgency',
    weight: 0.15,
    label: 'Tekanan waktu',
    re: /\b(segera|sekarang|hari ini|mendesak|terakhir|sebelum|diblokir|ditutup|dinonaktifkan|jangan sampai|secepatnya)\b/i,
  },
  {
    key: 'prize',
    weight: 0.2,
    label: 'Iming-iming hadiah',
    re: /\b(menang|pemenang|hadiah|undian|giveaway|klaim|gratis|bonus|cashback)\b/i,
  },
  {
    key: 'secrecy',
    weight: 0.25,
    label: 'Permintaan kerahasiaan',
    re: /\b(jangan bilang|jangan beri tahu|rahasia|hanya kita|jangan tutup telepon)\b/i,
  },
  {
    key: 'impersonation',
    weight: 0.3,
    label: 'Indikasi impersonasi',
    re: /\b(ini nomor baru|nomor saya baru|saya ganti nomor|ini admin|saya dari bank|saya petugas|saya dosen|saya polisi|saya pengacara|saya owner)\b/i,
  },
  {
    key: 'personal_data',
    weight: 0.2,
    label: 'Permintaan data pribadi',
    re: /\b(ktp|kk|selfie|foto ktp|data pribadi|alamat lengkap|username|email kampus)\b/i,
  },
  {
    key: 'account_threat',
    weight: 0.2,
    label: 'Ancaman terhadap akun',
    re: /\b(akun.*(diblokir|hack|ditutup|dinonaktifkan|terpilih|mencurigakan)|kena hack|akun saya)\b/i,
  },
];

function analyzeSocialEngineering(text) {
  const normalized = normalizeText(text);
  const hits = {};
  const indicators = [];
  let score = 0;

  for (const group of GROUPS) {
    const match = normalized.match(group.re);
    if (!match) continue;
    hits[group.key] = true;
    score += group.weight;
    indicators.push(`${group.label}: "${match[0]}"`);
  }

  const has = (key) => Boolean(hits[key]);

  if (has('credential') && (has('request') || has('urgency') || has('authority') || has('impersonation'))) {
    score += 0.2;
    indicators.push('Kombinasi permintaan kredensial + tekanan/otoritas');
  }
  if (has('financial') && (has('authority') || has('impersonation') || has('secrecy'))) {
    score += 0.2;
    indicators.push('Kombinasi permintaan finansial + otoritas/kerahasiaan');
  }
  if (has('prize') && (has('financial') || has('request'))) {
    score += 0.15;
    indicators.push('Kombinasi hadiah + permintaan pembayaran/data');
  }
  if (has('personal_data') && has('request')) {
    score += 0.1;
    indicators.push('Permintaan data pribadi secara langsung');
  }
  if (has('secrecy') && (has('financial') || has('credential'))) {
    score += 0.1;
    indicators.push('Permintaan kerahasiaan pada topik sensitif');
  }

  return {
    category: 'social_engineering',
    score: clamp01(score),
    indicators: unique(indicators),
    groups: Object.keys(hits),
  };
}

module.exports = { analyzeSocialEngineering };
