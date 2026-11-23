import { describe, expect, it } from "vitest";
import {
  initials,
  isWhatsAppGroupJid,
  isWhatsAppJid,
  isValidPhone,
  maskPhone,
  normalizePhone,
  stripWhatsAppDevice,
  toWhatsAppGroupJid,
  toWhatsAppJid
} from "../src/phone.js";

describe("phone helpers", () => {
  it("normalizes Indonesian prefixes", () => {
    expect(normalizePhone("+62 812-3456-7890")).toBe("081234567890");
    expect(normalizePhone("6281234567890")).toBe("081234567890");
    expect(normalizePhone("0812 3456 7890")).toBe("081234567890");
  });

  it("validates mobile numbers", () => {
    expect(isValidPhone("081234567890")).toBe(true);
    expect(isValidPhone("021-555-1234")).toBe(false);
  });

  it("masks the middle of the number", () => {
    expect(maskPhone("081234567890")).toBe("0812•••••890");
    expect(maskPhone("123")).toBe("••••");
  });

  it("builds initials", () => {
    expect(initials("Rizky Maulana")).toBe("RM");
    expect(initials("Bripka Andi Saputra")).toBe("BS");
    expect(initials("")).toBe("?");
  });

  it("builds WhatsApp JIDs from common phone input", () => {
    expect(toWhatsAppJid("0812-3456-7890")).toBe("6281234567890@s.whatsapp.net");
    expect(toWhatsAppJid("+62 812 3456 7890")).toBe("6281234567890@s.whatsapp.net");
    expect(toWhatsAppJid("81234567890")).toBe("6281234567890@s.whatsapp.net");
    expect(toWhatsAppJid("6281234567890@s.whatsapp.net")).toBe(
      "6281234567890@s.whatsapp.net"
    );
    expect(isWhatsAppJid(toWhatsAppJid("081234567890"))).toBe(true);
  });

  it("builds WhatsApp group JIDs from numeric IDs", () => {
    expect(toWhatsAppGroupJid("120363012345678901")).toBe("120363012345678901@g.us");
    expect(toWhatsAppGroupJid("120363012345678901@g.us")).toBe(
      "120363012345678901@g.us"
    );
    expect(isWhatsAppGroupJid(toWhatsAppGroupJid("120363012345678901"))).toBe(true);
    expect(isWhatsAppGroupJid("chat.whatsapp.com/abc")).toBe(false);
  });

  it("strips multi-device suffixes from WhatsApp JIDs", () => {
    expect(stripWhatsAppDevice("6281234567890:12@s.whatsapp.net")).toBe(
      "6281234567890@s.whatsapp.net"
    );
    expect(stripWhatsAppDevice("123456789012345:0@lid")).toBe(
      "123456789012345@lid"
    );
    expect(stripWhatsAppDevice("6281234567890@s.whatsapp.net")).toBe(
      "6281234567890@s.whatsapp.net"
    );
  });
});
