import type { WASocket } from "@whiskeysockets/baileys";
import type { BotApi } from "./api-client.js";
import type { BotLogger } from "./logger.js";
import { audioLabel, buildMediaContent } from "./media-content.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startOutboxWorker(
  api: BotApi,
  getSocket: () => WASocket | null,
  logger: BotLogger,
  intervalMs = 1500
): () => void {
  let running = false;

  const tick = async () => {
    if (running) return;
    const socket = getSocket();
    if (!socket) return;
    running = true;
    try {
      // Batch kecil agar seluruh batch selesai jauh sebelum lease API habis.
      const { items } = await api.pollOutbox(5);
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        const activeSocket = getSocket();
        if (!activeSocket) {
          try {
            await api.postOutboxResult(item.id, { ok: false, error: "socket_disconnected" });
          } catch {
            // ignore
          }
          continue;
        }

        let sent = false;
        try {
          if (item.kind === "media") {
            if (!item.payload.mediaId) {
              throw new Error("Payload media tanpa mediaId");
            }
            const media = await api.fetchMedia(item.payload.mediaId);
            const kind = item.payload.kind ?? "image";
            const content = buildMediaContent(kind, media.buffer, media.mime, item.payload.caption);
            await activeSocket.sendMessage(
              item.targetJid,
              content as Parameters<WASocket["sendMessage"]>[1]
            );
            if (kind === "audio") {
              const label = audioLabel(item.payload.caption);
              if (label) {
                try {
                  await activeSocket.sendMessage(item.targetJid, { text: label });
                } catch (labelError) {
                  // Audio sudah terkirim; jangan gagalkan item (mencegah voice note dobel).
                  logger.warn({ id: item.id, err: labelError }, "Label voice note gagal dikirim");
                }
              }
            }
          } else {
            const text = item.payload?.text;
            if (!text) throw new Error(`Payload ${item.kind} belum didukung`);
            await activeSocket.sendMessage(item.targetJid, { text });
          }
          sent = true;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn({ id: item.id, err: message }, "Gagal mengirim pesan");
          try {
            await api.postOutboxResult(item.id, { ok: false, error: message });
          } catch (reportError) {
            logger.warn({ err: reportError }, "Gagal melaporkan hasil outbox");
          }
        }

        if (sent) {
          try {
            await api.postOutboxResult(item.id, { ok: true });
            logger.info({ id: item.id, target: item.targetJid }, "Pesan terkirim");
          } catch (reportError) {
            logger.warn(
              { id: item.id, err: reportError },
              "Pesan terkirim tetapi gagal melapor status ke API"
            );
          }
          if (index < items.length - 1) {
            await sleep(350 + Math.floor(Math.random() * 250));
          }
        }
      }
    } catch (error) {
      logger.warn({ err: error }, "Polling outbox gagal");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  void tick();
  return () => clearInterval(timer);
}
