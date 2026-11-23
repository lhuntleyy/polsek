#!/usr/bin/env node
/**
 * Bangun polygon desa/kelurahan PERKIRAAN dari:
 *   - batas kecamatan resmi di OpenStreetMap (polygon nyata), dan
 *   - titik pusat desa di OpenStreetMap.
 *
 * OSM tidak punya batas desa untuk wilayah ini, hanya titik. Karena itu setiap
 * kecamatan dibagi dengan diagram Voronoi: setiap titik di kecamatan masuk ke
 * desa yang titik pusatnya paling dekat. Hasilnya:
 *   - batas LUAR wilkum (gabungan kecamatan) = batas OSM asli → klasifikasi
 *     "di dalam / di luar wilkum" akurat sebatas data OSM;
 *   - batas ANTAR-DESA = perkiraan → hanya untuk menebak desa/Bhabin, wajib
 *     diganti data resmi (BIG/Bappeda/Polres) sebelum dipakai operasional.
 *
 *   node scripts/wilkum/build-wilkum.mjs docs/wilkum/teluknaga-osm-source.json docs/wilkum/teluknaga.geojson
 *
 * Desa tanpa titik (`"point": null`) dilewati dan wilayahnya terbagi ke desa
 * tetangga. Isi titiknya manual di file sumber ([lng, lat]) lalu jalankan ulang.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [sourceFile, outFile] = process.argv.slice(2);
if (!sourceFile || !outFile) {
  console.error("Pemakaian: node scripts/wilkum/build-wilkum.mjs <sumber.json> <keluaran.geojson>");
  process.exit(1);
}
const source = JSON.parse(readFileSync(sourceFile, "utf8"));

// Proyeksi equirectangular lokal agar jarak lintang/bujur sebanding.
const LAT0 = (() => {
  const pts = source.villages.filter((v) => v.point).map((v) => v.point[1]);
  return pts.reduce((a, b) => a + b, 0) / Math.max(1, pts.length);
})();
const KX = Math.cos((LAT0 * Math.PI) / 180);
const KM_PER_DEG = 111.32;
const toXY = ([lng, lat]) => [lng * KX, lat];
const toLL = ([x, y]) => [Math.round((x / KX) * 1e7) / 1e7, Math.round(y * 1e7) / 1e7];

const polygonsOf = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return sum / 2;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(p, polygons) {
  return polygons.some((poly) => pointInRing(p, poly[0]) && !poly.slice(1).some((hole) => pointInRing(p, hole)));
}

/** Potong ring dengan setengah-bidang: simpan titik yang lebih dekat ke `a` daripada ke `b`. */
function clipRing(ring, a, b) {
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny; // <= 0 → sisi a
  const open = ring.slice(0, -1);
  const out = [];
  for (let i = 0; i < open.length; i += 1) {
    const cur = open[i];
    const prev = open[(i + open.length - 1) % open.length];
    const sc = side(cur);
    const sp = side(prev);
    if (sc <= 0) {
      if (sp > 0) out.push(intersect(prev, cur, sp, sc));
      out.push(cur);
    } else if (sp <= 0) {
      out.push(intersect(prev, cur, sp, sc));
    }
  }
  if (out.length < 3) return null;
  out.push(out[0]);
  return out;
}

function intersect(p, q, sp, sq) {
  const t = sp / (sp - sq);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

const areaKm2 = (polygons) =>
  polygons.reduce(
    (sum, poly) =>
      sum + Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0),
    0
  ) * KM_PER_DEG * KM_PER_DEG;

const features = [];
const report = [];

