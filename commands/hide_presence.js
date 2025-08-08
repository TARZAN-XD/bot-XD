const fs = require("fs");
const path = require("path");

const hiddenFile = path.join(__dirname, "../hidden.json");

if (!fs.existsSync(hiddenFile)) {
  fs.writeFileSync(hiddenFile, JSON.stringify([]));
}

module.exports = {
  name: "of",
  description: "إخفاء أو إظهار الظهور والتسليم عن رقم محدد",
  execute: async ({ sock, args, reply }) => {
    if (!args[0] || !args[1]) {
      return reply("⚠️ صيغة الأمر:\nOF add 967737996293\nOF remove 967737996293");
    }

    let action = args[0].toLowerCase(); // add أو remove
    let number = args[1].replace(/[^0-9]/g, "") + "@s.whatsapp.net";

    // قراءة القائمة
    let hiddenList = JSON.parse(fs.readFileSync(hiddenFile));

    if (action === "add") {
      if (!hiddenList.includes(number)) {
        hiddenList.push(number);
        fs.writeFileSync(hiddenFile, JSON.stringify(hiddenList, null, 2));
        reply(`✅ تم إخفاء الظهور والتسليم عن: ${args[1]}`);
      } else {
        reply(`ℹ️ الرقم ${args[1]} موجود بالفعل في القائمة`);
      }
    }

    if (action === "remove") {
      if (hiddenList.includes(number)) {
        hiddenList = hiddenList.filter(num => num !== number);
        fs.writeFileSync(hiddenFile, JSON.stringify(hiddenList, null, 2));
        reply(`✅ تم إزالة ${args[1]} من قائمة الإخفاء`);
      } else {
        reply(`ℹ️ الرقم ${args[1]} غير موجود في القائمة`);
      }
    }
  }
};
