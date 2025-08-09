// commands/groupProtect.js
/**
 * Group Manager & Protection (محسّن ودقيق)
 * - يمنع الروابط، الكلمات الممنوعة، السبام، الملفات الكبيرة
 * - نظام Strikes (تحذيرات) مع حفظ دائم في data/group_protect_strikes.json
 * - عند حذف رسالة: يرسل نسخة مفصّلة إلى أول أدمن خاص (اسم + رقم + وقت + نوع)
 * - عند دخول عضو: ترحيب منسق مع رقم حقيقي إن أمكن
 * - يسجّل كل الأحداث في logs/group_protection_log.txt
 *
 * ملاحظة: البوت يجب أن يكون أدمن لتنفيذ عمليات الحذف والطرد وتغيير إعدادات المجموعات.
 */

const fs = require("fs");
const path = require("path");

// === مسارات الملفات والتهيئة ===
const baseDir = path.join(__dirname, "../");
const dataDir = path.join(baseDir, "data");
const logsDir = path.join(baseDir, "logs");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const strikesFile = path.join(dataDir, "group_protect_strikes.json");
const logFile = path.join(logsDir, "group_protection_log.txt");
if (!fs.existsSync(strikesFile)) fs.writeFileSync(strikesFile, JSON.stringify({}), "utf8");
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, "", "utf8");

function appendLog(line) {
  try {
    const time = new Date().toLocaleString("ar-EG", { timeZone: "Asia/Riyadh" });
    fs.appendFileSync(logFile, `[${time}] ${line}\n`);
  } catch (e) {
    console.error("log write error:", e.message);
  }
}

// === إعدادات قابلة للتعديل ===
const CONFIG = {
  BANNED_WORDS: [
    // عربي (موسع)
    "كس","زبي","طيز","خول","شرموط","زب","قحبة","عاهرة","لوطي","متناك",
    "تبن","لعنة","لعنك","هرم","انقذف","نيك","مومس","كسمك","مصت","طيزك",
    // إنجليزي
    "fuck","shit","bitch","motherfucker","cunt","asshole","nigger","fag","gay"
  ],
  URL_REGEX: /((https?:\/\/|www\.)[^\s]+|wa\.me\/[0-9]+|t\.me\/[A-Za-z0-9_]+|chat\.whatsapp\.com\/[A-Za-z0-9]+)/i,
  FILE_MAX_BYTES: 8 * 1024 * 1024, // 8 MB limit for attachments (adjustable)
  SPAM_WINDOW_MS: 15_000,
  SPAM_THRESHOLD: 6,
  STRIKE_LIMIT: 3,
  STRIKE_RESET_MS: 24 * 60 * 60 * 1000 // 24 hours
};

// === cache ذاكرة داخلية ===
const messageCache = new Map();     // key => msg (لحفظ مؤقت لإعادة الإرسال للأدمن)
const recentMessages = new Map();   // sender => [timestamps] (لكشف السبام)
const adminsCache = new Map();      // groupId => { cachedAt, admins[] }

// === helpers لمسائل Strikes وملفات التخزين ===
function readStrikes() {
  try { return JSON.parse(fs.readFileSync(strikesFile, "utf8")); }
  catch { return {}; }
}
function writeStrikes(obj) {
  try { fs.writeFileSync(strikesFile, JSON.stringify(obj, null, 2), "utf8"); }
  catch (e) { console.error("writeStrikes error:", e.message); }
}
function formatJid(jid) {
  if (!jid) return jid;
  return jid.split("@")[0];
}
function safeSend(sock, jid, message) {
  // محاولة إرسال مع التقاط الأخطاء لتفادي crash
  return sock.sendMessage(jid, message).catch(err => {
    console.error("safeSend error:", err?.message || err);
  });
}

