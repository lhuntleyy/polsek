import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, like, lt, lte, ne, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  CATEGORY_META,
  PRIORITY_META,
  canTransition,
  classifyLocation,
  isActiveStatus,
  manualTicketSchema,
  mergeTicketSchema,
  noteSchema,
  ticketQuerySchema,
  transitionSchema,
  formatLocalTime,
  type GeoPolygon,
  type Priority,
  type RegionInput,
  type Role,
  type TicketStatus
} from "@sigap/core";
import { officers, regions, reporters, ticketEvents, ticketMedia, tickets } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { CONSENT_VERSION, DEFAULT_UNIT_ID } from "../lib/constants.js";
import { encryptPhone, decryptPhone, hashPhone } from "../lib/crypto.js";
import { reporterPhoneDisplay } from "../lib/reporter-phone.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { listTicketMedia } from "../lib/media.js";
import { enqueueOutbox } from "../lib/outbox.js";
import { sendPushToRoles } from "../lib/push.js";
import { readSettings } from "../lib/settings.js";
import { nextTicketNumber } from "../lib/ticket-number.js";
import {
  groupStatusMessage,
  reporterStatusMessage,
  resolveReporterJid
} from "../lib/wa-status.js";
import { dispatchTicketToUrc } from "../bot/conversation.js";

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    return typeof parsed.createdAt === "string" && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

const DUPLICATE_RADIUS_M = 500;
const DUPLICATE_WINDOW_MINUTES = 60;
const ACTIVE_STATUSES: TicketStatus[] = ["baru", "diterima", "otw", "ditkp", "ditunda"];

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earth = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

function loadRegions(app: FastifyInstance): RegionInput[] {
  return app.db
    .select()
    .from(regions)
    .where(and(eq(regions.unitId, DEFAULT_UNIT_ID), eq(regions.active, true)))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      geojson: JSON.parse(row.geojson) as GeoPolygon,
      center: { lat: row.centroidLat ?? 0, lng: row.centroidLng ?? 0 },
      isDemo: row.isDemo
    }));
}

function maskedReporterPhone(
  phoneEnc: string,
  phoneVerified: boolean | null | undefined,
  app: FastifyInstance
): string {
  return reporterPhoneDisplay({ phoneEnc, phoneVerified }, app.config.SIGAP_PHONE_KEY, true);
}

function baseTicketSelect() {
  return {
    id: tickets.id,
    unitId: tickets.unitId,
    ticketNo: tickets.ticketNo,
    category: tickets.category,
    priority: tickets.priority,
    status: tickets.status,
    title: tickets.title,
    description: tickets.description,
    address: tickets.address,
    lat: tickets.lat,
    lng: tickets.lng,
    accuracyM: tickets.accuracyM,
    regionId: tickets.regionId,
    locationStatus: tickets.locationStatus,
    source: tickets.source,
    assignedTo: tickets.assignedTo,
    acknowledgedBy: tickets.acknowledgedBy,
    ackAt: tickets.ackAt,
    otwAt: tickets.otwAt,
    arriveAt: tickets.arriveAt,
    closedAt: tickets.closedAt,
    closeNote: tickets.closeNote,
    rejectReason: tickets.rejectReason,
    internalNote: tickets.internalNote,
    escalatedPawasAt: tickets.escalatedPawasAt,
    escalatedKapolsekAt: tickets.escalatedKapolsekAt,
    duplicateOf: tickets.duplicateOf,
    isDemo: tickets.isDemo,
    createdAt: tickets.createdAt,
    updatedAt: tickets.updatedAt,
    reporterName: reporters.name,
    reporterPhoneEnc: reporters.phoneEnc,
    reporterPhoneVerified: reporters.phoneVerified,
    reporterReportCount: reporters.reportCount,
    reporterValidCount: reporters.validCount,
    reporterBlockedAt: reporters.blockedAt,
    regionName: regions.name,
    assigneeName: officers.name
  };
}

