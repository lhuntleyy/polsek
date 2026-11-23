/**
 * Impor wilayah (polygon desa/kelurahan) dari GeoJSON FeatureCollection.
 *
 *   pnpm --filter @sigap/api regions:import -- <file.geojson> [--deactivate-demo] [--deactivate-others] [--dry-run]
 *
 * - Upsert berdasarkan `properties.name`: nama yang sudah ada diperbarui
 *   polygonnya, nama baru ditambahkan.
 * - --deactivate-demo   : nonaktifkan wilayah demo bawaan seed.
 * - --deactivate-others : nonaktifkan semua wilayah yang tidak ada di file.
 * - --dry-run           : tampilkan rencana tanpa mengubah database.
 * Wilayah tidak pernah dihapus (tiket lama tetap menunjuk ke wilayahnya).
 * Aman dijalankan saat API hidup (SQLite WAL); perubahan langsung berlaku.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@sigap/config";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { loadEnv } from "../env.js";
import { importRegions } from "../lib/region-import.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const file = args.find((arg) => !arg.startsWith("--"));
if (!file) {
  console.error(
    "Pemakaian: pnpm --filter @sigap/api regions:import -- <file.geojson> [--deactivate-demo] [--deactivate-others] [--dry-run]"
  );
  process.exit(1);
}

loadEnv();
const config = loadConfig();
const handle = createDb(config);
try {
  runMigrations(handle.sqlite);
  const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
  const collection = JSON.parse(readFileSync(path, "utf8"));
  const dryRun = args.includes("--dry-run");
  const result = importRegions(
    handle.db,
    collection,
    {
      deactivateDemo: args.includes("--deactivate-demo"),
      deactivateOthers: args.includes("--deactivate-others"),
      dryRun
    },
    (fn) => handle.sqlite.transaction(fn).immediate()
  );
  console.log(`${dryRun ? "[DRY RUN] " : ""}File: ${path}`);
  console.log(`Ditambah   (${result.created.length}): ${result.created.join(", ") || "-"}`);
  console.log(`Diperbarui (${result.updated.length}): ${result.updated.join(", ") || "-"}`);
  console.log(`Dinonaktifkan (${result.deactivated.length}): ${result.deactivated.join(", ") || "-"}`);
  if (result.orphanedOfficers.length > 0) {
    console.warn("\nPERHATIAN: akun Bhabin berikut masih terikat ke wilayah yang dinonaktifkan. Pindahkan di Sistem → Petugas:");
    for (const officer of result.orphanedOfficers) {
      console.warn(`  - ${officer.name} (${officer.username ?? "-"}) → ${officer.region}`);
    }
  }
} finally {
  handle.close();
}
