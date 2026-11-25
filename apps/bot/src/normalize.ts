import {
  extractMessageContent,
  jidNormalizedUser,
  type WAMessage
} from "@whiskeysockets/baileys";
import type { NormalizedInbound } from "./types.js";

function normalizeJidValue(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return jidNormalizedUser(trimmed) || trimmed;
}

export function normalizeMessage(message: WAMessage): NormalizedInbound | null {
  if (message.key.fromMe) return null;
  const rawChatJid = message.key.remoteJid;
  if (!rawChatJid) return null;
  if (
    rawChatJid === "status@broadcast" ||
    rawChatJid.endsWith("@broadcast") ||
    rawChatJid.endsWith("@newsletter")
  ) {
    return null;
  }

  const content = extractMessageContent(message.message);
  if (!content) return null;

  const isGroup = rawChatJid.endsWith("@g.us");
  // Utamakan JID nomor telepon (@s.whatsapp.net) daripada LID (@lid), supaya
  // balasan, registry pelapor, dan validasi JID petugas tetap cocok.
  const preferPhoneJid = (
    ...values: Array<string | null | undefined>
  ): string | undefined => {
    const normalized = values.map(normalizeJidValue).filter(Boolean);
    return (
      normalized.find((value) => value.endsWith("@s.whatsapp.net")) ??
      normalized[0] ??
      undefined
    );
  };
  const chatJid = isGroup
    ? normalizeJidValue(rawChatJid)
    : preferPhoneJid(message.key.remoteJidAlt, rawChatJid) ?? normalizeJidValue(rawChatJid);
  const senderJid =
    preferPhoneJid(message.key.participant, message.key.participantAlt) ?? chatJid;
  const text =
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    content.buttonsResponseMessage?.selectedDisplayText ??
    content.listResponseMessage?.title ??
    undefined;

  // Teks pesan yang di-reply (dipakai untuk aksi tiket "by reply" di grup URC).
  const contextInfo =
    content.extendedTextMessage?.contextInfo ??
    content.imageMessage?.contextInfo ??
    content.videoMessage?.contextInfo ??
    undefined;
  const quoted = contextInfo?.quotedMessage
    ? extractMessageContent(contextInfo.quotedMessage)
    : undefined;
  const quotedText =
    quoted?.conversation ??
    quoted?.extendedTextMessage?.text ??
    quoted?.imageMessage?.caption ??
    quoted?.videoMessage?.caption ??
    quoted?.documentMessage?.caption ??
    undefined;

  const location =
    content.locationMessage ?? content.liveLocationMessage ?? null;

  let type: NormalizedInbound["type"] = "unknown";
  if (location) type = "location";
  else if (content.imageMessage) type = "image";
  else if (content.videoMessage) type = "video";
  else if (content.audioMessage) type = "audio";
  else if (text) type = "text";

  if (isGroup && type !== "text" && type !== "image") return null;
  if (type === "unknown" && !isGroup) {
    // Still forward unknown 1:1 messages so the API can reply with guidance.
    type = "unknown";
  }

  const waMessageId = message.key.id;
  if (!waMessageId) return null;

  const rawTimestamp = Number(message.messageTimestamp ?? 0);
  const timestamp =
    rawTimestamp > 0
      ? new Date(rawTimestamp * 1000).toISOString()
      : new Date().toISOString();

  return {
    waMessageId,
    chatJid,
    senderJid,
    senderName: message.pushName ?? undefined,
    isGroup,
    type,
    text: text?.trim() ? text.trim() : undefined,
    ...(quotedText?.trim() ? { quotedText: quotedText.trim() } : {}),
    location: location
      ? {
          lat: Number(location.degreesLatitude),
          lng: Number(location.degreesLongitude),
          accuracyM:
            "accuracyInMeters" in location && location.accuracyInMeters !== null
              ? Number(location.accuracyInMeters)
              : undefined
        }
      : undefined,
    timestamp
  };
}
