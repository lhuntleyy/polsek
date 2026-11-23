import { describe, expect, it } from "vitest";
import type { WAMessage } from "@whiskeysockets/baileys";
import { normalizeMessage } from "./normalize.js";

function message(overrides: Partial<WAMessage>): WAMessage {
  return {
    key: {
      remoteJid: "6281111111111@s.whatsapp.net",
      fromMe: false,
      id: "MSG1"
    },
    message: { conversation: "Halo" },
    messageTimestamp: 1_760_000_000,
    pushName: "Warga",
    ...overrides
  } as WAMessage;
}

describe("normalizeMessage", () => {
  it("normalizes a text message", () => {
    const result = normalizeMessage(message({}));
    expect(result).toMatchObject({
      waMessageId: "MSG1",
      chatJid: "6281111111111@s.whatsapp.net",
      senderJid: "6281111111111@s.whatsapp.net",
      isGroup: false,
      type: "text",
      text: "Halo"
    });
  });

  it("falls back to chatJid when participant is empty on a LID 1:1", () => {
    const result = normalizeMessage(
      message({
        key: {
          remoteJid: "123456789012345@lid",
          fromMe: false,
          id: "MSG-LID",
          participant: ""
        }
      })
    );
    expect(result?.senderJid).toBe("123456789012345@lid");
    expect(result?.isGroup).toBe(false);
  });

  it("prefers phone JID over LID for 1:1 chats", () => {
    const result = normalizeMessage(
      message({
        key: {
          remoteJid: "123456789012345@lid",
          remoteJidAlt: "6281234567890@s.whatsapp.net",
          fromMe: false,
          id: "MSG-LID-ALT",
          participant: "",
          participantAlt: "6281234567890@s.whatsapp.net"
        }
      })
    );
    expect(result?.chatJid).toBe("6281234567890@s.whatsapp.net");
    expect(result?.senderJid).toBe("6281234567890@s.whatsapp.net");
  });

  it("normalizes a location message", () => {
    const result = normalizeMessage(
      message({
        message: {
          locationMessage: {
            degreesLatitude: -6.26,
            degreesLongitude: 106.98,
            accuracyInMeters: 12
          }
        }
      })
    );
    expect(result?.type).toBe("location");
    expect(result?.location).toEqual({ lat: -6.26, lng: 106.98, accuracyM: 12 });
  });

  it("marks group messages and uses the participant as sender", () => {
    const result = normalizeMessage(
      message({
        key: {
          remoteJid: "120363000000000000@g.us",
          participant: "628000000005@s.whatsapp.net",
          fromMe: false,
          id: "MSG2"
        },
        message: { conversation: "/otw 001" }
      })
    );
    expect(result?.isGroup).toBe(true);
    expect(result?.senderJid).toBe("628000000005@s.whatsapp.net");
    expect(result?.text).toBe("/otw 001");
  });

  it("keeps a group photo caption so /selesai can attach it", () => {
    const result = normalizeMessage(
      message({
        key: {
          remoteJid: "120363000000000000@g.us",
          participant: "628000000005@s.whatsapp.net",
          fromMe: false,
          id: "MSG3"
        },
        message: {
          imageMessage: {
            caption: "/selesai 014 Bukti foto",
            mimetype: "image/jpeg"
          }
        }
      })
    );
    expect(result?.isGroup).toBe(true);
    expect(result?.type).toBe("image");
    expect(result?.text).toBe("/selesai 014 Bukti foto");
  });

  it("drops group audio and video", () => {
    const result = normalizeMessage(
      message({
        key: {
          remoteJid: "120363000000000000@g.us",
          participant: "628000000005@s.whatsapp.net",
          fromMe: false,
          id: "MSG4"
        },
        message: { audioMessage: { mimetype: "audio/ogg" } }
      })
    );
    expect(result).toBeNull();
  });

  it("ignores fromMe and status broadcasts", () => {
    expect(normalizeMessage(message({ key: { remoteJid: "x", fromMe: true, id: "1" } }))).toBeNull();
    expect(
      normalizeMessage(
        message({ key: { remoteJid: "status@broadcast", fromMe: false, id: "2" } })
      )
    ).toBeNull();
  });

  it("returns null when there is no message id", () => {
    expect(
      normalizeMessage(message({ key: { remoteJid: "x", fromMe: false, id: null } }))
    ).toBeNull();
  });

  it("unwraps ephemeral, viewOnce, and documentWithCaption containers and strips device suffix", () => {
    const eph = normalizeMessage(
      message({
        key: {
          remoteJid: "6281111111111:12@s.whatsapp.net",
          fromMe: false,
          id: "MSG-EPH"
        },
        message: {
          ephemeralMessage: {
            message: {
              extendedTextMessage: { text: "Pesan sementara" }
            }
          }
        }
      })
    );
    expect(eph).toMatchObject({
      chatJid: "6281111111111@s.whatsapp.net",
      senderJid: "6281111111111@s.whatsapp.net",
      type: "text",
      text: "Pesan sementara"
    });

    const viewOnce = normalizeMessage(
      message({
        key: {
          remoteJid: "6281111111111@s.whatsapp.net",
          fromMe: false,
          id: "MSG-VO"
        },
        message: {
          viewOnceMessageV2: {
            message: {
              imageMessage: { mimetype: "image/jpeg", caption: "Foto sekali lihat" }
            }
          }
        }
      })
    );
    expect(viewOnce).toMatchObject({
      type: "image",
      text: "Foto sekali lihat"
    });

    const docCaption = normalizeMessage(
      message({
        key: {
          remoteJid: "120363000000000000@g.us",
          participant: "6282222222222:7@s.whatsapp.net",
          fromMe: false,
          id: "MSG-DOC"
        },
        message: {
          documentWithCaptionMessage: {
            message: {
              documentMessage: { mimetype: "application/pdf", caption: "Lampiran" }
            }
          }
        }
      })
    );
    expect(docCaption).toMatchObject({
      isGroup: true,
      senderJid: "6282222222222@s.whatsapp.net",
      type: "text",
      text: "Lampiran"
    });
  });
});
