import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => {
    let dbOk = true;
    try {
      app.sqlite.prepare("SELECT 1").get();
    } catch {
      dbOk = false;
    }
    return {
      ok: dbOk,
      version: app.config.version,
      env: app.config.SIGAP_ENV,
      db: dbOk ? "ok" : "error",
      uptimeSeconds: Math.round(process.uptime())
    };
  });

  app.get("/api/health", async () => ({
    ok: true,
    version: app.config.version,
    uptimeSeconds: Math.round(process.uptime())
  }));
}
