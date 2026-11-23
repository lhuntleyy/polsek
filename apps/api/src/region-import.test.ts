import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { classifyLocation, type GeoPolygon } from "@sigap/core";
import { loadConfig } from "@sigap/config";
import { buildApp } from "./app.js";
import { importRegions } from "./lib/region-import.js";

const mediaDir = mkdtempSync(join(tmpdir(), "sigap-region-import-"));
const wilkumFile = resolve(__dirname, "../../../docs/wilkum/teluknaga.geojson");
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(
    loadConfig({
      SIGAP_ENV: "test",
      SIGAP_DB_PATH: ":memory:",
      SIGAP_MEDIA_DIR: mediaDir,
      SIGAP_SEED_DEMO: "true",
      SIGAP_ADMIN_PASSWORD: "Admin#12345",
      SIGAP_INTERNAL_TOKEN: "test-internal-token-123456",
      SIGAP_LOG_LEVEL: "silent"
    }),
    { seed: true, logger: false, rateLimit: false }
  );
}, 60_000);

afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

function activeRegions() {
  return app.sqlite
    .prepare("SELECT id, name, geojson, is_demo FROM regions WHERE active = 1")
    .all() as Array<{ id: string; name: string; geojson: string; is_demo: number }>;
}

describe("Teluknaga wilkum import", () => {
  it("imports the 22 OSM-derived desa polygons and deactivates demo regions", () => {
    const collection = JSON.parse(readFileSync(wilkumFile, "utf8"));
    const dry = importRegions(app.db, collection, { deactivateDemo: true, dryRun: true });
    expect(dry.created).toHaveLength(22);
    expect(activeRegions().every((r) => r.is_demo === 1)).toBe(true); // dry run tidak mengubah apa pun

    const result = importRegions(app.db, collection, { deactivateDemo: true }, (fn) =>
      app.sqlite.transaction(fn).immediate()
    );
    expect(result.created).toHaveLength(22);
    expect(result.deactivated.length).toBeGreaterThan(0);
    // Bhabin demo terikat ke wilayah demo → dilaporkan agar dipindahkan.
    expect(result.orphanedOfficers.length).toBeGreaterThan(0);

    const active = activeRegions();
    expect(active).toHaveLength(22);
    expect(active.every((r) => r.is_demo === 0)).toBe(true);

    // Import ulang = update, bukan duplikat.
    const again = importRegions(app.db, collection);
    expect(again.created).toHaveLength(0);
    expect(again.updated).toHaveLength(22);
    expect(activeRegions()).toHaveLength(22);
  });

  it("classifies points inside and outside the Teluknaga wilkum", () => {
    const regions = activeRegions().map((r) => ({
      id: r.id,
      name: r.name,
      geojson: JSON.parse(r.geojson) as GeoPolygon,
      center: { lat: 0, lng: 0 },
      isDemo: false
    }));
    const source = JSON.parse(
      readFileSync(resolve(__dirname, "../../../docs/wilkum/teluknaga-osm-source.json"), "utf8")
    ) as { villages: Array<{ name: string; point: [number, number] | null }> };
    for (const village of source.villages.filter((v) => v.point)) {
      const [lng, lat] = village.point as [number, number];
      const hit = classifyLocation({ lat, lng }, regions);
      expect(hit.status, village.name).toBe("verified");
      expect(regions.find((r) => r.id === hit.regionId)?.name).toBe(village.name);
    }
    expect(classifyLocation({ lat: -6.1754, lng: 106.8272 }, regions).status).toBe("outside"); // Monas
  });

  it("rejects malformed collections without touching the database", () => {
    const before = activeRegions().length;
    expect(() => importRegions(app.db, { type: "FeatureCollection", features: [{ properties: {}, geometry: null }] })).toThrow();
    expect(activeRegions()).toHaveLength(before);
  });
});
