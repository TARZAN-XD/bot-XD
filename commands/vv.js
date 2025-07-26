const { downloadMediaMessage } = require('@whiskeysockets/baileys');

module.exports = async ({ sock, msg, text }) => {
  if (text !== 'vv') return;

  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const senderJid = msg.key.participant || msg.key.remoteJid;

  if (!quoted) return;

  const mediaType = Object.keys(quoted)[0]; // imageMessage or videoMessage
  const viewOnceMsg = quoted[mediaType];
  const isViewOnce = viewOnceMsg?.viewOnce === true;

  if (!isViewOnce || (mediaType !== 'imageMessage' && mediaType !== 'videoMessage')) {
    return;
  }

  try {
    const mediaBuffer = await downloadMediaMessage(
      {
        key: msg.message.extendedTextMessage.contextInfo,
        message: quoted,
      },
      'buffer',
      {},
      { logger: console }
    );

    // إرسال الوسائط حسب النوع
    if (mediaType === 'imageMessage') {
      await sock.sendMessage(senderJid, {
        image: mediaBuffer,
        caption: '✅ تم استعادة الصورة (عرض لمرة واحدهة)',
      });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(senderJid, {
        video: mediaBuffer,
        caption: '✅ تم استعادة الفيديو (عرض لمرة واحدة)',
      });
    }

  } catch (err) {
    console.error('❌ خطأ في استعادة الوسائط:', err);
  }
};
