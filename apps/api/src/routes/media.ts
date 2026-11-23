import { createReadStream } from "node:fs";
import { extname } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthUser } from "../lib/auth-types.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { forbidden, notFound } from "../lib/errors.js";
import { getMediaRow, mediaFilePath } from "../lib/media.js";
import { tickets } from "../db/schema.js";

function assertAccess(app: FastifyInstance, user: AuthUser, ticketId: string | null): void {
  // Media staged (belum jadi tiket: kiriman warga yang belum selesai, foto
  // grup) hanya untuk peran yang memverifikasi laporan.
  if (!ticketId && !["piket", "pawas", "admin"].includes(user.role)) {
    throw forbidden("Media belum terhubung ke tiket");
  }
  if (user.role !== "bhabin") return;
  if (!user.regionId) throw forbidden("Akun bhabin belum terikat wilayah");
  if (!ticketId) throw forbidden("Media belum terhubung ke tiket");
  const ticket = app.db
    .select({ regionId: tickets.regionId })
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .get();
  if (!ticket || ticket.regionId !== user.regionId) {
    throw forbidden("Media ini berada di luar wilayah Anda");
  }
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(header: string | undefined, size: number): ByteRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  if (!rawStart && !rawEnd) return "invalid";

  let start: number;
  let end: number;
  if (!rawStart) {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start > end || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

function sendMedia(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  variant: "original" | "thumb"
) {
  const user = request.user;
  if (!user) throw notFound("Sesi tidak ditemukan");
  const { id } = request.params as { id: string };
  const row = getMediaRow(app.db, id);
  if (!row) throw notFound("Media tidak ditemukan");
  assertAccess(app, user, row.ticketId);

  const file = mediaFilePath(app.config, row, variant);
  if (!file) throw notFound("File media tidak ditemukan");

  const download = (request.query as { download?: string }).download === "1";
  const extension = extname(file.path).replace(".", "") || "bin";
  const disposition = download ? "attachment" : "inline";

  if (download) {
    writeAudit(app.db, {
      unitId: DEFAULT_UNIT_ID,
      actorId: user.id,
      action: "media.download",
      entity: "media",
      entityId: row.id,
      meta: { ticketId: row.ticketId, kind: row.kind },
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null
    });
  }

  reply
    .header("Content-Type", file.mime)
    .header("Content-Disposition", `${disposition}; filename="sigap-${row.id}.${extension}"`)
    .header("Cache-Control", "private, no-store")
    .header("Accept-Ranges", "bytes")
    .header("X-Content-Type-Options", "nosniff");

  const range = parseRange(request.headers.range, file.size);
  if (range === "invalid") {
    return reply
      .code(416)
      .header("Content-Range", `bytes */${file.size}`)
      .send({ error: { code: "range_not_satisfiable", message: "Rentang tidak valid" } });
  }

  if (!range) {
    reply.header("Content-Length", String(file.size));
    return reply.send(createReadStream(file.path));
  }

  reply
    .code(206)
    .header("Content-Length", String(range.end - range.start + 1))
    .header("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
  return reply.send(createReadStream(file.path, { start: range.start, end: range.end }));
}

export function registerMediaRoutes(app: FastifyInstance): void {
  app.get("/api/media/:id", { preHandler: app.authenticate }, async (request, reply) =>
    sendMedia(app, request, reply, "original")
  );

  app.get("/api/media/:id/thumb", { preHandler: app.authenticate }, async (request, reply) =>
    sendMedia(app, request, reply, "thumb")
  );
}
