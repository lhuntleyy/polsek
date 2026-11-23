import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  officerCreateSchema,
  officerUpdateSchema,
  paginationSchema,
  resetPasswordSchema
} from "@sigap/core";
import {
  isWhatsAppJid,
  toWhatsAppGroupJid,
  toWhatsAppJid
} from "@sigap/core";
import {
  auditLogs,
  officers,
  outboundMessages,
  regions,
  sessions,
  shifts,
  tickets,
  waGroups
} from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { hashPassword, passwordPolicyError } from "../lib/auth.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { badRequest, notFound } from "../lib/errors.js";
import { runDailyDigest } from "../lib/digest.js";
import type { GatewayCommand } from "../lib/gateway-state.js";
import { readSettings } from "../lib/settings.js";

const groupCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  jid: z
    .string()
    .trim()
    .min(5)
    .max(160)
    .transform(toWhatsAppGroupJid)
    .refine(
      (value) => /^\d{8,24}@g\.us$/.test(value),
      "ID grup tidak valid. Masukkan angka ID grup atau JID ...@g.us"
    ),
  purpose: z.enum(["urc", "bhabin", "lain"]).default("urc"),
  active: z.boolean().default(true)
});

const groupUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    active: z.boolean().optional()
  })
  .strict();

function assertWaJidFree(
  app: FastifyInstance,
  waJid: string | null | undefined,
  exceptId?: string
): void {
  if (!waJid) return;
  const holder = app.db
    .select({ id: officers.id, name: officers.name })
    .from(officers)
    .where(and(eq(officers.waJid, waJid), eq(officers.active, true)))
    .get();
  if (holder && holder.id !== exceptId) {
    // Nomor ganda membuat role pengirim perintah grup menjadi acak.
    throw badRequest(`Nomor WhatsApp ini sudah dipakai petugas lain (${holder.name})`);
  }
}

function safeDbSize(path: string): number | null {
  try {
    return statSync(path).size;
  } catch {
    return null;
  }
}

