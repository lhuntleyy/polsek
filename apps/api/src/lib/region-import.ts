import { randomUUID } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { geometryCenter, validateGeoPolygon } from "@sigap/core";
import type { Db } from "../db/client.js";
import { officers, regions } from "../db/schema.js";
import { writeAudit } from "./audit.js";
import { DEFAULT_UNIT_ID } from "./constants.js";

export interface RegionImportOptions {
  /** Nonaktifkan wilayah demo (is_demo = 1). */
  deactivateDemo?: boolean;
  /** Nonaktifkan semua wilayah yang tidak ada di file. */
  deactivateOthers?: boolean;
  dryRun?: boolean;
}

export interface RegionImportResult {
  created: string[];
  updated: string[];
  deactivated: string[];
  /** Petugas (bhabin) yang masih terikat ke wilayah yang dinonaktifkan. */
  orphanedOfficers: Array<{ username: string | null; name: string; region: string }>;
}

interface FeatureLike {
  type?: unknown;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
}

/**
 * Impor FeatureCollection GeoJSON menjadi wilayah SIGAP (upsert berdasarkan
 * nama). Wilayah lama tidak pernah dihapus — hanya dinonaktifkan — supaya
 * tiket lama tetap menunjuk ke wilayahnya.
 */
export function importRegions(
  db: Db,
  collection: unknown,
  options: RegionImportOptions = {},
  sqliteTransaction?: <T>(fn: () => T) => T
): RegionImportResult {
  const fc = collection as { type?: unknown; features?: unknown };
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new Error("File harus GeoJSON FeatureCollection");
  }
  const items = (fc.features as FeatureLike[]).map((feature, index) => {
    const name = typeof feature.properties?.name === "string" ? feature.properties.name.trim() : "";
    if (name.length < 2 || name.length > 120) {
      throw new Error(`Feature #${index + 1}: properties.name wajib (2–120 karakter)`);
    }
    const validation = validateGeoPolygon(feature.geometry);
    if (!validation.ok) throw new Error(`Feature "${name}": ${validation.error}`);
    return { name, geometry: validation.geometry };
  });
  const names = items.map((item) => item.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) throw new Error(`Nama wilayah ganda di file: ${[...new Set(duplicates)].join(", ")}`);

  const result: RegionImportResult = { created: [], updated: [], deactivated: [], orphanedOfficers: [] };

  const run = () => {
    const now = new Date().toISOString();
    for (const item of items) {
      const center = geometryCenter(item.geometry);
      const existing = db
        .select()
        .from(regions)
        .where(and(eq(regions.unitId, DEFAULT_UNIT_ID), eq(regions.name, item.name)))
        .get();
      if (existing) {
        result.updated.push(item.name);
        if (options.dryRun) continue;
        db.update(regions)
          .set({
            geojson: JSON.stringify(item.geometry),
            centroidLat: center.lat,
            centroidLng: center.lng,
            active: true,
            isDemo: false,
            version: existing.version + 1,
            updatedAt: now
          })
          .where(eq(regions.id, existing.id))
          .run();
      } else {
        result.created.push(item.name);
        if (options.dryRun) continue;
        db.insert(regions)
          .values({
            id: randomUUID(),
            unitId: DEFAULT_UNIT_ID,
            name: item.name,
            level: "kelurahan",
            parentId: null,
            geojson: JSON.stringify(item.geometry),
            centroidLat: center.lat,
            centroidLng: center.lng,
            active: true,
            isDemo: false,
            version: 1,
            createdAt: now,
            updatedAt: now
          })
          .run();
      }
    }

    if (options.deactivateDemo || options.deactivateOthers) {
      const conditions = [eq(regions.unitId, DEFAULT_UNIT_ID), eq(regions.active, true), notInArray(regions.name, names)];
      if (!options.deactivateOthers) conditions.push(eq(regions.isDemo, true));
      const targets = db.select().from(regions).where(and(...conditions)).all();
      for (const region of targets) {
        result.deactivated.push(region.name);
        const bound = db
          .select({ username: officers.username, name: officers.name })
          .from(officers)
          .where(and(eq(officers.regionId, region.id), eq(officers.active, true)))
          .all();
        for (const officer of bound) result.orphanedOfficers.push({ ...officer, region: region.name });
        if (options.dryRun) continue;
        db.update(regions)
          .set({ active: false, version: region.version + 1, updatedAt: now })
          .where(eq(regions.id, region.id))
          .run();
      }
    }

    if (!options.dryRun) {
      writeAudit(db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: null,
        action: "region.import",
        entity: "region",
        entityId: null,
        meta: {
          created: result.created.length,
          updated: result.updated.length,
          deactivated: result.deactivated.length
        },
        ip: null,
        userAgent: null
      });
    }
  };

  if (sqliteTransaction) sqliteTransaction(run);
  else run();
  return result;
}
