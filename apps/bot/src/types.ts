export interface NormalizedInbound {
  waMessageId: string;
  chatJid: string;
  senderJid: string;
  senderName?: string;
  isGroup: boolean;
  type: "text" | "location" | "image" | "video" | "audio" | "unknown";
  text?: string;
  /** Teks pesan yang di-reply, bila pesan ini adalah reply. */
  quotedText?: string;
  location?: { lat: number; lng: number; accuracyM?: number };
  mediaIds?: string[];
  mediaError?: string;
  timestamp: string;
}
