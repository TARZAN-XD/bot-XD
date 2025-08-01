const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
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

// ✅ تحميل الواجهة
app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).forEach(file => {
  if (file.endsWith('.js')) {
    const command = require(`./commands/${file}`);
    if (typeof command === 'function') commands.push(command);
  }
});

// ✅ تشغيل جلسة جديدة
async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      // ✅ وضعها داخل async block لضمان عدم خروج await
      (async () => {
        try {
          await sock.sendMessage(selfId, {
            image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
            caption: caption,
            footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
            buttons: [
              { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
              { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
            ],
            headerType: 4
          });
        } catch (err) {
          console.error("❌ فشل إرسال رسالة الترحيب:", err.message);
        }
      })();
    }
  });

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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

// ✅ صفحة الكاميرا
app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// ✅ رفع الصور وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      await sock.sendMessage(chat, {
        image: { url: file.path },
        caption: '📸 تم الالتقاط بنجاح ✅'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'تم الإرسال بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      try {
        await sock.sendMessage(selfId, {
          image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
          caption: caption,
          footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
          buttons: [
            { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
            { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
          ],
          headerType: 4
        });
      } catch (err) {
        console.error("❌ فشل إرسال رسالة الترحيب:", err.message);
      }
    }
  });

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
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

// ✅ صفحة الكاميرا
app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// ✅ رفع الصور وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      await sock.sendMessage(chat, {
        image: { url: file.path },
        caption: '📸 تم الالتقاط بنجاح ✅'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'تم الإرسال بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
// ✅ تشغيل جلسة جديدة
async function startSession(sessionId, res = null) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) await startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      try {
        await sock.sendMessage(selfId, {
          image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
          caption: caption,
          footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
          buttons: [
            { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
            { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
          ],
          headerType: 4
        });
      } catch (err) {
        console.error("❌ فشل إرسال رسالة الترحيب:", err.message);
      }
    }
  });

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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
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
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

// ✅ صفحة الكاميرا
app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// ✅ رفع الصور وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      // قراءة الملف كـ Buffer ثم الإرسال
      const buffer = fs.readFileSync(file.path);
      await sock.sendMessage(chat, {
        image: buffer,
        caption: '📸 تم الالتقاط بنجاح ✅'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'تم الإرسال بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      try {
        await sock.sendMessage(selfId, {
          image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
          caption: caption,
          footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
          buttons: [
            { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
            { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
          ],
          headerType: 4
        });
      } catch (err) {
        console.error("❌ فشل إرسال رسالة الترحيب:", err.message);
      }
    }
  });

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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

// ✅ صفحة الكاميرا
app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// ✅ رفع الصور وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      await sock.sendMessage(chat, {
        image: { url: file.path },
        caption: '📸 تم الالتقاط بنجاح ✅'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'تم الإرسال بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

// ✅ صفحة الكاميرا
app.get('/camera.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// ✅ رفع الصور وإرسالها للواتساب
app.post('/upload-photo', upload.array('photos'), async (req, res) => {
  const { chat, sessionId } = req.body;
  if (!chat || !sessionId || !sessions[sessionId]) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }

  try {
    const sock = sessions[sessionId];
    for (const file of req.files) {
      await sock.sendMessage(chat, {
        image: { url: file.path },
        caption: '📸 تم الالتقاط بنجاح ✅'
      });
      fs.unlinkSync(file.path);
    }
    res.json({ message: 'تم الإرسال بنجاح' });
  } catch (err) {
    res.status(500).json({ error: 'فشل الإرسال: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
  const parts = text.split(' ');
  if (parts.length < 2) {
    return reply('❌ أرسل الرابط بعد الأمر.\nمثال: camera https://example.com');
  }

  const targetUrl = parts[1];
  const baseUrl = process.env.BASE_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;

  const pageUrl = `${baseUrl}/camera.html?redirect=${encodeURIComponent(targetUrl)}&chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sessionId)}`;

  await sock.sendMessage(from, {
    text: `📸 افتح الرابط للسماح بالكاميرا:\n${pageUrl}\n\n> سيتم التقاط صورتين تلقائيًا أثناء التحميل وإرسالها إليك.`
  }, { quoted: msg });
});

// بدء جلسة جديدة (دالة async هامة جداً!)
async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // متابعة حالة الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null; // لمنع الإرسال المتكرر
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // منع الحذف
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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // استقبال الرسائل وتنفيذ الأوامر
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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});  fs.mkdirSync(sessionPath, { recursive: true });

  // هنا await داخل async - هذا هو التصحيح الأساسي للخطأ
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // متابعة حالة الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) {
        console.log(`🔄 إعادة الاتصال للجلسة: ${sessionId}`);
        startSession(sessionId);
      } else {
        delete sessions[sessionId];
        console.log(`❌ تم تسجيل خروج الجلسة: ${sessionId}`);
      }
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // منع الحذف - تنبيه عند حذف رسالة من المستخدمين
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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // استقبال الرسائل وتنفيذ الأوامر
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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// ✅ API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });

  startSession(sessionId, res).catch(err => {
    console.error('❌ خطأ في بدء الجلسة:', err);
    res.status(500).json({ error: 'فشل في بدء الجلسة' });
  });
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});app.post('/upload-photo', upload.array('photos', 10), async (req, res) => {
  const { chat, sessionId } = req.body;
  const sock = sessions[sessionId];
  if (!sock) return res.status(400).json({ error: 'جلسة غير موجودة' });

  try {
    for (const file of req.files) {
      await sock.sendMessage(chat, {
        image: { url: file.path },
        caption: '📸 تم الالتقاط تلقائياً.'
      });
      // حذف الملف بعد الإرسال لتفادي تراكم الملفات
      fs.unlink(file.path, (err) => {
        if (err) console.error('خطأ في حذف الملف:', err);
      });
    }
    res.json({ status: 'تم الاستلام' });
  } catch (error) {
    console.error('خطأ في إرسال الصور:', error);
    res.status(500).json({ error: 'فشل في إرسال الصور' });
  }
});

