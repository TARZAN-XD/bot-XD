module.exports = async ({ text, reply, sock, from }) => {
  if (text.toLowerCase() === 'camera') {
    const sessionId = 'default'; // يمكنك تغييره حسب نظام الجلسات لديك
    const baseUrl = process.env.BASE_URL || 'http://localhost:10000'; // ضع رابط Render عند الرفع
    const url = `${baseUrl}/camera.html?chat=${encodeURIComponent(from)}&sessionId=${encodeURIComponent(sessionId)}`;

    await reply(`📸 افتح الرابط للسماح بالكاميرا:\n${url}\n\n✅ سيتم الالتقاط وإرسال الصور تلقائياً.`);
  }
};
