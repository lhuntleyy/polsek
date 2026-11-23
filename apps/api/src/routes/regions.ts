import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  geometryCenter,
  regionSchema,
  regionUpdateSchema,
  validateGeoPolygon,
  type GeoPolygon
} from "@sigap/core";
import { officers, regions, tickets } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { badRequest, notFound } from "../lib/errors.js";

export function registerRegionRoutes(app: FastifyInstance): void {
  app.get("/api/regions", { preHandler: app.authenticate }, async (request) => {
    const user = request.user;
    const counts = app.db
      .select({ regionId: tickets.regionId, count: sql<number>`count(*)` })
      .from(tickets)
      .where(eq(tickets.unitId, DEFAULT_UNIT_ID))
      .groupBy(tickets.regionId)
      .all();
    const countMap = new Map(counts.map((row) => [row.regionId, Number(row.count)]));

    const rows = app.db
      .select()
      .from(regions)
      .where(eq(regions.unitId, DEFAULT_UNIT_ID))
      .all();

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        level: row.level,
        parentId: row.parentId,
        geojson: JSON.parse(row.geojson) as GeoPolygon,
        center: { lat: row.centroidLat ?? 0, lng: row.centroidLng ?? 0 },
        active: row.active,
        isDemo: row.isDemo,
        version: row.version,
        ticketCount:
          user?.role === "bhabin" && row.id !== user.regionId
            ? 0
            : (countMap.get(row.id) ?? 0)
      }))
    };
  });

  app.post(
    "/api/regions",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = regionSchema.parse(request.body);
      if (input.parentId) {
        const parent = app.db
          .select({ id: regions.id })
          .from(regions)
          .where(and(eq(regions.id, input.parentId), eq(regions.unitId, DEFAULT_UNIT_ID)))
          .get();
        if (!parent) throw badRequest("Wilayah induk tidak ditemukan");
      }
      const validation = validateGeoPolygon(input.geojson);
      if (!validation.ok) throw badRequest(validation.error);
      const center = geometryCenter(validation.geometry);
      const now = new Date().toISOString();
      const id = randomUUID();

      app.db
        .insert(regions)
        .values({
          id,
          unitId: DEFAULT_UNIT_ID,
          name: input.name,
          level: "kelurahan",
          parentId: input.parentId ?? null,
          geojson: JSON.stringify(validation.geometry),
          centroidLat: center.lat,
          centroidLng: center.lng,
          active: input.active,
          isDemo: input.isDemo,
          version: 1,
          createdAt: now,
          updatedAt: now
        })
        .run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "region.create",
        entity: "region",
        entityId: id,
        meta: { name: input.name, isDemo: input.isDemo },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { id };
    }
  );

  app.patch(
    "/api/regions/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const input = regionUpdateSchema.parse(request.body);
      const existing = app.db
        .select()
        .from(regions)
        .where(eq(regions.id, id))
        .get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Wilayah tidak ditemukan");
      }

      const changed =
        input.name !== undefined || input.active !== undefined || input.geojson !== undefined;
      if (!changed) {
        return { ok: true, version: existing.version };
      }

      const nextVersion = existing.version + 1;
      const patch: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
        version: nextVersion
      };
      if (input.name !== undefined) patch.name = input.name;
      if (input.active !== undefined) patch.active = input.active;
      if (input.geojson !== undefined) {
        const validation = validateGeoPolygon(input.geojson);
        if (!validation.ok) throw badRequest(validation.error);
        const center = geometryCenter(validation.geometry);
        patch.geojson = JSON.stringify(validation.geometry);
        patch.centroidLat = center.lat;
        patch.centroidLng = center.lng;
      }

      app.db.update(regions).set(patch).where(eq(regions.id, id)).run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "region.update",
        entity: "region",
        entityId: id,
        meta: { keys: Object.keys(input) },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { ok: true, version: nextVersion };
    }
  );

  app.delete(
    "/api/regions/:id",
    { preHandler: app.requireRole("admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const { id } = request.params as { id: string };
      const existing = app.db
        .select()
        .from(regions)
        .where(eq(regions.id, id))
        .get();
      if (!existing || existing.unitId !== DEFAULT_UNIT_ID) {
        throw notFound("Wilayah tidak ditemukan");
      }

      const ticketRefs = app.db
        .select({ n: sql<number>`count(*)` })
        .from(tickets)
        .where(eq(tickets.regionId, id))
        .get();
      const officerRefs = app.db
        .select({ n: sql<number>`count(*)` })
        .from(officers)
        .where(eq(officers.regionId, id))
        .get();
      const childRefs = app.db
        .select({ n: sql<number>`count(*)` })
        .from(regions)
        .where(eq(regions.parentId, id))
        .get();
      const ticketsCount = Number(ticketRefs?.n ?? 0);
      const officersCount = Number(officerRefs?.n ?? 0);
      const childrenCount = Number(childRefs?.n ?? 0);
      const now = new Date().toISOString();

      if (ticketsCount > 0 || officersCount > 0 || childrenCount > 0) {
        app.db
          .update(regions)
          .set({ active: false, updatedAt: now, version: existing.version + 1 })
          .where(eq(regions.id, id))
          .run();
        writeAudit(app.db, {
          unitId: DEFAULT_UNIT_ID,
          actorId: user.id,
          action: "region.deactivate",
          entity: "region",
          entityId: id,
          meta: {
            reason: "has_history",
            tickets: ticketsCount,
            officers: officersCount,
            children: childrenCount
          },
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null
        });
        return {
          ok: true,
          mode: "deactivated" as const,
          tickets: ticketsCount,
          officers: officersCount
        };
      }

      app.db.delete(regions).where(eq(regions.id, id)).run();
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "region.delete",
        entity: "region",
        entityId: id,
        meta: { name: existing.name },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true, mode: "deleted" as const };
    }
  );
}
