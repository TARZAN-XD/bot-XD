const axios = require('axios');

let searchCache = {}; // تخزين مؤقت لنتائج الصور حسب رقم المستخدم

module.exports = async ({ sock, msg, text, reply, from }) => {
  const messageText = text?.toLowerCase()?.trim();

  // ✅ إذا طلب المستخدم "img كلمه"
  if (messageText.startsWith('img ')) {
    const query = messageText.slice(4).trim();
    if (!query) return reply('❌ أدخل كلمة للبحث عن الصور.\nمثال: img بحر');

    await sock.sendMessage(from, { react: { text: '🔍', key: msg.key } });

    const results = await fetchImages(query);
    if (results.length === 0) {
      return reply('❌ لم يتم العثور على صور. جرب كلمة أخرى.');
    }

    // حفظ النتائج في كاش لتتمكن من التنقل بزر "التالي"
    searchCache[from] = { query, index: 1, results };

    // إرسال أول صورة
    await sendImage(sock, from, msg, results[0], 1, results.length, query);

  }

  // ✅ إذا ضغط على زر "التالي"
  else if (messageText === 'next_img' && searchCache[from]) {
    const { query, index, results } = searchCache[from];

    if (index >= results.length) {
      return reply('✅ لا توجد صور إضافية. انتهت النتائج.');
    }

    await sendImage(sock, from, msg, results[index], index + 1, results.length, query);

    searchCache[from].index += 1;
  }
};

// ✅ جلب صور من 3 مصادر
async function fetchImages(query) {
  const images = [];

  // 🟢 1. Pexels
  try {
    const res = await axios.get(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5`, {
      headers: {
        Authorization: '9vySYMFQtn9OjUO2jHt7CQ45Uwfw4fWyE3UcLouC4kb1oqc8Da8cNNHy'
      }
    });
    res.data.photos?.forEach(photo => {
      images.push({ url: photo.src.original, source: 'Pexels' });
    });
  } catch { }

  // 🟢 2. Unsplash
  try {
    const res = await axios.get(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&client_id=KTVJieF4bPuxmAs4AqSw95CEH3ozNjU6cTcNSrTrSpE`);
    res.data.results?.forEach(photo => {
      images.push({ url: photo.urls.full, source: 'Unsplash' });
    });
  } catch { }

  // 🟢 3. Pixabay
  try {
    const res = await axios.get(`https://pixabay.com/api/?key=38524332-3800d1d58030c7fbe8b0375f6&q=${encodeURIComponent(query)}&image_type=photo&per_page=5`);
    res.data.hits?.forEach(photo => {
      images.push({ url: photo.largeImageURL, source: 'Pixabay' });
    });
  } catch { }

  return images.slice(0, 10); // نختار أول 10 صور فقط للعرض بالتنقل
}

// ✅ إرسال صورة مع زر "التالي"
async function sendImage(sock, from, msg, result, index, total, query) {
  const buffer = await axios.get(result.url, { responseType: 'arraybuffer' });

  await sock.sendMessage(from, {
    image: Buffer.from(buffer.data, 'binary'),
    caption: `🔍 *نتيجة ${index} من ${total}*\n📌 *الكلمة:* ${query}\n🌐 *المصدر:* ${result.source}\n\n- بواسطة طرزان الواقدي`,
    buttons: [
      { buttonId: 'next_img', buttonText: { displayText: '📸 التالي' }, type: 1 }
    ],
    headerType: 4
  }, { quoted: msg });
}
