import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  handleGroupCommand,
  handleInbound,
  enqueueConversationReplies
} from "../bot/conversation.js";
import { outboundMessages, reporters } from "../db/schema.js";
import { hashPhone } from "../lib/crypto.js";
import { badRequest, notFound } from "../lib/errors.js";
import {
  getMediaRow,
  mediaFilePath,
  stageMedia,
  type GpsPoint,
  type MediaKind
} from "../lib/media.js";
import { readSettings, writeSettings } from "../lib/settings.js";

const inboundSchema = z
  .object({
    waMessageId: z.string().min(1).max(200),
    chatJid: z.string().min(3).max(200),
    // participant bisa kosong untuk chat 1:1 LID; fallback ke chatJid di route.
    senderJid: z.string().max(200).optional(),
    // Payload berasal dari bot internal yang sudah terautentikasi. Beberapa
    // versi Baileys mengirim pushName/type/timestamp dengan tipe yang sedikit
    // berbeda; normalisasi di sini agar pesan warga tidak hilang karena 400.
    senderName: z.coerce.string().max(200).optional(),
    isGroup: z.boolean().default(false),
    type: z
      .enum(["text", "location", "image", "video", "audio", "unknown"])
      .catch("unknown"),
    text: z.coerce.string().max(8000).optional(),
    location: z
      .object({
        lat: z.coerce.number().finite().min(-90).max(90),
        lng: z.coerce.number().finite().min(-180).max(180),
        accuracyM: z.coerce.number().finite().nonnegative().max(5000).optional()
      })
      .optional(),
    mediaIds: z.array(z.string().min(8).max(80)).max(10).optional(),
    mediaError: z.coerce.string().max(500).optional(),
    timestamp: z.unknown().optional()
  })
  .refine((value) => value.type !== "location" || Boolean(value.location), {
    message: "Pesan location harus membawa koordinat"
  });

const groupCommandSchema = z.object({
  waMessageId: z.string().min(1).max(200),
  groupJid: z.string().min(3).max(200),
  senderJid: z.string().min(3).max(200),
  text: z.string().min(3).max(1000),
  mediaIds: z.array(z.string().min(8).max(80)).max(10).optional(),
  timestamp: z.string().datetime().optional()
});

const gatewaySchema = z.object({
  status: z.enum(["disconnected", "connecting", "qr", "connected"]),
  qr: z.string().max(10_000).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  error: z.string().max(1000).nullable().optional()
});

const controlAckSchema = z.object({
  id: z.string().uuid()
});

const qrSchema = z.object({
  qrDataUrl: z
    .string()
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, "QR harus PNG data URL")
    .max(200_000),
  expiresAt: z.string().datetime().optional()
});

const outboxResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().max(1000).optional()
});

function idempotentMessage(
  app: FastifyInstance,
  waMessageId: string,
  waJid: string
): boolean {
  const result = app.sqlite
    .prepare(
      "INSERT OR IGNORE INTO message_log (wa_message_id, direction, wa_jid, received_at) VALUES (?, 'inbound', ?, ?)"
    )
    .run(waMessageId, waJid, new Date().toISOString());
  return result.changes > 0;
}

