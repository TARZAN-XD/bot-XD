const axios = require('axios');

module.exports = async ({ sock, msg, text, from, reply }) => {
  if (!text.toLowerCase().startsWith('fake ')) return;

  // صيغة الأمر:
  // fake [رقم] [نوع: text|image|sticker|audio|video] [رابط أو نص]
  const args = text.trim().split(' ').slice(1);
  if (args.length < 3) {
    return reply('❌ صيغة الأمر: fake [رقم] [نوع: text|image|sticker|audio|video] [رابط أو نص]');
  }

  const fakeNumber = args[0].replace(/\D/g, '') + '@s.whatsapp.net';
  const msgType = args[1].toLowerCase();
  const content = args.slice(2).join(' ');

  try {
    let messageContent;

    switch (msgType) {
      case 'text':
        messageContent = { conversation: content };
        break;

      case 'image':
        {
          const imageBuffer = await downloadMedia(content);
          messageContent = { image: imageBuffer, caption: '' };
        }
        break;

      case 'sticker':
        {
          const imageBuffer = await downloadMedia(content);
          // يمكنك هنا تحويل الصورة إلى ملصق إذا عندك مكتبة لذلك، لكن هنا نرسلها كصورة فقط
          messageContent = { sticker: imageBuffer };
        }
        break;

      case 'audio':
        {
          const audioBuffer = await downloadMedia(content);
          messageContent = { audio: audioBuffer, mimetype: 'audio/mpeg' };
        }
        break;

      case 'video':
        {
          const videoBuffer = await downloadMedia(content);
          messageContent = { video: videoBuffer, caption: '' };
        }
        break;

      default:
        return reply('❌ النوع غير مدعوم. استخدم: text, image, sticker, audio, video');
    }

    // بناء المفتاح (key) ليبدو وكأن الرسالة من الرقم المزور
    const fakeMessage = {
      key: {
        remoteJid: from,
        fromMe: false,
        participant: fakeNumber,
        id: `FAKE-${Date.now()}`
      },
      message: messageContent
    };

    await sock.sendMessage(from, messageContent, { quoted: fakeMessage });
  } catch (err) {
    console.error('خطأ في إرسال الرسالة المزورة:', err);
    reply('❌ حدث خطأ أثناء محاولة إرسال الرسالة المزورة.');
  }
};

async function downloadMedia(url) {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}
