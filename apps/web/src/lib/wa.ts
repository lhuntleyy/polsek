/**
 * Helper input JID untuk dashboard.
 *
 * Petugas cukup mengetik nomor WhatsApp (0812..., 62812..., +62...)
 * atau ID grup (angka panjang). JID internal WhatsApp dibuat otomatis:
 * - personal : <angka>@s.whatsapp.net
 * - grup     : <angka>@g.us
 *
 * Kalau petugas sudah punya JID lengkap, nilainya dipakai apa adanya.
 */
export function toWhatsAppJid(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits ? `${digits}@s.whatsapp.net` : "";
}

export function toWhatsAppGroupJid(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@g.us` : "";
}

export function looksLikeJid(value: string): boolean {
  return /@(s\.whatsapp\.net|g\.us)$/i.test(value.trim());
}
