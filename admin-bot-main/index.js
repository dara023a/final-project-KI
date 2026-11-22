// =============================================================
// index.js — Safety-Bot: Entry Point Utama
// Pemilik : 082254513920  |  Bot: 0895416132949
// =============================================================

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const cron   = require('node-cron');
const express = require('express');
const path    = require('path');
const fs      = require('fs');

const config             = require('./config');
const { handleNewMember }       = require('./handlers/welcomeHandler');
const { handleMessage, resetMemberWarnings, getMemberWarnings } = require('./handlers/moderationHandler');
const { startPrayerScheduler, getCachedPrayerTimes }  = require('./handlers/prayerHandler');
const { loadStatus, saveStatus } = require('./utils/storage');
const { getUsageStats }         = require('./utils/grokAI');

// ─── Setup Express (Dashboard) ─────────────────────────────
const app = express();
const PORT = process.env.PORT || 7860;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get Bot Stats & Config
app.get('/api/stats', (req, res) => {
  res.json({
    botStatus: loadStatus(),
    aiStats: getUsageStats(),
    groups: managedGroups,
    prayerTimes: getCachedPrayerTimes(),
    config: config,
    uptime: process.uptime()
  });
});

// API: Save Config
app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  Object.assign(config, newConfig);

  const content = `// =============================================================
// config.js — Konfigurasi utama Safety-Bot (AUTO-GENERATED)
// =============================================================

module.exports = ${JSON.stringify(config, null, 2)};
`;

  try {
    fs.writeFileSync(path.join(__dirname, 'config.js'), content, 'utf8');
    res.json({ success: true, message: 'Konfigurasi berhasil disimpan!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menyimpan file config.' });
  }
});

// API: Tampilkan QR Code sebagai gambar PNG
app.get('/qr', (req, res) => {
  const qrPath = path.join(__dirname, 'public', 'qr.png');
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath);
  } else {
    res.status(404).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f1117;color:#e8eaf0">
        <h2>QR Code belum tersedia</h2>
        <p>Bot sedang memuat atau sudah terautentikasi.</p>
        <p>Refresh halaman ini dalam beberapa detik.</p>
        <script>setTimeout(()=>location.reload(), 5000)</script>
      </body></html>
    `);
  }
});

// API: Status QR (untuk polling dari dashboard)
app.get('/api/qr-status', (req, res) => {
  const qrPath = path.join(__dirname, 'public', 'qr.png');
  res.json({ available: fs.existsSync(qrPath) });
});

// Fallback: Kirim index.html untuk semua rute lain
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌐 Dashboard aktif di: http://localhost:${PORT}\n`);
});

// ─── Daftar grup yang dikelola bot ─────────────────────────
let managedGroups = [];
const getGroups = () => managedGroups;

// ─── Inisialisasi Client WhatsApp ───────────────────────────
const isTermux = process.platform === 'android' || process.env.PREFIX === '/data/data/com.termux/files/usr';

const puppeteerOptions = {
    headless: true,
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
        '--js-flags=--max-old-space-size=512'
    ],
    timeout: 60000
};

if (isTermux) {
    puppeteerOptions.executablePath = '/data/data/com.termux/files/usr/bin/chromium-browser';
}

const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'safety-bot' }),
    puppeteer: puppeteerOptions
});

// ─── QR Code ────────────────────────────────────────────────
client.on('qr', async (qr) => {
  console.log('\n' + '═'.repeat(55));
  console.log('  📱  QR Code diterima, simpan ke file...');
  console.log('═'.repeat(55));

  try {
    const qrPath = path.join(__dirname, 'public', 'qr.png');
    await QRCode.toFile(qrPath, qr, { width: 300, margin: 2 });
    console.log(`  ✅  QR tersimpan! Buka: http://localhost:${PORT}/qr`);
  } catch (e) {
    console.error('  ❌  Gagal simpan QR:', e.message);
    // Fallback: tampilkan di terminal
    qrcode.generate(qr, { small: true });
  }

  console.log('  ⏳  Menunggu scan...');
  console.log('═'.repeat(55) + '\n');
});

// ─── Autentikasi Berhasil ────────────────────────────────────
client.on('authenticated', () => {
  console.log('✅ Autentikasi berhasil! Session disimpan.');

  // Hapus file QR setelah berhasil login (tidak perlu lagi)
  const qrPath = path.join(__dirname, 'public', 'qr.png');
  if (fs.existsSync(qrPath)) {
    fs.unlinkSync(qrPath);
    console.log('[QR] File QR dihapus (sudah tidak diperlukan).');
  }
});