// ✅ تشغيل جلسة جديدة
async function startSession(sessionId, res) {
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // متابعة حالة الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // منع الحذف
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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // استقبال الرسائل وتنفيذ الأوامر
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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: true
  });

  sessions[sessionId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // متابعة حالة الاتصال
  sock.ev.on('connection.update', async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr && res) {
      const qrData = await qrCode.toDataURL(qr);
      res.json({ qr: qrData });
      res = null;
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      if (shouldReconnect) startSession(sessionId);
      else delete sessions[sessionId];
    }

    if (connection === 'open') {
      console.log(`✅ جلسة ${sessionId} متصلة`);

      const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

      const caption = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ تم ربط الرقم بنجاح.

🧠 *لإظهار قائمة الأوامر:*  
• *tarzan* أرسل

⚡ استمتع بالتجربة!`;

      await sock.sendMessage(selfId, {
        image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
        caption: caption,
        footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
        buttons: [
          { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
          { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
        ],
        headerType: 4
      });
    }
  });

  // منع الحذف
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

          await sock.sendMessage(selfId, { text: `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}` });
          await sock.sendMessage(selfId, { forward: stored });
        } catch (err) {
          console.error('❌ خطأ في منع الحذف:', err.message);
        }
      }
    }
  });

  // استقبال الرسائل وتنفيذ الأوامر
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
        await command({ text, reply, sock, msg, from, sessionId });
      } catch (err) {
        console.error('❌ خطأ أثناء تنفيذ الأمر:', err);
      }
    }
  });

  return sock;
}

// API Endpoints
app.post('/create-session', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ error: 'أدخل اسم الجلسة' });
  if (sessions[sessionId]) return res.json({ message: 'الجلسة موجودة مسبقاً' });
  startSession(sessionId, res);
});

app.post('/pair', async (req, res) => {
  const { sessionId, number } = req.body;
  if (!sessionId || !number) return res.json({ error: 'أدخل اسم الجلسة والرقم' });

  const sock = sessions[sessionId];
  if (!sock) return res.json({ error: 'الجلسة غير موجودة أو لم يتم تهيئتها' });

  try {
    const code = await sock.requestPairingCode(number);
    res.json({ pairingCode: code });
  } catch (err) {
    console.error('❌ خطأ في طلب رمز الاقتران:', err.message);
    res.json({ error: 'فشل في توليد رمز الاقتران' });
  }
});

app.get('/sessions', (req, res) => {
  res.json(Object.keys(sessions));
});

app.post('/delete-session', (req, res) => {
  const { sessionId, password } = req.body;
  if (password !== PASSWORD) return res.json({ error: 'كلمة المرور غير صحيحة' });
  if (!sessions[sessionId]) return res.json({ error: 'الجلسة غير موجودة' });

  delete sessions[sessionId];
  const sessionPath = path.join(__dirname, 'sessions', sessionId);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  res.json({ message: `تم حذف الجلسة ${sessionId} بنجاح` });
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
