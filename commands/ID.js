module.exports = async ({ sock, msg, text, reply, from }) => {
  if (!text.toLowerCase().startsWith("newsletter") &&
      !text.toLowerCase().startsWith("cjid") &&
      !text.toLowerCase().startsWith("id")) return;

  try {
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      return reply(`❎ *يرجى إدخال رابط القناة.*\n\n📌 *مثال:*\nid https://whatsapp.com/channel/xxxxxxxxxx`);
    }

    const url = parts[1].trim();
    const match = url.match(/whatsapp\.com\/channel\/([\w-]+)/);
    if (!match) {
      return reply(`⚠️ *الرابط غير صالح!*\n\nالصيغة الصحيحة:\nhttps://whatsapp.com/channel/xxxxxxxxx`);
    }

    const inviteId = match[1];

    let metadata;
    try {
      metadata = await sock.newsletterMetadata("invite", inviteId);
    } catch (err) {
      console.error("❌ newsletterMetadata Error:", err);
      return reply("🚫 تعذر جلب معلومات القناة. تحقق من الرابط وحاول مرة أخرى.");
    }

    if (!metadata?.id) {
      return reply("❌ القناة غير موجودة أو غير قابلة للوصول.");
    }

    const infoText = `
📡 *معلومات القناة:*
────────────────────
🔖 *المعرف:* ${metadata.id}
🗂️ *الاسم:* ${metadata.name}
👥 *المتابعين:* ${metadata.subscribers?.toLocaleString() || "غير متوفر"}
🗓️ *تاريخ الإنشاء:* ${metadata.creation_time ? new Date(metadata.creation_time * 1000).toLocaleString("ar-EG") : "غير معروف"}
────────────────────
🔗 *رابط القناة:*
https://whatsapp.com/channel/${inviteId}
`;

    if (metadata.preview) {
      await sock.sendMessage(from, {
        image: { url: `https://pps.whatsapp.net${metadata.preview}` },
        caption: infoText
      }, { quoted: msg });
    } else {
      await reply(infoText);
    }

  } catch (err) {
    console.error("❌ Newsletter Command Error:", err);
    await reply("⚠️ حدث خطأ أثناء جلب معلومات القناة.");
  }
};
