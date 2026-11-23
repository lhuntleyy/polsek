import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import type { AppConfig } from "@sigap/config";
import { seedDatabase } from "./db/seed.js";
import { runMigrations } from "./db/migrate.js";
import { createDb } from "./db/client.js";
import { EventBus } from "./lib/sse.js";
import { AppError } from "./lib/errors.js";
import { GatewayState } from "./lib/gateway-state.js";
import { registerAuth } from "./lib/auth-plugin.js";
import { registerInternalAuth } from "./lib/internal-auth.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTicketRoutes } from "./routes/tickets.js";
import { registerRegionRoutes } from "./routes/regions.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerInternalRoutes } from "./routes/internal.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerHandoverRoutes } from "./routes/handover.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerReporterRoutes } from "./routes/reporters.js";
import { registerPushRoutes } from "./routes/push.js";
import { sweepMaintenance, sweepStagedMedia } from "./lib/media.js";
import { runEscalations } from "./lib/escalation.js";
import { runDailyDigest } from "./lib/digest.js";

export interface BuildOptions {
  seed?: boolean;
  logger?: boolean;
  rateLimit?: boolean;
}

function bodyShape(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      Array.isArray(item)
        ? `array(${item.length})`
        : item === null
          ? "null"
          : typeof item
    ])
  );
}

