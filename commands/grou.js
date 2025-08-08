module.exports = async ({ sock, ev }) => {
  if (!ev.action || !ev.participants || !ev.jid) return;

  if (ev.action === "add") {
    for (const participant of ev.participants) {
      try {
        const name = participant.split("@")[0];
        await sock.sendMessage(ev.jid, { text: `🎉 مرحباً بك @${name} في المجموعة! نتمنى لك وقت ممتع 😊` }, { mentions: [participant] });
      } catch (e) {
        console.error("خطأ في ترحيب العضو:", e.message);
      }
    }
  }
};
