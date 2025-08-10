const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "../data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const strikesFile = path.join(dataDir, "group_protect_strikes.json");
if (!fs.existsSync(strikesFile)) fs.writeFileSync(strikesFile, JSON.stringify({}), "utf8");

const logDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logFile = path.join(logDir, "group_protection_log.txt");

function readStrikes() {
  try {
    return JSON.parse(fs.readFileSync(strikesFile, "utf8"));
  } catch {
    return {};
  }
}

function writeStrikes(obj) {
  fs.writeFileSync(strikesFile, JSON.stringify(obj, null, 2), "utf8");
}

function appendLog(line) {
  const time = new Date().toLocaleString("ar-EG", { timeZone: "Asia/Riyadh" });
  fs.appendFileSync(logFile, `[${time}] ${line}\n`);
}

const BANNED_WORDS = ["كس", "زبي", "خول", "شرموط", "fuck", "shit", "bitch"];
const URL_REGEX = /((https?:\/\/|www\.)[^\s]+)/i;
const SPAM_WINDOW_MS = 15000;
const SPAM_THRESHOLD = 6;
const STRIKE_LIMIT = 3;
const STRIKE_RESET_MS = 1000 * 60 * 60 * 24;

const messageCache = new Map();
const recentMessages = new Map();
const adminsCache = new Map();

async function getAdmins(sock, groupId) {
  const now = Date.now();
  const cached = adminsCache.get(groupId);
  if (cached && (now - cached.cachedAt) < 60000) return cached.admins;
  try {
    const meta = await sock.groupMetadata(groupId);
    const admins = meta.participants.filter(p => p.admin).map(p => p.id);
    adminsCache.set(groupId, { cachedAt: now, admins });
    return admins;
  } catch {
    return [];
  }
}

async function installHooksIfNeeded(sock) {
  if (sock._groupProtect_hooks_installed) return;
  sock._groupProtect_hooks_installed = true;

  // مراقبة حذف الرسائل - إعادة إرسالها للأدمن فقط (خاص)
  sock.ev.on("messages.update", async (updates) => {
    for (const u of updates) {
      const key = u.key;
      if (!key) continue;
      if (u.update?.message === null && key.remoteJid.endsWith("@g.us") && !key.fromMe) {
        const cacheKey = `${key.remoteJid}_${key.id}`;
        const stored = messageCache.get(cacheKey);
        if (stored) {
          const admins = await getAdmins(sock, key.remoteJid);
          if (admins.length) {
            for (const adminJid of admins) {
              await sock.sendMessage(adminJid, { forward: stored });
            }
            appendLog(`Re-sent deleted message from ${key.participant || key.remoteJid} to admins in ${key.remoteJid}`);
          }
        }
      }
    }
  });

  // رسالة ترحيب مع صورة بروفايل العضو الجديد مع الاسم الحقيقي
  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (action === "add") {
      const meta = await sock.groupMetadata(id);
      const groupName = meta.subject;
      for (let user of participants) {
        let username = user.split("@")[0];
        try {
          username = await sock.getName(user);
        } catch {}
        let pfpUrl = null;
        try {
          pfpUrl = await sock.profilePictureUrl(user, "image");
        } catch {}
        const welcomeMsg = `
✨ ━━━━【📢 مرحبآ بك 】━━━━ ✨

👋 أهلًا وسهلًا بك يا *${username}* في مجموعة *${groupName}* 💎

📜 *قوانين المجموعة*:
1️⃣ الاحترام المتبادل بين الأعضاء.
2️⃣ ممنوع إرسال روابط أو سبام.
3️⃣ الابتعاد عن الألفاظ المسيئة.

💬 نتمنى لك وقتًا ممتعًا بيننا!
━━━━━━━━━━━━━━━━━━
        `;
        if (pfpUrl) {
          await sock.sendMessage(id, {
            image: { url: pfpUrl },
            caption: welcomeMsg,
            mentions: [user]
          });
        } else {
          await sock.sendMessage(id, {
            text: welcomeMsg,
            mentions: [user]
          });
        }
        appendLog(`Joined: ${username} -> ${id}`);
      }
    }
  });
}

module.exports = async ({ sock, msg }) => {
  if (!msg?.key?.remoteJid?.endsWith("@g.us")) return;
  const chat = msg.key.remoteJid;
  await installHooksIfNeeded(sock);

  const cacheKey = `${chat}_${msg.key.id}`;
  messageCache.set(cacheKey, msg);
  if (messageCache.size > 5000) messageCache.delete(messageCache.keys().next().value);

  const textContent = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  ).toLowerCase();

  const sender = msg.key.participant || msg.key.remoteJid;
  const admins = await getAdmins(sock, chat);
  const isAdmin = admins.includes(sender);
  if (isAdmin || msg.key.fromMe) return;

  if (URL_REGEX.test(textContent)) {
    await deleteAndStrike(sock, chat, sender, "نشر روابط ممنوعة", msg.key);
    return;
  }

  for (const bad of BANNED_WORDS) {
    if (textContent.includes(bad)) {
      await deleteAndStrike(sock, chat, sender, `استخدام كلمة محظورة: ${bad}`, msg.key);
      return;
    }
  }

  const now = Date.now();
  const arr = recentMessages.get(sender) || [];
  arr.push(now);
  const recent = arr.filter(t => (now - t) <= SPAM_WINDOW_MS);
  recentMessages.set(sender, recent);
  if (recent.length >= SPAM_THRESHOLD) {
    await deleteAndStrike(sock, chat, sender, "إرسال رسائل سبام متتالية", msg.key);
    recentMessages.delete(sender);
  }
};

async function deleteAndStrike(sock, groupId, offenderJid, reason, msgKey) {
  try {
    await sock.sendMessage(groupId, { delete: msgKey });
  } catch {}
  appendLog(`Violation: ${reason} by ${offenderJid} in ${groupId}`);
  await handleStrike(sock, groupId, offenderJid, reason);
}

async function handleStrike(sock, groupId, offenderJid, reason) {
  const strikes = readStrikes();
  const key = `${groupId}:${offenderJid}`;
  const now = Date.now();
  if (!strikes[key]) strikes[key] = [];
  strikes[key].push({ time: now, reason });
  const valid = strikes[key].filter(s => (now - s.time) <= STRIKE_RESET_MS);
  strikes[key] = valid;
  writeStrikes(strikes);

  // تحذير في الخاص
  try {
    await sock.sendMessage(offenderJid, {
      text: `⚠️ تحذير رقم ${valid.length}/${STRIKE_LIMIT}\n📌 السبب: ${reason}\n⏳ التزم بقوانين المجموعة لتجنب الطرد.`
    });
  } catch {}

  // طرد عند تخطي الحد
  if (valid.length >= STRIKE_LIMIT) {
    try {
      const meta = await sock.groupMetadata(groupId);
      const meJid = sock.user.id.split(":")[0] + "@s.whatsapp.net";
      const me = meta.participants.find(p => p.id === meJid);
      if (me?.admin) {
        await sock.groupParticipantsUpdate(groupId, [offenderJid], "remove");
        await sock.sendMessage(offenderJid, {
          text: `🚫 تم طردك من المجموعة "${meta.subject}"\n📌 السبب: ${reason}`
        });
        delete strikes[key];
        writeStrikes(strikes);
      }
    } catch {}
  }
}
