import { chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  extractMessageContent,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type WAMessage,
  type WASocket
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import type { AppConfig } from "@sigap/config";
import type { BotApi, GatewayCommand } from "./api-client.js";
import type { BotLogger } from "./logger.js";
import { InboundQueue } from "./inbound-queue.js";
import { normalizeMessage } from "./normalize.js";
import type { NormalizedInbound } from "./types.js";

interface PendingMedia {
  buffer: Buffer;
  mime: string;
  kind: "image" | "video" | "audio";
  filename: string;
  durationS: number | null;
  thumb: Buffer | null;
  caption: string | null;
}

function mediaExtension(mime: string, fallback: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "video/quicktime": "mov",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/amr": "amr"
  };
  return map[mime] ?? fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_AV_BYTES = 64 * 1024 * 1024;

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private connecting = false;
  private connected = false;
  private stopped = false;
  private sessionInvalid = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly inbound: InboundQueue;

  constructor(
    private readonly config: AppConfig,
    private readonly api: BotApi,
    private readonly logger: BotLogger
  ) {
    // Antrean di samping folder sesi (mis. /var/lib/sigap/bot-queue).
    const queueDir = join(dirname(config.botAuthDir), "bot-queue");
    mkdirSync(queueDir, { recursive: true, mode: 0o700 });
    this.inbound = new InboundQueue(
      queueDir,
      async (job) => {
        if (job.kind === "group") {
          await this.api.postGroupCommand(job.payload as Parameters<BotApi["postGroupCommand"]>[0]);
        } else {
          await this.api.postInbound(job.payload as NormalizedInbound);
        }
      },
      logger.child({ module: "inbound-queue" })
    );
  }

  get pendingInbound(): number {
    return this.inbound.pending;
  }

  getSocket(): WASocket | null {
    return this.socket;
  }

  getReadySocket(): WASocket | null {
    return this.connected ? this.socket : null;
  }

  private get credsPath(): string {
    return join(this.config.botAuthDir, "creds.json");
  }

  private prepareAuthDir(): void {
    mkdirSync(this.config.botAuthDir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.config.botAuthDir, 0o700);
    } catch {
      // Windows/FS may not support POSIX modes.
    }
  }

  async start(): Promise<void> {
    this.prepareAuthDir();
    this.inbound.recover();
    if (existsSync(this.credsPath) && !this.sessionInvalid) {
      await this.connect();
    } else {
      await this.safeStatus({ status: "disconnected", error: "waiting_for_pairing" });
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.inbound.stop();
    this.connected = false;
    this.clearReconnect();
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // ignore
      }
      this.socket = null;
    }
    await this.safeStatus({ status: "disconnected", error: "stopped" });
  }

  async handleCommand(command: GatewayCommand): Promise<void> {
    if (command === "connect") {
      this.stopped = false;
      await this.connect();
      return;
    }
    if (command === "disconnect") {
      await this.disconnect("dashboard_disconnect");
      return;
    }
    if (command === "logout") {
      await this.logout();
      return;
    }
    if (command === "restart") {
      await this.disconnect("restarting");
      this.stopped = false;
      await this.connect();
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async disconnect(reason: string): Promise<void> {
    this.stopped = true;
    this.connected = false;
    this.clearReconnect();
    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch {
        // ignore
      }
      this.socket = null;
    }
    await this.safeStatus({ status: "disconnected", error: reason });
  }

  async logout(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    this.sessionInvalid = true;
    this.clearReconnect();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        await Promise.race([
          socket.logout(),
          new Promise((resolve) => setTimeout(resolve, 5_000))
        ]);
      } catch {
        // Best-effort; local session files are removed below.
      }
      try {
        socket.end(undefined);
      } catch {
        // ignore
      }
    }
    rmSync(this.config.botAuthDir, { recursive: true, force: true });
    this.prepareAuthDir();
    this.sessionInvalid = false;
    await this.safeStatus({ status: "disconnected", error: "logged_out" });
  }

  private async safeStatus(payload: {
    status: "disconnected" | "connecting" | "qr" | "connected";
    qr?: string | null;
    phone?: string | null;
    error?: string | null;
  }): Promise<void> {
    try {
      await this.api.postStatus(payload);
    } catch (error) {
      this.logger.warn({ err: error }, "Gagal mengirim status gateway ke API");
    }
  }

  private async downloadWithRetry(
    socket: WASocket,
    message: WAMessage,
    attempts = 3
  ): Promise<Buffer> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await downloadMediaMessage(message, "buffer", {}, {
          logger: this.logger.child({ module: "media" }, { level: "warn" }),
          reuploadRequest: socket.updateMediaMessage
        });
      } catch (error) {
        lastError = error;
        if (attempt < attempts) await sleep(attempt * 1000);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async readMedia(socket: WASocket, message: WAMessage): Promise<PendingMedia | null> {
    const content = extractMessageContent(message.message);
    if (!content) return null;

    let kind: PendingMedia["kind"];
    let mime: string;
    let caption: string | null = null;
    let durationS: number | null = null;
    let thumb: Buffer | null = null;
    let declaredLength = 0;

    if (content.imageMessage) {
      kind = "image";
      mime = content.imageMessage.mimetype ?? "image/jpeg";
      caption = content.imageMessage.caption ?? null;
      declaredLength = content.imageMessage.fileLength
        ? Number(content.imageMessage.fileLength)
        : 0;
    } else if (content.videoMessage) {
      kind = "video";
      mime = content.videoMessage.mimetype ?? "video/mp4";
      caption = content.videoMessage.caption ?? null;
      declaredLength = content.videoMessage.fileLength
        ? Number(content.videoMessage.fileLength)
        : 0;
      thumb = content.videoMessage.jpegThumbnail
        ? Buffer.from(content.videoMessage.jpegThumbnail)
        : null;
    } else if (content.audioMessage) {
      kind = "audio";
      mime = content.audioMessage.mimetype ?? "audio/ogg";
      durationS = content.audioMessage.seconds ? Number(content.audioMessage.seconds) : null;
      declaredLength = content.audioMessage.fileLength
        ? Number(content.audioMessage.fileLength)
        : 0;
    } else {
      return null;
    }

    const limit = kind === "image" ? MAX_IMAGE_BYTES : MAX_AV_BYTES;
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      const limitMb = Math.round(limit / (1024 * 1024));
      throw new Error(`Ukuran media melebihi batas ${limitMb} MB`);
    }

    const unwrappedMessage: WAMessage = { ...message, message: content };
    const buffer = await this.downloadWithRetry(socket, unwrappedMessage);
    const id = message.key.id ?? "media";
    return {
      buffer,
      mime,
      kind,
      filename: `${id}.${mediaExtension(mime, "bin")}`,
      durationS,
      thumb,
      caption
    };
  }

  private async uploadMessageMedia(
    socket: WASocket,
    message: WAMessage,
    normalized: NormalizedInbound
  ): Promise<string[]> {
    const media = await this.readMedia(socket, message);
    if (!media) return [];
    const result = await this.api.uploadMedia({
      buffer: media.buffer,
      mime: media.mime,
      kind: media.kind,
      filename: media.filename,
      waChatJid: normalized.chatJid,
      waMessageId: normalized.waMessageId,
      durationS: media.durationS,
      caption: media.caption,
      thumb: media.thumb
    });
    return [result.media.id];
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.socket || this.connecting) return;
    this.connecting = true;
    try {
      if (this.sessionInvalid) {
        rmSync(this.config.botAuthDir, { recursive: true, force: true });
        this.prepareAuthDir();
        this.sessionInvalid = false;
      }
      await this.safeStatus({ status: "connecting" });
      const { state, saveCreds } = await useMultiFileAuthState(this.config.botAuthDir);
      const { version } = await fetchLatestBaileysVersion();
      if (this.stopped) return;

      const socket = makeWASocket({
        version,
        auth: state,
        logger: this.logger.child({ module: "baileys" }, { level: "warn" }) as never,
        printQRInTerminal: false,
        browser: Browsers.macOS("Desktop"),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        defaultQueryTimeoutMs: 60_000
      });
      this.socket = socket;

      socket.ev.on("creds.update", saveCreds);

      socket.ev.on("connection.update", (update) => {
        if (this.socket !== socket) return;
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          const expiresAt = new Date(Date.now() + 90_000).toISOString();
          void QRCode.toDataURL(qr, {
            width: 360,
            margin: 1,
            errorCorrectionLevel: "M"
          })
            .then((qrDataUrl) => this.api.postQr({ qrDataUrl, expiresAt }))
            .then(() => this.logger.info("QR pairing tersedia di dashboard"))
            .catch((error: unknown) =>
              this.logger.warn({ err: error }, "Gagal mengirim QR ke dashboard")
            );
        }

        if (connection === "open") {
          this.connected = true;
          this.reconnectAttempts = 0;
          const rawId = socket.user?.id ?? "";
          const phone = rawId.split(":")[0]?.split("@")[0] ?? null;
          this.logger.info({ phone }, "WhatsApp terhubung");
          void this.safeStatus({ status: "connected", phone });
        }

        if (connection === "close") {
          this.connected = false;
          this.socket = null;
          const statusCode = (
            lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
          )?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const message = lastDisconnect?.error?.message ?? "koneksi terputus";
          this.logger.warn({ statusCode, loggedOut, message }, "WhatsApp terputus");
          void this.safeStatus({
            status: "disconnected",
            error: loggedOut ? "logged_out" : message
          });

          if (loggedOut) {
            this.sessionInvalid = true;
            this.logger.error(
              "Sesi WhatsApp logout. Hubungkan ulang dari dashboard untuk pairing nomor baru."
            );
            return;
          }
          this.scheduleReconnect();
        }
      });

      socket.ev.on("messages.upsert", (event) => {
        if (event.type !== "notify") return;
        for (const message of event.messages) {
          let normalized: ReturnType<typeof normalizeMessage>;
          try {
            normalized = normalizeMessage(message);
          } catch (error) {
            this.logger.error({ err: error }, "Gagal membaca pesan WhatsApp");
            continue;
          }
          if (!normalized) continue;
          if (normalized.isGroup && !normalized.text?.startsWith("/")) continue;
          const current = normalized;
          // Diproses berurutan per chat dan disimpan ke disk sebelum dikirim
          // ke API, sehingga tidak hilang saat API restart dan tidak tertukar urutannya.
          void this.inbound.enqueue(current.chatJid, async () => {
            const normalized = current;
            const groupCompletionPhoto =
              normalized.isGroup && /^\/selesai\b/i.test(normalized.text ?? "");
            const hasMedia =
              normalized.type === "image" ||
              normalized.type === "video" ||
              normalized.type === "audio";
            let mediaIds: string[] | undefined;
            let mediaError: string | undefined;

            if (hasMedia && (!normalized.isGroup || groupCompletionPhoto)) {
              try {
                mediaIds = await this.uploadMessageMedia(socket, message, normalized);
              } catch (error) {
                mediaError = (error instanceof Error ? error.message : String(error)).slice(0, 480);
                this.logger.warn(
                  { err: error, messageId: normalized.waMessageId },
                  "Gagal mengunggah media WhatsApp"
                );
              }
            }

            if (normalized.isGroup) {
              return {
                kind: "group" as const,
                chatKey: normalized.chatJid,
                payload: {
                  waMessageId: normalized.waMessageId,
                  groupJid: normalized.chatJid,
                  senderJid: normalized.senderJid,
                  text: normalized.text ?? "",
                  ...(mediaIds?.length ? { mediaIds } : {}),
                  timestamp: normalized.timestamp
                }
              };
            }

            return {
              kind: "inbound" as const,
              chatKey: normalized.chatJid,
              payload: {
                ...normalized,
                ...(mediaIds?.length ? { mediaIds } : {}),
                ...(mediaError ? { mediaError } : {})
              }
            };
          });
        }
      });
    } catch (error) {
      this.connected = false;
      this.socket = null;
      this.logger.error({ err: error }, "Gagal membuat koneksi WhatsApp");
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(60_000, 2_000 * 2 ** Math.min(this.reconnectAttempts, 5));
    this.logger.info({ delay, attempt: this.reconnectAttempts }, "Reconnect WhatsApp");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }
}
