module.exports = async ({ text, reply, sock, msg, from }) => {
  if (!text.toLowerCase().startsWith("getid")) return;

  try {
    // إذا الرسالة في مجموعة أو قناة
    const jid = from; // معرف الجروب أو القناة
    const isGroup = jid.endsWith('@g.us');
    const isChannel = jid.endsWith('@newsletter');

    // جلب تفاصيل المجموعة/القناة
    const metadata = await sock.groupMetadata(jid).catch(() => null);

    let name = metadata?.subject || "غير معروف";
    let participantsCount = metadata?.participants?.length || 0;

    let type = isGroup ? "📢 مجموعة" : isChannel ? "📡 قناة" : "شخص";

    const infoMessage = `
✅ *تم جلب المعلومات بنجاح:*

🔖 *النوع:* ${type}
📛 *الاسم:* ${name}
🆔 *المعرف:* \`${jid}\`
👥 *عدد الأعضاء:* ${participantsCount}
`;

    await reply(infoMessage);
  } catch (err) {
    console.error("خطأ في getid:", err.message);
    await reply("❌ حدث خطأ أثناء جلب المعرف.");
  }
};
