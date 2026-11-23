/**
 * Regresi untuk perbaikan audit lanjutan (Nov 2026). Setiap blok menguji satu
 * temuan audit agar bug yang sama tidak kembali.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import { loadConfig } from "@sigap/config";
import { ticketDateCode } from "@sigap/core";
import { buildApp } from "./app.js";
import { encryptTotpSecret } from "./lib/crypto.js";
import { runEscalations } from "./lib/escalation.js";

const INTERNAL_TOKEN = "test-internal-token-123456";
const GROUP_JID = "120363000000000000@g.us";
const mediaDir = mkdtempSync(join(tmpdir(), "sigap-audit-fixes-"));

function makeConfig(extra: Record<string, string> = {}) {
  return loadConfig({
    SIGAP_ENV: "test",
    SIGAP_DB_PATH: ":memory:",
    SIGAP_MEDIA_DIR: mediaDir,
    SIGAP_SEED_DEMO: "true",
    SIGAP_UNIT_CODE: "BKS",
    SIGAP_ADMIN_PASSWORD: "Admin#12345",
    SIGAP_INTERNAL_TOKEN: INTERNAL_TOKEN,
    SIGAP_WA_GROUP_URC_JID: GROUP_JID,
    SIGAP_LOG_LEVEL: "silent",
    ...extra
  });
}

let app: FastifyInstance;

function sessionCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") throw new Error("Set-Cookie tidak ditemukan");
  return value.split(";")[0] as string;
}

async function login(username: string, password: string, totp?: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password, ...(totp ? { totp } : {}) }
  });
}

async function loginCookie(username: string, password: string): Promise<string> {
  const response = await login(username, password);
  expect(response.statusCode).toBe(200);
  return sessionCookie(response);
}

function inbound(sender: string, text: string, extra: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: "/internal/wa/inbound",
    headers: { "x-sigap-internal-token": INTERNAL_TOKEN },
    payload: {
      waMessageId: randomUUID(),
      chatJid: sender,
      senderJid: sender,
      isGroup: false,
      type: "text",
      text,
      timestamp: new Date().toISOString(),
      ...extra
    }
  });
}

function groupCommand(text: string, senderJid = "628000000005@s.whatsapp.net") {
  return app.inject({
    method: "POST",
    url: "/internal/wa/group-command",
    headers: { "x-sigap-internal-token": INTERNAL_TOKEN },
    payload: { waMessageId: randomUUID(), groupJid: GROUP_JID, senderJid, text }
  });
}

async function createManual(cookie: string, overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "POST",
    url: "/api/tickets/manual",
    headers: { cookie },
    payload: {
      reporterName: "Warga Uji",
      reporterPhone: `0812${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`,
      category: "tawuran",
      title: "Tiket uji audit",
      source: "telepon",
      address: "Jl. Uji Audit No. 3",
      reporterConsent: true,
      ...overrides
    }
  });
  return response;
}

beforeAll(async () => {
  app = await buildApp(makeConfig(), { seed: true, logger: false, rateLimit: false });
}, 60_000);

afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("login rate limit & lockout", () => {
  it("rate-limits per username, so one office IP is not locked out by another user's typos", async () => {
    const limited = await buildApp(makeConfig({ SIGAP_SEED_DEMO: "true" }), {
      seed: true,
      logger: false,
      rateLimit: true
    });
    try {
      for (let i = 0; i < 6; i += 1) {
        await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { username: "piket2", password: "Salah#12345" }
        });
      }
      const blocked = await limited.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "piket2", password: "Salah#12345" }
      });
      expect(blocked.statusCode).toBe(429);
      // Petugas lain dari IP yang sama tetap bisa login.
      const other = await limited.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "piket", password: "Demo#12345" }
      });
      expect(other.statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  }, 60_000);

  it("locks an account after repeated failures, even with the right password", async () => {
    for (let i = 0; i < 10; i += 1) {
      const res = await login("urc2", "Salah#12345");
      expect(res.statusCode).toBe(401);
    }
    const locked = await login("urc2", "Demo#12345");
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe("account_locked");
    // Admin reset membuka kunci.
    const admin = await loginCookie("admin", "Admin#12345");
    const officer = app.sqlite.prepare("SELECT id FROM officers WHERE username = 'urc2'").get() as { id: string };
    const reset = await app.inject({
      method: "POST",
      url: `/api/officers/${officer.id}/reset-password`,
      headers: { cookie: admin },
      payload: { newPassword: "Sementara123" }
    });
    expect(reset.statusCode).toBe(200);
    const after = await login("urc2", "Sementara123");
    expect(after.statusCode).toBe(200);
  });
});

describe("TOTP replay", () => {
  it("rejects reuse of the same TOTP code", async () => {
    const secret = authenticator.generateSecret();
    app.sqlite
      .prepare("UPDATE officers SET totp_secret = ?, totp_enabled = 1, totp_last_step = NULL WHERE username = 'kapolsek'")
      .run(encryptTotpSecret(secret, app.config.SIGAP_PHONE_KEY));
    const code = authenticator.generate(secret);
    const first = await login("kapolsek", "Demo#12345", code);
    expect(first.statusCode).toBe(200);
    const replay = await login("kapolsek", "Demo#12345", code);
    expect(replay.statusCode).toBe(401);
    expect(replay.json().error.message).toContain("sudah dipakai");
    app.sqlite
      .prepare("UPDATE officers SET totp_secret = NULL, totp_enabled = 0, totp_last_step = NULL, failed_logins = 0 WHERE username = 'kapolsek'")
      .run();
  });
});

describe("password lifecycle", () => {
  it("forces new officers to change the admin-issued password before using the app", async () => {
    const admin = await loginCookie("admin", "Admin#12345");
    const username = `piket_${randomUUID().slice(0, 6)}`;
    const created = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: admin },
      payload: { username, name: "Piket Baru", role: "piket", password: "Awal12345678" }
    });
    expect(created.statusCode).toBe(200);

    const res = await login(username, "Awal12345678");
    expect(res.statusCode).toBe(200);
    expect(res.json().user.mustChangePassword).toBe(true);
    const cookie = sessionCookie(res);

    const blocked = await app.inject({ method: "GET", url: "/api/tickets", headers: { cookie } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("password_change_required");

    const weak = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Awal12345678", newPassword: "abcdefghijk" }
    });
    expect(weak.statusCode).toBe(400);

    const changed = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: { cookie },
      payload: { currentPassword: "Awal12345678", newPassword: "Rahasia98765" }
    });
    expect(changed.statusCode).toBe(200);
    const newCookie = sessionCookie(changed);
    // Sesi lama dicabut; sesi baru bisa memakai aplikasi.
    const oldSession = await app.inject({ method: "GET", url: "/api/tickets", headers: { cookie } });
    expect(oldSession.statusCode).toBe(401);
    const ok = await app.inject({ method: "GET", url: "/api/tickets", headers: { cookie: newCookie } });
    expect(ok.statusCode).toBe(200);
    expect((await login(username, "Awal12345678")).statusCode).toBe(401);
  });

  it("rejects weak passwords and bhabin accounts without a region", async () => {
    const admin = await loginCookie("admin", "Admin#12345");
    const weak = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: admin },
      payload: { username: `weak_${randomUUID().slice(0, 4)}`, name: "Lemah Sekali", role: "piket", password: "password" }
    });
    expect(weak.statusCode).toBe(400);
    const bhabin = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: admin },
      payload: { username: `bh_${randomUUID().slice(0, 4)}`, name: "Bhabin Baru", role: "bhabin", password: "Kuat12345678" }
    });
    expect(bhabin.statusCode).toBe(400);
  });

  it("rejects a WhatsApp number already used by another active officer", async () => {
    const admin = await loginCookie("admin", "Admin#12345");
    const dup = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: admin },
      payload: {
        username: `dup_${randomUUID().slice(0, 4)}`,
        name: "Petugas Ganda",
        role: "urc",
        password: "Kuat12345678",
        waJid: "628000000005"
      }
    });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().error.message).toContain("sudah dipakai");
  });
});

describe("manual tickets", () => {
  it("rejects invalid reporter phone numbers instead of merging them into one reporter", async () => {
    const cookie = await loginCookie("piket", "Demo#12345");
    const res = await createManual(cookie, { reporterPhone: "tidak ada" });
    expect(res.statusCode).toBe(400);
  });
});

describe("group command ticket references", () => {
  it("does not close yesterday's ticket when today's short number does not exist", async () => {
    const cookie = await loginCookie("piket", "Demo#12345");
    const created = await createManual(cookie, { title: "Tiket kemarin" });
    const ticket = created.json().ticket as { id: string };
    // Jadikan tiket "kemarin" dengan nomor urut 777.
    const yesterday = ticketDateCode(new Date(Date.now() - 86_400_000), "Asia/Jakarta");
    app.sqlite
      .prepare("UPDATE tickets SET ticket_no = ?, status = 'selesai' WHERE id = ?")
      .run(`BKS-${yesterday}-777`, ticket.id);

    const res = await groupCommand("/selesai 777 beres");
    expect(res.statusCode).toBe(200);
    const status = app.sqlite.prepare("SELECT status FROM tickets WHERE id = ?").get(ticket.id) as { status: string };
    expect(status.status).toBe("selesai");
    const outbox = app.sqlite
      .prepare("SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC LIMIT 1")
      .get(GROUP_JID) as { payload_json: string };
    expect(outbox.payload_json).toContain("tidak ditemukan");
  });

  it("asks for the full number when several active tickets share a short number", async () => {
    const cookie = await loginCookie("piket", "Demo#12345");
    const a = (await createManual(cookie, { title: "Ambigu A" })).json().ticket as { id: string };
    const b = (await createManual(cookie, { title: "Ambigu B" })).json().ticket as { id: string };
    const d1 = ticketDateCode(new Date(Date.now() - 2 * 86_400_000), "Asia/Jakarta");
    const d2 = ticketDateCode(new Date(Date.now() - 3 * 86_400_000), "Asia/Jakarta");
    app.sqlite.prepare("UPDATE tickets SET ticket_no = ?, status = 'diterima' WHERE id = ?").run(`BKS-${d1}-888`, a.id);
    app.sqlite.prepare("UPDATE tickets SET ticket_no = ?, status = 'diterima' WHERE id = ?").run(`BKS-${d2}-888`, b.id);

    const res = await groupCommand("/otw 888");
    expect(res.json().reason).toBe("ambiguous_ref");
    const statuses = app.sqlite
      .prepare("SELECT status FROM tickets WHERE id IN (?, ?)")
      .all(a.id, b.id) as Array<{ status: string }>;
    expect(statuses.every((row) => row.status === "diterima")).toBe(true);
  });
});

describe("reopen", () => {
  it("does not double-count reporter stats or instantly escalate a reopened P1", async () => {
    const piket = await loginCookie("piket", "Demo#12345");
    const pawas = await loginCookie("pawas", "Demo#12345");
    const phone = `0813${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`;
    const ticket = (await createManual(piket, { priority: "P1", reporterPhone: phone, title: "P1 dibuka ulang" })).json()
      .ticket as { id: string };
    const go = (to: string, cookie: string, extra: Record<string, unknown> = {}) =>
      app.inject({
        method: "POST",
        url: `/api/tickets/${ticket.id}/transition`,
        headers: { cookie },
        payload: { to, ...extra }
      });
    for (const to of ["diterima", "otw", "ditkp"]) expect((await go(to, piket)).statusCode).toBe(200);
    expect((await go("selesai", piket, { note: "Selesai pertama" })).statusCode).toBe(200);

    // Buat seolah tiket dibuat 2 jam lalu (jauh melewati ambang eskalasi).
    const old = new Date(Date.now() - 2 * 3600_000).toISOString();
    app.sqlite.prepare("UPDATE tickets SET created_at = ? WHERE id = ?").run(old, ticket.id);

    expect((await go("diterima", pawas)).statusCode).toBe(200);
    const before = app.sqlite
      .prepare("SELECT escalated_kapolsek_at FROM tickets WHERE id = ?")
      .get(ticket.id) as { escalated_kapolsek_at: string | null };
    runEscalations(app);
    const after = app.sqlite
      .prepare("SELECT escalated_kapolsek_at, reopened_at FROM tickets WHERE id = ?")
      .get(ticket.id) as { escalated_kapolsek_at: string | null; reopened_at: string | null };
    expect(before.escalated_kapolsek_at).toBeNull();
    expect(after.reopened_at).toBeTruthy();
    expect(after.escalated_kapolsek_at).toBeNull();

    for (const to of ["otw", "ditkp"]) expect((await go(to, piket)).statusCode).toBe(200);
    expect((await go("selesai", piket, { note: "Selesai kedua" })).statusCode).toBe(200);
    const reporter = app.sqlite
      .prepare("SELECT r.valid_count FROM reporters r JOIN tickets t ON t.reporter_id = r.id WHERE t.id = ?")
      .get(ticket.id) as { valid_count: number };
    expect(reporter.valid_count).toBe(1);
  });
});

describe("WhatsApp abuse & identity", () => {
  it("replies to a blocked reporter at most once per interval", async () => {
    const sender = "6281777700001@s.whatsapp.net";
    await inbound(sender, "halo");
    app.sqlite
      .prepare("UPDATE reporters SET blocked_at = ?, blocked_reason = 'uji' WHERE wa_jid = ?")
      .run(new Date().toISOString(), sender);
    const first = await inbound(sender, "LAPOR");
    const second = await inbound(sender, "LAPOR");
    expect(first.json().replies).toBe(1);
    expect(second.json().replies).toBe(0);
  });

  it("keeps processing but pauses replies when one chat floods the bot", async () => {
    const sender = "6281777700002@s.whatsapp.net";
    const replies: number[] = [];
    for (let i = 0; i < 15; i += 1) {
      replies.push((await inbound(sender, `pesan ${i}`)).json().replies as number);
    }
    expect(replies.slice(0, 12).every((n) => n >= 1)).toBe(true);
    expect(replies[12]).toBe(1); // satu pemberitahuan jeda
    expect(replies[13]).toBe(0);
    expect(replies[14]).toBe(0);
  });

  it("marks LID-only reporters as having no real phone number", async () => {
    const sender = "123456789012345@lid";
    await inbound(sender, "DARURAT ada kebakaran");
    await inbound(sender, "Warga LID");
    await inbound(sender, "Jl. Mawar No. 5 RT 02");
    const reporter = app.sqlite
      .prepare("SELECT phone_verified FROM reporters WHERE wa_jid = ?")
      .get(sender) as { phone_verified: number };
    expect(reporter.phone_verified).toBe(0);
    const ticket = app.sqlite
      .prepare("SELECT t.id FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?")
      .get(sender) as { id: string };
    const cookie = await loginCookie("piket", "Demo#12345");
    const reveal = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/reveal-phone`,
      headers: { cookie }
    });
    expect(reveal.statusCode).toBe(409);
    const detail = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}`, headers: { cookie } });
    expect(detail.json().ticket.reporter.phoneVerified).toBe(false);
  });
});

describe("outbox", () => {
  it("gives media a longer lease and never downgrades a sent message", async () => {
    app.sqlite.prepare("UPDATE outbound_messages SET status = 'sent'").run();
    const id = randomUUID();
    app.sqlite
      .prepare(
        "INSERT INTO outbound_messages (id, unit_id, target_jid, kind, payload_json, status, attempts, created_at) SELECT ?, unit_id, ?, 'media', '{}', 'pending', 0, ? FROM officers WHERE username = 'admin'"
      )
      .run(id, GROUP_JID, new Date().toISOString());
    const poll = await app.inject({
      method: "GET",
      url: "/internal/outbox?limit=5",
      headers: { "x-sigap-internal-token": INTERNAL_TOKEN }
    });
    expect(poll.json().items.some((item: { id: string }) => item.id === id)).toBe(true);
    const row = app.sqlite
      .prepare("SELECT next_attempt_at FROM outbound_messages WHERE id = ?")
      .get(id) as { next_attempt_at: string };
    expect(new Date(row.next_attempt_at).getTime() - Date.now()).toBeGreaterThan(200_000);

    const post = (ok: boolean) =>
      app.inject({
        method: "POST",
        url: `/internal/outbox/${id}/result`,
        headers: { "x-sigap-internal-token": INTERNAL_TOKEN },
        payload: ok ? { ok } : { ok, error: "late" }
      });
    expect((await post(true)).statusCode).toBe(200);
    expect((await post(false)).json().alreadySent).toBe(true);
    const final = app.sqlite.prepare("SELECT status FROM outbound_messages WHERE id = ?").get(id) as { status: string };
    expect(final.status).toBe("sent");
  });
});

describe("officer deactivation", () => {
  it("always soft-deletes so audit trails keep the actor name", async () => {
    const admin = await loginCookie("admin", "Admin#12345");
    const created = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: admin },
      payload: { username: `tmp_${randomUUID().slice(0, 4)}`, name: "Petugas Sementara", role: "piket", password: "Kuat12345678" }
    });
    const id = created.json().id as string;
    const del = await app.inject({ method: "DELETE", url: `/api/officers/${id}`, headers: { cookie: admin } });
    expect(del.json().mode).toBe("deactivated");
    const row = app.sqlite.prepare("SELECT active FROM officers WHERE id = ?").get(id) as { active: number };
    expect(row.active).toBe(0);
  });
});
