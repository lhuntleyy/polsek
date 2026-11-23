import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { AppConfig } from "@sigap/config";
import { schema } from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

export interface DbHandle {
  sqlite: Database.Database;
  db: Db;
  close: () => void;
}

export function createDb(config: AppConfig): DbHandle {
  if (config.dbPath !== ":memory:") {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }
  mkdirSync(config.mediaDir, { recursive: true });

  const sqlite = new Database(config.dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");

  const db = drizzle(sqlite, { schema });

  return {
    sqlite,
    db,
    close: () => {
      if (sqlite.open) sqlite.close();
    }
  };
}
