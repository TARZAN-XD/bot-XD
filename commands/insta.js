const { instagram } = require('instagram-url-direct');
const axios = require('axios');

module.exports = async ({ sock, msg, text, reply, from }) => {
  if (!text.startsWith('instagram') && !text.startsWith('ig')) return;

  const parts = text.trim().split(' ');
  if (parts.length < 2) {
    return reply(`❌ يرجى إدخال رابط انستقرام.\n\nمثال:\n• instagram https://www.instagram.com/reel/xxxx/`);
  }

  const url = parts[1].trim();

  if (!url.includes('instagram.com')) {
    return reply('❌ الرابط غير صالح. تأكد من إدخال رابط انستقرام صحيح.');
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

  try {
    const data = await instagram(url);

    if (!data || !data.url_list || data.url_list.length === 0) {
      return reply('❌ لم أتمكن من جلب أي وسائط من الرابط.');
    }

    for (const mediaUrl of data.url_list) {
      const mediaBuffer = await getBuffer(mediaUrl);
      if (mediaUrl.includes('.mp4')) {
        await sock.sendMessage(from, {
          video: mediaBuffer,
          caption: `🎬 تم التحميل من انستقرام ✅`
        }, { quoted: msg });
      } else {
        await sock.sendMessage(from, {
          image: mediaBuffer,
          caption: `🖼️ تم التحميل من انستقرام ✅`
        }, { quoted: msg });
      }
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ فشل تحميل من انستقرام:', err.message);
    await reply('❌ حدث خطأ أثناء التحميل. حاول مرة أخرى.');
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};

async function getBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary');
}
