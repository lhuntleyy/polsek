#!/usr/bin/env node
/**
 * Buat paket rilis produksi untuk di-upload ke server.
 *
 *   pnpm release              # test + build + paket
 *   pnpm release --skip-test  # lewati test (tidak disarankan)
 *
 * Hasil: release/sigap-v<versi>.tar.gz berisi HANYA yang dibutuhkan server:
 * hasil build (dist), package.json + lockfile (agar native module dipasang
 * ulang untuk Linux), infra/, deploy/, dan dokumen deploy.
 *
 * Yang SENGAJA tidak ikut: .env, data/ (DB, media, sesi WhatsApp),
 * node_modules (binary Windows), source TypeScript, test, prototype.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const name = `sigap-v${version}`;
const outDir = join(root, "release");
const stage = join(outDir, "stage", name);
const skipTest = process.argv.includes("--skip-test");

const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

if (!skipTest) {
  console.log("\n== Typecheck & test ==");
  run("pnpm -r typecheck");
  run("pnpm -r test");
}
console.log("\n== Build produksi ==");
run("pnpm -r build");
run("node infra/scripts/csp-hash.mjs --check");

console.log("\n== Menyusun paket ==");
rmSync(join(outDir, "stage"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const include = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".env.example",
  "README.md",
  "apps/api/package.json",
  "apps/api/dist",
  "apps/bot/package.json",
  "apps/bot/dist",
  "apps/web/package.json",
  "apps/web/dist",
  "packages/core/package.json",
  "packages/config/package.json",
  "infra",
  "deploy",
  "docs/26-DEPLOY.md",
  "docs/27-AUDIT-LANJUTAN.md",
  "docs/17-RUNBOOK.md"
];
for (const item of include) {
  const from = join(root, item);
  if (!existsSync(from)) throw new Error(`Tidak ditemukan: ${item} (sudah build?)`);
  cpSync(from, join(stage, item), { recursive: true });
}

// Sourcemap tidak boleh ikut ke produksi (membuka source code).
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
for (const file of walk(stage)) {
  if (file.endsWith(".map")) rmSync(file);
}

// Penjaga terakhir: pastikan tidak ada secret/data yang ikut.
const forbidden = walk(stage).filter((file) => {
  const rel = relative(stage, file).replaceAll("\\", "/");
  return (
    /(^|\/)\.env($|\.(?!example$))/.test(rel) ||
    /\.(db|db-wal|db-shm|bak)$/.test(rel) ||
    rel.includes("baileys") && !rel.startsWith("infra/") && !rel.startsWith("docs/") && !rel.startsWith("apps/")
  );
});
if (forbidden.length > 0) throw new Error(`File terlarang ikut paket:\n${forbidden.join("\n")}`);

writeFileSync(
  join(stage, "RELEASE.txt"),
  [
    `SIGAP ${version}`,
    `Dibuat: ${new Date().toISOString()}`,
    "",
    "Pasang / update di server Ubuntu 24.04:",
    `  tar -xzf ${name}.tar.gz && cd ${name}`,
    "  sudo bash deploy/install.sh <domain-atau-IP>",
    "",
    "Panduan lengkap: docs/26-DEPLOY.md"
  ].join("\n") + "\n"
);

const archive = join(outDir, `${name}.tar.gz`);
rmSync(archive, { force: true });
// Path relatif + cwd di folder stage: aman untuk tar Windows (bsdtar) & GNU tar.
execSync(`tar -czf "../${name}.tar.gz" "${name}"`, { cwd: join(outDir, "stage"), stdio: "inherit" });
rmSync(join(outDir, "stage"), { recursive: true, force: true });

const sizeMb = (statSync(archive).size / 1024 / 1024).toFixed(1);
console.log(`\nPaket siap: ${relative(root, archive)} (${sizeMb} MB)`);
console.log(`Upload: scp ${relative(root, archive).replaceAll("\\", "/")} user@server:~/`);
