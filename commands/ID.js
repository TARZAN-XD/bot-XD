// commands/groupProtect.js
const fs = require("fs");
const path = require("path");
const urlRegex = /(https?:\/\/[^\s]+)/i;
const messageCache = new Map(); // key -> message object
const spamMap = new Map(); // jid -> {timestamps[]}
const adminsCache = new Map(); // groupId -> {cachedAt, admins[]}

const BANNED_WORDS = ["كلمة1","كلمة2"]; // عدلها حسب رغبتك
const SPAM_WINDOW_MS = 15000; // 15s
const SPAM_THRESHOLD = 6; // أكثر من 6 رسائل خلال SPAM_WINDOW -> يعتبر سبام

// helper: تحديث قائمة الأدمن للمجموعة (cached)
async function getAdmins(sock, groupId) {
  const now = Date.now();
  const c = adminsCache.get(groupId);
  if (c && (now - c.cachedAt) < 60_000) return c.admins; // cache 60s

  try {
    const meta = await sock.groupMetadata(groupId);
    const admins = (meta.participants || []).filter(p => p.admin).map(p => p.id);
    adminsCache.set(groupId, { cachedAt: now, admins });
    return admins;
  } catch (e) {
    return [];
  }
}

module.exports = async ({ sock, msg, text, from, reply }) => {
  // فقط للرسائل داخل مجموعات
  if (!msg || !msg.key || !msg.key.remoteJid) return;
  const chat = msg.key.remoteJid;
  if (!chat.endsWith("@g.us")) return; // فقط مجموعات

  // خزّن الرسالة في الكاش (لمنع حذف الرسائل)
  try {
    const key = `${chat}_${msg.key.id}`;
    messageCache.set(key, msg);
    // حافظ على حجم معقول
    if (messageCache.size > 5000) {
      // حذف أقدم
      const it = messageCache.keys().next();
      messageCache.delete(it.value);
    }
  } catch (e) {/**/}

  // استخراج نص ممكن
  const textContent = (msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || "").toLowerCase();

  // get sender
  const sender = msg.key.participant || msg.key.remoteJid;

  // لا نفعل للحالات من البوت أو الآدمن
  const admins = await getAdmins(sock, chat);
  const isAdmin = admins.includes(sender);

  // --- Anti-badwords
  if (!isAdmin && textContent) {
    for (const bad of BANNED_WORDS) {
      if (textContent.includes(bad)) {
        try {
          await sock.sendMessage(chat, { delete: msg.key });
          // بصمت: نُبلغ الأدمن بالخصوص (أول أدمن)
          if (admins.length) {
            await sock.sendMessage(admins[0], { text: `🚨 تم حذف رسالة تحتوي كلمة محظورة من ${sender.split("@")[0]} في المجموعة ${chat.split("@")[0]}` });
          }
        } catch (e) { console.error("groupProtect badword:", e.message); }
        return;
      }
    }
  }

  // --- Anti-links
  if (!isAdmin && textContent && urlRegex.test(textContent)) {
    try {
      await sock.sendMessage(chat, { delete: msg.key });
      if (admins.length) {
        await sock.sendMessage(admins[0], { text: `🔗 تم حذف رسالة رابط من ${sender.split("@")[0]} في ${chat.split("@")[0]}` });
      }
    } catch (e) { console.error("groupProtect link:", e.message); }
    return;
  }

  // --- Anti-spam (مبسط)
  if (!isAdmin) {
    const now = Date.now();
    const arr = spamMap.get(sender) || [];
    arr.push(now);
    // احتفظ بالزمنات داخل النافذة
    const recent = arr.filter(t => (now - t) <= SPAM_WINDOW_MS);
    spamMap.set(sender, recent);
    if (recent.length >= SPAM_THRESHOLD) {
      // طرد أو محاولة حظر مؤقت: هنا سنحذف الرسائل بصمت وننبه الأدمن
      try {
        // حذف آخر رسالة
        await sock.sendMessage(chat, { delete: msg.key });
        if (admins.length) {
          await sock.sendMessage(admins[0], { text: `⚠️ احتمال سبام من ${sender.split("@")[0]} في ${chat.split("@")[0]}. الرسائل المحذوفة: ${recent.length}` });
        }
      } catch (e) { console.error("groupProtect spam:", e.message); }
      // فرّغ عدّاد المرسل
      spamMap.delete(sender);
      return;
    }
  }

  // --- Anti-delete: (نسخة بسيطة) نعمل listener مرة واحدة لكل sok
  try {
    if (!sock._groupProtect_delete_hook_installed) {
      sock._groupProtect_delete_hook_installed = true;
      sock.ev.on("messages.update", async (updates) => {
        for (const u of updates) {
          const key = u.key;
          if (!key) continue;
          // حذف رسالة
          if (u.update?.message === null && key.remoteJid && key.remoteJid.endsWith("@g.us") && !key.fromMe) {
            const cacheKey = `${key.remoteJid}_${key.id}`;
            const stored = messageCache.get(cacheKey);
            if (stored) {
              try {
                await sock.sendMessage(key.remoteJid, { forward: stored }, { quoted: stored });
              } catch (e) {
                console.error("groupProtect re-send deleted:", e.message);
              }
            } else {
              // إذا ما في في الكاش لا شيء (بصمت)
            }
          }
        }
      });
    }
  } catch (e) { console.error("groupProtect install hook:", e.message); }

  // --- Welcome messages: نثبت listener واحد على group-participants.update
  try {
    if (!sock._groupProtect_participants_hook_installed) {
      sock._groupProtect_participants_hook_installed = true;
      sock.ev.on("group-participants.update", async (update) => {
        try {
          const { id, participants, action } = update; // id = group jid
          if (action === "add") {
            for (const p of participants) {
              const name = p.split("@")[0];
              await sock.sendMessage(id, { text: `🎉 مرحبًا @${name}!\nمرحبًا بك في المجموعة، رجاءً اقرأ قوانين المجموعة.` }, { mentions: participants });
            }
          } else if (action === "remove") {
            // اختياري: لا نرسل إشعار عام بصمت، لكن يمكن إرسال إلى الأدمن
            const admins = await getAdmins(sock, id);
            if (admins && admins.length) {
              await sock.sendMessage(admins[0], { text: `ℹ️ ${participants.join(", ")} غادر/طرد من ${id.split("@")[0]}` });
            }
          }
        } catch (e) { console.error("groupProtect participants:", e.message); }
      });
    }
  } catch (e) { console.error("groupProtect participants hook:", e.message); }
};
