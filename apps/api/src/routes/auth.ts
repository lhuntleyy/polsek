import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { changePasswordSchema, loginSchema, totpEnableSchema, type Role } from "@sigap/core";
import { officers, sessions } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import {
  generateTotpSecret,
  hashPassword,
  passwordPolicyError,
  totpUri,
  verifyDummyPassword,
  verifyPassword,
  verifyTotpStep
} from "../lib/auth.js";
import {
  decryptTotpSecret,
  encryptTotpSecret,
  hashToken,
  randomToken
} from "../lib/crypto.js";
import { AppError, badRequest, unauthorized } from "../lib/errors.js";
import { readSettings } from "../lib/settings.js";

/** Gagal berturut-turut sebelum akun dikunci sementara. */
export const MAX_FAILED_LOGINS = 10;
export const LOCK_MINUTES = 15;

function publicUser(officer: {
  id: string;
  username: string | null;
  name: string;
  role: string;
  unitId: string;
  regionId: string | null;
  totpEnabled: boolean;
  mustChangePassword?: boolean;
}) {
  return {
    id: officer.id,
    username: officer.username,
    name: officer.name,
    role: officer.role,
    unitId: officer.unitId,
    regionId: officer.regionId,
    totpEnabled: officer.totpEnabled,
    mustChangePassword: Boolean(officer.mustChangePassword)
  };
}

function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string): void {
  reply.setCookie(app.config.SIGAP_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: app.config.cookieSecure,
    maxAge: app.config.SIGAP_SESSION_TTL_HOURS * 3600
  });
}