function mapTicket(row: Record<string, any>, app: FastifyInstance) {
  const status = row.status as TicketStatus;
  return {
    id: row.id,
    ticketNo: row.ticketNo,
    title: row.title,
    category: row.category,
    categoryLabel: CATEGORY_META[row.category as keyof typeof CATEGORY_META]?.label ?? row.category,
    priority: row.priority,
    status,
    description: row.description,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracyM,
    regionId: row.regionId,
    region: row.regionName,
    locationStatus: row.locationStatus,
    source: row.source,
    assignedTo: row.assignedTo,
    assignee: row.assigneeName,
    ackAt: row.ackAt,
    otwAt: row.otwAt,
    arriveAt: row.arriveAt,
    closedAt: row.closedAt,
    closeNote: row.closeNote,
    rejectReason: row.rejectReason,
    internalNote: row.internalNote,
    escalatedPawasAt: row.escalatedPawasAt,
    escalatedKapolsekAt: row.escalatedKapolsekAt,
    duplicateOf: row.duplicateOf,
    isDemo: row.isDemo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    reporter: {
      name: row.reporterName,
      phoneMasked: maskedReporterPhone(row.reporterPhoneEnc, row.reporterPhoneVerified, app),
      phoneVerified: row.reporterPhoneVerified !== false,
      reportCount: row.reporterReportCount,
      validCount: row.reporterValidCount,
      verified: row.reporterReportCount > 0 && !row.reporterBlockedAt
    }
  };
}

function assertBhabinAccess(app: FastifyInstance, userRole: Role, userRegionId: string | null, ticketRegionId: string | null): void {
  if (userRole !== "bhabin") return;
  if (!userRegionId || !ticketRegionId || userRegionId !== ticketRegionId) {
    throw forbidden("Tiket ini berada di luar wilayah Anda");
  }
}

function getTicketRow(app: FastifyInstance, id: string) {
  return app.db
    .select(baseTicketSelect())
    .from(tickets)
    .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
    .leftJoin(regions, eq(tickets.regionId, regions.id))
    .leftJoin(officers, eq(tickets.assignedTo, officers.id))
    .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
    .get();
}

function getTicketDetail(app: FastifyInstance, id: string) {
  const row = getTicketRow(app, id);
  if (!row) throw notFound("Tiket tidak ditemukan");
  const events = app.db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, id))
    .orderBy(asc(ticketEvents.createdAt))
    .all();
  return { ticket: mapTicket(row, app), events, media: listTicketMedia(app.db, id) };
}

function broadcastTicket(app: FastifyInstance, row: { id: string; status: string; priority: string; title: string; regionId: string | null; ticketNo: string }): void {
  app.bus.broadcast("ticket.updated", {
    id: row.id,
    ticketNo: row.ticketNo,
    status: row.status,
    priority: row.priority,
    title: row.title,
    regionId: row.regionId
  });
}

