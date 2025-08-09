// commands/groupProtect.js
const fs = require("fs");
const path = require("path");

// ملفات وسجلات
const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const strikesFile = path.join(dataDir, "group_protect_strikes.json");
const logFile = path.join(__dirname, "../logs/group_protection_log.txt");
if (!fs.existsSync(path.join(__dirname, "../logs"))) fs.mkdirSync(path.join(__dirname, "../logs"), { recursive: true });

// تحميل / تهيئة ملفات التخزين
if (!fs.existsSync(strikesFile)) fs.writeFileSync(strikesFile, JSON.stringify({}), "utf8");

// Helpers
function readStrikes() {
  try { return JSON.parse(fs.readFileSync(strikesFile, "utf8")); }
  catch { return {}; }
}
function writeStrikes(obj) {
  fs.writeFileSync(strikesFile, JSON.stringify(obj, null, 2), "utf8");
}
function appendLog(line) {
  try {
    const time = new Date().toLocaleString("ar-EG", { timeZone: "Asia/Riyadh" });
    fs.appendFileSync(logFile, `[${time}] ${line}\n`);
  } catch (e) { console.error("log write error:", e.message); }
}

// Configurable
const BANNED_WORDS = [
  // عربي عام (موسع — عدل أو أضف ما تريد)
  "كس", "زبي", "طيز", "خول", "شرموط", "زب", "قحبة", "عاهرة", "لوطي", "متناك",
  "تبن", "لعنة", "لعنك", "هرم", "انقذف", "انقذف", "نيك", "نيك", "مومس",
  // إنجليزي
  "fuck", "shit", "bitch", "motherfucker", "cunt", "asshole", "nigger", "fag", "gay"
];
const URL_REGEX = /((https?:\/\/|www\.)[^\s]+|wa\.me\/[0-9]+|t\.me\/[A-Za-z0-9_]+|chat\.whatsapp\.com\/[A-Za-z0-9]+)/i;
const SPAM_WINDOW_MS = 15000; // window in ms
const SPAM_THRESHOLD = 6; // messages in window => consider spam
const STRIKE_LIMIT = 3; // after how many strikes to auto-kick (configurable)
const STRIKE_RESET_MS = 1000 * 60 * 60 * 24; // reset strikes after 24h (optional behavior)

// In-memory caches
const messageCache = new Map(); // key => msg
const recentMessages = new Map(); // sender => [timestamps]
const adminsCache = new Map(); // groupId => { cachedAt, admins[] }

// helper: get group admins (cached short)
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
    console.error("getAdmins error:", e.message);
    return [];
  }
}

// تثبيت hooks مرة واحدة لكل socket
async function installHooksIfNeeded(sock) {
  if (sock._groupProtect_hooks_installed) return;
  sock._groupProtect_hooks_installed = true;

  // عند حذف الرسائل: نعيد إرسال النسخة المخزنة إن وجدت
  sock.ev.on("messages.update", async (updates) => {
    try {
      for (const u of updates) {
        const key = u.key;
        if (!key) continue;
        if (u.update?.message === null && key.remoteJid && key.remoteJid.endsWith("@g.us") && !key.fromMe) {
          const cacheKey = `${key.remoteJid}_${key.id}`;
          const stored = messageCache.get(cacheKey);
          if (stored) {
            try {
              await sock.sendMessage(key.remoteJid, { forward: stored }, { quoted: stored });
              appendLog(`Re-sent deleted message from ${key.participant || key.remoteJid} in ${key.remoteJid}`);
            } catch (err) {
              console.error("re-send deleted err:", err.message);
            }
          }
        }
      }
    } catch (e) { console.error("messages.update hook error:", e.message); }
  });

  // عند دخول/خروج أعضاء
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupId, participants, action } = update;
      const admins = await getAdmins(sock, groupId);
      if (action === "add") {
        for (const p of participants) {
          // حاول جلب بيانات JID الحقيقية
          const [res] = await sock.onWhatsApp(p).catch(() => [null]);
          const real = res?.jid?.split("@")[0] || p.split("@")[0];
          await sock.sendMessage(groupId, {
            text: `🎉 مرحبًا @${real}!\n📜 رجاءً اقرأ قوانين المجموعة واحترم الأعضاء.`,
            mentions: [p]
          });
          appendLog(`Joined: ${real} -> ${groupId}`);
        }
      } else if (action === "remove") {
        // بصمت أبلغ أول أدمن (إن وُجد)
        if (admins && admins.length) {
          await sock.sendMessage(admins[0], { text: `ℹ️ ${participants.join(", ")} غادر/طُرد من ${groupId.split("@")[0]}` });
        }
        appendLog(`Left/Removed: ${participants.join(", ")} from ${groupId}`);
      }
    } catch (e) { console.error("participants.update hook error:", e.message); }
  });
}

