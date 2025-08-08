module.exports = async ({ sock, from, reply, msg }) => {
  if (!msg.key.remoteJid.endsWith("@g.us")) return;

  try {
    const groupMetadata = await sock.groupMetadata(from);
    const participants = groupMetadata.participants;

    let listText = `👥 *قائمة أعضاء المجموعة* (${participants.length}):\n\n`;
    for (const p of participants) {
      listText += `- ${p.id.split("@")[0]} ${p.admin === "admin" ? "👑" : ""}\n`;
    }

    reply(listText);
  } catch (e) {
    reply(`❌ خطأ: ${e.message}`);
  }
};
