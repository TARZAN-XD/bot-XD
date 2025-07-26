const axios = require('axios');

module.exports = async ({ sock, msg, text, reply, from }) => {
  if (!text.startsWith('tiktok') && !text.startsWith('ttdl') && !text.startsWith('tt')) return;

  const parts = text.trim().split(' ');
  if (parts.length < 2) {
    return reply(`❌ يرجى إدخال رابط تيك توك أو اسم مستخدم أو كلمات للبحث.\n
مثال:
• tiktok https://www.tiktok.com/...
• tiktok @username
• tiktok كلمات البحث`);
  }

  const query = parts.slice(1).join(' ').trim();

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

  try {
    if (query.includes('tiktok.com')) {
      await downloadVideo(query, reply, sock, msg, from);
    } else if (query.startsWith('@')) {
      const username = query.replace('@', '');
      await downloadUserVideos(username, reply, sock, from, msg);
    } else {
      await searchAndDownload(query, reply, sock, from, msg);
    }
  } catch (error) {
    console.error('❌ خطأ عام:', error);
    await reply('❌ حدث خطأ أثناء تنفيذ العملية. حاول لاحقًا.');
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};

async function downloadVideo(url, reply, sock, msg, from) {
  try {
    const apiUrl = `https://api.nexoracle.com/downloader/tiktok-nowm?apikey=free_key@maher_apis&url=${encodeURIComponent(url)}`;
    const response = await axios.get(apiUrl);

    if (!response.data || response.data.status !== 200 || !response.data.result) {
      return reply('❌ تعذر جلب الفيديو من الرابط.');
    }

    const { title, author, metrics, url: videoUrl } = response.data.result;

    await reply(`📥 جاري تحميل فيديو من @${author.username} ...`);

    const videoBuffer = await getBuffer(videoUrl);

    await sock.sendMessage(from, {
      video: videoBuffer,
      caption:
        `🎬 ${title || "بدون عنوان"}\n` +
        `👤 @${author.username}\n` +
        `❤️ ${metrics.digg_count} | 💬 ${metrics.comment_count} | 🔁 ${metrics.share_count}\n\n` +
        `> تحميل بواسطة طرزان الواقدي`
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ فشل تحميل الفيديو من الرابط:', err);
    await reply('❌ فشل تحميل الفيديو من الرابط.');
  }
}

async function downloadUserVideos(username, reply, sock, from, msg) {
  try {
    await reply(`📂 جاري البحث عن فيديوهات المستخدم @${username}...`);

    const apiUrl = `https://api.nexoracle.com/tiktok-user?apikey=free_key@maher_apis&username=${username}`;
    const response = await axios.get(apiUrl);

    if (!response.data || !response.data.result || response.data.result.length === 0) {
      return reply('❌ لم يتم العثور على فيديوهات لهذا المستخدم.');
    }

    const videos = response.data.result; // كل الفيديوهات

    for (const video of videos) {
      await reply(`⬇️ جاري تحميل فيديو: ${video.title || 'بدون عنوان'} ...`);

      try {
        const videoBuffer = await getBuffer(video.nowm);
        await sock.sendMessage(from, {
          video: videoBuffer,
          caption: `🎬 ${video.title || "فيديو بدون عنوان"}\n👤 @${username}\n❤️ ${video.likes} | 💬 ${video.comments} | 🔁 ${video.shares}`
        }, { quoted: msg });
      } catch (e) {
        console.error('❌ خطأ تحميل فيديو من المستخدم:', e);
        await reply('⚠️ حدث خطأ في تحميل أحد الفيديوهات.');
      }
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ فشل تحميل فيديوهات المستخدم:', err);
    await reply('❌ فشل تحميل فيديوهات المستخدم.');
  }
}

async function searchAndDownload(query, reply, sock, from, msg) {
  try {
    await reply(`🔍 جاري البحث عن: "${query}" ...`);

    const apiUrl = `https://api.nexoracle.com/tiktok-search?apikey=free_key@maher_apis&query=${encodeURIComponent(query)}`;
    const response = await axios.get(apiUrl);

    if (!response.data || !response.data.result || response.data.result.length === 0) {
      return reply('❌ لم يتم العثور على فيديوهات.');
    }

    // أول 5 فيديوهات فقط
    const videos = response.data.result.slice(0, 5);

    for (const video of videos) {
      await reply(`⬇️ جاري تحميل فيديو: ${video.title} ...`);

      try {
        const videoBuffer = await getBuffer(video.nowm);
        await sock.sendMessage(from, {
          video: videoBuffer,
          caption: `🎬 ${video.title || "فيديو"}\n👤 @${video.author}\n❤️ ${video.likes} | 💬 ${video.comments} | 🔁 ${video.shares}`
        }, { quoted: msg });
      } catch (e) {
        console.error('❌ خطأ تحميل فيديو من البحث:', e);
        await reply('⚠️ حدث خطأ في تحميل أحد الفيديوهات من البحث.');
      }
    }

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ فشل تحميل الفيديو من البحث:', err);
    await reply('❌ فشل تحميل الفيديو من البحث.');
  }
}

async function getBuffer(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data, 'binary');
  }
