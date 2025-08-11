// commands/pinterest.js
const axios = require("axios");
const cheerio = require("cheerio");

module.exports = async ({ text, reply, sock, from, msg }) => {
    if (!text.startsWith("pinterest ")) return;

    const url = text.split(" ")[1];
    if (!url || !url.includes("pinterest.com")) {
        return reply("⚠️ أرسل رابط Pinterest صحيح\nمثال: pinterest https://pin.it/xxxxxx");
    }

    try {
        reply("⏳ جارِ استخراج الرابط من Pinterest...");

        const { data } = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });

        const $ = cheerio.load(data);

        // البحث عن فيديو أو صورة
        let mediaUrl =
            $('meta[property="og:video"]').attr("content") ||
            $('meta[property="og:image"]').attr("content");

        if (!mediaUrl) {
            return reply("❌ لم أستطع العثور على وسائط في هذا الرابط.");
        }

        // إرسال الوسائط
        if (mediaUrl.endsWith(".mp4")) {
            await sock.sendMessage(from, {
                video: { url: mediaUrl },
                caption: "🎥 تم التحميل من Pinterest بنجاح ✅"
            }, { quoted: msg });
        } else {
            await sock.sendMessage(from, {
                image: { url: mediaUrl },
                caption: "🖼️ تم التحميل من Pinterest بنجاح ✅"
            }, { quoted: msg });
        }

    } catch (err) {
        console.error(err);
        reply("❌ حدث خطأ أثناء محاولة التحميل من Pinterest.");
    }
};
