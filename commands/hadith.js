module.exports = async ({ text, reply }) => {
  if (text.toLowerCase().includes('حديث')) {
    reply('📖 قال رسول الله ﷺ: "من دل على خير فله مثل أجر فاعله"');
  }
};
