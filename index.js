const baileys = require('@whiskeysockets/baileys');
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

const express = require('express');
const fs = require('fs');
const path = require('path');
const qrCode = require('qrcode');
const moment = require('moment-timezone');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ✅ تحميل الأوامر من مجلد commands
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).forEach(file => {
    if (file.endsWith('.js')) {
        const command = require(`./commands/${file}`);
        if (typeof command === 'function') commands.push(command);
    }
});

const msgStore = new Map();
let sock; // الجلسة النشطة
let sessionIdCustom = null; // معرف الجلسة من المستخدم

const startSock = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info'); // الجلسة الدائمة
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            await qrCode.toFile('./public/qr.png', qr).catch(err => console.error('QR Error:', err));
            console.log('✅ تم حفظ رمز QR في ./public/qr.png');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
            console.log('📴 تم قطع الاتصال. إعادة الاتصال:', shouldReconnect);
            if (shouldReconnect) startSock();
        }

        if (connection === 'open') {
            console.log('✅ تم الاتصال بواتساب بنجاح');

            const selfId = sock.user.id.split(':')[0] + "@s.whatsapp.net";

            const welcomeMessage = `✨ *مرحباً بك في بوت طرزان الواقدي* ✨

✅ *تم ربط الجلسة بنجاح!*  
🔑 *معرف الجلسة:* \`${sessionIdCustom || 'غير محدد'}\`

🧠 *أوامر مقترحة:*  
━━━━━━━━━━━━━━━  
• *tarzan* ⬅️ لعرض جميع الأوامر الجاهزة  
━━━━━━━━━━━━━━━  

⚡ *استمتع بالتجربة الآن!*`;

            await sock.sendMessage(selfId, {
                image: { url: 'https://b.top4top.io/p_3489wk62d0.jpg' },
                caption: welcomeMessage,
                footer: "🤖 طرزان الواقدي - بوت الذكاء الاصطناعي ⚔️",
                buttons: [
                    { buttonId: "help", buttonText: { displayText: "📋 عرض الأوامر" }, type: 1 },
                    { buttonId: "menu", buttonText: { displayText: "📦 قائمة الميزات" }, type: 1 }
                ],
                headerType: 4
            });
        }
    });

    // منع حذف الرسائل
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
                        `🚫 *تم حذف رسالة!*\n👤 *الاسم:* ${name}\n📱 *الرقم:* wa.me/${number}\n🕒 *الوقت:* ${time}\n📂 *نوع الرسالة:* ${type}`;

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

    // استقبال الأوامر
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
};

startSock();

// ✅ API لطلب رمز Pairing Code
app.post('/pair', async (req, res) => {
    try {
        const { number, sessionId } = req.body;
        if (!number || !sessionId) return res.status(400).json({ error: 'يرجى إدخال الرقم ومعرف الجلسة' });

        sessionIdCustom = sessionId; // حفظ المعرف
        if (!sock || sock.authState.creds.registered) {
            return res.status(400).json({ error: 'الجهاز مرتبط بالفعل' });
        }
        const code = await sock.requestPairingCode(number.trim());
        return res.json({ pairingCode: code });
    } catch (err) {
        console.error('❌ خطأ في توليد الرمز:', err);
        res.status(500).json({ error: 'فشل في إنشاء الرمز' });
    }
});

// ✅ API لعرض حالة الجلسة
app.get('/sessions', (req, res) => {
    if (sock && sock.user) {
        return res.json([{ connected: true, id: sock.user.id, customId: sessionIdCustom || 'غير محدد' }]);
    }
    return res.json([]);
});

app.listen(PORT, () => {
    console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
