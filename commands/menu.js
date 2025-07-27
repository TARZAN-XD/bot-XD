module.exports = async ({ sock, msg, from }) => {
    try {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text) return;

        if (text.toLowerCase() === "menu") {
            await sock.sendMessage(from, {
                text: "✅ مرحبًا! اختر من القائمة أدناه:",
                footer: "بوت واتساب الذكي",
                title: "📜 القائمة الرئيسية",
                buttonText: "اضغط هنا لعرض القائمة",
                sections: [
                    {
                        title: "القسم الأول - التحميل",
                        rows: [
                            { title: "📥 تحميل فيديو", description: "من يوتيوب أو إنستجرام", rowId: "menu_video" },
                            { title: "🎵 تحميل موسيقى", description: "من يوتيوب", rowId: "menu_music" }
                        ]
                    },
                    {
                        title: "القسم الثاني - الأدوات",
                        rows: [
                            { title: "🖼 صور عشوائية", description: "احصل على صور مذهلة", rowId: "menu_images" },
                            { title: "📄 معلومات البوت", description: "حول هذا البوت", rowId: "menu_info" }
                        ]
                    }
                ]
            });
        }
    } catch (error) {
        console.error("❌ خطأ في أمر القائمة:", error);
        await sock.sendMessage(from, { text: "⚠ حدث خطأ أثناء عرض القائمة!" });
    }
};
