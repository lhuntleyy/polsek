export function normalizePhone(input: string): string {
  let digits = String(input).replace(/\D/g, "");
  if (digits.startsWith("62")) digits = `0${digits.slice(2)}`;
  if (digits && !digits.startsWith("0")) digits = `0${digits}`;
  return digits;
}

export function isValidPhone(input: string): boolean {
  return /^08\d{8,12}$/.test(normalizePhone(input));
}

export function maskPhone(input: string): string {
  const phone = normalizePhone(input);
  if (phone.length < 8) return "••••";
  return `${phone.slice(0, 4)}•••••${phone.slice(-3)}`;
}

export function initials(name: string): string {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * Terima nomor apa pun yang lazim diketik petugas:
 * 0812..., 62812..., +62 812..., atau JID lengkap.
 * Hasilnya selalu JID WhatsApp personal.
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

/**
 * ID grup WhatsApp biasanya berupa deretan angka panjang.
 * Terima angka saja, atau JID lengkap; hasilnya JID grup.
 */
export function toWhatsAppGroupJid(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return `${digits}@g.us`;
}

export function isWhatsAppJid(value: string): boolean {
  return /^\d{8,20}@s\.whatsapp\.net$/.test(value);
}

export function isWhatsAppGroupJid(value: string): boolean {
  return /^\d{8,24}@g\.us$/.test(value);
}

export function stripWhatsAppDevice(jid: string): string {
  const trimmed = String(jid ?? "").trim();
  if (!trimmed) return "";
  const atIndex = trimmed.indexOf("@");
  if (atIndex === -1) return trimmed.replace(/:\d+$/, "");
  const local = trimmed.slice(0, atIndex).replace(/:\d+$/, "");
  const domain = trimmed.slice(atIndex).toLowerCase();
  return `${local}${domain}`;
}

