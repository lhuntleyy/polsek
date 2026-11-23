import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("src/db/migrations");
// The bundler rewrites import.meta.url to dist/server.js, so runMigrations
// resolves "./migrations/" relative to dist/. Keep both paths for safety.
const targets = [resolve("dist/migrations"), resolve("dist/db/migrations")];
for (const target of targets) {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}
console.log("Migrations copied to dist/migrations and dist/db/migrations");
