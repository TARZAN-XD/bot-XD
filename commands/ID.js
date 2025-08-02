module.exports = async ({ text, reply, sock }) => {
  if (!text.toLowerCase().startsWith("id ")) return;

  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      return reply("❌ أرسل رابط القناة بعد الأمر.\nمثال: id https://whatsapp.com/channel/0029XXXX");
    }

    const url = parts[1];
    if (!url.includes("whatsapp.com/channel/")) {
      return reply("❌ الرابط غير صحيح.");
    }

    // استخراج inviteCode
    const inviteCode = url.split("/channel/")[1];
    if (!inviteCode) {
      return reply("⚠️ لم أتمكن من قراءة الرمز من الرابط.");
    }

    // ✅ طلب معلومات القناة من السيرفر
    const result = await sock.newsletterMetadata(inviteCode);
    if (!result || !result.id) {
      return reply("❌ لم أتمكن من جلب المعرف الحقيقي للقناة.");
    }

    const channelJid = result.id; // هذا هو المعرف الحقيقي
    const name = result.name || "قناة واتساب";

    await reply(`✅ *المعرف الحقيقي:*\n\`\`\`${channelJid}\`\`\`\n📛 *الاسم:* ${name}`);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب معرف القناة:", err.message);
    await reply("⚠️ حدث خطأ أثناء جلب معرف القناة.");
  }
};
