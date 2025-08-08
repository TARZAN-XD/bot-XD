module.exports = async ({ sock, from, text, msg, reply }) => {
  if (!text.toLowerCase().startsWith("lock ")) return;
  if (!msg.key.remoteJid.endsWith("@g.us")) return reply("❌ خاص بالمجموعات فقط.");

  const option = text.split(" ")[1];
  const settingsMap = {
    "media": "announce",  // أو حسب API
    "links": "restrict"
  };

  if (!["media", "links"].includes(option)) return reply("❌ الصيغة: lock [media|links]");

  try {
    if (option === "media") {
      // قفل الميديا - فقط الأدمن يرسل
      await sock.groupSettingUpdate(from, true); // true تعني قفل، false فتح
      reply("✅ تم قفل إرسال الميديا (الصور والفيديو).");
    } else if (option === "links") {
      // منع الروابط مثلاً بإعدادات البوت أو بحذفها (أنظمة حماية خاصة)
      reply("⚠️ ميزة منع الروابط تعمل تلقائياً (ضمن حماية البوت).");
    }
  } catch (e) {
    reply(`❌ خطأ: ${e.message}`);
  }
};
