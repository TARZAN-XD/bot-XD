module.exports = async ({ text, reply, sock, msg, from }) => {
  if (text === 'زر') {
    await sock.sendMessage(from, {
      text: "👋 مرحبًا، اضغط الزر أدناه!",
      buttons: [
        { buttonId: 'id_1', buttonText: { displayText: '📥 تحميل PDF' }, type: 1 }
      ],
      headerType: 1
    }, { quoted: msg });
  }

  // اختبار عند الضغط على الزر
  if (text === 'id_1') {
    await sock.sendMessage(from, { text: "✅ تم الضغط على زر تحميل PDF!" }, { quoted: msg });
  }
};