// === جلب الأدمنز مع caching بسيط ===
async function getAdmins(sock, groupId) {
  const now = Date.now();
  const cached = adminsCache.get(groupId);
  if (cached && (now - cached.cachedAt) < 60_000) return cached.admins;
  try {
    const meta = await sock.groupMetadata(groupId);
    const admins = (meta.participants || []).filter(p => p.admin).map(p => p.id);
    adminsCache.set(groupId, { cachedAt: now, admins });
    return admins;
  } catch (e) {
    console.error("getAdmins error:", e?.message || e);
    return [];
  }
}

// === تثبيت الـ hooks مرة واحدة لكل socket ===
async function installHooksIfNeeded(sock) {
  if (sock._groupProtect_hooks_installed) return;
  sock._groupProtect_hooks_installed = true;

  // عند حذف الرسائل: نرسل نسخة مفصلة للأدمن في الخاص فقط
  sock.ev.on("messages.update", async (updates) => {
    try {
      for (const u of updates) {
        const key = u.key;
        if (!key) continue;
        if (u.update?.message === null && key.remoteJid && key.remoteJid.endsWith("@g.us") && !key.fromMe) {
          const cacheKey = `${key.remoteJid}_${key.id}`;
          const stored = messageCache.get(cacheKey);
          if (!stored) continue;

          // جلب الأدمن الأول (owner-like) لإرسال الرسالة له في الخاص
          const admins = await getAdmins(sock, key.remoteJid);
          if (!admins || admins.length === 0) {
            appendLog(`Deleted message detected but no admin found for ${key.remoteJid}`);
            continue;
          }
          const mainAdmin = admins[0];

          // جلب معلومات المرسل (الاسم أو رقم إن أمكن)
          const participant = stored.key.participant || stored.key.remoteJid;
          let displayId = formatJid(participant);
          try {
            const [res] = await sock.onWhatsApp(participant).catch(() => [null]);
            displayId = res?.jid?.split("@")[0] || displayId;
          } catch { /* ignore */ }

          // بناء رسالة تفصيلية للأدمن
          const time = new Date().toLocaleString("ar-EG", { timeZone: "Asia/Riyadh" });
          const headerText = `🗑️ تم حذف رسالة في المجموعة: ${key.remoteJid.split("@")[0]}\n👤 المرسل: ${displayId}\n🕒 الوقت: ${time}`;

          // أرسل نص المعلومات ثم أعِد إرسال (forward) المحتوى
          try {
            await safeSend(sock, mainAdmin, { text: headerText });
            // إعادة توجیه (forward) المحتوى للمشرف
            await safeSend(sock, mainAdmin, { forward: stored });
            appendLog(`Sent deleted message privately to ${mainAdmin} from ${displayId} in ${key.remoteJid}`);
          } catch (err) {
            console.error("messages.update -> send to admin error:", err?.message || err);
          }
        }
      }
    } catch (e) {
      console.error("messages.update hook error:", e?.message || e);
    }
  });

  // عند دخول أو خروج أعضاء
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const { id: groupId, participants, action } = update;
      const admins = await getAdmins(sock, groupId);

      if (action === "add") {
        for (const p of participants) {
          // جلب الرقم الحقيقي إن أمكن
          let real = p.split("@")[0];
          try {
            const [res] = await sock.onWhatsApp(p).catch(() => [null]);
            real = res?.jid?.split("@")[0] || real;
          } catch { /* ignore */ }

          const welcome = `🎉 أهلاً @${real}!\n📜 رجاءً اقرأ قوانين المجموعة وكن محترماً.\n✳️ للمساعدة اكتب: menu`;
          // ترحيب في القروب مع منشن العضو
          await safeSend(sock, groupId, { text: welcome, mentions: [p] });
          appendLog(`Welcome sent for ${real} -> ${groupId}`);
        }
      } else if (action === "remove") {
        // أبلغ أول أدمن بالحدث بصمت
        if (admins && admins.length) {
          const msg = `ℹ️ ${participants.join(", ")} غادر/طرد من ${groupId.split("@")[0]}`;
          await safeSend(sock, admins[0], { text: msg });
        }
        appendLog(`Participants removed: ${participants.join(", ")} from ${groupId}`);
      }
    } catch (e) {
      console.error("group-participants.update hook error:", e?.message || e);
    }
  });
}

