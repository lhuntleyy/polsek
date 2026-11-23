/**
 * Rotasi secret SIGAP tanpa kehilangan data.
 *
 *   pnpm --filter @sigap/api secrets:rotate            # buat secret baru, tampilkan
 *   pnpm --filter @sigap/api secrets:rotate -- --write-env ../../.env
 *
 * Langkah:
 * 1. Backup DB (`<db>.pre-rotate-<waktu>.bak`).
 * 2. Dekripsi nomor pelapor & TOTP dengan kunci LAMA (dari env saat ini),
 *    enkripsi ulang dengan kunci BARU, hitung ulang phone_hash dengan pepper baru.
 * 3. Cabut semua sesi (SESSION_SECRET baru membuat token lama tidak valid).
 * 4. Tampilkan / tulis nilai baru ke file env.
 *
 * Kunci baru bisa diberikan lewat SIGAP_NEW_PHONE_KEY / SIGAP_NEW_PHONE_PEPPER /
 * SIGAP_NEW_SESSION_SECRET / SIGAP_NEW_INTERNAL_TOKEN; jika kosong dibuat acak.
 * Matikan API & bot sebelum menjalankan ini.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadConfig } from "@sigap/config";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import {
  decryptPhone,
  decryptTotpSecret,
  encryptPhone,
  encryptTotpSecret,
  hashPhone
} from "../lib/crypto.js";
import { loadEnv } from "../env.js";

loadEnv();
const config = loadConfig();

const fresh = {
  SIGAP_PHONE_KEY: process.env.SIGAP_NEW_PHONE_KEY || randomBytes(32).toString("base64"),
  SIGAP_PHONE_PEPPER: process.env.SIGAP_NEW_PHONE_PEPPER || randomBytes(32).toString("base64url"),
  SIGAP_SESSION_SECRET:
    process.env.SIGAP_NEW_SESSION_SECRET || randomBytes(48).toString("base64url"),
  SIGAP_INTERNAL_TOKEN:
    process.env.SIGAP_NEW_INTERNAL_TOKEN || randomBytes(32).toString("base64url")
};
if (Buffer.from(fresh.SIGAP_PHONE_KEY, "base64").length !== 32) {
  throw new Error("SIGAP_NEW_PHONE_KEY harus 32 byte base64");
}

const writeEnvIndex = process.argv.indexOf("--write-env");
const envPath = writeEnvIndex >= 0 ? process.argv[writeEnvIndex + 1] : undefined;

const handle = createDb(config);
runMigrations(handle.sqlite);
const sqlite = handle.sqlite;

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
if (config.dbPath !== ":memory:") {
  const backup = `${config.dbPath}.pre-rotate-${stamp}.bak`;
  await sqlite.backup(backup);
  console.log(`Backup DB: ${backup}`);
}

const reporters = sqlite
  .prepare("SELECT id, phone_enc FROM reporters")
  .all() as Array<{ id: string; phone_enc: string }>;
const officers = sqlite
  .prepare("SELECT id, totp_secret FROM officers WHERE totp_secret IS NOT NULL")
  .all() as Array<{ id: string; totp_secret: string }>;

const updateReporter = sqlite.prepare(
  "UPDATE reporters SET phone_enc = ?, phone_hash = ? WHERE id = ?"
);
const updateOfficer = sqlite.prepare("UPDATE officers SET totp_secret = ? WHERE id = ?");

let reporterCount = 0;
let officerCount = 0;
const failures: string[] = [];

sqlite.transaction(() => {
  // phone_hash UNIQUE: tandai sementara agar urutan update tidak bentrok.
  sqlite.prepare("UPDATE reporters SET phone_hash = 'rotating:' || id").run();
  for (const row of reporters) {
    try {
      const phone = decryptPhone(row.phone_enc, config.SIGAP_PHONE_KEY);
      updateReporter.run(
        encryptPhone(phone, fresh.SIGAP_PHONE_KEY),
        hashPhone(phone, fresh.SIGAP_PHONE_PEPPER),
        row.id
      );
      reporterCount += 1;
    } catch (error) {
      failures.push(`reporter ${row.id}: ${(error as Error).message}`);
    }
  }
  for (const row of officers) {
    try {
      const secret = decryptTotpSecret(row.totp_secret, config.SIGAP_PHONE_KEY);
      updateOfficer.run(encryptTotpSecret(secret, fresh.SIGAP_PHONE_KEY), row.id);
      officerCount += 1;
    } catch (error) {
      failures.push(`officer ${row.id}: ${(error as Error).message}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Rotasi dibatalkan, ${failures.length} data gagal didekripsi:\n${failures.join("\n")}`);
  }
  sqlite
    .prepare("UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL")
    .run(new Date().toISOString());
})();

handle.close();
console.log(`Re-enkripsi selesai: ${reporterCount} pelapor, ${officerCount} TOTP petugas. Semua sesi dicabut.`);

if (envPath) {
  if (!existsSync(envPath)) throw new Error(`File env tidak ditemukan: ${envPath}`);
  let text = readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(fresh)) {
    const line = `${key}="${value}"`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(envPath, text, { mode: 0o600 });
  console.log(`Nilai baru ditulis ke ${envPath}. Salin SIGAP_INTERNAL_TOKEN yang sama ke env bot.`);
} else {
  console.log("\nPerbarui file env API (dan SIGAP_INTERNAL_TOKEN di env bot) dengan nilai berikut:\n");
  for (const [key, value] of Object.entries(fresh)) console.log(`${key}="${value}"`);
}
console.log("\nLalu jalankan ulang API & bot. Semua petugas perlu login ulang.");
