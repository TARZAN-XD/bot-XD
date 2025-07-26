module.exports = async ({ text, reply }) => {
  if (text.toLowerCase().includes('دعاء')) {
    reply('🤲 اللهم إنا نسألك الهداية والتوفيق والرضا والقبول.');
  }
};
