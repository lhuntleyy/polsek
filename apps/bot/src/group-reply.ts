/**
 * Aksi tiket "by reply" di grup URC.
 *
 * Anggota cukup me-reply pesan tiket dari bot. Balasan bebas apa pun ke pesan
 * forward tiket ("siap", "meluncur ndan", dst.) berarti anggota itu menanggapi
 * dan menuju lokasi → "/tanggap", dan pelapor dikabari. Kata kunci lama
 * ("otw", "tiba", "selesai", "tunda <alasan>") tetap dikenali.
 * Nomor tiket diambil dari pesan yang di-reply, lalu balasan diterjemahkan
 * menjadi perintah grup biasa (mis. "/otw DEMO-261123-014") sehingga API
 * memakai validasi yang sama: nomor petugas terdaftar, role, transisi status,
 * dan kabar ke pelapor.
 */

const TICKET_NO = /\b([A-Z0-9]{2,12}-\d{6}-\d{3,6})\b/i;

type GroupAction = "otw" | "tiba" | "selesai" | "tunda" | "status";

const ACTION_PATTERNS: Array<[GroupAction, RegExp]> = [
  ["otw", /^(?:otw|on\s+the\s+way|meluncur|berangkat|menuju\s+tkp)\b/i],
  [
    "tiba",
    /^(?:tiba|sampai|(?:sudah|sdh|udah)\s+(?:di\s+)?(?:tkp|tiba|sampai)|di\s*tkp|tkp)\b/i
  ],
  ["selesai", /^(?:selesai|beres|clear|done)\b/i],
  ["tunda", /^tunda\b/i],
  ["status", /^status\b/i]
];

/** Pesan forward tiket dari bot selalu memuat baris "Pelapor:". */
function isTicketForward(quotedText: string): boolean {
  return /^Pelapor:/m.test(quotedText);
}

/** Nomor tiket pertama di teks pesan yang di-reply, atau null. */
export function ticketNoFromQuoted(quotedText: string | undefined): string | null {
  if (!quotedText) return null;
  const match = TICKET_NO.exec(quotedText);
  return match?.[1] ? match[1].toUpperCase() : null;
}

/**
 * Terjemahkan reply anggota menjadi perintah grup. Mengembalikan null bila
 * pesan bukan reply ke pesan tiket, atau bukan kata aksi yang dikenal —
 * obrolan biasa di grup tetap diabaikan seperti sebelumnya.
 */
export function replyToGroupCommand(
  text: string | undefined,
  quotedText: string | undefined
): string | null {
  const ticketNo = ticketNoFromQuoted(quotedText);
  if (!ticketNo) return null;
  const body = (text ?? "").trim().replace(/^\//, "").trim();
  if (!body) return null;

  for (const [action, pattern] of ACTION_PATTERNS) {
    const match = pattern.exec(body);
    if (!match) continue;
    let rest = body.slice(match[0].length).trim();
    // "/otw 014" sebagai reply: nomor pendek di belakang diabaikan, karena
    // tiket sudah pasti dari pesan yang di-reply.
    rest = rest.replace(/^#?(?:[A-Z0-9]{2,12}-\d{6}-)?\d{1,6}\b/i, "").trim();
    rest = rest.replace(/^[-:,.]\s*/, "").trim();
    return [`/${action}`, ticketNo, rest].filter(Boolean).join(" ");
  }
  // Balasan bebas ke forward tiket = menanggapi (menuju lokasi). Reply ke
  // pesan status bot (mis. "🚓 ... sedang jalan ke TKP") tetap diabaikan.
  if (quotedText && isTicketForward(quotedText) && !body.startsWith("/")) {
    return ["/tanggap", ticketNo, body].join(" ");
  }
  return null;
}
