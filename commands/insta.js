const axios = require('axios');

module.exports = async ({ sock, msg, text, reply, from }) => {
  // التحقق من الأمر
  if (!text.startsWith('insta')) return;

  // استخراج الرابط من الأمر
  const parts = text.trim().split(' ');
  if (parts.length < 2) {
    return reply('❌ يرجى إدخال رابط منشور أو ريلز من إنستغرام.\nمثال: insta https://www.instagram.com/reel/...');
  }

  const instaUrl = parts[1];

  if (!instaUrl.includes('instagram.com')) {
    return reply('❌ الرابط غير صالح. يرجى التأكد من رابط إنستغرام.');
  }

  try {
    await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });

    // استخدم API مجاني - مفتاحك الذي زودتني به
    const apiUrl = `https://inrl-web.onrender.com/api/download/insta?apikey=f2aa1b720cdbce02f6ae29e2&url=${encodeURIComponent(instaUrl)}`;
    const response = await axios.get(apiUrl);

    if (!response.data || !response.data.status || !response.data.result || !response.data.result.length) {
      return reply('❌ تعذر جلب الوسائط. تأكد من الرابط وحاول مجددًا.');
    }

    await reply('📥 جاري تحميل منشور إنستغرام... الرجاء الانتظار.');

    // أرسل أول وسائط فقط - يمكنك تعديل ذلك لإرسال أكثر
    const mediaUrl = response.data.result[0];

    const mediaResp = await axios.get(mediaUrl.url, { responseType: 'arraybuffer' });
    const mediaBuffer = Buffer.from(mediaResp.data, 'binary');

    const type = mediaUrl.url.endsWith('.mp4') ? 'video' : 'image';

    await sock.sendMessage(from, {
      [type]: mediaBuffer,
      caption: `📥 تم تحميل الوسائط بنجاح من إنستغرام.\n> طـــــرزان الواقدي 🔥`
    }, { quoted: msg });

    await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('❌ خطأ أثناء تحميل إنستغرام:', err.message);
    await reply('❌ حدث خطأ أثناء المعالجة. الرجاء المحاولة لاحقًا.');
    await sock.sendMessage(from, { react: { text: '❌', key: msg.key } });
  }
};
