import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { settingsPatchSchema } from "@sigap/core";
import { units, waGroups } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { notFound } from "../lib/errors.js";
import { readSettings, writeSettings } from "../lib/settings.js";

function serializeSettings(settings: ReturnType<typeof readSettings>) {
  return { ...settings };
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get("/api/public/config", async () => {
    const unit = readSettings(app.db, app.config);
    return {
      unit: {
        name: unit.unitName,
        code: unit.unitCode,
        address: unit.unitAddress,
        timezone: unit.unitTimezone
      },
      version: app.config.version,
      // Jangan umumkan env produksi ke pengunjung tanpa login.
      env: app.config.isProduction ? undefined : app.config.SIGAP_ENV,
      demoEnabled: app.config.seedDemo && !app.config.isProduction,
      features: {
        whatsapp: app.gateway.get().status === "connected",
        map: true
      }
    };
  });

  app.get(
    "/api/settings",
    { preHandler: app.requireRole("admin") },
    async () => {
      return { settings: serializeSettings(readSettings(app.db, app.config)) };
    }
  );

  app.patch(
    "/api/settings",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const patch = settingsPatchSchema.parse(request.body);
      writeSettings(app.db, patch, user.id);

      const unitPatch: Record<string, unknown> = {};
      if (patch.unit_name !== undefined) unitPatch.name = patch.unit_name;
      if (patch.unit_code !== undefined) unitPatch.code = patch.unit_code.toUpperCase();
      if (patch.unit_address !== undefined) unitPatch.address = patch.unit_address;
      if (patch.unit_timezone !== undefined) unitPatch.timezone = patch.unit_timezone;
      if (Object.keys(unitPatch).length > 0) {
        app.db.update(units).set(unitPatch).where(eq(units.id, DEFAULT_UNIT_ID)).run();
      }

      // Pastikan grup URC yang diisi di Pengaturan juga terdaftar sebagai
      // grup aktif agar command /otw, /tiba, /selesai langsung diterima bot.
      if (patch.wa_group_urc_jid) {
        const existingGroup = app.db
          .select()
          .from(waGroups)
          .where(eq(waGroups.jid, patch.wa_group_urc_jid))
          .get();
        if (!existingGroup) {
          app.db
            .insert(waGroups)
            .values({
              id: randomUUID(),
              unitId: DEFAULT_UNIT_ID,
              name: "Grup URC",
              jid: patch.wa_group_urc_jid,
              purpose: "urc",
              active: true,
              createdAt: new Date().toISOString()
            })
            .run();
        } else if (!existingGroup.active) {
          app.db
            .update(waGroups)
            .set({ active: true })
            .where(eq(waGroups.id, existingGroup.id))
            .run();
        }
      }

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "settings.update",
        entity: "settings",
        entityId: null,
        meta: { keys: Object.keys(patch) },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { settings: serializeSettings(readSettings(app.db, app.config)) };
    }
  );
}