function createSession(
  app: FastifyInstance,
  request: FastifyRequest,
  officerId: string
): { token: string; expiresAt: string } {
  const token = randomToken(32);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + app.config.SIGAP_SESSION_TTL_HOURS * 3600 * 1000
  ).toISOString();
  app.db
    .insert(sessions)
    .values({
      id: randomUUID(),
      officerId,
      tokenHash: hashToken(token, app.config.SIGAP_SESSION_SECRET),
      expiresAt,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      revokedAt: null,
      createdAt: now.toISOString()
    })
    .run();
  return { token, expiresAt };
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          // Harus preHandler: di onRequest body belum diparse sehingga kunci
          // jatuh ke IP saja, dan satu kantor (satu IP NAT) bisa terkunci bersama.
          hook: "preHandler",
          keyGenerator: (request) => {
            const body = request.body as { username?: unknown } | undefined;
            const username =
              typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
            return username ? `${request.ip}:${username}` : request.ip;
          }
        }
      }
    },
    async (request, reply) => {
      const input = loginSchema.parse(request.body);
      const officer = app.db
        .select()
        .from(officers)
        .where(eq(officers.username, input.username))
        .get();

      if (!officer || !officer.active || !officer.passwordHash) {
        await verifyDummyPassword(input.password);
        throw unauthorized("Username atau password salah");
      }

      const nowMs = Date.now();
      if (officer.lockedUntil && new Date(officer.lockedUntil).getTime() > nowMs) {
        await verifyDummyPassword(input.password);
        throw new AppError(
          429,
          "account_locked",
          "Terlalu banyak percobaan gagal. Akun dikunci sementara; coba lagi nanti atau hubungi admin."
        );
      }

      const registerFailure = (message: string): never => {
        const failed = (officer.failedLogins ?? 0) + 1;
        const lock = failed >= MAX_FAILED_LOGINS;
        app.db
          .update(officers)
          .set({
            failedLogins: lock ? 0 : failed,
            lockedUntil: lock
              ? new Date(nowMs + LOCK_MINUTES * 60_000).toISOString()
              : officer.lockedUntil,
            updatedAt: new Date(nowMs).toISOString()
          })
          .where(eq(officers.id, officer.id))
          .run();
        if (lock) {
          writeAudit(app.db, {
            unitId: officer.unitId,
            actorId: null,
            action: "auth.lockout",
            entity: "officer",
            entityId: officer.id,
            meta: { minutes: LOCK_MINUTES },
            ip: request.ip,
            userAgent: request.headers["user-agent"] ?? null
          });
        }
        throw unauthorized(message);
      };

      const passwordOk = await verifyPassword(officer.passwordHash, input.password);
      if (!passwordOk) registerFailure("Username atau password salah");

      let totpStep: number | null = null;
      if (officer.totpEnabled) {
        let totpSecret: string | null = null;
        try {
          totpSecret = officer.totpSecret
            ? decryptTotpSecret(officer.totpSecret, app.config.SIGAP_PHONE_KEY)
            : null;
        } catch {
          totpSecret = null;
        }
        totpStep =
          input.totp && totpSecret ? verifyTotpStep(input.totp, totpSecret, nowMs) : null;
        if (totpStep === null) registerFailure("Kode TOTP salah atau belum diisi");
        // Tolak pemakaian ulang kode yang sama (replay) dalam jendela waktu TOTP.
        if (
          officer.totpLastStep !== null &&
          officer.totpLastStep !== undefined &&
          (totpStep as number) <= officer.totpLastStep
        ) {
          registerFailure("Kode TOTP sudah dipakai. Tunggu kode berikutnya.");
        }
        if (totpSecret && officer.totpSecret && !officer.totpSecret.startsWith("v1.")) {
          app.db
            .update(officers)
            .set({
              totpSecret: encryptTotpSecret(totpSecret, app.config.SIGAP_PHONE_KEY),
              updatedAt: new Date().toISOString()
            })
            .where(eq(officers.id, officer.id))
            .run();
        }
      }

      const { token, expiresAt } = createSession(app, request, officer.id);
      const now = new Date().toISOString();
      app.db
        .update(officers)
        .set({
          lastLoginAt: now,
          updatedAt: now,
          failedLogins: 0,
          lockedUntil: null,
          ...(totpStep !== null ? { totpLastStep: totpStep } : {})
        })
        .where(eq(officers.id, officer.id))
        .run();

      writeAudit(app.db, {
        unitId: officer.unitId,
        actorId: officer.id,
        action: "auth.login",
        entity: "officer",
        entityId: officer.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      setSessionCookie(app, reply, token);
      const unit = readSettings(app.db, app.config);
      return {
        user: publicUser(officer),
        unit: { name: unit.unitName, code: unit.unitCode, timezone: unit.unitTimezone },
        hiddenMenus: unit.menuHidden[officer.role as Role] ?? [],
        expiresAt
      };
    }
  );

  app.post("/api/auth/logout", async (request, reply) => {
    const token = request.cookies[app.config.SIGAP_COOKIE_NAME];
    if (token) {
      const session = app.db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, hashToken(token, app.config.SIGAP_SESSION_SECRET)))
        .get();
      if (session) {
        app.db
          .update(sessions)
          .set({ revokedAt: new Date().toISOString() })
          .where(eq(sessions.id, session.id))
          .run();
        app.bus.disconnectSession(session.id);
      }
    }
    reply.clearCookie(app.config.SIGAP_COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", { preHandler: app.authenticate }, async (request) => {
    const user = request.user;
    if (!user) throw unauthorized();
    const row = app.db
      .select({ mustChangePassword: officers.mustChangePassword })
      .from(officers)
      .where(eq(officers.id, user.id))
      .get();
    const unitSettings = readSettings(app.db, app.config);
    return {
      user: { ...user, mustChangePassword: Boolean(row?.mustChangePassword) },
      hiddenMenus: unitSettings.menuHidden[user.role as Role] ?? []
    };
  });

  app.post(
    "/api/auth/password",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: "15 minutes", hook: "preHandler" } }
    },
    async (request, reply) => {
      const user = request.user;
      if (!user) throw unauthorized();
      const input = changePasswordSchema.parse(request.body);
      const officer = app.db.select().from(officers).where(eq(officers.id, user.id)).get();
      if (!officer?.passwordHash) throw unauthorized();
      if (!(await verifyPassword(officer.passwordHash, input.currentPassword))) {
        throw unauthorized("Password lama salah");
      }
      const policy = passwordPolicyError(input.newPassword);
      if (policy) throw badRequest(policy);
      if (input.newPassword === input.currentPassword) {
        throw badRequest("Password baru harus berbeda dari password lama");
      }
      const now = new Date().toISOString();
      app.db
        .update(officers)
        .set({
          passwordHash: await hashPassword(input.newPassword),
          mustChangePassword: false,
          updatedAt: now
        })
        .where(eq(officers.id, officer.id))
        .run();
      // Cabut semua sesi lama (termasuk perangkat lain), lalu terbitkan sesi baru.
      app.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.officerId, officer.id), isNull(sessions.revokedAt)))
        .run();
      app.bus.disconnectOfficer(officer.id);
      const { token } = createSession(app, request, officer.id);
      writeAudit(app.db, {
        unitId: officer.unitId,
        actorId: officer.id,
        action: "auth.password.change",
        entity: "officer",
        entityId: officer.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });
      setSessionCookie(app, reply, token);
      return { ok: true };
    }
  );

  app.post(
    "/api/auth/totp/setup",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw unauthorized();
      if (user.totpEnabled) throw badRequest("TOTP sudah aktif");

      const secret = generateTotpSecret();
      app.db
        .update(officers)
        .set({
          totpSecret: encryptTotpSecret(secret, app.config.SIGAP_PHONE_KEY),
          totpEnabled: false,
          totpLastStep: null,
          updatedAt: new Date().toISOString()
        })
        .where(eq(officers.id, user.id))
        .run();

      return {
        secret,
        uri: totpUri(user.username ?? user.name, secret)
      };
    }
  );

  app.post(
    "/api/auth/totp/enable",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: "15 minutes", hook: "preHandler" } }
    },
    async (request) => {
      const input = totpEnableSchema.parse(request.body);
      const user = request.user;
      if (!user) throw unauthorized();

      const officer = app.db.select().from(officers).where(eq(officers.id, user.id)).get();
      if (!officer) throw unauthorized();
      if (officer.totpEnabled) throw badRequest("TOTP sudah aktif");
      let secret: string | null = null;
      try {
        secret = officer.totpSecret
          ? decryptTotpSecret(officer.totpSecret, app.config.SIGAP_PHONE_KEY)
          : null;
      } catch {
        secret = null;
      }
      if (!secret) throw badRequest("Jalankan setup TOTP terlebih dahulu");
      const step = verifyTotpStep(input.code, secret);
      if (step === null) throw unauthorized("Kode TOTP salah");

      app.db
        .update(officers)
        .set({
          totpSecret: encryptTotpSecret(secret, app.config.SIGAP_PHONE_KEY),
          totpEnabled: true,
          totpLastStep: step,
          updatedAt: new Date().toISOString()
        })
        .where(eq(officers.id, officer.id))
        .run();

      writeAudit(app.db, {
        unitId: officer.unitId,
        actorId: officer.id,
        action: "auth.totp.enable",
        entity: "officer",
        entityId: officer.id,
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { ok: true };
    }
  );
}
