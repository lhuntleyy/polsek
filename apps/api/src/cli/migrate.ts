import { loadConfig } from "@sigap/config";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { loadEnv } from "../env.js";

loadEnv();
const config = loadConfig();
const { sqlite, close } = createDb(config);
try {
  const applied = runMigrations(sqlite);
  console.log(
    applied.length ? `Migrasi diterapkan: ${applied.join(", ")}` : "Tidak ada migrasi baru."
  );
} finally {
  close();
}
