const axios = require('axios');

module.exports = async ({ sock, msg, text, reply, from }) => {
  if (!text.startsWith('tiktok')) return;

  const parts = text.trim().split(' ');
  if (parts.length < 2) {
    return reply(`❌ يرجى إدخال رابط تيك توك.\n\nمثال:\n• tiktok https://www.tiktok.com/@username/video/1234567890`);
  }

  const url = parts[1].trim();

  if (!url.includes('tiktok.com')) {
    return reply('❌ الرابط غير صالح. تأكد من إدخال رابط تيك توك صحيح.');
  }

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

  try {
    // API مع المفتاح والرابط
    const apiUrl = `https://api.nexoracle.com/downloader/tiktok-nowm?apikey=free_key@maher_apis&url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl);

    if (!response.data || response.data.status !== 200 || !response.data.result) {
      return reply('❌ تعذر جلب الفيديو من الرابط. حاول برابط آخر.');
    }

    const { title, author, metrics, url: videoUrl } = response.data.result;

    await reply(`📥 جاري تحميل الفيديو من @${author.username} ...`);

    const videoBuffer = await getBuffer(videoUrl);

    await sock.sendMessage(from, {
      video: videoBuffer,
      caption:
        `🎬 ${title || "بدون عنوان"}\n` +
        `👤 @${author.username}\n` +
        `❤️ ${metrics.digg_count} | 💬 ${metrics.comment_count} | 🔁 ${metrics.share_count}\n\n` +
        `> تم التحميل بواسطة طرزان الواقدي`
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ فشل تحميل الفيديو:', err.message);
    await reply('❌ حدث خطأ أثناء التحميل. حاول مرة أخرى.');
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};

async function getBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary');
}
