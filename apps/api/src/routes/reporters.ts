import { and, desc, eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { blockReporterSchema, maskPhone, reporterQuerySchema } from "@sigap/core";
import { reporters } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { decryptPhone } from "../lib/crypto.js";
import { notFound } from "../lib/errors.js";

export function registerReporterRoutes(app: FastifyInstance): void {
  app.get(
    "/api/reporters",
    { preHandler: app.requireRole("admin", "pawas") },
    async (request) => {
      const query = reporterQuerySchema.parse(request.query);
      const limit = query.limit;
      const term = query.q;
      const conditions = [eq(reporters.unitId, DEFAULT_UNIT_ID)];
      if (term) conditions.push(like(reporters.name, `%${term}%`));

      const rows = app.db
        .select()
        .from(reporters)
        .where(and(...conditions))
        .orderBy(desc(reporters.createdAt))
        .limit(limit)
        .all();

      return {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          phoneMasked: (() => {
            try {
              return maskPhone(decryptPhone(row.phoneEnc, app.config.SIGAP_PHONE_KEY));
            } catch {
              return "••••";
            }
          })(),
          reportCount: row.reportCount,
          validCount: row.validCount,
          falseCount: row.falseCount,
          blockedAt: row.blockedAt,
          blockedReason: row.blockedReason,
          createdAt: row.createdAt
        }))
      };
    }
  );

  app.post(
    "/api/reporters/:id/block",
    { preHandler: app.requireRole("admin", "pawas") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = blockReporterSchema.parse(request.body);
      const existing = app.db
        .select()
        .from(reporters)
        .where(and(eq(reporters.id, id), eq(reporters.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!existing) throw notFound("Pelapor tidak ditemukan");

      const now = new Date().toISOString();
      app.db
        .update(reporters)
        .set({ blockedAt: now, blockedReason: input.reason, updatedAt: now })
        .where(eq(reporters.id, id))
        .run();
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "reporter.block",
        entity: "reporter",
        entityId: id,
        meta: { reason: input.reason },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );

  app.post(
    "/api/reporters/:id/unblock",
    { preHandler: app.requireRole("admin", "pawas") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const existing = app.db
        .select()
        .from(reporters)
        .where(and(eq(reporters.id, id), eq(reporters.unitId, DEFAULT_UNIT_ID)))
        .get();
      if (!existing) throw notFound("Pelapor tidak ditemukan");

      app.db
        .update(reporters)
        .set({ blockedAt: null, blockedReason: null, updatedAt: new Date().toISOString() })
        .where(eq(reporters.id, id))
        .run();
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "reporter.unblock",
        entity: "reporter",
        entityId: id,
        meta: null,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );
}
