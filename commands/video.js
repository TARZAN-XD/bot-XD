const ytdl = require('ytdl-core');
const axios = require('axios');

module.exports = async ({ sock, msg, text, reply, from }) => {
  // أوامر البدء للكلمة المفتاحية
  if (!text.startsWith('youtube') && !text.startsWith('yt') && !text.startsWith('yt-dl')) return;

  const parts = text.trim().split(' ');
  if (parts.length < 2) {
    return reply(`❌ يرجى إدخال رابط يوتيوب أو كلمات للبحث.\n
مثال:
• youtube https://www.youtube.com/watch?v=xxxx
• yt https://youtu.be/xxxx
• yt-dl كلمات البحث`);
  }

  const query = parts.slice(1).join(' ').trim();

  await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

  try {
    if (ytdl.validateURL(query)) {
      // تحميل فيديو من رابط مباشر
      await downloadYouTubeVideo(query, reply, sock, msg, from);
    } else {
      // البحث ثم تحميل أول نتيجة
      await searchAndDownloadYouTube(query, reply, sock, msg, from);
    }
  } catch (error) {
    console.error('❌ خطأ عام:', error);
    await reply('❌ حدث خطأ أثناء تنفيذ العملية. حاول لاحقًا.');
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};

async function downloadYouTubeVideo(url, reply, sock, msg, from) {
  try {
    await reply(`📥 جاري تحميل فيديو من YouTube ...`);

    // الحصول على معلومات الفيديو
    const info = await ytdl.getInfo(url);
    const title = info.videoDetails.title || "بدون عنوان";

    // تنزيل الفيديو كتيار Stream مع اختيار جودة (مثلاً 18 = mp4 360p)
    const stream = ytdl(url, { quality: '18' });

    // تجميع البيانات في Buffer
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const videoBuffer = Buffer.concat(chunks);

    // إرسال الفيديو عبر واتساب
    await sock.sendMessage(from, {
      video: videoBuffer,
      caption: `🎬 ${title}\n> تحميل بواسطة طرزان الواقدي`
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
  } catch (err) {
    console.error('❌ فشل تحميل فيديو يوتيوب:', err);
    await reply('❌ فشل تحميل فيديو يوتيوب.');
  }
}

async function searchAndDownloadYouTube(query, reply, sock, msg, from) {
  try {
    await reply(`🔍 جاري البحث عن: "${query}" ...`);

    // البحث عن فيديو باستخدام مكتبة yt-search
    const ytSearch = require('yt-search');
    const results = await ytSearch(query);

    if (!results || !results.videos || results.videos.length === 0) {
      return reply('❌ لم يتم العثور على فيديوهات.');
    }

    // اختر أول فيديو
    const video = results.videos[0];
    const url = video.url;
    const title = video.title;

    await reply(`⬇️ جاري تحميل أول فيديو من البحث: ${title} ...`);

    // حمل الفيديو بواسطة الدالة السابقة
    await downloadYouTubeVideo(url, reply, sock, msg, from);

  } catch (err) {
    console.error('❌ فشل تحميل الفيديو من البحث:', err);
    await reply('❌ فشل تحميل الفيديو من البحث.');
  }
}
