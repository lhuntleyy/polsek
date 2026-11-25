import { describe, expect, it } from "vitest";
import { replyToGroupCommand, ticketNoFromQuoted } from "./group-reply.js";

const FORWARD = [
  "🚨 *P1 · Lainnya*",
  "#DEMO-261123-014 — DARURAT Lainnya: kasih sayang",
  "Pelapor: janda muda (62895410342813)",
  "Aksi: balas (reply) pesan ini dengan OTW, TIBA, SELESAI, atau TUNDA <alasan>"
].join("\n");

describe("ticketNoFromQuoted", () => {
  it("reads the ticket number from a forwarded ticket", () => {
    expect(ticketNoFromQuoted(FORWARD)).toBe("DEMO-261123-014");
  });

  it("reads the ticket number from a group status message", () => {
    expect(ticketNoFromQuoted("🚓 BKS-261125-003 — *Bripka Andi* sedang jalan ke TKP.")).toBe(
      "BKS-261125-003"
    );
  });

  it("ignores phone numbers and plain chat", () => {
    expect(ticketNoFromQuoted("Pelapor: Budi (62895410342813)")).toBeNull();
    expect(ticketNoFromQuoted(undefined)).toBeNull();
  });
});

describe("replyToGroupCommand", () => {
  it.each([
    ["otw", "/otw DEMO-261123-014"],
    ["OTW", "/otw DEMO-261123-014"],
    ["Otw ndan", "/otw DEMO-261123-014 ndan"],
    ["meluncur", "/otw DEMO-261123-014"],
    ["tiba", "/tiba DEMO-261123-014"],
    ["tkp", "/tiba DEMO-261123-014"],
    ["sudah di tkp", "/tiba DEMO-261123-014"],
    ["sampai", "/tiba DEMO-261123-014"],
    ["selesai", "/selesai DEMO-261123-014"],
    ["selesai, warga sudah damai", "/selesai DEMO-261123-014 warga sudah damai"],
    ["tunda menunggu unit", "/tunda DEMO-261123-014 menunggu unit"],
    ["status", "/status DEMO-261123-014"],
    ["/otw", "/otw DEMO-261123-014"],
    ["/otw 014", "/otw DEMO-261123-014"],
    ["/selesai 014 aman", "/selesai DEMO-261123-014 aman"]
  ])("maps reply %j", (text, expected) => {
    expect(replyToGroupCommand(text, FORWARD)).toBe(expected);
  });

  it("ignores ordinary chat replies", () => {
    expect(replyToGroupCommand("siap ndan", FORWARD)).toBeNull();
    expect(replyToGroupCommand("otwnya siapa?", FORWARD)).toBeNull();
    expect(replyToGroupCommand("", FORWARD)).toBeNull();
  });

  it("ignores replies to messages without a ticket number", () => {
    expect(replyToGroupCommand("otw", "Selamat pagi rekan-rekan")).toBeNull();
    expect(replyToGroupCommand("otw", undefined)).toBeNull();
  });
});