export function registerSystemRoutes(app: FastifyInstance): void {
  app.get(
    "/api/system/gateway",
    { preHandler: app.authenticate },
    async (request) => {
      const gateway = app.gateway.get();
      return {
        gateway: {
          ...gateway,
          qr: request.user?.role === "admin" ? gateway.qr : null
        }
      };
    }
  );

  const gatewayAction = (
    path: string,
    command: GatewayCommand,
    auditAction: string
  ): void => {
    app.post(
      path,
      {
        preHandler: app.requireRole("admin"),
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
      },
      async (request) => {
        const user = request.user;
        if (!user) throw notFound("Sesi tidak ditemukan");
        const requested = app.gateway.requestCommand(command);
        writeAudit(app.db, {
          unitId: DEFAULT_UNIT_ID,
          actorId: user.id,
          action: auditAction,
          entity: "wa_gateway",
          entityId: "main",
          meta: { command, commandId: requested.id },
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });
        return { ok: true, requested, gateway: app.gateway.get() };
      }
    );
  };

  gatewayAction("/api/system/gateway/connect", "connect", "wa.gateway.connect");
  gatewayAction(
    "/api/system/gateway/disconnect",
    "disconnect",
    "wa.gateway.disconnect"
  );
  gatewayAction("/api/system/gateway/logout", "logout", "wa.gateway.logout");
  gatewayAction("/api/system/gateway/restart", "restart", "wa.gateway.restart");
  app.get(
    "/api/system/status",
    { preHandler: app.requireRole("admin", "pawas", "kapolsek") },
    async (request) => {
      const unit = readSettings(app.db, app.config);
      const outbox = app.db
        .select({ status: outboundMessages.status, count: sql<number>`count(*)` })
        .from(outboundMessages)
        .groupBy(outboundMessages.status)
        .all();
      const demoRegions = app.db
        .select()
        .from(regions)
        .where(eq(regions.isDemo, true))
        .all().length;
      const demoTickets = app.db
        .select()
        .from(tickets)
        .where(eq(tickets.isDemo, true))
        .all().length;
      const gatewayState = app.gateway.get();

      return {
        version: app.config.version,
        env: app.config.SIGAP_ENV,
        uptimeSeconds: Math.round(process.uptime()),
        db: {
          sizeBytes: safeDbSize(app.config.dbPath),
          wal: true
        },
        gateway: {
          number: unit.waNumber ? `${unit.waNumber.slice(0, 4)}•••••${unit.waNumber.slice(-3)}` : null,
          owner: unit.waOwner || null,
          status: unit.waNumber ? "configured" : "not_configured"
        },
        gatewayState: {
          ...gatewayState,
          qr: request.user?.role === "admin" ? gatewayState.qr : null
        },
        outbox: Object.fromEntries(outbox.map((row) => [row.status, Number(row.count)])),
        demo: {
          regions: demoRegions,
          tickets: demoTickets,
          enabled: app.config.seedDemo
        },
        retentionDays: unit.retentionDays,
        dpoName: unit.dpoName
      };
    }
  );

  app.post(
    "/api/system/digest",
    { preHandler: app.requireRole("admin", "pawas", "kapolsek") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const result = runDailyDigest(app, { force: true });
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "digest.trigger",
        entity: "system",
        entityId: null,
        meta: result,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return result;
    }
  );

  app.get(
    "/api/audit",
    { preHandler: app.requireRole("admin", "pawas") },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      let cursor: { createdAt: string; id: string } | null = null;
      if (query.cursor) {
        try {
          const parsed = JSON.parse(
            Buffer.from(query.cursor, "base64url").toString("utf8")
          ) as { createdAt?: unknown; id?: unknown };
          if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
            cursor = { createdAt: parsed.createdAt, id: parsed.id };
          }
        } catch {
          cursor = null;
        }
      }

      const conditions = [eq(auditLogs.unitId, DEFAULT_UNIT_ID)];
      if (cursor) {
        const page = or(
          lt(auditLogs.createdAt, cursor.createdAt),
          and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id))
        );
        if (page) conditions.push(page);
      }

      const rows = app.db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entity: auditLogs.entity,
          entityId: auditLogs.entityId,
          metaJson: auditLogs.metaJson,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
          actorId: auditLogs.actorId,
          actorName: officers.name
        })
        .from(auditLogs)
        .leftJoin(officers, eq(auditLogs.actorId, officers.id))
        .where(and(...conditions))
        .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
        .limit(query.limit + 1)
        .all();

      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      const last = sliced[sliced.length - 1];
      return {
        items: sliced.map((row) => ({
          ...row,
          meta: row.metaJson ? safeJson(row.metaJson) : null,
          metaJson: undefined
        })),
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({ createdAt: last.createdAt, id: last.id })
              ).toString("base64url")
            : null
      };
    }
  );

  app.get(
    "/api/wa-groups",
    { preHandler: app.requireRole("admin", "pawas", "piket") },
    async () => ({
      items: app.db
        .select()
        .from(waGroups)
        .where(eq(waGroups.unitId, DEFAULT_UNIT_ID))
        .orderBy(desc(waGroups.createdAt))
        .all()
    })
  );

  app.post(
    "/api/wa-groups",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = groupCreateSchema.parse(request.body);
      const existing = app.db.select().from(waGroups).where(eq(waGroups.jid, input.jid)).get();
      if (existing) throw badRequest("JID grup sudah terdaftar");

      const id = randomUUID();
      const now = new Date().toISOString();
      app.db
        .insert(waGroups)
        .values({
          id,
          unitId: DEFAULT_UNIT_ID,
          name: input.name,
          jid: input.jid,
          purpose: input.purpose,
          active: input.active,
          createdAt: now
        })
        .run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "wa_group.create",
        entity: "wa_group",
        entityId: id,
        meta: { name: input.name, purpose: input.purpose },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { id };
    }
  );

  app.patch(
    "/api/wa-groups/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = groupUpdateSchema.parse(request.body);
      const existing = app.db
        .select()
        .from(waGroups)
        .where(eq(waGroups.id, id))
        .get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Grup tidak ditemukan");
      }
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.active !== undefined) patch.active = input.active;
      if (Object.keys(patch).length > 0) {
        app.db.update(waGroups).set(patch).where(eq(waGroups.id, id)).run();
      }
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "wa_group.update",
        entity: "wa_group",
        entityId: id,
        meta: patch,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );

  app.get(
    "/api/officers",
    { preHandler: app.requireRole("admin", "pawas", "piket") },
    async () => {
      const rows = app.db
        .select({
          id: officers.id,
          name: officers.name,
          rank: officers.rank,
          role: officers.role,
          regionId: officers.regionId,
          waJid: officers.waJid,
          active: officers.active
        })
        .from(officers)
        .where(eq(officers.unitId, DEFAULT_UNIT_ID))
        .all();
      return { items: rows };
    }
  );

  app.post(
    "/api/officers",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = officerCreateSchema.parse(request.body);
      const existing = app.db
        .select()
        .from(officers)
        .where(eq(officers.username, input.username))
        .get();
      if (existing) throw badRequest("Username sudah dipakai");
      const policy = passwordPolicyError(input.password);
      if (policy) throw badRequest(policy);
      if (input.role === "bhabin" && !input.regionId) {
        throw badRequest("Akun Bhabinkamtibmas wajib terikat ke satu wilayah");
      }
      assertWaJidFree(app, input.waJid);
      if (input.regionId) {
        const region = app.db
          .select({ id: regions.id })
          .from(regions)
          .where(and(eq(regions.id, input.regionId), eq(regions.unitId, DEFAULT_UNIT_ID)))
          .get();
        if (!region) throw badRequest("Wilayah tidak ditemukan");
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(input.password);
      app.db
        .insert(officers)
        .values({
          id,
          unitId: DEFAULT_UNIT_ID,
          username: input.username,
          passwordHash,
          totpSecret: null,
          totpEnabled: false,
          // Password awal dibuat admin; petugas wajib menggantinya saat login pertama.
          mustChangePassword: true,
          name: input.name,
          rank: input.rank ?? null,
          role: input.role,
          phone: input.phone ?? null,
          waJid: input.waJid ?? null,
          regionId: input.regionId ?? null,
          active: true,
          lastLoginAt: null,
          createdAt: now,
          updatedAt: now
        })
        .run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "officer.create",
        entity: "officer",
        entityId: id,
        meta: { username: input.username, role: input.role },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { id };
    }
  );

  app.patch(
    "/api/officers/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = officerUpdateSchema.parse(request.body);
      const existing = app.db.select().from(officers).where(eq(officers.id, id)).get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Petugas tidak ditemukan");
      }

      if (
        id === user.id &&
        (input.active === false || (input.role !== undefined && input.role !== "admin"))
      ) {
        throw badRequest("Tidak bisa menonaktifkan atau menurunkan role akun admin sendiri");
      }

      if (
        existing.role === "admin" &&
        existing.active &&
        (input.active === false || (input.role !== undefined && input.role !== "admin"))
      ) {
        const admins = app.db
          .select({ n: sql<number>`count(*)` })
          .from(officers)
          .where(
            and(
              eq(officers.unitId, DEFAULT_UNIT_ID),
              eq(officers.role, "admin"),
              eq(officers.active, true)
            )
          )
          .get();
        if (Number(admins?.n ?? 0) <= 1) {
          throw badRequest("Tidak bisa menonaktifkan admin aktif terakhir");
        }
      }

      if (input.regionId) {
        const region = app.db
          .select({ id: regions.id })
          .from(regions)
          .where(and(eq(regions.id, input.regionId), eq(regions.unitId, DEFAULT_UNIT_ID)))
          .get();
        if (!region) throw badRequest("Wilayah tidak ditemukan");
      }
      const nextRole = input.role ?? existing.role;
      const nextRegion = input.regionId !== undefined ? input.regionId : existing.regionId;
      if (nextRole === "bhabin" && !nextRegion) {
        throw badRequest("Akun Bhabinkamtibmas wajib terikat ke satu wilayah");
      }

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { updatedAt: now };
      if (input.name !== undefined) patch.name = input.name;
      if (input.rank !== undefined) patch.rank = input.rank;
      if (input.role !== undefined) patch.role = input.role;
      if (input.regionId !== undefined) patch.regionId = input.regionId;
      if (input.phone !== undefined) patch.phone = input.phone;
      if (input.waJid !== undefined) {
        const waJid = input.waJid ? toWhatsAppJid(input.waJid) : null;
        if (waJid && !isWhatsAppJid(waJid)) {
          throw badRequest("Nomor WhatsApp tidak valid. Masukkan 0812..., 62812..., atau JID ...@s.whatsapp.net");
        }
        assertWaJidFree(app, waJid, id);
        patch.waJid = waJid;
      }
      if (input.active !== undefined) patch.active = input.active;

      app.db.update(officers).set(patch).where(eq(officers.id, id)).run();
      if (
        input.active === false ||
        (input.role !== undefined && input.role !== existing.role) ||
        (input.regionId !== undefined && input.regionId !== existing.regionId)
      ) {
        // Role/wilayah di-cache di sesi SSE; paksa login ulang agar scope baru berlaku.
        app.db
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.officerId, id), isNull(sessions.revokedAt)))
          .run();
        app.bus.disconnectOfficer(id);
      }
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "officer.update",
        entity: "officer",
        entityId: id,
        meta: { keys: Object.keys(input) },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );

  app.delete(
    "/api/officers/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      if (id === user.id) throw badRequest("Tidak bisa menghapus akun sendiri");
      const existing = app.db.select().from(officers).where(eq(officers.id, id)).get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Petugas tidak ditemukan");
      }
      if (existing.role === "admin" && existing.active) {
        const admins = app.db
          .select({ n: sql<number>`count(*)` })
          .from(officers)
          .where(
            and(
              eq(officers.unitId, DEFAULT_UNIT_ID),
              eq(officers.role, "admin"),
              eq(officers.active, true)
            )
          )
          .get();
        if (Number(admins?.n ?? 0) <= 1) {
          throw badRequest("Tidak bisa menghapus admin aktif terakhir");
        }
      }

      // Selalu nonaktifkan (soft delete). Hapus permanen membuat jejak di
      // audit_logs/ticket_events kehilangan nama pelaku.
      const now = new Date().toISOString();
      app.db
        .update(officers)
        .set({ active: false, waJid: null, updatedAt: now })
        .where(eq(officers.id, id))
        .run();
      app.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.officerId, id), isNull(sessions.revokedAt)))
        .run();
      app.bus.disconnectOfficer(id);
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "officer.deactivate",
        entity: "officer",
        entityId: id,
        meta: { username: existing.username },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true, mode: "deactivated" as const };
    }
  );

  app.post(
    "/api/officers/:id/reset-password",
    {
      preHandler: app.requireRole("admin"),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = resetPasswordSchema.parse(request.body);
      const policy = passwordPolicyError(input.newPassword);
      if (policy) throw badRequest(policy);
      const existing = app.db.select().from(officers).where(eq(officers.id, id)).get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Petugas tidak ditemukan");
      }
      const now = new Date().toISOString();
      const self = id === user.id;
      app.db
        .update(officers)
        .set({
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: !self,
          failedLogins: 0,
          lockedUntil: null,
          updatedAt: now
        })
        .where(eq(officers.id, id))
        .run();
      if (!self) {
        app.db
          .update(sessions)
          .set({ revokedAt: now })
          .where(and(eq(sessions.officerId, id), isNull(sessions.revokedAt)))
          .run();
        app.bus.disconnectOfficer(id);
      }
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "officer.password.reset",
        entity: "officer",
        entityId: id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );

  app.post(
    "/api/officers/:id/reset-totp",
    {
      preHandler: app.requireRole("admin"),
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
    },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const existing = app.db.select().from(officers).where(eq(officers.id, id)).get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Petugas tidak ditemukan");
      }
      const now = new Date().toISOString();
      app.db
        .update(officers)
        .set({ totpSecret: null, totpEnabled: false, totpLastStep: null, updatedAt: now })
        .where(eq(officers.id, id))
        .run();
      app.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.officerId, id), isNull(sessions.revokedAt)))
        .run();
      app.bus.disconnectOfficer(id);
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "officer.totp.reset",
        entity: "officer",
        entityId: id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
