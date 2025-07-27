module.exports = async ({ sock, m }) => {
    try {
        // إرسال القائمة للمستخدم
        await sock.sendMessage(m.chat, {
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
    } catch (error) {
        console.error("❌ خطأ في إرسال القائمة:", error);
        await sock.sendMessage(m.chat, { text: "⚠ حدث خطأ أثناء إرسال القائمة!" });
    }
};
