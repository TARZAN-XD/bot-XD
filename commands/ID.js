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

    const inviteCode = url.split("/channel/")[1];
    if (!inviteCode) {
      return reply("⚠️ لم أتمكن من قراءة الرمز من الرابط.");
    }

    // ✅ الاستعلام الخام لجلب البيانات
    const result = await sock.query({
      tag: 'iq',
      attrs: {
        to: '@s.whatsapp.net',
        type: 'get',
        xmlns: 'w:wa:newsletter'
      },
      content: [
        {
          tag: 'newsletter',
          attrs: { invite: inviteCode }
        }
      ]
    });

    const newsletterNode = result?.content?.find(c => c.tag === 'newsletter');
    if (!newsletterNode) {
      return reply("❌ لم أتمكن من جلب معلومات القناة.");
    }

    const channelId = newsletterNode.attrs?.id || "غير معروف";
    const name = newsletterNode.attrs?.name || "قناة واتساب";

    await reply(`✅ *المعرف الحقيقي:*\n\`\`\`${channelId}\`\`\`\n📛 *الاسم:* ${name}`);
  } catch (err) {
    console.error("❌ خطأ أثناء جلب معرف القناة:", err);
    await reply("⚠️ حدث خطأ أثناء جلب معرف القناة.");
  }
};
