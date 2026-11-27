// =============================================================
// handlers/prayerHandler.js
// Jadwal shalat 5 waktu: reminder, notifikasi adzan, kunci/buka grup
//
// Alur per waktu shalat:
//   H-5 menit  -> reminder + KUNCI grup
//   tepat adzan -> notifikasi adzan
//   H+10 menit -> pesan selesai + BUKA grup (Jumat: H+30)
//
// Semua perhitungan waktu memakai WIB (UTC+7), tidak bergantung
// timezone mesin/server.
// =============================================================

const axios  = require('axios');
const config = require('../config');
const { loadStatus } = require('../utils/storage');

const JAKARTA_OFFSET_MINUTES = 7 * 60; // WIB = UTC+7 (tanpa DST)

// Simpan semua timeout aktif agar bisa dibatalkan saat refresh
let activeTimeouts = [];
let cachedTimings  = null;

// Grup yang dikunci OTOMATIS karena waktu shalat. Dipakai agar bot
// tidak membuka grup yang dikunci manual oleh owner (!lock).
const prayerLockedGroups = new Set();

/**
 * Ambil jadwal shalat hari ini dari Aladhan API
 */
async function fetchPrayerTimes() {
  try {
    const jakartaNow = new Date(Date.now() + JAKARTA_OFFSET_MINUTES * 60000);
    const response = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
      params: {
        city:    config.CITY,
        country: config.COUNTRY,
        method:  config.PRAYER_METHOD,
        day:     jakartaNow.getUTCDate(),
        month:   jakartaNow.getUTCMonth() + 1,
        year:    jakartaNow.getUTCFullYear()
      },
      timeout: 15000
    });
    cachedTimings = response.data.data.timings;
    return cachedTimings;
  } catch (err) {
    console.error('[Prayer] Gagal mengambil jadwal shalat:', err.message);
    return null;
  }
}

/**
 * Ambil cache jadwal shalat
 */
function getCachedPrayerTimes() {
  return cachedTimings;
}

/**
 * Menit sejak 00:00 WIB.
 */
function getJakartaMinutes() {
  const now = new Date();
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + JAKARTA_OFFSET_MINUTES) % 1440;
}

function getJakartaHour() {
  return Math.floor(getJakartaMinutes() / 60);
}

function getJakartaDay() {
  return new Date(Date.now() + JAKARTA_OFFSET_MINUTES * 60000).getUTCDay();
}

/**
 * Apakah sekarang berada dalam jam operasional grup (WIB)?
 */
function isWithinOperationalHours() {
  const hour = getJakartaHour();
  return hour >= config.OPEN_HOUR && hour < config.CLOSE_HOUR;
}

/**
 * Hitung milidetik hingga waktu target WIB hari ini.
 * Return -1 jika sudah lewat.
 */
function msUntil(timeStr, offsetMinutes = 0) {
  const [h, m] = String(timeStr).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;

  const now    = new Date();
  const nowMin = getJakartaMinutes();
  const nowSec = now.getUTCSeconds();
  const nowMs  = now.getUTCMilliseconds();

  const target = h * 60 + m + offsetMinutes;
  if (target < 0) return -1;

  const diffMin = target - nowMin;
  if (diffMin < 0) return -1;

  const diffMs = diffMin * 60000 - nowSec * 1000 - nowMs;
  return diffMs > 0 ? diffMs : -1;
}

/**
 * Jadwalkan satu event dengan setTimeout, simpan referensi
 */
function scheduleOnce(ms, fn) {
  if (ms < 0) return; // Sudah lewat, skip
  const t = setTimeout(fn, ms);
  activeTimeouts.push(t);
}

/**
 * Kunci grup untuk waktu shalat.
 * Return true jika bot benar-benar mengunci grup ini.
 */
async function lockGroupForPrayer(chat, groupId) {
  if (!isWithinOperationalHours()) {
    console.log(`[Prayer] ${groupId} di luar jam operasional, tidak dikunci.`);
    return false;
  }

  await chat.setMessagesAdminsOnly(true);
  prayerLockedGroups.add(groupId);
  return true;
}

/**
 * Buka grup setelah waktu shalat.
 * Hanya membuka grup yang sebelumnya dikunci oleh bot karena shalat.
 */
async function unlockGroupAfterPrayer(chat, groupId) {
  if (!prayerLockedGroups.has(groupId)) return false;

  prayerLockedGroups.delete(groupId);

  if (!isWithinOperationalHours()) {
    console.log(`[Prayer] ${groupId} di luar jam operasional, tetap terkunci.`);
    return false;
  }

  await chat.setMessagesAdminsOnly(false);
  return true;
}

/**
 * Mulai / refresh scheduler shalat
 * Dipanggil saat bot ready, setiap tengah malam, dan saat ada grup baru.
 */
