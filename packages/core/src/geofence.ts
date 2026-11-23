import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import buffer from "@turf/buffer";
import distance from "@turf/distance";
import { point } from "@turf/helpers";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { z } from "zod";
import type {
  GeoPolygon,
  LocationClassification,
  RegionInput
} from "./types.js";

const MAX_GEOJSON_VERTICES = 25_000;
const MAX_BUFFER_CACHE = 256;

const lngSchema = z.number().finite().min(-180).max(180);
const latSchema = z.number().finite().min(-90).max(90);
const positionSchema = z
  .union([
    z.tuple([lngSchema, latSchema]),
    z.tuple([lngSchema, latSchema, z.number().finite()])
  ])
  .transform(([lng, lat]): [number, number] => [lng, lat]);
const ringSchema = z.array(positionSchema).min(4);
const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(ringSchema).min(1)
});
const multiPolygonSchema = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(ringSchema).min(1)).min(1)
});
const geoPolygonSchema = z.union([polygonSchema, multiPolygonSchema]);

export type GeoValidationResult =
  | { ok: true; geometry: GeoPolygon }
  | { ok: false; error: string };

const bufferCache = new Map<string, Feature<Polygon | MultiPolygon> | null>();

function ringIsClosed(ring: number[][]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return Boolean(
    first &&
      last &&
      first.length >= 2 &&
      last.length >= 2 &&
      first[0] === last[0] &&
      first[1] === last[1]
  );
}

export function validateGeoPolygon(value: unknown): GeoValidationResult {
  const parsed = geoPolygonSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "GeoJSON harus Polygon atau MultiPolygon dengan koordinat valid" };
  }

  const geometry = parsed.data;
  const polygons: number[][][][] =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  let vertexCount = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      vertexCount += ring.length;
      if (vertexCount > MAX_GEOJSON_VERTICES) {
        return {
          ok: false,
          error: `GeoJSON melebihi batas maksimal ${MAX_GEOJSON_VERTICES} titik koordinat`
        };
      }
      if (!ringIsClosed(ring)) {
        return { ok: false, error: "Setiap ring polygon harus tertutup (titik awal = titik akhir)" };
      }
    }
  }

  return { ok: true, geometry };
}

export function toFeature(geometry: GeoPolygon): Feature<Polygon | MultiPolygon> {
  return { type: "Feature", properties: {}, geometry };
}

export function pointInRegion(lat: number, lng: number, region: RegionInput): boolean {
  return booleanPointInPolygon(point([lng, lat]), toFeature(region.geojson));
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  return (
    distance(point([a.lng, a.lat]), point([b.lng, b.lat]), { units: "kilometers" }) * 1000
  );
}

function geometryFingerprint(region: RegionInput): string {
  const geom = region.geojson;
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0] ?? [];
    const first = ring[0];
    const mid = ring[Math.floor(ring.length / 2)];
    return `${region.id}:P:${geom.coordinates.length}:${ring.length}:${first?.[0] ?? 0},${first?.[1] ?? 0}:${mid?.[0] ?? 0},${mid?.[1] ?? 0}`;
  }
  const ring = geom.coordinates[0]?.[0] ?? [];
  const first = ring[0];
  const lastPoly = geom.coordinates[geom.coordinates.length - 1]?.[0] ?? [];
  const lastPt = lastPoly[Math.floor(lastPoly.length / 2)];
  return `${region.id}:MP:${geom.coordinates.length}:${ring.length}:${first?.[0] ?? 0},${first?.[1] ?? 0}:${lastPt?.[0] ?? 0},${lastPt?.[1] ?? 0}`;
}

function getBufferedRegion(region: RegionInput): Feature<Polygon | MultiPolygon> | null {
  const key = geometryFingerprint(region);
  if (bufferCache.has(key)) {
    return bufferCache.get(key) ?? null;
  }
  const buffered = buffer(toFeature(region.geojson), 0.25, { units: "kilometers" }) ?? null;
  if (bufferCache.size >= MAX_BUFFER_CACHE) {
    const oldestKey = bufferCache.keys().next().value;
    if (oldestKey !== undefined) bufferCache.delete(oldestKey);
  }
  bufferCache.set(key, buffered);
  return buffered;
}

