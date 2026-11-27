// =============================================================
// handlers/securityHandler.js
// Handler utama: deteksi spam, phishing, rekayasa sosial,
// lalu hapus pesan / beri peringatan / kick / notifikasi owner.
// =============================================================

const config = require('../config');
const { analyzeMessage, recordMessage } = require('../utils/threatAnalyzer');
const {
  loadWarnings,
  addWarning,
  resetWarning,
  getWarningCount,
  loadStatus,
} = require('../utils/storage');
const { appendIncident } = require('../utils/incidents');
const { truncate } = require('../utils/securityText');

let warnings = loadWarnings();

const CATEGORY_INFO = {
  spam: { emoji: '📢', label: 'Spam' },
  phishing: { emoji: '🎣', label: 'Phishing' },
  social_engineering: { emoji: '🎭', label: 'Rekayasa Sosial' },
};

const SEVERITY_INFO = {
  low: { emoji: '🟡', label: 'RENDAH' },
  medium: { emoji: '🟠', label: 'SEDANG' },
  high: { emoji: '🔴', label: 'TINGGI' },
};

function normalizePhone(value) {
  if (!value) return '';
  let n = String(value).replace(/\D/g, '');
  if (n.startsWith('0')) n = '62' + n.slice(1);
  if (n.startsWith('8')) n = '62' + n;
  return n;
}

async function notifyOwner(client, text) {
  if (!config.NOTIFY_OWNER_ON_THREAT || !client) return;
  const ownerNumbers = String(config.OWNER_NUMBER || '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  for (const no of ownerNumbers) {
    const target = no.includes('@')
      ? no
      : `${no}${no.length > 15 ? '@lid' : '@c.us'}`;
    try {
      await client.sendMessage(target, text);
    } catch (err) {
      console.log(`[Security] Gagal notifikasi owner ${target}: ${err.message}`);
    }
  }
}

function buildWarningMessage({ senderId, info, severityInfo, result, warningCount, remaining }) {
  const lastWarn = remaining === 0 ? '\n🔴 *INI PERINGATAN TERAKHIR SEBELUM KICK!*' : '';
  const indicators = result.indicators.length
    ? result.indicators.map((item) => `   • ${item}`).join('\n')
    : '   • Tidak ada detail indikator';

  return `
${info.emoji} *PERINGATAN KEAMANAN ${warningCount}/${config.MAX_WARNINGS}* ${info.emoji}

@${senderId.split('@')[0]} terdeteksi mengirim *${info.label}*.
📊 Tingkat   : *${severityInfo.label}* (${result.score}/100)
🧠 Sumber    : ${result.source}
📝 Indikator :
${indicators}

⚠️ Sisa poin peringatan: *${remaining}*${lastWarn}

Pesan telah dihapus. Mohon patuhi aturan keamanan grup.
*— ${config.BOT_NAME}*
`.trim();
}

function buildKickMessage({ senderId, info, severityInfo, result, warningCount }) {
  return `
🚫 *ANGGOTA DIKELUARKAN* 🚫

@${senderId.split('@')[0]} telah melanggar aturan keamanan grup
dan mencapai *${warningCount} poin* peringatan.

📂 Pelanggaran terakhir : *${info.label}*
📊 Tingkat              : *${severityInfo.label}* (${result.score}/100)
📝 Indikator            :
${result.indicators.map((item) => `   • ${item}`).join('\n') || '   • -'}

Anggota dikeluarkan otomatis dari grup.
*— ${config.BOT_NAME}*
`.trim();
}

