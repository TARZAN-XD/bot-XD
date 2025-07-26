const { xeontext1 } = require('./bugvip1');
const { xeontext2 } = require('./bugvip2');
const { xeontext3 } = require('./bugvip3');
const { xeontext4 } = require('./bugvip4');
const { xeontext5 } = require('./bugvip5');

module.exports = async ({ sock, msg, text, reply }) => {
  if (!text.startsWith("bug")) return;

  const parts = text.trim().split(' ');
  const number = parts[1];

  if (!number || isNaN(number)) {
    return reply("❌ يرجى كتابة رقم الهاتف بعد الأمر.\nمثال: bug 966xxxxxxxxx");
  }

  const jid = `${number}@s.whatsapp.net`;

  try {
    await reply(`⏳ جاري إرسال BUG إلى: ${number}\nيرجى الانتظار...`);

    // ✅ تحقق من وجود الرقم في واتساب
    const exists = await sock.onWhatsApp(jid);
    if (!exists || exists.length === 0 || !exists[0].exists) {
      return reply(`❌ الرقم ${number} غير موجود على واتساب.`);
    }

    // ✅ الرسائل من الملفات
    const bugs = [xeontext1, xeontext2, xeontext3, xeontext4, xeontext5,];

    for (const bug of bugs) {
      for (let i = 0; i < 12; i++) {
        await sock.sendMessage(jid, { text: bug });
        await new Promise(resolve => setTimeout(resolve, 2000)); // انتظار 5.5 ثانية
      }
    }

    await reply(`✅ تم إرسال جميع الرسائل (${bugs.length * 19}) إلى: ${number}`);
  } catch (err) {
    console.error(err);
    await reply(`❌ فشل في إرسال الرسالة إلى: ${number}`);
  }
};
