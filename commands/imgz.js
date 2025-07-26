const axios = require("axios");

// ✅ دالة لإنشاء الصورة
async function generateImage(sock, from, prompt, reply, apiUrl, quotedMsg) {
  if (!prompt) return reply("❌ الرجاء إدخال وصف للصورة.");

  try {
    await reply("> *جاري إنشاء الصورة... 🔥*");

    const response = await axios.get(apiUrl, { responseType: "arraybuffer" });
    if (!response?.data) return reply("❌ لم يتم استلام صورة من الخادم.");

    const imageBuffer = Buffer.from(response.data, "binary");

    await sock.sendMessage(from, {
      image: imageBuffer,
      caption: `✨ *تم إنشاء الصورة بنجاح!*  
🔍 *الوصف:* ${prompt}`
    }, { quoted: quotedMsg });

  } catch (error) {
    console.error("❌ خطأ:", error);
    reply(`❌ حدث خطأ: ${error.response?.data?.message || error.message}`);
  }
}

module.exports = async ({ sock, msg, text, reply, from }) => {
  const args = text.trim().split(/\s+/);
  const command = args[0].toLowerCase();
  const prompt = args.slice(1).join(' ');

  // ✅ عند كتابة "تخيل" يتم عرض الرسالة الفخمة
  if (command === "تخيل") {
    const helpMsg = `
✨ *مرحباً بك في عالم الإبداع مع طرزان الواقدي* ✨

✅ *قسم توليد الصور بالذكاء الاصطناعي جاهز لك!*  

🧠 *الأوامر المتاحة:*  
━━━━━━━━━━━━━━━  
🔹 *fluxai*  ➤ صور عالية الدقة بتقنية Flux  
🔹 *stablediffusion*  ➤ تصميمات إبداعية بخاصية Stable Diffusion  
🔹 *stabilityai*  ➤ فنون مذهلة عبر Stability AI  
━━━━━━━━━━━━━━━  

📌 *كيفية الاستخدام:*  
اكتب الأمر متبوعًا بالوصف، مثال:  
\`fluxai منظر خيالي لغروب الشمس في الصحراء\`

⚠️ *نصيحة:* كلما كان الوصف دقيقًا، زادت روعة الصورة!  

⚡ *ابدأ الآن ودع خيالك يبدع!*  
`.trim();

    // ✅ إرسال الرسالة مع أزرار تفاعلية
    await sock.sendMessage(from, {
      text: helpMsg,
      footer: "🤖 طرزان الواقدي - الإبداع في متناول يدك",
      buttons: [
        { buttonId: "fluxai مثال", buttonText: { displayText: "🚀 تجربة Flux" }, type: 1 },
        { buttonId: "stablediffusion مثال", buttonText: { displayText: "🎨 تجربة Stable" }, type: 1 },
        { buttonId: "stabilityai مثال", buttonText: { displayText: "✨ تجربة Stability" }, type: 1 }
      ],
      headerType: 1
    }, { quoted: msg });

    return;
  }

  // ✅ تنفيذ أوامر التوليد
  if (["fluxai", "flux", "imagine"].includes(command)) {
    const apiUrl = `https://api.siputzx.my.id/api/ai/flux?prompt=${encodeURIComponent(prompt)}`;
    return generateImage(sock, from, prompt, reply, apiUrl, msg);
  }

  if (["stablediffusion", "sdiffusion", "imagine2"].includes(command)) {
    const apiUrl = `https://api.siputzx.my.id/api/ai/stable-diffusion?prompt=${encodeURIComponent(prompt)}`;
    return generateImage(sock, from, prompt, reply, apiUrl, msg);
  }

  if (["stabilityai", "stability", "imagine3"].includes(command)) {
    const apiUrl = `https://api.siputzx.my.id/api/ai/stabilityai?prompt=${encodeURIComponent(prompt)}`;
    return generateImage(sock, from, prompt, reply, apiUrl, msg);
  }
};
