import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Role } from "@sigap/core";
import { officers, sessions } from "../db/schema.js";
import { hashToken } from "./crypto.js";

const PASSWORD_CHANGE_ALLOWLIST = new Set(["/api/me", "/api/auth/password", "/api/auth/logout"]);

export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest("user", null);

  app.decorate("authenticate", async function (request, reply) {
    const token = request.cookies[app.config.SIGAP_COOKIE_NAME];
    if (!token) {
      reply.code(401).send({
        error: { code: "unauthorized", message: "Sesi tidak ditemukan" }
      });
      return;
    }

    const now = new Date().toISOString();
    const row = app.db
      .select({
        sessionId: sessions.id,
        officerId: officers.id,
        username: officers.username,
        name: officers.name,
        role: officers.role,
        unitId: officers.unitId,
        regionId: officers.regionId,
        totpEnabled: officers.totpEnabled,
        mustChangePassword: officers.mustChangePassword
      })
      .from(sessions)
      .innerJoin(officers, eq(sessions.officerId, officers.id))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token, app.config.SIGAP_SESSION_SECRET)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          eq(officers.active, true)
        )
      )
      .get();

    if (!row) {
      return reply.code(401).send({
        error: { code: "unauthorized", message: "Sesi tidak valid atau sudah berakhir" }
      });
    }

    // Password awal/reset dari admin harus diganti dulu sebelum fitur lain dipakai.
    const path = request.url.split("?")[0] ?? "";
    if (row.mustChangePassword && !PASSWORD_CHANGE_ALLOWLIST.has(path)) {
      return reply.code(403).send({
        error: {
          code: "password_change_required",
          message: "Ganti password awal Anda terlebih dahulu"
        }
      });
    }

    request.user = {
      id: row.officerId,
      sessionId: row.sessionId,
      username: row.username,
      name: row.name,
      role: row.role as Role,
      unitId: row.unitId,
      regionId: row.regionId,
      totpEnabled: row.totpEnabled
    };
  });

  app.decorate("requireRole", function (...roles: Role[]) {
    return async function (request, reply) {
      await app.authenticate(request, reply);
      if (reply.sent) return;
      if (!request.user || !roles.includes(request.user.role)) {
        return reply.code(403).send({
          error: { code: "forbidden", message: "Anda tidak memiliki akses ke aksi ini" }
        });
      }
    };
  });
}
