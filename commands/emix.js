const { fetchJson, getBuffer } = require("../lib/functions");
const { Sticker, StickerTypes } = require("wa-sticker-formatter");

module.exports = async ({ sock, msg, text, reply }) => {
    if (!text.toLowerCase().startsWith("emix")) return;

    const query = text.replace("emix", "").trim();
    if (!query.includes(",")) {
        return reply("❌ *الاستخدام الصحيح:*\n*emix 😂,🙂*");
    }

    const [emoji1, emoji2] = query.split(",").map(e => e.trim());

    try {
        await reply("⏳ جاري إنشاء الملصق...");
        const apiUrl = `https://levanter.onrender.com/emix?q=${encodeURIComponent(emoji1)},${encodeURIComponent(emoji2)}`;
        const data = await fetchJson(apiUrl);

        if (!data.result) {
            return reply("❌ لم أستطع إنشاء الإيموجي المدمج. جرب رموز أخرى.");
        }

        const buffer = await getBuffer(data.result);

        const sticker = new Sticker(buffer, {
            pack: "Emoji Mix",
            author: "طرزان الواقدي",
            type: StickerTypes.FULL,
            quality: 75,
            background: "transparent"
        });

        const stickerBuffer = await sticker.toBuffer();
        await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer }, { quoted: msg });

    } catch (err) {
        console.error(err);
        reply("❌ حدث خطأ أثناء إنشاء الملصق.");
    }
};
