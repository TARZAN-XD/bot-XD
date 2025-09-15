const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const axios = require('axios');
const cheerio = require('cheerio');
const chalk = require('chalk'); // 🟢 لوجات ملونة

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const PORT = process.env.PORT || 10000;
const PASSWORD = 'tarzanbot';
const sessions = {};
const msgStore = new Map();

app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
      const command = require(`./commands/${file}`);
      if (typeof command === 'function') commands.push(command);
    }
  });
}

// ✅ بدء جلسة
async function startSession(sessionId, res = null) {
  try {
    const sessionPath = path.join(__dirname, 'sessions', sessionId);
    fs.mkdirSync(sessionPath, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false
    });

    sock.sessionId = sessionId;
    sessions[sessionId] = sock;
    sock.ev.on('creds.update', saveCreds);

    const hiddenFile = path.join(__dirname, 'hidden.json');
    if (!fs.existsSync(hiddenFile)) fs.writeFileSync(hiddenFile, JSON.stringify([]));

    // منع الظهور
    const originalPresence = sock.sendPresenceUpdate;
    sock.sendPresenceUpdate = async (type, jid) => {
      let hiddenList = JSON.parse(fs.readFileSync(hiddenFile));
      if (hiddenList.includes(jid)) return;
      return originalPresence.apply(sock, [type, jid]);
    };

    // منع قراءة رسائل محددة
    const originalRead = sock.readMessages;
    sock.readMessages = async (keys) => {
      let hiddenList = JSON.parse(fs.readFileSync(hiddenFile));
      const filtered = keys.filter(k => !hiddenList.includes(k.remoteJid));
      if (filtered.length) return originalRead.apply(sock, [filtered]);
    };

    // متابعة الاتصال
    sock.ev.on('connection.update', async (update) => {
      const { connection, qr, lastDisconnect } = update;

      if (qr && res) {
        const qrData = await qrCode.toDataURL(qr);
        res.json({ qr: qrData });
        res = null;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log(chalk.yellow(`🔄 إعادة محاولة الاتصال بالجلسة ${sessionId}...`));
          setTimeout(() => startSession(sessionId), 5000);
        } else {
          console.log(chalk.red(`🚫 تم تسجيل الخروج من الجلسة ${sessionId}`));
          delete sessions[sessionId];
        }
      }

      if (connection === 'open') {
        console.log(chalk.green(`✅ جلسة ${sessionId} متصلة`));

        const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";
        const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

        try {
          await sock.sendMessage(selfId, {
            image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
            caption,
            footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
            buttons: [
              { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
              { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
            ],
            headerType: 4
          });
        } catch (err) {
          console.error(chalk.red('❌ فشل إرسال رسالة الترحيب:'), err.message);
        }
      }
    });

    // منع الحذف
    sock.ev.on('messages.update', async (updates) => {
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

            await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
            await sock.sendMessage(selfId, { forward: stored });
          } catch (err) {
            console.error(chalk.red('❌ خطأ في منع الحذف:'), err.message);
          }
        }
      }
    });

    // استقبال الرسائل
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg?.message || !msg.key?.id || !msg.key?.remoteJid) return;

        const from = msg.key.remoteJid;
        const msgId = msg.key.id;
        msgStore.set(`${from}_${msgId}`, msg);

        let text = msg.message.conversation ||
                   msg.message.extendedTextMessage?.text ||
                   msg.message.buttonsResponseMessage?.selectedButtonId;

        if (!text || typeof text !== 'string') return;
        text = text.toLowerCase();

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

        if (text === 'camera') {
          const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:' + (process.env.PORT || 10000)}/camera.html?chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sock.sessionId)}`;
          await reply(`📷 *افتح الكاميرا من هنا:*\n${url}`);
          return;
        }

        for (const command of commands) {
          try {
            await command({ text, reply, sock, msg, from, sessionId: sock.sessionId });
          } catch (err) {
            console.error(chalk.red('❌ خطأ أثناء تنفيذ الأمر:'), err);
          }
        }
      } catch (err) {
        console.error(chalk.red('❌ خطأ في استقبال الرسائل:'), err);
      }
    });

    return sock;
  } catch (err) {
    console.error(chalk.red(`❌ خطأ في تشغيل الجلسة ${sessionId}:`), err.message);
    if (res) res.status(500).json({ error: 'فشل في بدء الجلسة' });
  }
}

// 🔹 API Endpoints
app.post('/create-session', async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  await startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number); // 🟢 يطلق إشعار رسمي
    res.json({ pairingCode: code });
  } catch (err) {
    console.error(chalk.red('❌ خطأ في طلب رمز الاقتران:'), err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => res.json(Object.keys(sessions)));

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      const buffer = fs.readFileSync(file.path);
      await sock.sendMessage(chat, {
        image: buffer,
        caption: 'تم الدخول بنجاح'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'شكرآ لك' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.get('/channel-info', async (req, res) => {
  const { link } = req.query;
  if (!link || !link.includes('whatsapp.com/channel/')) {
    return res.status(400).json({ status: 400, message: 'يرجى إدخال رابط قناة صحيح.' });
  }

  try {
    const { data } = await axios.get(link, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ar,en;q=0.9' }
    });

    const $ = cheerio.load(data);
    const title = $('meta[property="og:title"]').attr('content') || 'غير معروف';
    const image = $('meta[property="og:image"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') || 'لا يوجد وصف';
    const inviteId = link.split('/channel/')[1];

    return res.json({ status: 200, id: inviteId, name: title, description, image, link });
  } catch (error) {
    console.error(chalk.red('❌ خطأ أثناء الجلب:'), error.message);
    return res.status(500).json({ status: 500, message: 'تعذر جلب بيانات القناة.' });
  }
});

app.listen(PORT, () => {
  console.log(chalk.blue(`🚀 السيرفر شغال على http://localhost:${PORT}`));
});