async function startPrayerScheduler(client, getGroups) {
  // Batalkan semua timeout lama
  activeTimeouts.forEach(t => clearTimeout(t));
  activeTimeouts = [];

  const timings = await fetchPrayerTimes();
  if (!timings) {
    console.warn('[Prayer] Jadwal tidak tersedia, retry dalam 5 menit...');
    const retry = setTimeout(() => startPrayerScheduler(client, getGroups), 5 * 60 * 1000);
    activeTimeouts.push(retry);
    return;
  }

  const prayerKeys = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const isFriday   = getJakartaDay() === 5;

  for (const key of prayerKeys) {
    const timeStr = timings[key];
    if (!timeStr) continue;

    let info = { ...config.PRAYER_MESSAGES[key] };

    // Penyesuaian khusus Shalat Jumat
    const isFridayJumat = isFriday && key === 'Dhuhr';
    if (isFridayJumat) {
      info.name = 'Jumat';
      info.msg  = 'Siap-siap untuk shalat Jumat! Jangan lupa potong kuku, mandi sunnah, dan datang lebih awal ke masjid. 🕌✨';
    }

    const beforeMinutes = config.BEFORE_PRAYER;
    const afterMinutes  = isFridayJumat ? 30 : config.AFTER_PRAYER;

    console.log(`[Prayer] ${info.name}: ${timeStr} WIB (${isFridayJumat ? 'Jadwal Jumat' : 'Reguler'})`);

    // ── 0. KHUSUS JUMAT: Pengingat 1 Jam Sebelum Adzan ────────
    if (isFridayJumat) {
      scheduleOnce(msUntil(timeStr, -60), async () => {
        const { isActive } = loadStatus();
        if (!isActive) return;

        const groups = getGroups();
        console.log('[Prayer] Jumat: kirim pengingat 1 jam sebelum');
        for (const groupId of groups) {
          try {
            const chat = await client.getChatById(groupId);
            await chat.sendMessage(
              `📢 *PENGINGAT SHALAT JUMAT* 🕌\n\n` +
              `Sekitar *1 jam lagi* adzan Shalat Jumat akan berkumandang.\n` +
              `Yuk mulai persiapan diri, mandi sunnah, dan bersiap menuju masjid lebih awal. ✨\n\n` +
              `*— ${config.BOT_NAME}*`
            );
          } catch (e) {
            console.error('[Prayer] Jumat-60min error:', e.message);
          }
        }
      });
    }

    // ── 1. 5 menit sebelum adzan -> reminder + KUNCI grup ─────
    scheduleOnce(msUntil(timeStr, -beforeMinutes), async () => {
      const { isActive } = loadStatus();
      if (!isActive) return;

      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: reminder + kunci ${groups.length} grup`);

      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);

          const reminderMsg = `
📢 *PENGINGAT — Waktu Shalat ${info.name} Segera Tiba* 🕌

Panggilan ibadah untuk shalat *${info.name}* akan segera tiba (sekitar *${beforeMinutes} menit* lagi).

🔒 Grup dikunci sementara selama waktu ibadah dan akan dibuka kembali sekitar *${afterMinutes} menit setelah adzan*.

Mari bersiap-siap menunaikan ibadah tepat waktu. ✨

*— ${config.BOT_NAME}*
`.trim();

          await chat.sendMessage(reminderMsg);

          const locked = await lockGroupForPrayer(chat, groupId);
          if (locked) console.log(`[Prayer] Grup ${groupId} dikunci untuk ${info.name}.`);
        } catch (e) {
          console.error(`[Prayer] Pre-${info.name} error di ${groupId}:`, e.message);
        }
      }
    });

    // ── 2. Tepat waktu adzan -> notifikasi ────────────────────
    scheduleOnce(msUntil(timeStr, 0), async () => {
      const { isActive } = loadStatus();
      if (!isActive) return;

      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: kirim notifikasi adzan`);

      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);
          const lockedNote = prayerLockedGroups.has(groupId)
            ? '\n🔒 Grup sedang dikunci sementara selama waktu ibadah.'
            : '';

          const adzanMsg = `
${info.emoji} *Allahu Akbar!*  —  *Adzan ${info.name}* ${info.emoji}

${info.msg}

🕌 Mari tinggalkan sejenak aktivitas dunia.
Semoga ibadah kita diterima Allah SWT. Aamiin 🤲
${lockedNote}

*— ${config.BOT_NAME}*
`.trim();

          await chat.sendMessage(adzanMsg);
        } catch (e) {
          console.error(`[Prayer] Adzan-${info.name} error di ${groupId}:`, e.message);
        }
      }
    });

    // ── 3. Post-Adzan -> pesan selesai + BUKA grup ────────────
    scheduleOnce(msUntil(timeStr, afterMinutes), async () => {
      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: pesan selesai ibadah + buka grup`);

      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);

          const opened = await unlockGroupAfterPrayer(chat, groupId);

          const openMsg = `
✅ *Waktu Ibadah Selesai* ✅

Waktu shalat *${info.name}* telah selesai. Semoga amal ibadah kita semua diterima oleh Allah SWT. Aamiin 🤲

${opened ? '🔓 Grup telah *dibuka kembali*. Silakan lanjutkan aktivitas diskusi.' : 'Silakan lanjutkan aktivitas diskusi Anda.'} 😊

*— ${config.BOT_NAME}*
`.trim();

          await chat.sendMessage(openMsg);
        } catch (e) {
          console.error(`[Prayer] Post-${info.name} error di ${groupId}:`, e.message);
        }
      }
    });
  }

  // Tampilkan ringkasan jadwal hari ini
  console.log('\n[Prayer] ✅ Jadwal shalat berhasil dimuat:');
  for (const key of prayerKeys) {
    const t    = timings[key];
    const info = config.PRAYER_MESSAGES[key];
    if (t && info) console.log(`         ${info.emoji} ${info.name.padEnd(8)}: ${t} WIB`);
  }
  console.log('');
}

module.exports = {
  startPrayerScheduler,
  fetchPrayerTimes,
  msUntil,
  getCachedPrayerTimes,
  isWithinOperationalHours,
  getJakartaHour
};
