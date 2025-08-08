module.exports = {
  name: "of",
  description: "إخفاء الظهور والتسليم عن رقم محدد",
  execute: async ({ sock, args, reply }) => {
    if (!args[0]) return reply("⚠️ أرسل الرقم بعد الأمر\nمثال:\nOF 966534123176");

    let targetNumber = args[0].replace(/[^0-9]/g, "");
    if (!targetNumber.endsWith("@s.whatsapp.net")) {
      targetNumber += "@s.whatsapp.net";
    }

    // حفظ الرقم في قائمة الإخفاء (تقدر تحفظه في JSON أو قاعدة بيانات)
    global.hiddenPresence = global.hiddenPresence || [];
    if (!global.hiddenPresence.includes(targetNumber)) {
      global.hiddenPresence.push(targetNumber);
      reply(`✅ تم إخفاء الظهور والتسليم عن: ${args[0]}`);
    } else {
      reply(`ℹ️ الرقم ${args[0]} موجود بالفعل في قائمة الإخفاء`);
    }

    // الحدث الأساسي لمنع الاستلام وإرسال الظهور
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      if (!msg.key.remoteJid) return;
      if (global.hiddenPresence.includes(msg.key.remoteJid)) {
        console.log(`📵 تم حجب الظهور والتسليم عن: ${msg.key.remoteJid}`);
        return; // ما نسوي Read أو Presence
      }
    });

    // منع إرسال حالة الكتابة والظهور لهؤلاء
    let origPresence = sock.sendPresenceUpdate;
    sock.sendPresenceUpdate = async (type, jid) => {
      if (global.hiddenPresence.includes(jid)) {
        return; // لا ترسل أي Presence
      }
      return origPresence.apply(sock, [type, jid]);
    };
  }
};