export function distanceToPolygonBoundaryMeters(
  target: { lat: number; lng: number },
  geometry: GeoPolygon
): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const cosLat = Math.cos((target.lat * Math.PI) / 180) || 1;
  let minMeters = Number.POSITIVE_INFINITY;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 0; i < ring.length - 1; i += 1) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        if (!p1 || !p2) continue;
        const lng1 = p1[0] ?? 0;
        const lat1 = p1[1] ?? 0;
        const lng2 = p2[0] ?? 0;
        const lat2 = p2[1] ?? 0;

        const ax = (lng1 - target.lng) * cosLat;
        const ay = lat1 - target.lat;
        const bx = (lng2 - target.lng) * cosLat;
        const by = lat2 - target.lat;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq)) : 0;

        const closestLng = lng1 + t * (lng2 - lng1);
        const closestLat = lat1 + t * (lat2 - lat1);
        const meters = distanceMeters(target, { lat: closestLat, lng: closestLng });
        if (meters < minMeters) minMeters = meters;
      }
    }
  }
  return minMeters;
}

export function geometryCenter(geometry: GeoPolygon): { lat: number; lng: number } {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let latSum = 0;
  let lngSum = 0;
  let count = 0;

  for (const polygon of polygons) {
    const ring = polygon[0] ?? [];
    if (ring.length === 0) continue;
    const first = ring[0];
    const last = ring[ring.length - 1];
    const closed =
      Boolean(first && last) && first?.[0] === last?.[0] && first?.[1] === last?.[1];
    const points = closed ? ring.slice(0, -1) : ring;
    for (const coord of points) {
      lngSum += coord[0] ?? 0;
      latSum += coord[1] ?? 0;
      count += 1;
    }
  }

  if (count === 0) return { lat: 0, lng: 0 };
  return { lat: latSum / count, lng: lngSum / count };
}

/**
 * Validasi lokasi kejadian terhadap wilkum.
 * Buffer 250 m dipakai untuk titik di perbatasan; titik jauh di luar -> outside.
 */
export function classifyLocation(
  input: { lat: number; lng: number; accuracyM?: number },
  regions: RegionInput[]
): LocationClassification {
  if (
    !Number.isFinite(input.lat) ||
    !Number.isFinite(input.lng) ||
    input.lat < -90 ||
    input.lat > 90 ||
    input.lng < -180 ||
    input.lng > 180
  ) {
    return {
      status: "needs_verification",
      regionId: null,
      nearestRegionId: null,
      distanceMeters: null,
      reason: "invalid_coordinates"
    };
  }

  if (regions.length === 0) {
    return {
      status: "needs_verification",
      regionId: null,
      nearestRegionId: null,
      distanceMeters: null,
      reason: "no_regions"
    };
  }

  const pt = point([input.lng, input.lat]);

  for (const region of regions) {
    if (booleanPointInPolygon(pt, toFeature(region.geojson))) {
      const lowAccuracy = (input.accuracyM ?? 0) > 100;
      return {
        status: lowAccuracy ? "needs_verification" : "verified",
        regionId: region.id,
        nearestRegionId: region.id,
        distanceMeters: 0,
        reason: lowAccuracy ? "accuracy_low" : null
      };
    }
  }

  let bestBuffered: { region: RegionInput; distance: number } | null = null;
  for (const region of regions) {
    const buffered = getBufferedRegion(region);
    if (buffered && booleanPointInPolygon(pt, buffered)) {
      const d = distanceToPolygonBoundaryMeters({ lat: input.lat, lng: input.lng }, region.geojson);
      if (!bestBuffered || d < bestBuffered.distance) {
        bestBuffered = { region, distance: d };
      }
    }
  }
  if (bestBuffered) {
    return {
      status: "needs_verification",
      regionId: bestBuffered.region.id,
      nearestRegionId: bestBuffered.region.id,
      distanceMeters: Math.round(bestBuffered.distance),
      reason: "near_boundary"
    };
  }

  let nearest: RegionInput | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const d = distanceToPolygonBoundaryMeters({ lat: input.lat, lng: input.lng }, region.geojson);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearest = region;
    }
  }

  if (nearest && nearestDistance <= 1000) {
    return {
      status: "needs_verification",
      regionId: nearest.id,
      nearestRegionId: nearest.id,
      distanceMeters: Math.round(nearestDistance),
      reason: "near_wilkum"
    };
  }

  return {
    status: "outside",
    regionId: null,
    nearestRegionId: nearest?.id ?? null,
    distanceMeters: Number.isFinite(nearestDistance) ? Math.round(nearestDistance) : null,
    reason: "outside_wilkum"
  };
}
