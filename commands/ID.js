const axios = require('axios');

module.exports = async ({ text, reply }) => {
  if (!text.startsWith('id ')) return;

  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) {
    return reply('❌ أرسل رابط القناة بعد الأمر.\nمثال:\n`id https://whatsapp.com/channel/xxxxxxxxxx`');
  }

  const link = parts[1];
  if (!link.includes('whatsapp.com/channel/')) {
    return reply('⚠️ الرابط غير صحيح. يرجى إرسال رابط قناة واتساب.');
  }

  try {
    // ✅ استدعاء API الخاص بك
    const apiURL = `http://localhost:10000/channel-info?link=${encodeURIComponent(link)}`;
    const { data } = await axios.get(apiURL);

    if (data.status !== 200) {
      return reply('🚫 تعذر جلب معلومات القناة. تحقق من الرابط وحاول مرة أخرى.');
    }

    const infoText = `
╭───「 *معلومات القناة* 」
│ 📛 *الاسم:* ${data.name}
│ 🆔 *المعرف:* ${data.id}
│ 📝 *الوصف:* ${data.description}
│ 🔗 *الرابط:* ${data.link}
╰─────────────────`;

    if (data.image) {
      await reply('📡 *جارٍ جلب صورة القناة...*');
      await global.sock.sendMessage(reply.chat, {
        image: { url: data.image },
        caption: infoText
      });
    } else {
      await reply(infoText);
    }
  } catch (err) {
    console.error('❌ خطأ في أمر id:', err.message);
    await reply('⚠️ حدث خطأ أثناء جلب معلومات القناة. حاول لاحقاً.');
  }
};
