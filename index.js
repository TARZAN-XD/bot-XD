const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));

// ✅ تحميل الأوامر
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(`./commands/${file}`);
    if (typeof command === 'function') commands.push(command);
  }
});

const sessions = {};
const msgStore = new Map();

// ✅ إنشاء جلسة جديدة
async function startSession(sessionId) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  await fs.ensureDir(sessionPath);

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = { sock, sessionId };

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
    if (qr) {
      const qrFile = path.join(__dirname, 'public', `${sessionId}.png`);
      await qrCode.toFile(qrFile, qr).catch(err => console.error('QR Error:', err));
      console.log(`✅ QR جاهز للجلسة ${sessionId}: ${qrFile}`);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      console.log(`📴 جلسة ${sessionId} تم قطع الاتصال`);
      if (shouldReconnect) startSession(sessionId);
    }

    if (connection === 'open') {
      console.log(`✅ الجلسة ${sessionId} متصلة الآن`);

      // ✅ رسالة الترحيب الجديدة
      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: `✨ *مرحباً بك في بوت طرزان الواقدي* ✨\n\n✅ تم ربط الرقم بنجاح.\n\n🧠 *لإظهار قائمة الأوامر:*\n• *tarzan* ارسل\n\n⚡ استمتع بالتجربة!`,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // ✅ منع الحذف
  sock.ev.on('messages.update', async updates => {
    for (const { key, update } of updates) {
      if (update?.message === null && key?.remoteJid && !key.fromMe) {
        try {
          const stored = msgStore.get(`${key.remoteJid}_${key.id}`);
          if (!stored?.message) return;

          const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
          const senderJid = key.participant || stored.key?.participant || key.remoteJid;
          const number = senderJid?.split('@')[0] || 'مجهول';
          const name = stored.pushName || 'غير معروف';
          const type = Object.keys(stored.message)[0];
          const time = moment().tz("Asia/Riyadh").format("YYYY-MM-DD HH:mm:ss");

          const infoMessage =
`🚫 *تم حذف رسالة!*
👤 *الاسم:* ${name}
📱 *الرقم:* wa.me/${number}
🕒 *الوقت:* ${time}
📂 *نوع الرسالة:* ${type}`;

          fs.appendFileSync('./deleted_messages.log',
            `🧾 حذف من: ${name} - wa.me/${number} - ${type} - ${time}\n==========================\n`
          );

          await sock.sendMessage(selfId, { text: infoMessage });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // ✅ استقبال الأوامر
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message) return;

    const from = msg.key.remoteJid;
    const msgId = msg.key.id;
    msgStore.set(`${from}_${msgId}`, msg);

    const text = msg.message.conversation ||
                 msg.message.extendedTextMessage?.text ||
                 msg.message.buttonsResponseMessage?.selectedButtonId;

    if (!text) return;

    const reply = async (message, buttons = null) => {
      if (buttons && Array.isArray(buttons)) {
        await sock.sendMessage(from, {
          text: message,
          buttons: buttons.map(b => ({ buttonId: b.id, buttonText: { displayText: b.text }, type: 1 })),
          headerType: 1
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, { text: message }, { quoted: msg });
      }
    };

    for (const command of commands) {
      try {
        await command({ text, reply, sock, msg, from });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });
}

// ✅ API لإنشاء جلسة جديدة
app.post('/create-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'أدخل اسم الجلسة' });
    if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة بالفعل' });

    await startSession(sessionId);
    res.json({ message: `تم إنشاء الجلسة: ${sessionId}`, qr: `/${sessionId}.png` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ أثناء إنشاء الجلسة' });
  }
});

// ✅ API لطلب Pairing Code مع إشعار واتساب
app.post('/pair', async (req, res) => {
  try {
    const { sessionId, number } = req.body;
    if (!sessionId || !number) return res.status(400).json({ error: 'أدخل الجلسة والرقم' });

    const session = sessions[sessionId];
    if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });

    const sock = session.sock;
    if (sock.authState.creds.registered) {
      return res.status(400).json({ error: 'الجلسة مرتبطة بالفعل. احذفها أولاً.' });
    }

    // ✅ تغيير معرف الجهاز لجعل واتساب يعتبره جهاز جديد
    sock.authState.creds.deviceId = `device-${Date.now()}`;

    const code = await sock.requestPairingCode(number.trim());
    res.json({ pairingCode: code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في توليد الرمز' });
  }
});

// ✅ عرض الجلسات النشطة
app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

// ✅ حذف الجلسة
app.post('/delete-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessions[sessionId]) return res.status(404).json({ error: 'الجلسة غير موجودة' });

    delete sessions[sessionId];
    await fs.remove(path.join(__dirname, 'sessions', sessionId));
    const qrFile = path.join(__dirname, 'public', `${sessionId}.png`);
    if (fs.existsSync(qrFile)) fs.unlinkSync(qrFile);

    res.json({ message: `تم حذف الجلسة ${sessionId}` });
  } catch (err) {
    res.status(500).json({ error: 'فشل في حذف الجلسة' });
  }
});

app.listen(PORT, () => console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`));