// === التعامل مع Strikes - سجل التحذيرات والطرد ===
async function handleStrike(sock, groupId, offenderJid, reason) {
  try {
    const strikes = readStrikes();
    const key = `${groupId}:${offenderJid}`;
    const now = Date.now();
    if (!strikes[key]) strikes[key] = [];
    strikes[key].push(now);
    // احتفظ بالضربات داخل نافذة STRIKE_RESET_MS
    strikes[key] = strikes[key].filter(t => (now - t) <= CONFIG.STRIKE_RESET_MS);
    writeStrikes(strikes);

    const count = strikes[key].length;
    const mention = offenderJid;
    const warnText = `⚠️ تحذير: تم تسجيل مخالفة ضد @${formatJid(offenderJid)} (${count}/${CONFIG.STRIKE_LIMIT})\nالسبب: ${reason}`;
    // نرسل التحذير داخل المجموعة مع منشن
    await safeSend(sock, groupId, { text: warnText, mentions: [mention] });
    appendLog(`Strike ${count} for ${offenderJid} in ${groupId} (reason: ${reason})`);

    // إذا بلغ الحد -> طرد (إذا البوت أدمن)
    if (count >= CONFIG.STRIKE_LIMIT) {
      try {
        const meta = await sock.groupMetadata(groupId);
        const meJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
        const me = meta.participants.find(p => p.id === meJid);
        if (me && me.admin) {
          await sock.groupParticipantsUpdate(groupId, [offenderJid], "remove");
          appendLog(`Auto-kicked ${offenderJid} from ${groupId} after ${count} strikes`);
          // نظف الضربات لهذا المستخدم
          const strikesObj = readStrikes();
          delete strikesObj[key];
          writeStrikes(strikesObj);
          // بلّغ الأدمن الأول بطرده الخاص
          const admins = await getAdmins(sock, groupId);
          if (admins && admins.length) {
            await safeSend(sock, admins[0], { text: `✅ تم طرد @${formatJid(offenderJid)} من ${groupId.split("@")[0]} بعد ${count} مخالفات.`, mentions: [offenderJid] });
          }
        } else {
          appendLog(`Wanted to kick ${offenderJid} but bot is not admin in ${groupId}`);
        }
      } catch (e) {
        console.error("auto-kick failed:", e?.message || e);
      }
    }
  } catch (e) {
    console.error("handleStrike error:", e?.message || e);
  }
}

