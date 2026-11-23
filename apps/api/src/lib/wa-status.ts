import { STATUS_META, type TicketStatus } from "@sigap/core";
import { decryptPhone } from "./crypto.js";

/**
 * Ubah nomor telepon pelapor menjadi JID WhatsApp.
 */
export function phoneJid(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
  return `${digits}@s.whatsapp.net`;
}

export function resolveReporterJid(
  reporter: { waJid?: string | null; phoneEnc: string },
  phoneKey: string
): string | null {
  if (reporter.waJid && reporter.waJid.includes("@")) {
    return reporter.waJid;
  }
  try {
    const phone = decryptPhone(reporter.phoneEnc, phoneKey);
    const digits = phone.replace(/\D/g, "").replace(/^0/, "62");
    return digits ? `${digits}@s.whatsapp.net` : null;
  } catch {
    return null;
  }
}

function statusLabel(status: TicketStatus): string {
  return STATUS_META[status]?.label ?? status;
}

/**
 * Pesan status untuk pelapor. Bahasa dibuat operasional supaya warga paham
 * tanpa istilah internal seperti "OTW" atau "DI TKP".
 */
export function reporterStatusMessage(
  ticketNo: string,
  status: TicketStatus,
  note?: string | null,
  officerName?: string | null
): string {
  const prefix = `Status pelaporan dengan nomor tiket ${ticketNo}`;
  const by = officerName ? ` oleh ${officerName}` : "";
  switch (status) {
    case "diterima":
      return `Laporan dengan nomor tiket ${ticketNo} sudah diterima petugas${by}. Mohon tunggu, tim akan menindaklanjuti.`;
    case "otw":
      return officerName
        ? `${prefix}: petugas ${officerName} sedang jalan ke TKP.`
        : `${prefix} sedang jalan ke TKP.`;
    case "ditkp":
      return officerName
        ? `${prefix}: petugas ${officerName} sudah tiba di TKP.`
        : `${prefix} sudah tiba di TKP.`;
    case "selesai":
      return `${prefix} sudah selesai ditangani${by}.${note ? `\nCatatan: ${note}` : ""}`;
    case "ditunda":
      return `${prefix} ditunda.${note ? `\nAlasan: ${note}` : ""}`;
    case "ditolak":
      return `${prefix} ditolak.${note ? `\nAlasan: ${note}` : ""}`;
    case "dibatalkan":
      return `${prefix} dibatalkan.`;
    default:
      return `${prefix} diperbarui menjadi ${statusLabel(status)}.`;
  }
}

/**
 * Ringkasan status untuk grup URC. Lebih singkat daripada pesan pelapor,
 * tetapi tetap memakai bahasa yang jelas. Nama petugas (pangkat + nama dari
 * menu Petugas) ditampilkan supaya grup tahu siapa yang bergerak.
 */
export function groupStatusMessage(
  ticketNo: string,
  status: TicketStatus,
  note?: string | null,
  mediaCount = 0,
  officerName?: string | null
): string {
  const suffix = mediaCount > 0 ? ` · ${mediaCount} media terlampir` : "";
  const who = officerName ? `*${officerName}*` : "petugas";
  const by = officerName ? ` oleh *${officerName}*` : "";
  switch (status) {
    case "diterima":
      return `${ticketNo} — diterima${by}.${suffix}`;
    case "otw":
      return `🚓 ${ticketNo} — ${who} sedang jalan ke TKP.${suffix}`;
    case "ditkp":
      return `📍 ${ticketNo} — ${who} sudah tiba di TKP.${suffix}`;
    case "selesai":
      return `✅ ${ticketNo} — selesai ditangani${by}.${note ? ` Catatan: ${note}` : ""}${suffix}`;
    case "ditunda":
      return `${ticketNo} — ditunda${by}.${note ? ` Alasan: ${note}` : ""}${suffix}`;
    case "ditolak":
      return `${ticketNo} — ditolak.${note ? ` Alasan: ${note}` : ""}${suffix}`;
    case "dibatalkan":
      return `${ticketNo} — dibatalkan.${suffix}`;
    default:
      return `${ticketNo} — ${statusLabel(status)}.${suffix}`;
  }
}