export async function buildApp(
  config: AppConfig,
  options: BuildOptions = {}
): Promise<FastifyInstance> {
  const handle = createDb(config);
  runMigrations(handle.sqlite);

  const requestSerializer = (request: {
    method: string;
    url: string;
    ip: string;
    headers: { host?: string };
  }) => ({
    method: request.method,
    // Jangan log query string: bisa berisi nama/nomor pelapor.
    url: request.url.split("?")[0],
    host: request.headers.host,
    remoteAddress: request.ip
  });

  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : config.isDevelopment
          ? {
              level: config.SIGAP_LOG_LEVEL,
              serializers: { req: requestSerializer },
              transport: {
                target: "pino-pretty",
                options: { colorize: true, translateTime: "SYS:standard" }
              }
            }
          : {
              level: config.SIGAP_LOG_LEVEL,
              serializers: { req: requestSerializer }
            },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: ["127.0.0.1", "::1"]
  });

  app.decorate("config", config);
  app.decorate("db", handle.db);
  app.decorate("sqlite", handle.sqlite);
  app.decorate("bus", new EventBus());
  app.decorate("gateway", new GatewayState(handle.sqlite));
  const isSessionValid = (sessionId: string): boolean => {
    if (!handle.sqlite.open) return false;
    const now = new Date().toISOString();
    const row = handle.sqlite
      .prepare(
        `SELECT 1 AS ok
         FROM sessions s
         INNER JOIN officers o ON o.id = s.officer_id
         WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND o.active = 1`
      )
      .get(sessionId, now);
    return Boolean(row);
  };
  app.bus.startHeartbeat(15_000, isSessionValid);

  await app.register(cookie, { secret: config.SIGAP_SESSION_SECRET });
  await app.register(multipart, {
    limits: {
      fileSize: 64 * 1024 * 1024,
      files: 3,
      fields: 20,
      parts: 25
    }
  });

  if (options.rateLimit !== false) {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: "1 minute"
    });
  }

  const allowedOrigins = new Set([config.SIGAP_PUBLIC_ORIGIN]);
  if (config.isDevelopment) {
    allowedOrigins.add("http://localhost:5173");
    allowedOrigins.add("http://127.0.0.1:5173");
    allowedOrigins.add("http://localhost:4173");
    allowedOrigins.add("http://127.0.0.1:4173");
  }

  app.addHook("onRequest", async (request, reply) => {
    const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
    if (!mutating) return undefined;

    const origin = request.headers.origin;
    if (origin) {
      if (!allowedOrigins.has(origin)) {
        return reply.code(403).send({
          error: { code: "csrf_origin", message: "Origin tidak diizinkan" }
        });
      }
      return undefined;
    }

    const referer = request.headers.referer;
    if (referer) {
      let refererOrigin = "";
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        refererOrigin = "";
      }
      if (!refererOrigin || !allowedOrigins.has(refererOrigin)) {
        return reply.code(403).send({
          error: { code: "csrf_origin", message: "Referer tidak diizinkan" }
        });
      }
    }

    const fetchSite = request.headers["sec-fetch-site"];
    if (
      typeof fetchSite === "string" &&
      fetchSite !== "same-origin" &&
      fetchSite !== "none"
    ) {
      return reply.code(403).send({
        error: { code: "csrf_origin", message: "Permintaan lintas situs ditolak" }
      });
    }
    return undefined;
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.warn(
        {
          route: request.url.split("?")[0],
          issues: error.issues,
          bodyShape: bodyShape(request.body)
        },
        "validation error"
      );
      return reply.code(400).send({
        error: {
          code: "validation_error",
          message: "Input tidak valid",
          details: error.issues
        }
      });
    }
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details }
      });
    }
    if ((error as { validation?: unknown }).validation) {
      return reply.code(400).send({
        error: { code: "validation_error", message: "Input tidak valid" }
      });
    }
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: {
          code: (error as { code?: string }).code ?? "request_error",
          message:
            statusCode === 413
              ? "Ukuran media terlalu besar"
              : error instanceof Error
                ? error.message
                : String(error)
        }
      });
    }
    request.log.error(error);
    return reply.code(500).send({
      error: {
        code: "internal_error",
        message: config.isProduction
          ? "Terjadi kesalahan internal"
          : error instanceof Error
            ? error.message
            : String(error)
      }
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: "not_found", message: "Endpoint tidak ditemukan" } });
  });

  registerAuth(app);
  registerInternalAuth(app);
  registerHealthRoutes(app);
  registerSettingsRoutes(app);
  registerAuthRoutes(app);
  registerTicketRoutes(app);
  registerRegionRoutes(app);
  registerAnalyticsRoutes(app);
  registerSystemRoutes(app);
  registerStreamRoutes(app);
  registerInternalRoutes(app);
  registerMediaRoutes(app);
  registerHandoverRoutes(app);
  registerExportRoutes(app);
  registerReporterRoutes(app);
  registerPushRoutes(app);

  try {
    sweepStagedMedia(app.db, config);
    sweepMaintenance(handle.sqlite);
  } catch (error) {
    app.log.warn({ err: error }, "Gagal membersihkan media staging lama");
  }
  const mediaSweep = setInterval(() => {
    try {
      sweepStagedMedia(app.db, config);
      sweepMaintenance(handle.sqlite);
    } catch (error) {
      app.log.warn({ err: error }, "Gagal membersihkan media staging lama");
    }
  }, 6 * 60 * 60 * 1000);
  mediaSweep.unref();

  try {
    runEscalations(app);
  } catch (error) {
    app.log.warn({ err: error }, "Gagal menjalankan eskalasi P1");
  }
  const escalationSweep = setInterval(() => {
    try {
      const result = runEscalations(app);
      if (result.pawas > 0 || result.kapolsek > 0) {
        app.log.info(result, "Eskalasi P1 dikirim");
      }
    } catch (error) {
      app.log.warn({ err: error }, "Gagal menjalankan eskalasi P1");
    }
  }, 60_000);
  escalationSweep.unref();

  const digestSweep = setInterval(() => {
    try {
      const result = runDailyDigest(app);
      if (result.queued > 0) app.log.info(result, "Digest harian dikirim");
    } catch (error) {
      app.log.warn({ err: error }, "Gagal mengirim digest harian");
    }
  }, 15 * 60_000);
  digestSweep.unref();

  if (options.seed) {
    await seedDatabase(config, handle);
  }

  app.addHook("onClose", async () => {
    clearInterval(mediaSweep);
    clearInterval(escalationSweep);
    clearInterval(digestSweep);
    app.bus.stopHeartbeat();
    handle.close();
  });

  return app;
}
