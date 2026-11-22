// =============================================================
// handlers/prayerHandler.js
// Jadwal shalat 5 waktu: reminder, notifikasi adzan, kunci/buka grup
// =============================================================

const axios  = require('axios');
const config = require('../config');
const { loadStatus } = require('../utils/storage');

// Simpan semua timeout aktif agar bisa dibatalkan saat refresh
let activeTimeouts = [];
let cachedTimings  = null;

/**
 * Ambil jadwal shalat hari ini dari Aladhan API
 */
async function fetchPrayerTimes() {
  try {
    const now   = new Date();
    const response = await axios.get('https://api.aladhan.com/v1/timingsByCity', {
      params: {
        city:    config.CITY,
        country: config.COUNTRY,
        method:  config.PRAYER_METHOD,
        day:     now.getDate(),
        month:   now.getMonth() + 1,
        year:    now.getFullYear()
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
 * Hitung milidetik hingga waktu target hari ini (atau return -1 jika sudah lewat)
 */
function msUntil(timeStr, offsetMinutes = 0) {
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h * 60 + m + offsetMinutes;
  const tH     = Math.floor(total / 60) % 24;
  const tM     = total % 60;

  const now    = new Date();
  const target = new Date();
  target.setHours(tH, tM, 0, 0);

  const diff = target - now;
  return diff > 0 ? diff : -1; // -1 = sudah lewat hari ini
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
 * Mulai / refresh scheduler shalat
 * Dipanggil saat bot ready dan setiap tengah malam
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

  const isFriday = new Date().getDay() === 5;

  for (const key of prayerKeys) {
    const timeStr = timings[key];
    let info      = { ...config.PRAYER_MESSAGES[key] };

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
        console.log(`[Prayer] Jumat: Kirim pengingat 1 jam sebelum`);
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
            console.error(`[Prayer] Jumat-60min error:`, e.message);
          }
        }
      });
    }

    // ── 1. 5 menit sebelum adzan → reminder (TANPA KUNCI) ─────
    scheduleOnce(msUntil(timeStr, -beforeMinutes), async () => {
      const { isActive } = loadStatus();
      if (!isActive) return;

      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: kirim reminder ke ${groups.length} grup`);

      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);

          const reminderMsg = `
📢 *PENGINGAT — Waktu Shalat ${info.name} Segera Tiba* 🕌

Panggilan ibadah untuk shalat *${info.name}* akan segera tiba (sekitar *${beforeMinutes} menit* lagi).
Mari bersiap-siap menunaikan ibadah tepat waktu. ✨

_Catatan: Grup tetap dibuka, namun mohon tetap menjaga ketertiban selama waktu ibadah._ 🙏

*— ${config.BOT_NAME}*
`.trim();

          await chat.sendMessage(reminderMsg);
        } catch (e) {
          console.error(`[Prayer] Pre-${info.name} error di ${groupId}:`, e.message);
        }
      }
    });

    // ── 2. Tepat waktu adzan → notifikasi ────────────────────
    scheduleOnce(msUntil(timeStr, 0), async () => {
      const { isActive } = loadStatus();
      if (!isActive) return;

      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: kirim notifikasi adzan`);

      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);

          const adzanMsg = `
${info.emoji} *Allahu Akbar!*  —  *Adzan ${info.name}* ${info.emoji}

${info.msg}

🕌 Mari tinggalkan sejenak aktivitas dunia.
Semoga ibadah kita diterima Allah SWT. Aamiin 🤲

*— ${config.BOT_NAME}*
`.trim();

          await chat.sendMessage(adzanMsg);
        } catch (e) {
          console.error(`[Prayer] Adzan-${info.name} error di ${groupId}:`, e.message);
        }
      }
    });

    // ── 3. Post-Adzan → ucapan selesai ibadah (TANPA BUKA KARENA GA DIKUNCI) ──
    scheduleOnce(msUntil(timeStr, afterMinutes), async () => {
      const { isActive } = loadStatus();
      if (!isActive) return;

      const groups = getGroups();
      console.log(`[Prayer] ${info.name}: kirim pesan selesai ibadah`);
      
      for (const groupId of groups) {
        try {
          const chat = await client.getChatById(groupId);
          const openMsg = `
✅ *Waktu Ibadah Selesai* ✅

Waktu shalat *${info.name}* telah selesai. Semoga amal ibadah kita semua diterima oleh Allah SWT. Aamiin 🤲

Silakan lanjutkan aktivitas diskusi Anda. Terima kasih! 😊

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

module.exports = { startPrayerScheduler, fetchPrayerTimes, msUntil, getCachedPrayerTimes };