async function handleMessage(client, message, getGroups, providedChat = null) {
  try {
    const { isActive } = loadStatus();
    if (!isActive) return;

    let chat = providedChat;
    if (!chat) {
      try { chat = await message.getChat(); } catch {}
    }
    if (!chat || !chat.isGroup) return;
    if (getGroups && !getGroups().includes(chat.id._serialized)) return;
    if (message.fromMe) return;

    const contact = await message.getContact();
    const senderId = message.author || message.from;
    const senderNo = senderId.split('@')[0];
    let phoneNo = contact.number;

    if (senderId.includes('@lid') && client) {
      try {
        const mapped = await client.getContactLidAndPhone(senderId);
        const pn = mapped && mapped[0] && mapped[0].pn;
        if (pn) phoneNo = pn.split('@')[0];
      } catch {}
    }

    const ownerNumbers = String(config.OWNER_NUMBER || '').split(',').map(normalizePhone);
    const senderCandidates = [senderNo, phoneNo, contact.id?.user, contact.number]
      .filter(Boolean)
      .map(normalizePhone);
    const isOwner = senderCandidates.some((n) => ownerNumbers.includes(n));
    const botJid = `${config.BOT_NUMBER}@c.us`;
    if (isOwner || senderId === botJid) return;

    const body = (message.body || '').trim();
    if (!body || body.length < 3) return;

    const participant = chat.participants?.find(
      (p) =>
        p.id._serialized === senderId ||
        p.id.user === senderNo ||
        p.id.user === phoneNo
    );
    if (participant?.isAdmin || participant?.isSuperAdmin) return;

    const groupId = chat.id._serialized;
    const context = {
      message,
      chat,
      groupId,
      groupName: chat.name || groupId,
      senderId,
      senderNo,
      senderName: contact.pushname || contact.name || senderNo,
    };

    // Bangun baseline rate/duplikasi untuk semua pesan, termasuk yang aman.
    recordMessage({ ...context, text: body });

    const result = await analyzeMessage(body, context);
    if (!result.is_threat) return;

    const info = CATEGORY_INFO[result.category] || { emoji: '⚠️', label: result.category };
    const severityInfo = SEVERITY_INFO[result.severity] || SEVERITY_INFO.medium;
    const senderName = context.senderName;

    // Low severity: hanya dicatat untuk analisis, tidak menghapus pesan.
    if (result.severity === 'low') {
      appendIncident({
        ...context,
        category: result.category,
        severity: result.severity,
        score: result.score,
        confidence: result.confidence,
        source: result.source,
        action: 'log',
        indicators: result.indicators,
        text: truncate(body, 300),
      });
      console.log(
        `[Security] LOW ${result.category} dari ${senderName}: ${result.indicators.join('; ')}`
      );
      return;
    }

    const weight = result.severity === 'high' ? config.HIGH_SEVERITY_WEIGHT : 1;
    const warningCount = addWarning(warnings, groupId, senderId, weight);
    const remaining = Math.max(0, config.MAX_WARNINGS - warningCount);

    // Hapus pesan berbahaya (butuh bot sebagai admin).
    let deleteOk = false;
    try {
      await message.delete(true);
      deleteOk = true;
    } catch {
      console.warn(`[Security] Gagal hapus pesan dari ${senderName} (bot mungkin bukan admin).`);
    }

    let action = deleteOk ? 'delete+warn' : 'warn';
    let kicked = false;

    if (warningCount <= config.MAX_WARNINGS) {
      const warnMsg = buildWarningMessage({
        senderId,
        info,
        severityInfo,
        result,
        warningCount,
        remaining,
      });
      try {
        await chat.sendMessage(warnMsg, { mentions: [senderId] });
      } catch (err) {
        console.warn('[Security] Gagal kirim peringatan:', err.message);
      }
    } else {
      const kickMsg = buildKickMessage({
        senderId,
        info,
        severityInfo,
        result,
        warningCount,
      });
      try {
        await chat.sendMessage(kickMsg, { mentions: [senderId] });
      } catch {}

      try {
        await chat.removeParticipants([senderId]);
        kicked = true;
        action = deleteOk ? 'delete+kick' : 'kick';
        resetWarning(warnings, groupId, senderId);
        console.log(`[Security] ${senderName} dikeluarkan dari ${chat.name}.`);
      } catch (kickErr) {
        console.error(`[Security] Gagal kick ${senderName}:`, kickErr.message);
        try {
          await chat.sendMessage(
            `⚠️ Gagal mengeluarkan @${senderId.split('@')[0]}. Pastikan bot memiliki izin admin penuh.`
          );
        } catch {}
      }
    }

    const incident = appendIncident({
      ...context,
      category: result.category,
      severity: result.severity,
      score: result.score,
      confidence: result.confidence,
      source: result.source,
      action,
      indicators: result.indicators,
      text: truncate(body, 300),
      warningCount,
    });

    console.log(
      `[Security] ${result.severity.toUpperCase()} ${result.category} | ` +
      `${senderName} | skor ${result.score} | aksi ${action} | warn ${warningCount}/${config.MAX_WARNINGS}`
    );

    if (result.severity === 'high' || kicked) {
      const ownerMsg = `
🚨 *INSIDEN KEAMANAN GRUP* 🚨

📂 Grup      : ${chat.name || groupId}
👤 Pengirim  : ${senderName} (${senderNo})
🧩 Kategori  : ${info.label}
📊 Tingkat   : ${severityInfo.label} (${result.score}/100)
🧠 Sumber    : ${result.source}
🛠️ Aksi      : ${action}
⚠️ Peringatan: ${warningCount}/${config.MAX_WARNINGS}

📝 Indikator:
${result.indicators.map((item) => `• ${item}`).join('\n') || '• -'}

💬 Pesan:
${truncate(body, 280)}

🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
`.trim();
      await notifyOwner(client, ownerMsg);
    }

    return incident;
  } catch (error) {
    console.error('[Security] Error:', error.message);
  }
}

function resetMemberWarnings(groupId, userId) {
  resetWarning(warnings, groupId, userId);
}

function getMemberWarnings(groupId, userId) {
  return getWarningCount(warnings, groupId, userId);
}

module.exports = {
  handleMessage,
  resetMemberWarnings,
  getMemberWarnings,
};
