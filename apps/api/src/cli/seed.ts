import { loadConfig } from "@sigap/config";
import { createDb } from "../db/client.js";
import { runMigrations } from "../db/migrate.js";
import { seedDatabase } from "../db/seed.js";
import { loadEnv } from "../env.js";

loadEnv();
const config = loadConfig();
const handle = createDb(config);
try {
  runMigrations(handle.sqlite);
  await seedDatabase(config, handle);
  console.log("Seed selesai. Admin:", config.SIGAP_ADMIN_USERNAME);
  if (config.seedDemo) {
    console.log("Demo login: piket / Demo#12345, urc / Demo#12345, kapolsek / Demo#12345");
  }
} finally {
  handle.close();
}
