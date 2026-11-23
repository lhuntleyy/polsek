#!/usr/bin/env node
// Hitung hash CSP untuk setiap <script> inline di index.html hasil build, dan
// (opsional) cek apakah Caddyfile sudah memuat hash yang benar.
//
//   node infra/scripts/csp-hash.mjs                 # tampilkan hash
//   node infra/scripts/csp-hash.mjs --check          # exit 1 bila Caddyfile tidak cocok
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const htmlPath = process.env.SIGAP_INDEX_HTML ?? resolve(root, "apps/web/dist/index.html");
const caddyPath = process.env.SIGAP_CADDYFILE ?? resolve(root, "infra/caddy/Caddyfile");

const html = readFileSync(htmlPath, "utf8");
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (match) => `'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`
);

if (hashes.length === 0) {
  console.log("Tidak ada script inline.");
  process.exit(0);
}
console.log(hashes.join(" "));

if (process.argv.includes("--check")) {
  const caddy = readFileSync(caddyPath, "utf8");
  const missing = hashes.filter((hash) => !caddy.includes(hash));
  if (missing.length > 0) {
    console.error(`Caddyfile belum memuat hash: ${missing.join(" ")}`);
    process.exit(1);
  }
  console.log("Caddyfile CSP cocok.");
}
