module.exports = async ({ text, reply, sock }) => {
  if (!text.toLowerCase().startsWith("id ")) return;

  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      return reply("❌ أرسل رابط القناة بعد الأمر.\n\nمثال:\n```id https://whatsapp.com/channel/0029XXXX```");
    }

    const url = parts[1].trim();
    if (!/^https:\/\/whatsapp\.com\/channel\/[A-Za-z0-9]+$/i.test(url)) {
      return reply("❌ الرابط غير صحيح. يجب أن يكون رابط قناة واتساب.");
    }

    const inviteCode = url.split("/channel/")[1];
    if (!inviteCode) {
      return reply("⚠️ لم أتمكن من استخراج رمز الدعوة من الرابط.");
    }

    // ✅ طلب استعلام القناة عبر Baileys
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

    // ✅ التحقق من وجود العقدة
    const newsletterNode = result?.content?.find(c => c.tag === 'newsletter');
    if (!newsletterNode || !newsletterNode.attrs) {
      return reply("❌ لم أتمكن من جلب معلومات القناة. قد يكون الرابط غير صالح أو القناة محمية.");
    }

    const channelId = newsletterNode.attrs.id || "غير متوفر";
    const name = newsletterNode.attrs.name || "غير معروف";
    const type = newsletterNode.attrs.type || "channel";
    const creation = newsletterNode.attrs.creation || "غير معروف";

    // ✅ إرسال النتيجة للمستخدم
    await reply(
      `✅ *معلومات القناة:*\n` +
      `🆔 *المعرف الحقيقي:* \`\`\`${channelId}\`\`\`\n` +
      `📛 *الاسم:* ${name}\n` +
      `📂 *النوع:* ${type}\n` +
      `📅 *تاريخ الإنشاء:* ${creation}`
    );

  } catch (err) {
    console.error("❌ خطأ أثناء جلب معرف القناة:", err);
    await reply("⚠️ حدث خطأ أثناء جلب معرف القناة. حاول لاحقاً.");
  }
};