// ─── Bot Siap ────────────────────────────────────────────────
client.on('ready', async () => {
  console.log('\n' + '═'.repeat(55));
  console.log(`  🤖  ${config.BOT_NAME} Aktif!`);
  console.log(`  📅  ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`);
  console.log('═'.repeat(55));

  try {
    const chats = await client.getChats();
    const groupChats = chats.filter(c => c.isGroup).map(c => c.id._serialized);

    if (managedGroups.length === 0) {
      managedGroups = groupChats;
    } else {
      managedGroups = managedGroups.filter(id => groupChats.includes(id));
    }

    console.log(`  📊  Memantau ${managedGroups.length} grup`);
    managedGroups.forEach(id => console.log(`       • ${id}`));
    console.log('═'.repeat(55) + '\n');
  } catch (e) {
    console.error('Gagal mengambil daftar grup:', e.message);
  }

  await startPrayerScheduler(client, getGroups);
  startGroupOperationalScheduler();
  await checkCurrentOperationalHours();

  try {
    const ownerNumbers = (config.OWNER_NUMBER || '').split(',').map(n => n.trim());
    for (const no of ownerNumbers) {
      const target = no.includes('@') ? no : `${no}${no.length > 15 ? '@lid' : '@c.us'}`;
      try {
        await client.sendMessage(
          target,
          `✅ *${config.BOT_NAME} Aktif!*\n\n` +
          `🕐 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
          `📊 Grup dikelola: ${managedGroups.length}\n\n` +
          `Ketik *!help* untuk daftar perintah.`
        );
        console.log(`[Notification] Terkirim ke owner: ${target}`);
      } catch (sendErr) {
        console.log(`[Info] Gagal kirim notifikasi ke ${target}: ${sendErr.message}`);
      }
    }
  } catch (e) {
    console.log('[Info] Terjadi kesalahan saat memproses notifikasi owner.');
  }
});

// ─── Scheduler Jam Operasional Grup ─────────────────────────
function startGroupOperationalScheduler() {
  cron.schedule('0 3 * * *', async () => {
    const { isActive } = loadStatus();
    if (!isActive) return;
    console.log('[Scheduler] Membuka grup (03:00 WIB)');
    for (const groupId of managedGroups) {
      try {
        const chat = await client.getChatById(groupId);
        await chat.setMessagesAdminsOnly(false);
        await chat.sendMessage(
          `🌅 *SELAMAT PAGI! — GRUP DIBUKA* ☀️\n\n` +
          `Waktu menunjukkan pukul 03.00 WIB. Sesuai jadwal operasional, grup kini telah *dibuka kembali*.\n\n` +
          `Selamat beraktivitas, tetap jaga kesopanan dan semangat pagi! 💪😊\n\n` +
          `*— ${config.BOT_NAME}*`
        );
      } catch (e) {
        console.error('[Scheduler] Gagal buka grup:', e.message);
      }
    }
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule('0 22 * * *', async () => {
    const { isActive } = loadStatus();
    if (!isActive) return;
    console.log('[Scheduler] Menutup grup (22:00 WIB)');
    for (const groupId of managedGroups) {
      try {
        const chat = await client.getChatById(groupId);
        await chat.sendMessage(
          `🌙 *SELAMAT ISTIRAHAT — GRUP DITUTUP* 💤\n\n` +
          `Waktu menunjukkan pukul 22.00 WIB. Sesuai jadwal operasional, grup kini kami *tutup sementara* untuk waktu istirahat.\n\n` +
          `Grup akan dibuka kembali besok pagi pukul 03.00 WIB. Sampai jumpa besok! 👋😴\n\n` +
          `*— ${config.BOT_NAME}*`
        );
        await chat.setMessagesAdminsOnly(true);
      } catch (e) {
        console.error('[Scheduler] Gagal tutup grup:', e.message);
      }
    }
  }, { timezone: 'Asia/Jakarta' });

  cron.schedule('1 0 * * *', async () => {
    console.log('[Scheduler] Refresh jadwal shalat (00:01 WIB)');
    await startPrayerScheduler(client, getGroups);
  }, { timezone: 'Asia/Jakarta' });

  console.log('[Scheduler] Jam operasional & refresh jadwal aktif.\n');
}

async function checkCurrentOperationalHours() {
  const { isActive } = loadStatus();
  if (!isActive) return;

  const now  = new Date();
  const hour = now.getHours();

  if (hour >= config.CLOSE_HOUR || hour < config.OPEN_HOUR) {
    console.log(`[Operational] Jam sekarang ${hour}:00, otomatis mengunci grup (Waktu Tidur).`);
    for (const groupId of managedGroups) {
      try {
        const chat = await client.getChatById(groupId);
        await chat.setMessagesAdminsOnly(true);
        await chat.sendMessage(
          `🌙 *INFO OTOMATIS — GRUP TETAP DITUTUP* 💤\n\n` +
          `Bot baru saja aktif. Karena saat ini sudah memasuki waktu istirahat (pukul ${hour}.00 WIB), maka grup *tetap dikunci* sesuai jadwal operasional.\n\n` +
          `Grup akan dibuka kembali besok pagi pukul 03.00 WIB. Selamat beristirahat! 😴\n\n` +
          `*— ${config.BOT_NAME}*`
        );
      } catch (e) {
        console.error(`[Operational] Gagal kunci grup ${groupId}:`, e.message);
      }
    }
  } else {
    console.log(`[Operational] Jam sekarang ${hour}:00, masuk jam operasional.`);
  }
}

// ─── Event: Anggota Baru Masuk ───────────────────────────────
client.on('group_join', async (notification) => {
  const ids = notification.recipientIds || [];
  if (ids.includes(config.BOT_NUMBER + '@c.us')) {
    if (!managedGroups.includes(notification.chatId)) {
      managedGroups.push(notification.chatId);
      console.log(`[Group] Bot ditambahkan ke grup baru: ${notification.chatId}`);
      await startPrayerScheduler(client, getGroups);
    }
  }
  await handleNewMember(client, notification);
});

// ─── Event: Anggota Keluar ───────────────────────────────────
client.on('group_leave', async (notification) => {
  const ids = notification.recipientIds || [];
  if (ids.includes(config.BOT_NUMBER + '@c.us')) {
    managedGroups = managedGroups.filter(id => id !== notification.chatId);
    console.log(`[Group] Bot dikeluarkan dari grup: ${notification.chatId}`);
  }
});

// ─── Event: Pesan Masuk ───────────────────────────────────────
client.on('message', async (message) => {
  await handleAllMessages(message);
});

// ─── Event: Pesan Terkirim (Dari Diri Sendiri) ───────────────
client.on('message_create', async (message) => {
  if (message.fromMe && message.body && !message.body.includes('— ' + config.BOT_NAME)) {
    await handleAllMessages(message);
  }
});

async function handleAllMessages(message) {
  const contact  = await message.getContact();
  const senderId = message.author || message.from;
  const senderNo = senderId.split('@')[0];
  const phoneNo  = contact.number;

  const ownerNumbers = (config.OWNER_NUMBER || '').split(',').map(n => n.trim());
  const isOwner      = ownerNumbers.includes(senderNo) || ownerNumbers.includes(phoneNo);

  const body = (message.body || '').trim().toLowerCase();
  const chat = await message.getChat();

  console.log(`[Msg] Dari: ${senderNo} (${phoneNo}) | Chat: ${chat.name || 'Private'} | Body: ${body}`);

  if (body === '!help') {
    if (chat.isGroup || isOwner) {
      let helpMsg = `📋 *Menu ${config.BOT_NAME}*\n\n` +
                    `*!status*    — Cek status aktif bot\n` +
                    `*!apistats*  — Penggunaan AI hari ini\n`;
      if (isOwner) {
        helpMsg += `\n👑 *Owner Only:*\n` +
                   `*bot-bangun*  — Aktifkan bot\n` +
                   `*bot-tidur*   — Matikan bot\n` +
                   `*!groups*      — Daftar grup\n` +
                   `*!reset <id> <no>* — Reset warn\n` +
                   `*!lock/unlock <id>* — Kontrol grup\n`;
      }
      helpMsg += `\n_Ketik perintah sesuai daftar di atas._`;
      await message.reply(helpMsg);
      return;
    }
  }

  if (body === '!status') {
    const { isActive } = loadStatus();
    await message.reply(
      `✅ *${config.BOT_NAME} Status*\n\n` +
      `🕐 Waktu   : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
      `🤖 Moderasi: ${isActive ? 'Aktif (Bangun) ✅' : 'Mati (Tidur) 💤'}\n` +
      `🤖 Versi   : 1.0.0`
    );
    return;
  }

  if (body === '!apistats') {
    const stats = getUsageStats();
    const pct   = Math.round((stats.used / stats.cap) * 100);
    const bar   = '█'.repeat(Math.round(pct/10)) + '░'.repeat(10 - Math.round(pct/10));
    await message.reply(
      `📊 *Grok AI Usage Hari Ini*\n\n` +
      `Model  : grok-3-mini (free tier)\n` +
      `Tanggal: ${stats.date}\n` +
      `${bar} ${pct}%\n` +
      `Pakai  : *${stats.used}* / ${stats.cap} panggilan\n` +
      `Sisa   : *${stats.cap - stats.used}* panggilan\n\n` +
      `_Counter reset otomatis tiap tengah malam._`
    );
    return;
  }

  if (body === 'bot-bangun' || body === 'bot-tidur') {
    let canToggle = isOwner;
    if (!canToggle && chat.isGroup) {
      if (!chat.participants) {
        try { await chat.fetchParticipants(); } catch {}
      }
      const participant = chat.participants?.find(p =>
        p.id._serialized === senderId ||
        p.id.user === senderNo ||
        p.id.user === phoneNo
      );
      if (participant?.isAdmin || participant?.isSuperAdmin) canToggle = true;
    }
    console.log(`[Control] Command: ${body} | canToggle: ${canToggle} | isOwner: ${isOwner}`);
    if (canToggle) {
      const isActivating = body === 'bot-bangun';
      saveStatus(isActivating);
      const statusMsg = isActivating
        ? '☀️ *Bot Bangun!* Bot kembali aktif memantau grup. 🤖✅'
        : '🌙 *Bot Tidur.* Bot dinonaktifkan sementara. 🤖💤';
      await message.reply(statusMsg);
      return;
    }
  }

  if (isOwner) {
    if (body === '!groups') {
      const list = managedGroups.length
        ? managedGroups.map((g, i) => `${i + 1}. ${g}`).join('\n')
        : 'Tidak ada grup.';
      await message.reply(`📋 *Grup yang dikelola:*\n\n${list}`);
      return;
    }
    const parts = body.split(' ');
    if (body.startsWith('!reset ') && parts.length >= 3) {
      const groupId = parts[1];
      const userId  = parts[2] + '@c.us';
      resetMemberWarnings(groupId, userId);
      await message.reply(`✅ Peringatan untuk *${parts[2]}* berhasil direset.`);
      return;
    }
    if (body.startsWith('!lock ') && parts.length >= 2) {
      try {
        const chatLock = await client.getChatById(parts[1]);
        await chatLock.setMessagesAdminsOnly(true);
        await message.reply('✅ Grup berhasil dikunci.');
      } catch (e) {
        await message.reply(`❌ Gagal mengunci grup: ${e.message}`);
      }
      return;
    }
    if (body.startsWith('!unlock ') && parts.length >= 2) {
      try {
        const chatUnlock = await client.getChatById(parts[1]);
        await chatUnlock.setMessagesAdminsOnly(false);
        await message.reply('✅ Grup berhasil dibuka.');
      } catch (e) {
        await message.reply(`❌ Gagal membuka grup: ${e.message}`);
      }
      return;
    }
  }

  if (chat.isGroup) {
    await handleMessage(client, message, getGroups);
  }
}

// ─── Auth Failure ────────────────────────────────────────────
client.on('auth_failure', (msg) => {
  console.error('❌ Autentikasi gagal:', msg);
  process.exit(1);
});

// ─── Koneksi Terputus ────────────────────────────────────────
let isReconnecting = false;

client.on('disconnected', async (reason) => {
  console.warn('⚠️  Bot terputus:', reason);

  if (reason === 'LOGOUT') {
    console.log('❌ Session logout! Hapus session dan restart...');
    isReconnecting = false;
    return;
  }

  if (isReconnecting) return;
  isReconnecting = true;

  console.log('🔄  Menghubungkan kembali dalam 10 detik...');
  setTimeout(async () => {
    try {
      await client.destroy();
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
      console.log('[Info] Destroy error (diabaikan):', e.message);
    }
    isReconnecting = false;
    client.initialize();
  }, 10000);
});

// ─── Mulai Bot ───────────────────────────────────────────────
console.log(`\n🚀 Memulai ${config.BOT_NAME}...\n`);
client.initialize();

// ─── Graceful Shutdown ───────────────────────────────────────
process.on('SIGINT', async () => {
  console.log('\n🛑 Menghentikan bot...');
  try { await client.destroy(); } catch {}
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Error] Unhandled rejection:', reason);
});