export function registerTicketRoutes(app: FastifyInstance): void {
  app.get("/api/tickets", { preHandler: app.authenticate }, async (request) => {
    const user = request.user;
    if (!user) throw notFound("Sesi tidak ditemukan");
    const query = ticketQuerySchema.parse(request.query);
    const cursor = decodeCursor(query.cursor);

    const conditions = [eq(tickets.unitId, DEFAULT_UNIT_ID)];
    if (query.status) conditions.push(eq(tickets.status, query.status));
    if (query.priority) conditions.push(eq(tickets.priority, query.priority));
    if (query.regionId) conditions.push(eq(tickets.regionId, query.regionId));
    if (query.category) conditions.push(eq(tickets.category, query.category));
    if (query.from) conditions.push(gte(tickets.createdAt, query.from));
    if (query.to) conditions.push(lte(tickets.createdAt, query.to));
    if (user.role === "bhabin") {
      if (!user.regionId) {
        throw forbidden("Akun bhabin belum terikat wilayah");
      }
      conditions.push(eq(tickets.regionId, user.regionId));
    }
    if (query.q) {
      const term = `%${query.q}%`;
      const search = or(
        like(tickets.title, term),
        like(tickets.ticketNo, term),
        like(tickets.description, term),
        like(reporters.name, term)
      );
      if (search) conditions.push(search);
    }
    if (cursor) {
      const page = or(
        lt(tickets.createdAt, cursor.createdAt),
        and(eq(tickets.createdAt, cursor.createdAt), lt(tickets.id, cursor.id))
      );
      if (page) conditions.push(page);
    }

    const rows = app.db
      .select(baseTicketSelect())
      .from(tickets)
      .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
      .leftJoin(regions, eq(tickets.regionId, regions.id))
      .leftJoin(officers, eq(tickets.assignedTo, officers.id))
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(query.limit + 1)
      .all();

    const hasMore = rows.length > query.limit;
    const items = (hasMore ? rows.slice(0, query.limit) : rows).map((row) => mapTicket(row, app));
    const last = items[items.length - 1];
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({ createdAt: last.createdAt as string, id: last.id as string })
          : null
    };
  });

  app.get("/api/tickets/:id", { preHandler: app.authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user;
    if (!user) throw notFound("Sesi tidak ditemukan");
    const row = getTicketRow(app, id);
    if (!row) throw notFound("Tiket tidak ditemukan");
    assertBhabinAccess(app, user.role, user.regionId, row.regionId);
    return getTicketDetail(app, id);
  });

  app.post(
    "/api/tickets/:id/reveal-phone",
    {
      preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin", "urc"),
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } }
    },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const row = app.db
        .select({
          reporterPhoneEnc: reporters.phoneEnc,
          reporterPhoneVerified: reporters.phoneVerified,
          ticketNo: tickets.ticketNo,
          regionId: tickets.regionId
        })
        .from(tickets)
        .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!row) throw notFound("Tiket tidak ditemukan");
      if (row.reporterPhoneVerified === false) {
        throw conflict(
          "Pelapor ini hanya dikenal lewat LID WhatsApp; nomor telepon aslinya tidak diketahui. Hubungi lewat balasan chat."
        );
      }

      const phone = decryptPhone(row.reporterPhoneEnc, app.config.SIGAP_PHONE_KEY);
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "reporter.phone.reveal",
        entity: "ticket",
        entityId: id,
        meta: { ticketNo: row.ticketNo },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { phone };
    }
  );

  app.get(
    "/api/tickets/:id/duplicates",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const current = app.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!current) throw notFound("Tiket tidak ditemukan");
      assertBhabinAccess(app, user.role, user.regionId, current.regionId);

      const baseMs = new Date(current.createdAt).getTime();
      const anchorMs = Number.isFinite(baseMs) ? baseMs : Date.now();
      const windowStart = new Date(anchorMs - DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();
      const windowEnd = new Date(anchorMs + DUPLICATE_WINDOW_MINUTES * 60_000).toISOString();
      const dupConditions = [
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        ne(tickets.id, id),
        eq(tickets.category, current.category),
        inArray(tickets.status, ACTIVE_STATUSES),
        isNull(tickets.duplicateOf),
        gte(tickets.createdAt, windowStart),
        lte(tickets.createdAt, windowEnd)
      ];
      if (user.role === "bhabin" && user.regionId) {
        dupConditions.push(eq(tickets.regionId, user.regionId));
      }
      const rows = app.db
        .select({
          id: tickets.id,
          ticketNo: tickets.ticketNo,
          title: tickets.title,
          status: tickets.status,
          priority: tickets.priority,
          category: tickets.category,
          lat: tickets.lat,
          lng: tickets.lng,
          regionId: tickets.regionId,
          region: regions.name,
          createdAt: tickets.createdAt,
          reporterName: reporters.name
        })
        .from(tickets)
        .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
        .leftJoin(regions, eq(tickets.regionId, regions.id))
        .where(and(...dupConditions))
        .all();

      const items = rows
        .map((row) => {
          const distance =
            current.lat !== null &&
            current.lng !== null &&
            row.lat !== null &&
            row.lng !== null
              ? distanceMeters(current.lat, current.lng, row.lat, row.lng)
              : null;
          return { ...row, distanceM: distance };
        })
        .filter((row) => {
          if (row.distanceM !== null) return row.distanceM <= DUPLICATE_RADIUS_M;
          return Boolean(current.regionId) && row.regionId === current.regionId;
        })
        .sort((a, b) => {
          if (a.distanceM !== null && b.distanceM !== null) return a.distanceM - b.distanceM;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

      return {
        items: items.map((row) => ({
          ...row,
          distanceM: row.distanceM === null ? null : Math.round(row.distanceM),
          minutesAgo: Math.max(
            0,
            Math.round((Date.now() - new Date(row.createdAt).getTime()) / 60_000)
          )
        }))
      };
    }
  );

  app.post(
    "/api/tickets/:id/merge",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = mergeTicketSchema.parse(request.body);
      const primary = app.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!primary) throw notFound("Tiket utama tidak ditemukan");
      if (!isActiveStatus(primary.status as TicketStatus)) {
        throw badRequest("Tiket utama sudah final dan tidak bisa digabung");
      }

      const now = new Date().toISOString();
      const mergedTickets: Array<{ id: string; ticketNo: string; priority: string; title: string; regionId: string | null }> = [];
      const runMerge = () => {
        for (const sourceId of [...new Set(input.sourceIds)]) {
          if (sourceId === id) continue;
          const source = app.db
            .select()
            .from(tickets)
            .where(and(eq(tickets.id, sourceId), eq(tickets.unitId, DEFAULT_UNIT_ID)))
            .get();
          if (!source || !isActiveStatus(source.status as TicketStatus)) continue;
          if (source.category !== primary.category) continue;

          const mergeNote = `Digabung ke ${primary.ticketNo}${input.note ? ` — ${input.note}` : ""}`;
          app.db
            .update(tickets)
            .set({
              status: "dibatalkan",
              duplicateOf: primary.id,
              closedAt: now,
              closeNote: mergeNote,
              updatedAt: now
            })
            .where(eq(tickets.id, source.id))
            .run();
          app.db
            .update(ticketMedia)
            .set({ ticketId: primary.id })
            .where(eq(ticketMedia.ticketId, source.id))
            .run();
          app.db
            .insert(ticketEvents)
            .values({
              id: randomUUID(),
              ticketId: source.id,
              actorType: "officer",
              actorId: user.id,
              fromStatus: source.status,
              toStatus: "dibatalkan",
              note: mergeNote,
              createdAt: now
            })
            .run();
          writeAudit(app.db, {
            unitId: DEFAULT_UNIT_ID,
            actorId: user.id,
            action: "ticket.merge",
            entity: "ticket",
            entityId: source.id,
            meta: { primaryId: primary.id, primaryNo: primary.ticketNo },
            ip: request.ip,
            userAgent: request.headers["user-agent"] ?? null
          });
          if (!source.isDemo && source.source === "wa") {
            const reporter = app.db
              .select({ waJid: reporters.waJid, phoneEnc: reporters.phoneEnc })
              .from(reporters)
              .where(eq(reporters.id, source.reporterId))
              .get();
            const targetJid = reporter ? resolveReporterJid(reporter, app.config.SIGAP_PHONE_KEY) : null;
            if (targetJid) {
              enqueueOutbox(app.db, {
                targetJid,
                kind: "text",
                payload: {
                  text: `Laporan ${source.ticketNo} digabungkan dengan laporan ${primary.ticketNo} untuk penanganan terpadu. Balas STATUS ${primary.ticketNo} untuk memantau.`
                }
              });
            }
          }
          mergedTickets.push(source);
        }
        if (mergedTickets.length > 0) {
          app.db
            .insert(ticketEvents)
            .values({
              id: randomUUID(),
              ticketId: primary.id,
              actorType: "officer",
              actorId: user.id,
              fromStatus: primary.status,
              toStatus: primary.status,
              note: `Menggabungkan tiket duplikat: ${mergedTickets.map((item) => item.ticketNo).join(", ")}`,
              createdAt: now
            })
            .run();
        }
      };

      const mergeTx = app.sqlite.transaction(runMerge);
      if (app.sqlite.inTransaction) mergeTx();
      else mergeTx.immediate();

      if (mergedTickets.length === 0) throw badRequest("Tidak ada tiket aktif yang bisa digabung");
      for (const source of mergedTickets) {
        broadcastTicket(app, { ...source, status: "dibatalkan" });
      }
      broadcastTicket(app, primary);
      return { ...getTicketDetail(app, primary.id), merged: mergedTickets.length };
    }
  );

  app.post(
    "/api/tickets/:id/transition",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = transitionSchema.parse(request.body);

      const current = app.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!current) throw notFound("Tiket tidak ditemukan");
      assertBhabinAccess(app, user.role, user.regionId, current.regionId);

      if (!canTransition(current.status as TicketStatus, input.to, user.role)) {
        throw forbidden(`Transisi ${current.status} -> ${input.to} tidak diizinkan untuk role ${user.role}`);
      }

      const nowDate = new Date();
      const now = nowDate.toISOString();
      const patch: Record<string, unknown> = { status: input.to, updatedAt: now };

      if (input.to === "diterima") {
        if (!current.ackAt) {
          patch.acknowledgedBy = user.id;
          patch.ackAt = now;
        }
        if (current.status === "selesai" || current.status === "ditolak") {
          // Acuan SLA/eskalasi untuk tiket yang dibuka ulang; tanpa ini umur
          // dihitung dari createdAt dan eskalasi Kapolsek langsung terkirim.
          patch.reopenedAt = now;
          patch.closedAt = null;
          patch.closeNote = null;
          patch.rejectReason = null;
          patch.otwAt = null;
          patch.arriveAt = null;
          patch.escalatedPawasAt = null;
          patch.escalatedKapolsekAt = null;
        }
      }
      if (input.to === "otw") {
        const assigneeId = input.assigneeId ?? (user.role === "urc" ? user.id : current.assignedTo);
        if (assigneeId) {
          const assignee = app.db.select().from(officers).where(eq(officers.id, assigneeId)).get();
          if (!assignee || !assignee.active) throw badRequest("Petugas assignee tidak valid");
          patch.assignedTo = assigneeId;
        }
        patch.otwAt = now;
      }
      if (input.to === "ditkp") patch.arriveAt = now;
      if (input.to === "selesai") {
        if (!input.note && !current.closeNote) {
          throw badRequest("Catatan penanganan wajib diisi sebelum menutup tiket");
        }
        patch.closedAt = now;
        patch.closeNote = input.note ?? current.closeNote;
      }
      if (input.to === "ditolak") {
        if (!input.reason) throw badRequest("Alasan penolakan wajib diisi");
        patch.closedAt = now;
        patch.rejectReason = input.reason;
      }
      if (input.to === "ditunda") {
        if (!input.note) {
          throw badRequest("Alasan penundaan wajib diisi");
        }
        const stamp = `${formatLocalTime(nowDate, readSettings(app.db, app.config).unitTimezone)} · ${user.name}`;
        const entry = `[${stamp}] [DITUNDA] ${input.note}`;
        patch.internalNote = current.internalNote ? `${current.internalNote}\n${entry}` : entry;
      }

      const runTransition = () => {
        app.db.update(tickets).set(patch).where(eq(tickets.id, id)).run();
        if (input.to === "selesai" && current.status !== "selesai") {
          app.db
            .update(reporters)
            .set({ validCount: sql`${reporters.validCount} + 1`, updatedAt: now })
            .where(eq(reporters.id, current.reporterId))
            .run();
        } else if (input.to === "ditolak" && input.reason === "palsu" && current.status !== "ditolak") {
          app.db
            .update(reporters)
            .set({ falseCount: sql`${reporters.falseCount} + 1`, updatedAt: now })
            .where(eq(reporters.id, current.reporterId))
            .run();
        }
        // Buka ulang: batalkan counter reputasi yang dulu ditambahkan saat
        // tiket ditutup, supaya penutupan berikutnya tidak menghitung ganda.
        if (input.to === "diterima" && current.status === "selesai") {
          app.db
            .update(reporters)
            .set({ validCount: sql`MAX(${reporters.validCount} - 1, 0)`, updatedAt: now })
            .where(eq(reporters.id, current.reporterId))
            .run();
        } else if (
          input.to === "diterima" &&
          current.status === "ditolak" &&
          current.rejectReason === "palsu"
        ) {
          app.db
            .update(reporters)
            .set({ falseCount: sql`MAX(${reporters.falseCount} - 1, 0)`, updatedAt: now })
            .where(eq(reporters.id, current.reporterId))
            .run();
        }
        app.db
          .insert(ticketEvents)
          .values({
            id: randomUUID(),
            ticketId: id,
            actorType: "officer",
            actorId: user.id,
            fromStatus: current.status,
            toStatus: input.to,
            note: input.note ?? null,
            createdAt: now
          })
          .run();

        writeAudit(app.db, {
          unitId: DEFAULT_UNIT_ID,
          actorId: user.id,
          action: "ticket.transition",
          entity: "ticket",
          entityId: id,
          meta: { from: current.status, to: input.to, reason: input.reason ?? null },
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });

        // Laporan baru diteruskan ke grup URC hanya setelah piket menerimanya.
        if (
          input.to === "diterima" &&
          current.status === "baru" &&
          !current.ackAt &&
          !current.isDemo
        ) {
          dispatchTicketToUrc(app, id, user.name);
        }

        // Nama petugas: untuk OTW pakai petugas yang ditugaskan, selain itu user aktif.
        const assigneeName =
          input.to === "otw" && typeof patch.assignedTo === "string"
            ? app.db
                .select({ name: officers.name })
                .from(officers)
                .where(eq(officers.id, patch.assignedTo))
                .get()?.name
            : undefined;
        const actorName = assigneeName ?? user.name;
        const urcJid = readSettings(app.db, app.config).waGroupUrcJid;
        if (
          urcJid &&
          current.ackAt &&
          !current.isDemo &&
          (["otw", "ditkp", "selesai", "ditunda", "ditolak"] as TicketStatus[]).includes(input.to)
        ) {
          enqueueOutbox(app.db, {
            targetJid: urcJid,
            kind: "text",
            payload: {
              text: groupStatusMessage(
                current.ticketNo,
                input.to,
                input.note ?? input.reason ?? null,
                0,
                actorName
              )
            }
          });
        }

        if (!current.isDemo) {
          const reporter = app.db
            .select({ waJid: reporters.waJid, phoneEnc: reporters.phoneEnc })
            .from(reporters)
            .where(eq(reporters.id, current.reporterId))
            .get();
          const targetJid = reporter
            ? resolveReporterJid(reporter, app.config.SIGAP_PHONE_KEY)
            : null;
          if (targetJid) {
            enqueueOutbox(app.db, {
              targetJid,
              kind: "text",
              payload: {
                text: reporterStatusMessage(
                  current.ticketNo,
                  input.to,
                  input.note ?? input.reason ?? current.closeNote ?? null,
                  input.to === "ditolak" ? null : actorName
                )
              }
            });
          }
        }
      };

      const tx = app.sqlite.transaction(runTransition);
      if (app.sqlite.inTransaction) tx();
      else tx.immediate();

      broadcastTicket(app, { ...current, status: input.to });
      return getTicketDetail(app, id);
    }
  );

  app.post(
    "/api/tickets/:id/notes",
    { preHandler: app.authenticate },
    async (request) => {
      const { id } = request.params as { id: string };
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = noteSchema.parse(request.body);
      const current = app.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!current) throw notFound("Tiket tidak ditemukan");
      assertBhabinAccess(app, user.role, user.regionId, current.regionId);

      const now = new Date();
      const stamp = `${formatLocalTime(now, readSettings(app.db, app.config).unitTimezone)} · ${user.name}`;
      const nextNote = current.internalNote
        ? `${current.internalNote}\n[${stamp}] ${input.text}`
        : `[${stamp}] ${input.text}`;

      app.db
        .update(tickets)
        .set({ internalNote: nextNote, updatedAt: now.toISOString() })
        .where(eq(tickets.id, id))
        .run();
      app.db
        .insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId: id,
          actorType: "officer",
          actorId: user.id,
          fromStatus: current.status,
          toStatus: current.status,
          note: input.text,
          createdAt: now.toISOString()
        })
        .run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "ticket.note",
        entity: "ticket",
        entityId: id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      broadcastTicket(app, current);
      return getTicketDetail(app, id);
    }
  );

  app.post(
    "/api/tickets/manual",
    { preHandler: app.requireRole("piket", "pawas", "admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = manualTicketSchema.parse(request.body);
      const phoneHash = hashPhone(input.reporterPhone, app.config.SIGAP_PHONE_PEPPER);

      const regionList = loadRegions(app);
      let regionId = input.regionId ?? null;
      let locationStatus = "needs_verification";
      if (input.lat !== undefined && input.lng !== undefined) {
        const classification = classifyLocation(
          { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM },
          regionList
        );
        locationStatus = classification.status;
        regionId = classification.status === "outside" ? null : (classification.regionId ?? regionId);
      }
      if (regionId && !regionList.some((region) => region.id === regionId)) {
        throw badRequest("Wilayah tidak ditemukan");
      }

      const ticketId = randomUUID();
      const categoryMeta = CATEGORY_META[input.category];
      const priority = (input.priority ?? categoryMeta.defaultPriority) as Priority;
      const settings = readSettings(app.db, app.config);
      let ticketNo = "";

      const runCreate = () => {
        let reporter = app.db
          .select()
          .from(reporters)
          .where(eq(reporters.phoneHash, phoneHash))
          .get();
        if (!reporter) {
          const reporterId = randomUUID();
          const nowReporter = new Date().toISOString();
          app.db
            .insert(reporters)
            .values({
              id: reporterId,
              unitId: DEFAULT_UNIT_ID,
              phoneHash,
              phoneEnc: encryptPhone(input.reporterPhone, app.config.SIGAP_PHONE_KEY),
              name: input.reporterName,
              consentVersion: CONSENT_VERSION,
              consentAt: nowReporter,
              reportCount: 0,
              validCount: 0,
              falseCount: 0,
              blockedAt: null,
              blockedReason: null,
              createdAt: nowReporter,
              updatedAt: nowReporter
            })
            .run();
          reporter = app.db.select().from(reporters).where(eq(reporters.id, reporterId)).get();
        }
        if (!reporter) throw badRequest("Gagal membuat data pelapor");
        if (reporter.blockedAt) throw badRequest("Nomor pelapor diblokir");

        ticketNo = nextTicketNumber(app.db, app.config, app.sqlite);
        const now = new Date().toISOString();

        app.db
          .insert(tickets)
          .values({
            id: ticketId,
            unitId: DEFAULT_UNIT_ID,
            ticketNo,
            reporterId: reporter.id,
            category: input.category,
            priority,
            status: "baru",
            title: input.title,
            description: input.description ?? null,
            address: input.address ?? null,
            lat: input.lat ?? null,
            lng: input.lng ?? null,
            accuracyM: input.accuracyM ?? null,
            regionId,
            locationStatus,
            source: input.source,
            clusterId: null,
            assignedTo: null,
            acknowledgedBy: null,
            ackAt: null,
            otwAt: null,
            arriveAt: null,
            closedAt: null,
            closeNote: null,
            rejectReason: null,
            internalNote: null,
            isDemo: false,
            createdAt: now,
            updatedAt: now
          })
          .run();

        app.db
          .update(reporters)
          .set({ reportCount: sql`${reporters.reportCount} + 1`, updatedAt: now })
          .where(eq(reporters.id, reporter.id))
          .run();

        app.db
          .insert(ticketEvents)
          .values({
            id: randomUUID(),
            ticketId,
            actorType: "officer",
            actorId: user.id,
            fromStatus: null,
            toStatus: "baru",
            note: "Tiket manual dibuat dari dashboard",
            createdAt: now
          })
          .run();

        writeAudit(app.db, {
          unitId: DEFAULT_UNIT_ID,
          actorId: user.id,
          action: "ticket.manual.create",
          entity: "ticket",
          entityId: ticketId,
          meta: { source: input.source },
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });

        // Grup URC dikabari setelah piket menerima tiket (dispatchTicketToUrc).
      };

      const tx = app.sqlite.transaction(runCreate);
      if (app.sqlite.inTransaction) tx();
      else tx.immediate();

      broadcastTicket(app, {
        id: ticketId,
        ticketNo,
        status: "baru",
        priority,
        title: input.title,
        regionId
      });
      if (priority === "P1") {
        void sendPushToRoles(app, ["piket", "pawas", "kapolsek"], {
          title: "SIGAP — P1 baru",
          body: `${ticketNo} · ${input.title}`,
          url: `/?ticket=${ticketId}`,
          tag: `ticket-${ticketId}`
        });
      }

      return getTicketDetail(app, ticketId);
    }
  );

  app.get(
    "/api/tickets/:id/events",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const ticket = app.db
        .select({ id: tickets.id, regionId: tickets.regionId })
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!ticket) throw notFound("Tiket tidak ditemukan");
      assertBhabinAccess(app, user.role, user.regionId, ticket.regionId);
      const events = app.db
        .select()
        .from(ticketEvents)
        .where(eq(ticketEvents.ticketId, id))
        .orderBy(asc(ticketEvents.createdAt))
        .all();
      return { events };
    }
  );
}
