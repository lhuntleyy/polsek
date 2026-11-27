/**
 * Susun konten Baileys untuk mengirim media dari outbox.
 *
 * Voice note WhatsApp (PTT) wajib dikirim dengan mimetype persis
 * "audio/ogg; codecs=opus". API menyajikan file dengan content-type
 * "audio/ogg" (parameter codecs hilang), dan bila dikirim apa adanya sebagai
 * PTT, voice note gagal terkirim/tidak bisa diputar di grup. Audio format lain
 * (mp3, m4a, aac, amr, wav) dikirim sebagai file audio biasa, bukan PTT.
 */

export type OutboxMediaKind = "image" | "video" | "audio";

export type MediaContent =
  | { image: Buffer; mimetype: string; caption?: string }
  | { video: Buffer; mimetype: string; caption?: string }
  | { audio: Buffer; mimetype: string; ptt: boolean };

const VOICE_NOTE_MIME = "audio/ogg; codecs=opus";

export function isVoiceNoteMime(mime: string): boolean {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return base === "audio/ogg" || base === "audio/opus";
}

export function buildMediaContent(
  kind: OutboxMediaKind,
  buffer: Buffer,
  mime: string,
  caption?: string
): MediaContent {
  const text = caption?.slice(0, 1000);
  if (kind === "video") return { video: buffer, mimetype: mime, caption: text };
  if (kind === "audio") {
    return isVoiceNoteMime(mime)
      ? { audio: buffer, mimetype: VOICE_NOTE_MIME, ptt: true }
      : { audio: buffer, mimetype: mime, ptt: false };
  }
  return { image: buffer, mimetype: mime, caption: text };
}

/**
 * Audio tidak bisa membawa caption di WhatsApp. Label ini dikirim terpisah
 * setelah audio supaya grup tahu voice note milik tiket mana (dan bisa
 * di-reply OTW/TIBA/SELESAI karena memuat nomor tiket).
 */
export function audioLabel(caption: string | undefined): string | null {
  const text = caption?.trim();
  return text ? `🎙️ Voice note · ${text.slice(0, 1000)}` : null;
}