// الصيغة الأساسية المنفذة على كل رسالة (تُستدعى من index.js)
module.exports = async ({ sock, msg, text, from, reply }) => {
  try {
    // تأكد من الشغل على مجموعات فقط
    if (!msg || !msg.key || !msg.key.remoteJid) return;
    const chat = msg.key.remoteJid;
    if (!chat.endsWith("@g.us")) return;

    // ثبت الhooks مرة واحدة
    await installHooksIfNeeded(sock);

    // خزّن الرسالة في الكاش لإمكانية إعادة الإرسال عند الحذف
    try {
      const cacheKey = `${chat}_${msg.key.id}`;
      messageCache.set(cacheKey, msg);
      if (messageCache.size > 5000) {
        // حذف أقدم مدخل للحفاظ على الذاكرة
        const firstKey = messageCache.keys().next().value;
        messageCache.delete(firstKey);
      }
    } catch (e) { /**/ }

    // استخرج نص قابل للفحص
    const textContent = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ""
    ).toString().toLowerCase();

    const sender = msg.key.participant || msg.key.remoteJid;
    const senderId = sender.split("@")[0];

    // جلب الأدمنز للمجموعة
    const admins = await getAdmins(sock, chat);
    const isAdmin = admins.includes(sender);

    // لا نفعل لأي رسائل من البوت نفسه أو من أدمن
    if (isAdmin || msg.key.fromMe) return;

    // حالات: روابط
    if (textContent && URL_REGEX.test(textContent)) {
      // حذف الرسالة بصمت
      try {
        await sock.sendMessage(chat, { delete: msg.key });
      } catch (e) {
        console.error("delete link message failed:", e.message);
      }

      // تسجيل ورفع strike
      appendLog(`Deleted link from ${senderId} in ${chat}`);
      handleStrike(sock, chat, sender, `Link posted`);
      // انبه أول أدمن فقط
      if (admins && admins.length) {
        await sock.sendMessage(admins[0], { text: `🔗 تم حذف رسالة رابط من ${senderId} في المجموعة ${chat.split("@")[0]}` });
      }
      return;
    }

    // حالات: كلمات ممنوعة
    if (textContent) {
      for (const bad of BANNED_WORDS) {
        if (textContent.includes(bad)) {
          try {
            await sock.sendMessage(chat, { delete: msg.key });
          } catch (e) { console.error("delete badword failed:", e.message); }

          appendLog(`Deleted badword from ${senderId} in ${chat} (word: ${bad})`);
          handleStrike(sock, chat, sender, `Used banned word: ${bad}`);
          if (admins && admins.length) {
            await sock.sendMessage(admins[0], { text: `🚨 تم حذف رسالة تحتوي كلمة محظورة من ${senderId} في ${chat.split("@")[0]}` });
          }
          return;
        }
      }
    }

    // حالات: سبام (مبسط)
    {
      const now = Date.now();
      const arr = recentMessages.get(sender) || [];
      arr.push(now);
      // حافظ على الزمنات ضمن النافذة
      const recent = arr.filter(t => (now - t) <= SPAM_WINDOW_MS);
      recentMessages.set(sender, recent);
      if (recent.length >= SPAM_THRESHOLD) {
        // حذف الرسالة الحالية
        try {
          await sock.sendMessage(chat, { delete: msg.key });
        } catch (e) { console.error("delete spam msg failed:", e.message); }

        appendLog(`Spam suspected from ${senderId} in ${chat} (${recent.length} msgs in window)`);
        handleStrike(sock, chat, sender, `Spam (${recent.length})`);
        // أبلغ الأدمن الأول
        if (admins && admins.length) {
          await sock.sendMessage(admins[0], { text: `⚠️ احتمال سبام من ${senderId} في ${chat.split("@")[0]}. الرسائل: ${recent.length}` });
        }
        // صفّر الـ recent
        recentMessages.delete(sender);
        return;
      }
    }

    // لا مزيد من الفحوصات — صامتاً
  } catch (err) {
    console.error("groupProtect main error:", err.message);
  }
};

// إدارة Strikes: تحذير، حذف، وطرد إن بلغ الحد
async function handleStrike(sock, groupId, offenderJid, reason) {
  try {
    const strikes = readStrikes();
    const key = `${groupId}:${offenderJid}`;
    const now = Date.now();

    if (!strikes[key]) strikes[key] = [];
    // أضف ضربة مع طابع زمني
    strikes[key].push(now);

    // حافظ على ضربات خلال نافذة إعادة التصفير لو أردنا (مثلاً STRIKE_RESET_MS)
    // هنا نحتفظ بأي ضربات أقل من STRIKE_RESET_MS قبل الآن
    const valid = strikes[key].filter(t => (now - t) <= STRIKE_RESET_MS);
    strikes[key] = valid;
    writeStrikes(strikes);

    // أرسل تحذير للمخالف في المجموعة (منشن)
    try {
      await sock.sendMessage(groupId, {
        text: `⚠️ تنبيه: تم تسجيل مخالفة ضد @${offenderJid.split("@")[0]} (${valid.length}/${STRIKE_LIMIT}). السبب: ${reason}`,
        mentions: [offenderJid]
      });
    } catch (e) { console.error("warn send failed:", e.message); }

    appendLog(`Strike for ${offenderJid} in ${groupId} (reason: ${reason}) - total: ${valid.length}`);

    // إذا تجاوز الحد => طرد
    if (valid.length >= STRIKE_LIMIT) {
      try {
        // تأكد أن البوت أدمن
        const meta = await sock.groupMetadata(groupId);
        const meJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const me = meta.participants.find(p => p.id === meJid);
        if (me && me.admin) {
          await sock.groupParticipantsUpdate(groupId, [offenderJid], "remove");
          appendLog(`Auto-kicked ${offenderJid} from ${groupId} after ${valid.length} strikes.`);
          // نظف السجلات الخاصة بالمستخدم
          const strikesObj = readStrikes();
          delete strikesObj[`${groupId}:${offenderJid}`];
          writeStrikes(strikesObj);
        } else {
          appendLog(`Wanted to kick ${offenderJid} from ${groupId} but bot is not admin.`);
        }
      } catch (e) { console.error("auto-kick failed:", e.message); }
    }
  } catch (e) { console.error("handleStrike error:", e.message); }
}
