import { maskPhone } from "@sigap/core";
import { decryptPhone } from "./crypto.js";

/** Label untuk pelapor yang hanya dikenal lewat LID WhatsApp (bukan nomor telepon). */
export const UNVERIFIED_PHONE_LABEL = "nomor tidak diketahui (LID WA)";

/**
 * Tampilan nomor pelapor yang aman dipakai di dashboard, grup, dan export.
 * Pelapor LID tidak punya nomor telepon asli: angka LID tidak boleh
 * ditampilkan seolah-olah nomor yang bisa ditelepon.
 */
export function reporterPhoneDisplay(
  reporter: { phoneEnc: string; phoneVerified?: boolean | null },
  phoneKey: string,
  mask: boolean
): string {
  if (reporter.phoneVerified === false) return UNVERIFIED_PHONE_LABEL;
  try {
    const phone = decryptPhone(reporter.phoneEnc, phoneKey);
    return mask ? maskPhone(phone) : phone;
  } catch {
    return "••••";
  }
}

export function isLidJid(jid: string | null | undefined): boolean {
  return Boolean(jid && jid.toLowerCase().endsWith("@lid"));
}
