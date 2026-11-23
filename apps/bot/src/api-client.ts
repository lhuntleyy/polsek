import type { NormalizedInbound } from "./types.js";

export interface OutboxItem {
  id: string;
  targetJid: string;
  kind: string;
  payload: {
    text?: string;
    mediaId?: string;
    mime?: string;
    kind?: "image" | "video" | "audio";
    caption?: string;
  };
  attempts: number;
}

export interface OutboxResult {
  ok: boolean;
  error?: string;
}

export interface MediaUploadInput {
  buffer: Buffer;
  mime: string;
  filename: string;
  kind: "image" | "video" | "audio";
  reporterId?: string | null;
  waChatJid?: string | null;
  waMessageId?: string | null;
  durationS?: number | null;
  caption?: string | null;
  thumb?: Buffer | null;
  exifGps?: { lat: number; lng: number } | null;
}

export interface MediaUploadResult {
  ok: boolean;
  media: { id: string; kind: string; size: number; sha256: string };
}

export type GatewayCommand = "connect" | "disconnect" | "logout" | "restart";

export interface GatewayControl {
  command: {
    id: string;
    command: GatewayCommand;
    requestedAt: string | null;
  } | null;
}

export class BotApi {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-sigap-internal-token": this.token,
        ...(init.headers ?? {})
      },
      signal: AbortSignal.timeout(15_000)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`API ${response.status}: ${text || response.statusText}`);
    }
    return (text ? JSON.parse(text) : {}) as T;
  }

  postInbound(payload: NormalizedInbound): Promise<{ ok: boolean; duplicate?: boolean; replies?: number }> {
    return this.request("/internal/wa/inbound", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  postGroupCommand(payload: {
    waMessageId: string;
    groupJid: string;
    senderJid: string;
    text: string;
    mediaIds?: string[];
    timestamp: string;
  }): Promise<{ ok: boolean; duplicate?: boolean; replies?: number }> {
    return this.request("/internal/wa/group-command", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async uploadMedia(input: MediaUploadInput): Promise<MediaUploadResult> {
    let lastError: unknown;
    // Lebih toleran terhadap API yang sedang restart (±30 detik total).
    const attempts = 5;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.postMedia(input);
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async postMedia(input: MediaUploadInput): Promise<MediaUploadResult> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(input.buffer)], { type: input.mime }), input.filename);
    form.append("mime", input.mime);
    form.append("kind", input.kind);
    if (input.reporterId) form.append("reporterId", input.reporterId);
    if (input.waChatJid) form.append("waChatJid", input.waChatJid);
    if (input.waMessageId) form.append("waMessageId", input.waMessageId);
    if (input.durationS !== null && input.durationS !== undefined) {
      form.append("durationS", String(input.durationS));
    }
    if (input.caption) form.append("caption", input.caption);
    if (input.exifGps) {
      form.append("exifLat", String(input.exifGps.lat));
      form.append("exifLng", String(input.exifGps.lng));
    }
    if (input.thumb && input.thumb.length > 0) {
      form.append("thumb", new Blob([new Uint8Array(input.thumb)], { type: "image/jpeg" }), "thumb.jpg");
    }

    const response = await fetch(`${this.baseUrl}/internal/media`, {
      method: "POST",
      headers: { "x-sigap-internal-token": this.token },
      body: form,
      signal: AbortSignal.timeout(120_000)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`API ${response.status}: ${text || response.statusText}`);
    }
    return (text ? JSON.parse(text) : {}) as MediaUploadResult;
  }

  postStatus(payload: {
    status: "disconnected" | "connecting" | "qr" | "connected";
    qr?: string | null;
    phone?: string | null;
    error?: string | null;
  }): Promise<{ ok: boolean }> {
    return this.request("/internal/wa/status", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  getControl(): Promise<GatewayControl> {
    return this.request("/internal/wa/control");
  }

  ackControl(id: string): Promise<{ ok: boolean }> {
    return this.request("/internal/wa/control/ack", {
      method: "POST",
      body: JSON.stringify({ id })
    });
  }

  postQr(payload: { qrDataUrl: string; expiresAt: string }): Promise<{ ok: boolean }> {
    return this.request("/internal/wa/qr", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  pollOutbox(limit = 20): Promise<{ items: OutboxItem[] }> {
    return this.request(`/internal/outbox?limit=${limit}`);
  }

  async fetchMedia(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const response = await fetch(
      `${this.baseUrl}/internal/media/${encodeURIComponent(id)}`,
      {
        headers: { "x-sigap-internal-token": this.token },
        signal: AbortSignal.timeout(120_000)
      }
    );
    if (!response.ok) {
      throw new Error(`Media API ${response.status}: ${await response.text()}`);
    }
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mime: response.headers.get("content-type")?.split(";")[0] ?? "application/octet-stream"
    };
  }

  postOutboxResult(id: string, result: OutboxResult): Promise<{ ok: boolean }> {
    return this.request(`/internal/outbox/${encodeURIComponent(id)}/result`, {
      method: "POST",
      body: JSON.stringify(result)
    });
  }
}
