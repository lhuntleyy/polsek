import { defaultSecretsInUse, loadConfig } from "@sigap/config";
import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";

loadEnv();
const config = loadConfig();

const app = await buildApp(config, { seed: true });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({
    host: config.SIGAP_API_HOST,
    port: config.SIGAP_API_PORT
  });
  app.log.info(
    {
      env: config.SIGAP_ENV,
      port: config.SIGAP_API_PORT,
      unit: config.SIGAP_UNIT_NAME
    },
    "SIGAP API ready"
  );
  const defaults = defaultSecretsInUse(config);
  if (defaults.length > 0) {
    // Nilai default tertulis di repo (publik). Jangan pernah dipakai dengan
    // data warga asli / nomor WhatsApp asli, termasuk di laptop pengembang.
    app.log.warn(
      { secrets: defaults },
      "PERINGATAN: secret masih memakai nilai default publik. Jalankan `pnpm --filter @sigap/api secrets:rotate` sebelum memakai data asli."
    );
  }
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exit(1);
}
