const fs = require("fs");
const path = require("path");

const hiddenFile = path.join(__dirname, "../hidden.json");
if (!fs.existsSync(hiddenFile)) fs.writeFileSync(hiddenFile, JSON.stringify([]));

module.exports = async ({ text, reply }) => {
  // تحقق إذا النص يبدأ بـ "of " (مع فراغ بعد OF)
  if (!text.toLowerCase().startsWith("of ")) return;

  const parts = text.trim().split(/\s+/); // تقسيم الأمر
  if (parts.length < 3) {
    await reply("⚠️ صيغة الأمر:\nOF add 967737996293\nOF remove 967737996293");
    return;
  }

  const action = parts[1].toLowerCase(); // add أو remove
  let number = parts[2].replace(/[^0-9]/g, "") + "@s.whatsapp.net";

  let hiddenList = JSON.parse(fs.readFileSync(hiddenFile));

  if (action === "add") {
    if (!hiddenList.includes(number)) {
      hiddenList.push(number);
      fs.writeFileSync(hiddenFile, JSON.stringify(hiddenList, null, 2));
      await reply(`✅ تم إخفاء الظهور والتسليم عن: ${parts[2]}`);
    } else {
      await reply(`ℹ️ الرقم ${parts[2]} موجود بالفعل في القائمة`);
    }
  } else if (action === "remove") {
    if (hiddenList.includes(number)) {
      hiddenList = hiddenList.filter(num => num !== number);
      fs.writeFileSync(hiddenFile, JSON.stringify(hiddenList, null, 2));
      await reply(`✅ تم إزالة ${parts[2]} من قائمة الإخفاء`);
    } else {
      await reply(`ℹ️ الرقم ${parts[2]} غير موجود في القائمة`);
    }
  } else {
    await reply("⚠️ الأمر غير معروف. استخدم add أو remove");
  }
};