for (const [kecName, kec] of Object.entries(source.kecamatan)) {
  const kecPolys = polygonsOf(kec.geometry).map((poly) => poly.map((ring) => ring.map(toXY)));
  const kecArea = areaKm2(kecPolys);
  const villages = source.villages.filter((v) => v.kecamatan === kecName);
  const withPoint = villages.filter((v) => v.point);
  for (const v of villages.filter((item) => !item.point)) {
    report.push(`⚠ ${v.name} (${kecName}): tidak ada titik di OSM — wilayahnya ikut desa tetangga. Isi "point" manual lalu jalankan ulang.`);
  }

  let covered = 0;
  for (const v of withPoint) {
    const p = toXY(v.point);
    if (!pointInPolygons(p, kecPolys)) {
      report.push(`⚠ ${v.name}: titik OSM berada di luar batas Kecamatan ${kecName}`);
    }
    const others = withPoint.filter((o) => o !== v).map((o) => toXY(o.point));
    const cellPolys = [];
    for (const poly of kecPolys) {
      let outer = poly[0];
      for (const o of others) {
        if (!outer) break;
        outer = clipRing(outer, p, o);
      }
      if (!outer || Math.abs(ringArea(outer)) < 1e-10) continue;
      const holes = poly
        .slice(1)
        .map((hole) => others.reduce((r, o) => (r ? clipRing(r, p, o) : null), hole))
        .filter((r) => r && Math.abs(ringArea(r)) > 1e-10);
      cellPolys.push([outer, ...holes]);
    }
    if (cellPolys.length === 0) {
      report.push(`⚠ ${v.name}: sel Voronoi kosong (titik di luar kecamatan?) — dilewati`);
      continue;
    }
    const area = areaKm2(cellPolys);
    covered += area;
    const coords = cellPolys.map((poly) => poly.map((ring) => ring.map(toLL)));
    features.push({
      type: "Feature",
      properties: {
        name: v.name,
        kecamatan: kecName,
        kind: v.kind,
        code: v.code,
        osmPoint: v.osm,
        osmKecamatan: kec.osm,
        method: "voronoi-approx",
        areaKm2: Math.round(area * 100) / 100
      },
      geometry: coords.length === 1 ? { type: "Polygon", coordinates: coords[0] } : { type: "MultiPolygon", coordinates: coords }
    });
  }
  report.push(
    `Kecamatan ${kecName}: ${withPoint.length}/${villages.length} desa, luas ${kecArea.toFixed(2)} km², tertutup ${((covered / kecArea) * 100).toFixed(1)}%`
  );
}

// Peringatan bandara: area yang mungkin menjadi wilkum polres bandara.
if (source.airport) {
  const airport = polygonsOf(source.airport.geometry).map((poly) => poly.map((ring) => ring.map(toXY)));
  const kosambi = source.kecamatan.Kosambi
    ? polygonsOf(source.kecamatan.Kosambi.geometry).map((poly) => poly.map((ring) => ring.map(toXY)))
    : [];
  const all = airport.flat(2);
  const [minX, maxX] = [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  const [minY, maxY] = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  let inAirport = 0;
  let overlap = 0;
  const N = 120;
  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < N; j += 1) {
      const p = [minX + ((i + 0.5) / N) * (maxX - minX), minY + ((j + 0.5) / N) * (maxY - minY)];
      if (!pointInPolygons(p, airport)) continue;
      inAirport += 1;
      if (pointInPolygons(p, kosambi)) overlap += 1;
    }
  }
  report.push(
    `Bandara Soekarno-Hatta: ±${((overlap / Math.max(1, inAirport)) * 100).toFixed(1)}% area bandara berada di dalam polygon Kosambi`
  );
}

writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      type: "FeatureCollection",
      name: "wilkum",
      attribution: source.source,
      note:
        "Batas luar = batas kecamatan OSM. Batas antar-desa = PERKIRAAN Voronoi dari titik desa OSM; ganti dengan data resmi sebelum operasional.",
      generatedAt: new Date().toISOString(),
      features
    },
    null,
    1
  )}\n`
);
console.log(report.join("\n"));
console.log(`\n${features.length} polygon desa/kelurahan ditulis ke ${outFile}`);
