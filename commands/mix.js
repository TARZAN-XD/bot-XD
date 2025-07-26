const axios = require('axios');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = async ({ sock, msg, text, reply, from }) => {
  if (!text.toLowerCase().startsWith('mix')) return;

  const parts = text.trim().split(/\s+/).slice(1); // الإيموجيات
  if (parts.length !== 2) {
    return reply('❌ يجب إدخال إيموجيين فقط.\nمثال: mix 😋 😎');
  }

  try {
    await sock.sendMessage(from, { react: { text: '🎨', key: msg.key } });

    const emoji1 = encodeURIComponent(parts[0]);
    const emoji2 = encodeURIComponent(parts[1]);

    // ✅ جلب الدمج من Emoji Kitchen API
    const apiUrl = `https://tenor.googleapis.com/v2/featured?key=AIzaSyB-YaVwM&client_key=emoji_kitchen&collection=emoji_kitchen_v6&q=${emoji1}_${emoji2}`;
    const res = await axios.get(apiUrl);

    if (!res.data || !res.data.results || res.data.results.length === 0) {
      return reply('❌ لا يوجد دمج متاح لهذه الإيموجيات.');
    }

    const imageUrl = res.data.results[0].url;

    // ✅ تنزيل الصورة
    const imgBuffer = (await axios.get(imageUrl, { responseType: 'arraybuffer' })).data;

    // ✅ تحويلها إلى ملصق
    const sticker = new Sticker(imgBuffer, {
      pack: 'Emoji Fusion',
      author: 'طرزان الواقدي',
      type: StickerTypes.FULL,
      quality: 100
    });

    const stickerBuffer = await sticker.build();

    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ خطأ في mixemoji:', err.message);
    await reply('❌ حدث خطأ أثناء إنشاء الملصق.');
  }
};
