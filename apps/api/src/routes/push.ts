import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pushSubscriptions } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { isAllowedPushEndpoint, pushPublicKey, sendPushToOfficer } from "../lib/push.js";
import { conflict, notFound } from "../lib/errors.js";

function makeSubscribeSchema(isProduction: boolean) {
  return z.object({
    endpoint: z
      .string()
      .url()
      .max(600)
      .refine(
        (value) => isAllowedPushEndpoint(value, isProduction),
        "Endpoint Web Push harus HTTPS publik yang valid"
      ),
    keys: z.object({
      p256dh: z.string().min(10).max(300),
      auth: z.string().min(4).max(120)
    })
  });
}

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(600)
});

export function registerPushRoutes(app: FastifyInstance): void {
  const subscribeSchema = makeSubscribeSchema(app.config.isProduction);

  app.get("/api/push/public-key", { preHandler: app.authenticate }, async () => ({
    publicKey: pushPublicKey(app),
    configured: Boolean(pushPublicKey(app))
  }));

  app.post(
    "/api/push/subscribe",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = subscribeSchema.parse(request.body);
      const now = new Date().toISOString();

      const existing = app.db
        .select({ officerId: pushSubscriptions.officerId })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, input.endpoint))
        .get();
      if (existing && existing.officerId !== user.id) {
        throw conflict("Endpoint push sudah terdaftar untuk petugas lain");
      }

      app.db
        .insert(pushSubscriptions)
        .values({
          id: randomUUID(),
          unitId: DEFAULT_UNIT_ID,
          officerId: user.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: request.headers["user-agent"] ?? null,
          createdAt: now,
          lastSeenAt: now
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: request.headers["user-agent"] ?? null,
            lastSeenAt: now
          }
        })
        .run();
      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "push.subscribe",
        entity: "push_subscription",
        entityId: null,
        meta: { host: new URL(input.endpoint).host },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      return { ok: true };
    }
  );

  app.post(
    "/api/push/unsubscribe",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = unsubscribeSchema.parse(request.body);
      app.db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, input.endpoint),
            eq(pushSubscriptions.officerId, user.id)
          )
        )
        .run();
      return { ok: true };
    }
  );

  app.post("/api/push/test", { preHandler: app.authenticate }, async (request) => {
    const user = request.user;
    if (!user) throw notFound("Sesi tidak ditemukan");
    const result = await sendPushToOfficer(app, user.id, {
      title: "SIGAP — tes notifikasi",
      body: "Web Push aktif untuk perangkat ini.",
      url: "/",
      tag: "sigap-test"
    });
    return { ok: true, ...result };
  });
}
