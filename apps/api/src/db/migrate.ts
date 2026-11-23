import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const migrationsDir = fileURLToPath(new URL("./migrations/", import.meta.url));

export function runMigrations(
  sqlite: Database.Database,
  directory = migrationsDir
): string[] {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    sqlite
      .prepare("SELECT id FROM _migrations")
      .all()
      .map((row) => (row as { id: string }).id)
  );

  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const justApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(directory, file), "utf8");
    const run = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite
        .prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)")
        .run(file, new Date().toISOString());
    });
    run();
    justApplied.push(file);
  }
  return justApplied;
}