export function registerInternalRoutes(app: FastifyInstance): void {
  app.post(
    "/internal/wa/inbound",
    { preHandler: app.requireInternal },
    async (request) => {
      const input = inboundSchema.parse(request.body);
      const senderJid =
        input.senderJid && input.senderJid.length >= 3
          ? input.senderJid
          : input.chatJid;
      const run = () => {
        if (!idempotentMessage(app, input.waMessageId, input.chatJid)) {
          return { duplicate: true as const };
        }
        const result = handleInbound(app, {
          ...input,
          senderJid,
          timestamp:
            typeof input.timestamp === "string"
              ? input.timestamp
              : new Date().toISOString()
        });
        enqueueConversationReplies(app, result.replies);
        return { duplicate: false as const, result };
      };
      const tx = app.sqlite.transaction(run);
      const outcome = app.sqlite.inTransaction ? tx() : tx.immediate();
      if (outcome.duplicate) {
        return { ok: true, duplicate: true };
      }
      outcome.result.afterCommit?.();
      return {
        ok: true,
        replies: outcome.result.replies.length,
        reason: outcome.result.reason ?? null
      };
    }
  );

  app.post(
    "/internal/wa/group-command",
    { preHandler: app.requireInternal },
    async (request) => {
      const input = groupCommandSchema.parse(request.body);
      const run = () => {
        if (!idempotentMessage(app, input.waMessageId, input.groupJid)) {
          return { duplicate: true as const };
        }
        const result = handleGroupCommand(app, {
          ...input,
          timestamp: input.timestamp ?? new Date().toISOString()
        });
        enqueueConversationReplies(app, result.replies);
        return { duplicate: false as const, result };
      };
      const tx = app.sqlite.transaction(run);
      const outcome = app.sqlite.inTransaction ? tx() : tx.immediate();
      if (outcome.duplicate) {
        return { ok: true, duplicate: true };
      }
      outcome.result.afterCommit?.();
      return {
        ok: true,
        replies: outcome.result.replies.length,
        reason: outcome.result.reason ?? null
      };
    }
  );

  app.post(
    "/internal/wa/status",
    // Dipanggil bot tiap 1-3 detik: jangan catat setiap request (banjir log
    // memperlambat proses dev dan menenggelamkan log penting).
    { preHandler: app.requireInternal, logLevel: "warn" },
    async (request) => {
      const input = gatewaySchema.parse(request.body);
      const patch: Parameters<typeof app.gateway.update>[0] = { status: input.status };
      if (input.qr !== undefined) patch.qr = input.qr;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.error !== undefined) patch.error = input.error;
      const gateway = app.gateway.update(patch);
      // Isi nomor unit sekali saat pairing berhasil, tanpa menimpa nomor resmi
      // yang sudah diisi admin.
      if (input.status === "connected" && input.phone) {
        const current = readSettings(app.db, app.config);
        if (!current.waNumber) {
          writeSettings(app.db, { wa_number: input.phone }, null);
        }
      }
      return { ok: true, gateway };
    }
  );

  app.get(
    "/internal/wa/control",
    // Dipanggil bot tiap 1-3 detik: jangan catat setiap request (banjir log
    // memperlambat proses dev dan menenggelamkan log penting).
    { preHandler: app.requireInternal, logLevel: "warn" },
    async () => {
      app.gateway.touchBot();
      return { command: app.gateway.pendingCommand() };
    }
  );

  app.post(
    "/internal/wa/control/ack",
    { preHandler: app.requireInternal },
    async (request) => {
      const input = controlAckSchema.parse(request.body);
      return { ok: app.gateway.ackCommand(input.id) };
    }
  );

  app.post(
    "/internal/wa/qr",
    { preHandler: app.requireInternal },
    async (request) => {
      const input = qrSchema.parse(request.body);
      const expiresAt =
        input.expiresAt ?? new Date(Date.now() + 90_000).toISOString();
      return {
        ok: true,
        gateway: app.gateway.update({
          status: "qr",
          qr: input.qrDataUrl,
          qrExpiresAt: expiresAt,
          error: null
        })
      };
    }
  );

  app.get(
    "/internal/media/:id",
    { preHandler: app.requireInternal },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const row = getMediaRow(app.db, id);
      if (!row) throw notFound("Media tidak ditemukan");
      const file = mediaFilePath(app.config, row, "original");
      if (!file) throw notFound("File media tidak ditemukan");
      reply
        .header("Content-Type", file.mime)
        .header("Content-Length", String(file.size))
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff");
      return reply.send(createReadStream(file.path));
    }
  );

  app.get(
    "/internal/outbox",
    // Dipanggil bot tiap 1-3 detik: jangan catat setiap request (banjir log
    // memperlambat proses dev dan menenggelamkan log penting).
    { preHandler: app.requireInternal, logLevel: "warn" },
    async (request) => {
      const query = z
        .object({ limit: z.coerce.number().int().min(1).max(50).default(20) })
        .parse(request.query);
      const now = new Date();
      const nowIso = now.toISOString();

      const run = () => {
        // Poison rows that exceeded max attempts must become dead rather than looping forever.
        app.sqlite
          .prepare(
            "UPDATE outbound_messages SET status = 'dead', last_error = COALESCE(last_error, 'max_attempts_exceeded'), next_attempt_at = NULL WHERE status = 'sending' AND next_attempt_at < ? AND attempts >= 8"
          )
          .run(nowIso);

        // Reclaim recoverable messages whose lease expired (bot crash/timeout).
        app.sqlite
          .prepare(
            "UPDATE outbound_messages SET status = 'pending' WHERE status = 'sending' AND next_attempt_at < ? AND attempts < 8"
          )
          .run(nowIso);

        const rows = app.db
          .select()
          .from(outboundMessages)
          .where(
            and(
              eq(outboundMessages.status, "pending"),
              or(
                isNull(outboundMessages.nextAttemptAt),
                lte(outboundMessages.nextAttemptAt, nowIso)
              )
            )
          )
          .orderBy(asc(outboundMessages.createdAt))
          .limit(query.limit)
          .all();

        const claimed = [];
        for (const row of rows) {
          const attempts = row.attempts + 1;
          app.db
            .update(outboundMessages)
            .set({
              status: "sending",
              attempts,
              // Lease: media (unduh + unggah video) bisa lama; lease terlalu pendek
              // membuat pesan diambil ulang dan terkirim dua kali.
              nextAttemptAt: new Date(
                now.getTime() + (row.kind === "media" ? 300_000 : 90_000)
              ).toISOString()
            })
            .where(eq(outboundMessages.id, row.id))
            .run();
          claimed.push({
            id: row.id,
            targetJid: row.targetJid,
            kind: row.kind,
            payload: JSON.parse(row.payloadJson) as unknown,
            attempts
          });
        }
        return claimed;
      };
      const tx = app.sqlite.transaction(run);
      const items = app.sqlite.inTransaction ? tx() : tx.immediate();
      return { items };
    }
  );

  app.post(
    "/internal/outbox/:id/result",
    { preHandler: app.requireInternal },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = outboxResultSchema.parse(request.body);
      const row = app.db
        .select()
        .from(outboundMessages)
        .where(eq(outboundMessages.id, id))
        .get();
      if (!row) throw notFound("Outbox tidak ditemukan");
      // Hasil yang datang terlambat tidak boleh menurunkan status pesan yang
      // sudah tercatat terkirim.
      if (row.status === "sent") return { ok: true, alreadySent: true };

      const now = new Date();
      if (input.ok) {
        app.db
          .update(outboundMessages)
          .set({ status: "sent", sentAt: now.toISOString(), lastError: null })
          .where(eq(outboundMessages.id, id))
          .run();
        return { ok: true };
      }

      const attempts = row.attempts;
      const dead = attempts >= 8;
      const backoffSeconds = Math.min(300, Math.max(5, 2 ** Math.min(attempts, 6) * 5));
      app.db
        .update(outboundMessages)
        .set({
          status: dead ? "dead" : "pending",
          lastError: input.error ?? "unknown",
          nextAttemptAt: dead
            ? null
            : new Date(now.getTime() + backoffSeconds * 1000).toISOString()
        })
        .where(eq(outboundMessages.id, id))
        .run();
      return { ok: true, dead, attempts };
    }
  );

  app.post("/internal/media", { preHandler: app.requireInternal }, async (request) => {
    if (!request.isMultipart()) throw badRequest("Gunakan multipart/form-data");
    const fields: Record<string, string> = {};
    let main: { buffer: Buffer; mime: string; filename: string | null } | null = null;
    let thumb: Buffer | null = null;

    for await (const part of request.parts()) {
      if (part.type === "file") {
        if (part.fieldname === "file" && !main) {
          main = {
            buffer: await part.toBuffer(),
            mime: part.mimetype,
            filename: part.filename ?? null
          };
        } else if (part.fieldname === "thumb" && !thumb) {
          thumb = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      } else {
        fields[part.fieldname] = String(part.value ?? "");
      }
    }

    if (!main) throw badRequest("File media wajib dikirim pada field 'file'");
    const kindValue = fields.kind;
    const kind: MediaKind | undefined =
      kindValue === "image" || kindValue === "video" || kindValue === "audio"
        ? kindValue
        : undefined;
    const latitude = fields.exifLat ? Number(fields.exifLat) : Number.NaN;
    const longitude = fields.exifLng ? Number(fields.exifLng) : Number.NaN;
    const exifGps: GpsPoint | null =
      Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null;
    const duration = fields.durationS ? Number(fields.durationS) : Number.NaN;
    const durationS =
      Number.isFinite(duration) && duration >= 0 && duration <= 3600 ? duration : null;

    let reporterId = fields.reporterId || null;
    if (!reporterId && fields.waChatJid) {
      reporterId =
        app.db
          .select({ id: reporters.id })
          .from(reporters)
          .where(eq(reporters.waJid, fields.waChatJid))
          .get()?.id ?? null;
      if (!reporterId) {
        const phone = fields.waChatJid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
        if (phone) {
          const phoneHash = hashPhone(phone, app.config.SIGAP_PHONE_PEPPER);
          reporterId =
            app.db
              .select({ id: reporters.id })
              .from(reporters)
              .where(eq(reporters.phoneHash, phoneHash))
              .get()?.id ?? null;
        }
      }
    }

    const media = await stageMedia(app.db, app.config, {
      file: main.buffer,
      thumb,
      mime: fields.mime || main.mime,
      kind,
      originalName: main.filename,
      reporterId,
      waChatJid: fields.waChatJid || null,
      waMessageId: fields.waMessageId || null,
      durationS,
      caption: fields.caption || null,
      exifGps
    });
    return { ok: true, media };
  });

  app.get("/internal/health", { preHandler: app.requireInternal }, async () => ({
    ok: true,
    gateway: app.gateway.get(),
    now: new Date().toISOString()
  }));
}