// === الدالة الأساسية التي تستدعى من index.js لكل رسالة واردة ===
module.exports = async ({ sock, msg, text, from, reply }) => {
  try {
    // تأكد أن الرسالة من مجموعة
    if (!msg?.key?.remoteJid) return;
    const chat = msg.key.remoteJid;
    if (!chat.endsWith("@g.us")) return;

    // ثبت الhooks مرة واحدة
    await installHooksIfNeeded(sock);

    // خزّن الرسالة في الكاش (مؤقت) لإمكانية إظهارها للأدمن عند حذفها
    try {
      const cacheKey = `${chat}_${msg.key.id}`;
      messageCache.set(cacheKey, msg);
      if (messageCache.size > 5000) {
        // تنظيف أقدم مدخل
        const firstKey = messageCache.keys().next().value;
        messageCache.delete(firstKey);
      }
    } catch (e) { /* ignore */ }

    // استخراج نص أو كابشن
    const textContent = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      ""
    ).toString().toLowerCase();

    const sender = msg.key.participant || msg.key.remoteJid;
    const senderId = formatJid(sender);

    // جلب الأدمنز والتحقق إن المستخدم أدمن
    const admins = await getAdmins(sock, chat);
    const isAdmin = admins.includes(sender);
    // لا تراقب رسائل الأدمن أو رسائل البوت نفسه
    if (isAdmin || msg.key.fromMe) return;

    // 1) فحص حجم الملفات (لو الرسالة تحمل ملف)
    try {
      if (msg.message?.documentMessage || msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage) {
        // نقدر نحصّل حجم من documentMessage.size أو videoMessage.fileLength أو imageMessage.fileLength
        let fileSize = 0;
        if (msg.message.documentMessage?.fileLength) fileSize = Number(msg.message.documentMessage.fileLength);
        else if (msg.message.videoMessage?.fileLength) fileSize = Number(msg.message.videoMessage.fileLength);
        else if (msg.message.imageMessage?.fileLength) fileSize = Number(msg.message.imageMessage.fileLength);
        else if (msg.message.audioMessage?.fileLength) fileSize = Number(msg.message.audioMessage.fileLength);

        if (fileSize > CONFIG.FILE_MAX_BYTES) {
          // حذف وإعطاء Strike
          await safeSend(sock, chat, { delete: msg.key }).catch(() => {});
          appendLog(`Deleted large file from ${senderId} (${fileSize} bytes) in ${chat}`);
          handleStrike(sock, chat, sender, `Large file ${fileSize} bytes`);
          if (admins && admins.length) safeSend(sock, admins[0], { text: `⚠️ تم حذف ملف كبير من ${senderId} في ${chat.split("@")[0]} (${(fileSize/1024/1024).toFixed(2)}MB)` });
          return;
        }
      }
    } catch (e) {
      console.error("file size check error:", e?.message || e);
    }

    // 2) فحص الروابط
    if (textContent && CONFIG.URL_REGEX.test(textContent)) {
      await safeSend(sock, chat, { delete: msg.key }).catch(() => {});
      appendLog(`Deleted link from ${senderId} in ${chat}`);
      handleStrike(sock, chat, sender, "Link posted");
      if (admins && admins.length) safeSend(sock, admins[0], { text: `🔗 تم حذف رسالة رابط من ${senderId} في ${chat.split("@")[0]}` });
      return;
    }

    // 3) فحص الكلمات الممنوعة
    if (textContent) {
      for (const bad of CONFIG.BANNED_WORDS) {
        if (!bad) continue;
        if (textContent.includes(bad)) {
          await safeSend(sock, chat, { delete: msg.key }).catch(() => {});
          appendLog(`Deleted badword (${bad}) from ${senderId} in ${chat}`);
          handleStrike(sock, chat, sender, `Used banned word: ${bad}`);
          if (admins && admins.length) safeSend(sock, admins[0], { text: `🚨 تم حذف رسالة تحتوي كلمة محظورة (${bad}) من ${senderId} في ${chat.split("@")[0]}` });
          return;
        }
      }
    }

    // 4) سبام مبسّط — تعداد الرسائل في نافذة زمنية
    {
      const now = Date.now();
      const arr = recentMessages.get(sender) || [];
      arr.push(now);
      const recent = arr.filter(t => (now - t) <= CONFIG.SPAM_WINDOW_MS);
      recentMessages.set(sender, recent);
      if (recent.length >= CONFIG.SPAM_THRESHOLD) {
        await safeSend(sock, chat, { delete: msg.key }).catch(() => {});
        appendLog(`Spam suspected from ${senderId} in ${chat} (${recent.length})`);
        handleStrike(sock, chat, sender, `Spam (${recent.length})`);
        if (admins && admins.length) safeSend(sock, admins[0], { text: `⚠️ احتمال سبام من ${senderId} في ${chat.split("@")[0]}. الرسائل: ${recent.length}` });
        recentMessages.delete(sender);
        return;
      }
    }

    // كل شيء آخر: مراقبة بصمت (لا تزعج المجموعة)
  } catch (err) {
    console.error("groupProtect main error:", err?.message || err);
    appendLog(`Error in main: ${err?.message || err}`);
  }
};
