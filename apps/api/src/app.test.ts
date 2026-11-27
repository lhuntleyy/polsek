import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { authenticator } from "otplib";
import sharp from "sharp";
import { loadConfig } from "@sigap/config";
import { ticketDateCode } from "@sigap/core";
import { buildApp } from "./app.js";
import { decryptTotpSecret, encryptTotpSecret } from "./lib/crypto.js";
import { hashPassword } from "./lib/auth.js";
import { runEscalations } from "./lib/escalation.js";
import { runDailyDigest } from "./lib/digest.js";
import { nextTicketNumber } from "./lib/ticket-number.js";

let app: FastifyInstance;
let cookie: string;
const mediaDir = mkdtempSync(join(tmpdir(), "sigap-media-test-"));

function sessionCookie(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers["set-cookie"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") throw new Error("Set-Cookie tidak ditemukan");
  return value.split(";")[0] as string;
}

beforeAll(async () => {
  const config = loadConfig({
    SIGAP_ENV: "test",
    SIGAP_DB_PATH: ":memory:",
    SIGAP_MEDIA_DIR: mediaDir,
    SIGAP_SEED_DEMO: "true",
    SIGAP_UNIT_CODE: "BKS",
    SIGAP_UNIT_NAME: "Polsek Contoh",
    SIGAP_ADMIN_PASSWORD: "Admin#12345",
    SIGAP_INTERNAL_TOKEN: "test-internal-token-123456",
    SIGAP_WA_GROUP_URC_JID: "120363000000000000@g.us",
    SIGAP_VAPID_PUBLIC_KEY:
      "BOLVg2vmpKz7PGqhI5ARp35rV3rxuNSHzh4r5xrvTHnlEc9QM3czQ9upKeEihpE4rt6wHoT7jL6zJllQtK2_r0A",
    SIGAP_VAPID_PRIVATE_KEY: "oRcYKFTQWaFvkb1x2p3iKrxw-aiupiURHKSUZatEQkg",
    SIGAP_VAPID_SUBJECT: "mailto:test@sigap.local",
    SIGAP_LOG_LEVEL: "silent"
  });
  app = await buildApp(config, { seed: true, logger: false, rateLimit: false });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username: "piket", password: "Demo#12345" }
  });
  expect(login.statusCode).toBe(200);
  cookie = sessionCookie(login);
}, 60_000);

afterAll(async () => {
  await app.close();
  rmSync(mediaDir, { recursive: true, force: true });
});

describe("API foundation", () => {
  it("serves public unit config", async () => {
    const response = await app.inject({ method: "GET", url: "/api/public/config" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.unit.code).toBe("BKS");
    expect(body.version).toBe("1.2.0");
  });

  it("rejects tickets without a session", async () => {
    const response = await app.inject({ method: "GET", url: "/api/tickets" });
    expect(response.statusCode).toBe(401);
  });

  it("returns seeded tickets for an authenticated piket", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=10",
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThan(0);
    expect(body.items[0].reporter.phoneMasked).toContain("•");
  });

  it("lets piket accept a new ticket", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?status=baru&limit=1",
      headers: { cookie }
    });
    const ticket = list.json().items[0];
    expect(ticket).toBeTruthy();

    const response = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ticket.status).toBe("diterima");
    expect(response.json().events.length).toBeGreaterThan(1);
  });

  it("does not let URC accept a new ticket", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "urc", password: "Demo#12345" }
    });
    const urcCookie = sessionCookie(login);
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?status=baru&limit=1",
      headers: { cookie: urcCookie }
    });
    const ticket = list.json().items[0];
    const response = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie: urcCookie },
      payload: { to: "diterima" }
    });
    expect(response.statusCode).toBe(403);
  });

  it("creates a manual ticket with geofence classification", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/tickets/manual",
      headers: { cookie },
      payload: {
        reporterName: "Warga Uji",
        reporterPhone: "081200000009",
        category: "tawuran",
        priority: "P1",
        title: "Uji tiket manual",
        description: "Tes pembuatan tiket manual dari API.",
        address: "Pekayon Jaya",
        lat: -6.26,
        lng: 106.982,
        reporterConsent: true,
        source: "telepon"
      }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ticket.status).toBe("baru");
    expect(body.ticket.priority).toBe("P1");
    expect(body.ticket.locationStatus).toBe("verified");
  });

  it("lets admin update an officer WhatsApp JID", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Admin#12345" }
    });
    const adminCookie = sessionCookie(login);
    const officers = await app.inject({
      method: "GET",
      url: "/api/officers",
      headers: { cookie: adminCookie }
    });
    const officer = officers
      .json()
      .items.find((item: { username?: string; role: string }) => item.role === "urc");
    const response = await app.inject({
      method: "PATCH",
      url: `/api/officers/${officer.id}`,
      headers: { cookie: adminCookie },
      payload: { waJid: "628000000005@s.whatsapp.net" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  it("lets admin update settings", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Admin#12345" }
    });
    const adminCookie = sessionCookie(login);
    const response = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: adminCookie },
      payload: { wa_number: "081200000000", dpo_name: "Project Owner" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().settings.waNumber).toBe("081200000000");
  });

  it("lets admin hide menus per role and exposes them on login and /api/me", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Admin#12345" }
    });
    const adminCookie = sessionCookie(login);
    expect(login.json().hiddenMenus).toEqual([]);

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: adminCookie },
      payload: { menu_hidden: { piket: ["analytics", "guide"], urc: ["map"] } }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().settings.menuHidden).toEqual({
      piket: ["analytics", "guide"],
      urc: ["map"]
    });

    const piketLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "piket", password: "Demo#12345" }
    });
    expect(piketLogin.json().hiddenMenus).toEqual(["analytics", "guide"]);
    const me = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: sessionCookie(piketLogin) }
    });
    expect(me.json().hiddenMenus).toEqual(["analytics", "guide"]);

    // Admin tidak boleh mengunci dirinya sendiri dari menu Sistem.
    const lockout = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: adminCookie },
      payload: { menu_hidden: { admin: ["system"] } }
    });
    expect(lockout.statusCode).toBe(400);

    // Setiap role wajib punya minimal satu menu yang tampil.
    const empty = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: adminCookie },
      payload: { menu_hidden: { bhabin: ["live", "reports", "map", "analytics", "system", "guide"] } }
    });
    expect(empty.statusCode).toBe(400);

    // Non-admin tidak bisa mengubah pengaturan menu.
    const forbidden = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: sessionCookie(piketLogin) },
      payload: { menu_hidden: {} }
    });
    expect(forbidden.statusCode).toBe(403);

    const reset = await app.inject({
      method: "PATCH",
      url: "/api/settings",
      headers: { cookie: adminCookie },
      payload: { menu_hidden: {} }
    });
    expect(reset.json().settings.menuHidden).toEqual({});
  });
});

const INTERNAL_TOKEN = "test-internal-token-123456";
const GROUP_JID = "120363000000000000@g.us";

function internalHeaders() {
  return { "x-sigap-internal-token": INTERNAL_TOKEN };
}

async function loginCookie(username: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { username, password }
  });
  expect(response.statusCode).toBe(200);
  return sessionCookie(response);
}

async function createManualTicket(
  payload: {
    reporterName: string;
    reporterPhone?: string;
    category?: string;
    priority?: string;
    title: string;
    lat?: number;
    lng?: number;
  },
  authCookie = cookie
) {
  const response = await app.inject({
    method: "POST",
    url: "/api/tickets/manual",
    headers: { cookie: authCookie },
    payload: {
      reporterName: payload.reporterName,
      reporterPhone:
        payload.reporterPhone ??
        `0812${String(Math.floor(Math.random() * 90_000_000) + 10_000_000)}`,
      category: payload.category ?? "tawuran",
      priority: payload.priority,
      title: payload.title,
      description: "Tiket uji Fase 4.",
      address: "Jl. Uji Fase 4 No. 1",
      lat: payload.lat,
      lng: payload.lng,
      reporterConsent: true
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json().ticket as {
    id: string;
    ticketNo: string;
    status: string;
    duplicateOf: string | null;
  };
}

function inbound(
  sender: string,
  type: "text" | "location" | "image" | "video" | "audio" | "unknown",
  payload: {
    text?: string;
    location?: { lat: number; lng: number; accuracyM?: number };
    waMessageId?: string;
    mediaIds?: string[];
    mediaError?: string;
  } = {}
) {
  return {
    waMessageId: payload.waMessageId ?? randomUUID(),
    chatJid: sender,
    senderJid: sender,
    isGroup: false,
    type,
    text: payload.text,
    location: payload.location,
    mediaIds: payload.mediaIds,
    mediaError: payload.mediaError,
    timestamp: new Date().toISOString()
  };
}

describe("WhatsApp conversation engine", () => {
  it("rejects internal calls without a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      payload: inbound("6281111111111@s.whatsapp.net", "text", { text: "LAPOR" })
    });
    expect(response.statusCode).toBe(401);
  });

  it("runs the normal report flow and creates a ticket", async () => {
    const sender = "6281111111111@s.whatsapp.net";
    const before = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const beforeCount = before.json().items.length;

    const steps: Array<{ type: "text" | "location"; text?: string; location?: { lat: number; lng: number } }> = [
      { type: "text", text: "LAPOR" },
      { type: "text", text: "Budi Santoso" },
      { type: "text", text: "1" },
      { type: "text", text: "Ada tawuran di depan pasar, sekitar 15 orang." },
      { type: "location", location: { lat: -6.26, lng: 106.982 } },
      { type: "text", text: "SELESAI" },
      { type: "text", text: "1" }
    ];

    for (const step of steps) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
      expect(response.statusCode).toBe(200);
    }

    const after = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const items = after.json().items;
    expect(items.length).toBe(beforeCount + 1);
    const ticket = items.find((item: { reporter: { name: string } }) => item.reporter.name === "Budi Santoso");
    expect(ticket).toBeTruthy();
    expect(ticket.status).toBe("baru");
    expect(ticket.priority).toBe("P2");
    expect(ticket.category).toBe("tawuran");
    expect(ticket.locationStatus).toBe("verified");

    const outbox = await app.inject({
      method: "GET",
      url: "/internal/outbox?limit=50",
      headers: internalHeaders()
    });
    const messages = outbox.json().items as Array<{
      targetJid: string;
      payload: { text?: string };
    }>;
    // Laporan baru belum masuk grup URC sebelum diterima piket.
    expect(
      messages.some(
        (item) => item.targetJid === GROUP_JID && item.payload.text?.includes(ticket.ticketNo)
      )
    ).toBe(false);

    const accept = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    expect(accept.statusCode).toBe(200);
    const groupRow = app.sqlite
      .prepare(
        "SELECT payload_json FROM outbound_messages WHERE target_jid = ? AND payload_json LIKE ?"
      )
      .get(GROUP_JID, `%${ticket.ticketNo}%`) as { payload_json: string } | undefined;
    expect(groupRow).toBeTruthy();
    const groupText = (JSON.parse(groupRow!.payload_json) as { text: string }).text;
    expect(groupText).toContain(ticket.ticketNo);
    expect(groupText).toContain("Diterima piket:");
    expect(groupText).toContain("Budi Santoso");
  });

  it("deduplicates the same WhatsApp message id", async () => {
    const sender = "6281111111112@s.whatsapp.net";
    const waMessageId = randomUUID();
    const first = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "text", { text: "LAPOR", waMessageId })
    });
    const second = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "text", { text: "LAPOR", waMessageId })
    });
    expect(first.json().duplicate).toBeUndefined();
    expect(second.json().duplicate).toBe(true);
  });

  it("recognises affixed emergency words such as perampokan / bersenjata", async () => {
    const sender = "6281111111177@s.whatsapp.net";
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "text", {
        text: "Tolong sedang ada perampokan di rumah saya dan bersenjata"
      })
    });
    const last = app.sqlite
      .prepare(
        "SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC, rowid DESC LIMIT 1"
      )
      .get(sender) as { payload_json: string };
    expect(JSON.parse(last.payload_json).text).toContain("kejadian DARURAT");
  });

  it("asks for confirmation on emergency keywords, then creates P1 on YA", async () => {
    const sender = "6281111111113@s.whatsapp.net";
    const countP1 = async () =>
      (
        await app.inject({ method: "GET", url: "/api/tickets?limit=100&priority=P1", headers: { cookie } })
      ).json().items.length as number;
    const before = await countP1();

    const response = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "text", {
        text: "TAWURAN di depan sekolah, ada yang bawa senjata"
      })
    });
    expect(response.statusCode).toBe(200);
    // Kata kunci saja belum membuat P1 (mencegah alarm palsu).
    expect(await countP1()).toBe(before);

    for (const step of [
      { type: "text" as const, text: "1" },
      { type: "text" as const, text: "Siti Aminah" }
    ]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }
    // Lokasi wajib: tiket P1 belum dibuat sebelum lokasi dikirim.
    expect(await countP1()).toBe(before);
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "location", { location: { lat: -6.26, lng: 106.982 } })
    });
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const ticket = list
      .json()
      .items.find((item: { reporter: { name: string }; priority: string; description: string }) =>
        item.priority === "P1" && item.description?.includes("ada yang bawa senjata")
      );
    expect(ticket).toBeTruthy();
    expect(ticket.priority).toBe("P1");
    expect(ticket.category).toBe("tawuran");
  });

  it("treats a keyword message as a normal report when the reporter answers TIDAK", async () => {
    const sender = "6281111111123@s.whatsapp.net";
    const countP1 = async () =>
      (
        await app.inject({ method: "GET", url: "/api/tickets?limit=100&priority=P1", headers: { cookie } })
      ).json().items.length as number;
    const before = await countP1();
    for (const text of ["Info banjir di RW 3 kemarin sudah surut", "2"]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, "text", { text })
      });
    }
    expect(await countP1()).toBe(before);
    const row = app.sqlite
      .prepare("SELECT state, context_json FROM conversations WHERE wa_jid = ?")
      .get(sender) as { state: string; context_json: string };
    // Nama belum ada → ditanya nama dulu; deskripsi awal dipertahankan.
    expect(row.state).toBe("AWAIT_NAME");
    expect(JSON.parse(row.context_json).description).toContain("banjir");
  });

  it("creates P1 from DARURAT once the reason, name, and location are given", async () => {
    const sender = "6281111111124@s.whatsapp.net";
    const send = (step: { type: "text" | "location"; text?: string; location?: { lat: number; lng: number } }) =>
      app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    const ticketFor = () =>
      app.sqlite
        .prepare(
          "SELECT t.priority, t.category, t.title FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?"
        )
        .get(sender) as { priority: string; category: string; title: string } | undefined;
    await send({ type: "text", text: "DARURAT rumah warga terbakar" });
    await send({ type: "text", text: "Warga Darurat" });
    expect(ticketFor()).toBeUndefined();
    await send({ type: "text", text: "LEWATI" });
    expect(ticketFor()).toBeUndefined();
    await send({ type: "location", location: { lat: -6.26, lng: 106.982 } });
    const ticket = ticketFor();
    expect(ticket?.priority).toBe("P1");
    expect(ticket?.category).toBe("kebakaran");
    expect(ticket?.title).toContain("rumah warga terbakar");

    // Darurat di dalam wilkum langsung diteruskan ke grup URC tanpa menunggu piket.
    const dispatched = app.sqlite
      .prepare(
        "SELECT t.status, t.ack_at, t.ticket_no FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?"
      )
      .get(sender) as { status: string; ack_at: string | null; ticket_no: string };
    expect(dispatched.status).toBe("diterima");
    expect(dispatched.ack_at).toBeTruthy();
    const forward = app.sqlite
      .prepare("SELECT payload_json FROM outbound_messages WHERE target_jid = ? AND payload_json LIKE ?")
      .get(GROUP_JID, `%${dispatched.ticket_no}%`) as { payload_json: string } | undefined;
    expect(forward?.payload_json).toContain("Balas (reply) untuk menanggapi");
    expect(forward?.payload_json).not.toContain("TUNDA <alasan>");
  });

  it("does not create P1 when DARURAT is sent without saying what happened", async () => {
    const sender = "6281111111126@s.whatsapp.net";
    for (const text of ["DARURAT", "tolong darurat", "test test"]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, "text", { text })
      });
    }
    const tickets = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?")
      .get(sender) as { n: number };
    expect(tickets.n).toBe(0);
    const row = app.sqlite
      .prepare("SELECT state FROM conversations WHERE wa_jid = ?")
      .get(sender) as { state: string };
    expect(row.state).toBe("AWAIT_EMERGENCY_DESC");
  });

  it("starts a normal report (not P1) when a location is shared without context", async () => {
    const sender = "6281111111125@s.whatsapp.net";
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "location", { location: { lat: -6.26, lng: 106.982 } })
    });
    const tickets = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?")
      .get(sender) as { n: number };
    expect(tickets.n).toBe(0);
    const row = app.sqlite
      .prepare("SELECT state, context_json FROM conversations WHERE wa_jid = ?")
      .get(sender) as { state: string; context_json: string };
    expect(row.state).toBe("AWAIT_NAME");
    expect(JSON.parse(row.context_json).lat).toBeCloseTo(-6.26);
  });

  it("redirects a location outside the wilkum", async () => {
    const sender = "6281111111114@s.whatsapp.net";
    const before = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const beforeCount = before.json().items.length;

    const flow = [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Warga Luar" },
      { type: "text" as const, text: "1" },
      { type: "text" as const, text: "Laporan di luar wilayah" },
      { type: "location" as const, location: { lat: 0, lng: 0 } }
    ];
    for (const step of flow) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }

    const after = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    expect(after.json().items.length).toBe(beforeCount);

    const outbox = await app.inject({
      method: "GET",
      url: "/internal/outbox?limit=50",
      headers: internalHeaders()
    });
    expect(outbox.statusCode).toBe(200);
    const texts = (outbox.json().items as Array<{ payload: { text?: string } }>).map(
      (item) => item.payload.text ?? ""
    );
    expect(texts.some((text) => text.includes("di luar wilayah hukum"))).toBe(true);
  });

  it("reveals a group ID before the group is registered", async () => {
    const groupJid = "120363999999999999@g.us";
    const response = await app.inject({
      method: "POST",
      url: "/internal/wa/group-command",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        groupJid,
        senderJid: "6281111111110@s.whatsapp.net",
        text: "/id",
        timestamp: new Date().toISOString()
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().replies).toBe(1);
    const message = app.sqlite
      .prepare("SELECT payload_json FROM outbound_messages WHERE target_jid = ?")
      .get(groupJid) as { payload_json: string } | undefined;
    expect(message?.payload_json).toContain("120363999999999999");
  });

  it("processes /otw, /tiba, and /selesai from the URC group", async () => {
    const sender = "6281111111115@s.whatsapp.net";
    const flow = [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Siti Uji" },
      { type: "text" as const, text: "2" },
      { type: "text" as const, text: "Motor hilang di parkiran." },
      { type: "location" as const, location: { lat: -6.241, lng: 106.978 } },
      { type: "text" as const, text: "SELESAI" },
      { type: "text" as const, text: "1" }
    ];
    for (const step of flow) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }

    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const ticket = list
      .json()
      .items.find((item: { reporter: { name: string } }) => item.reporter.name === "Siti Uji");
    expect(ticket).toBeTruthy();
    const seq = ticket.ticketNo.split("-").at(-1) as string;

    await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });

    const lastGroupReply = () =>
      app.sqlite
        .prepare(
          "SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(GROUP_JID) as { payload_json: string } | undefined;
    const lastReporterReply = () =>
      app.sqlite
        .prepare(
          "SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(sender) as { payload_json: string } | undefined;

    expect(lastReporterReply()?.payload_json).toContain("sudah diterima petugas");

    const bhabinAttempt = await app.inject({
      method: "POST",
      url: "/internal/wa/group-command",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        groupJid: GROUP_JID,
        senderJid: "628000000007@s.whatsapp.net",
        text: `/otw ${seq}`,
        timestamp: new Date().toISOString()
      }
    });
    expect(bhabinAttempt.json().replies).toBe(1);
    const bhabinReply = lastGroupReply();
    expect(bhabinReply?.payload_json).toContain("tidak berhak");
    expect(bhabinReply?.payload_json).toContain("piket, urc, pawas, admin");

    const unknownAttempt = await app.inject({
      method: "POST",
      url: "/internal/wa/group-command",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        groupJid: GROUP_JID,
        senderJid: "6289999999999@s.whatsapp.net",
        text: `/otw ${seq}`,
        timestamp: new Date().toISOString()
      }
    });
    expect(unknownAttempt.json().reason).toBe("unknown_officer");
    expect(lastGroupReply()?.payload_json).toContain("belum terdaftar sebagai petugas");

    for (const [command, note] of [
      ["otw", ""],
      ["tiba", ""],
      ["selesai", "Ditangani URC"]
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/group-command",
        headers: internalHeaders(),
        payload: {
          waMessageId: randomUUID(),
          groupJid: GROUP_JID,
          senderJid: "628000000005@s.whatsapp.net",
          text: `/${command} ${seq} ${note}`.trim(),
          timestamp: new Date().toISOString()
        }
      });
      expect(response.statusCode).toBe(200);
      const reporterText = lastReporterReply()?.payload_json ?? "";
      const officerName = (
        app.sqlite
          .prepare("SELECT name FROM officers WHERE wa_jid = ?")
          .get("628000000005@s.whatsapp.net") as { name: string }
      ).name;
      // Nama petugas pengirim command tampil di grup dan di pesan pelapor.
      expect(reporterText).toContain(officerName);
      expect(lastGroupReply()?.payload_json ?? "").toContain(officerName);
      if (command === "otw") expect(reporterText).toContain("sedang jalan ke TKP");
      if (command === "tiba") expect(reporterText).toContain("sudah tiba di TKP");
      if (command === "selesai") {
        expect(reporterText).toContain("sudah selesai ditangani");
        expect(reporterText).toContain("Ditangani URC");
      }
    }

    const detail = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}`,
      headers: { cookie }
    });
    expect(detail.json().ticket.status).toBe("selesai");
    expect(detail.json().ticket.closeNote).toBe("Ditangani URC");
  });

  it("treats a free-text reply (/tanggap) as the officer heading out and tells the reporter", async () => {
    const sender = "6281111111127@s.whatsapp.net";
    const flow = [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Rina Tanggap" },
      { type: "text" as const, text: "2" },
      { type: "text" as const, text: "Helm dicuri di warung." },
      { type: "location" as const, location: { lat: -6.241, lng: 106.978 } },
      { type: "text" as const, text: "SELESAI" },
      { type: "text" as const, text: "1" }
    ];
    for (const step of flow) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }
    const row = app.sqlite
      .prepare(
        "SELECT t.id, t.ticket_no, t.status FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?"
      )
      .get(sender) as { id: string; ticket_no: string; status: string };
    // Laporan biasa tetap menunggu ACC piket/admin dan belum masuk grup.
    expect(row.status).toBe("baru");
    const beforeAccept = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM outbound_messages WHERE target_jid = ? AND payload_json LIKE ?")
      .get(GROUP_JID, `%${row.ticket_no}%`) as { n: number };
    expect(beforeAccept.n).toBe(0);

    await app.inject({
      method: "POST",
      url: `/api/tickets/${row.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });

    const groupCommand = (text: string) =>
      app.inject({
        method: "POST",
        url: "/internal/wa/group-command",
        headers: internalHeaders(),
        payload: {
          waMessageId: randomUUID(),
          groupJid: GROUP_JID,
          senderJid: "628000000005@s.whatsapp.net",
          text,
          timestamp: new Date().toISOString()
        }
      });
    const first = await groupCommand(`/tanggap ${row.ticket_no} siap meluncur ndan`);
    expect(first.statusCode).toBe(200);
    const status = app.sqlite.prepare("SELECT status, assigned_to FROM tickets WHERE id = ?").get(row.id) as {
      status: string;
      assigned_to: string | null;
    };
    expect(status.status).toBe("otw");
    expect(status.assigned_to).toBeTruthy();
    const reporterText = (
      app.sqlite
        .prepare(
          "SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC LIMIT 1"
        )
        .get(sender) as { payload_json: string }
    ).payload_json;
    expect(reporterText).toContain("sedang jalan ke TKP");
    // Obrolan anggota tidak diteruskan ke pelapor.
    expect(reporterText).not.toContain("ndan");

    // Reply berikutnya (tiket sudah OTW) diam saja, tidak membanjiri grup.
    const second = await groupCommand(`/tanggap ${row.ticket_no} saya juga merapat`);
    expect(second.json().reason).toBe("response_ignored");
    expect(second.json().replies).toBe(0);
  });

  it("filters the ticket list by category and date range", async () => {
    const all = await app.inject({ method: "GET", url: "/api/tickets?limit=100", headers: { cookie } });
    const items = all.json().items as Array<{ category: string; createdAt: string }>;
    const category = items[0]!.category;
    const byCategory = await app.inject({
      method: "GET",
      url: `/api/tickets?limit=100&category=${category}`,
      headers: { cookie }
    });
    expect(byCategory.statusCode).toBe(200);
    const filtered = byCategory.json().items as Array<{ category: string }>;
    expect(filtered.length).toBe(items.filter((item) => item.category === category).length);
    expect(filtered.every((item) => item.category === category)).toBe(true);

    const future = await app.inject({
      method: "GET",
      url: `/api/tickets?limit=100&from=${encodeURIComponent(new Date(Date.now() + 86_400_000).toISOString())}`,
      headers: { cookie }
    });
    expect(future.json().items).toHaveLength(0);
  });

  it("updates gateway status through the internal endpoint", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/wa/status",
      headers: internalHeaders(),
      payload: { status: "connected", phone: "6281111111111" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().gateway.status).toBe("connected");
  });
});

function multipartBody(
  boundary: string,
  fields: Record<string, string>,
  files: Array<{ name: string; filename: string; contentType: string; data: Buffer }>
): Buffer {
  const chunks: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      )
    );
  }
  for (const file of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.data);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function testImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 72,
      height: 48,
      channels: 3,
      background: { r: 180, g: 40, b: 40 }
    }
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function uploadImage(options: {
  chatJid?: string;
  waMessageId?: string;
  mime?: string;
  kind?: string;
  data?: Buffer;
  thumb?: Buffer;
  durationS?: number;
  exifGps?: { lat: number; lng: number };
} = {}) {
  const data = options.data ?? (await testImage());
  const mime = options.mime ?? "image/jpeg";
  const fields: Record<string, string> = {
    mime,
    kind: options.kind ?? "image",
    waChatJid: options.chatJid ?? "6281111111111@s.whatsapp.net",
    waMessageId: options.waMessageId ?? randomUUID()
  };
  if (options.durationS !== undefined) fields.durationS = String(options.durationS);
  if (options.exifGps) {
    fields.exifLat = String(options.exifGps.lat);
    fields.exifLng = String(options.exifGps.lng);
  }
  const files = [
    {
      name: "file",
      filename: mime.startsWith("image/") ? "bukti.jpg" : "media.bin",
      contentType: mime,
      data
    }
  ];
  if (options.thumb) {
    files.push({
      name: "thumb",
      filename: "thumb.jpg",
      contentType: "image/jpeg",
      data: options.thumb
    });
  }
  const boundary = `----sigap-${randomUUID()}`;
  const body = multipartBody(boundary, fields, files);
  const response = await app.inject({
    method: "POST",
    url: "/internal/media",
    headers: {
      ...internalHeaders(),
      "content-type": `multipart/form-data; boundary=${boundary}`
    },
    payload: body
  });
  return { response, data };
}

describe("WhatsApp media pipeline", () => {
  it("rejects internal media uploads without the internal token", async () => {
    const boundary = `----sigap-${randomUUID()}`;
    const body = multipartBody(
      boundary,
      { mime: "image/jpeg" },
      [
        {
          name: "file",
          filename: "bukti.jpg",
          contentType: "image/jpeg",
          data: await testImage()
        }
      ]
    );
    const response = await app.inject({
      method: "POST",
      url: "/internal/media",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body
    });
    expect(response.statusCode).toBe(401);
  });

  it("stores an image, builds a thumbnail, and serves it with range support", async () => {
    const { response, data } = await uploadImage();
    expect(response.statusCode).toBe(200);
    const media = response.json().media;
    expect(media.kind).toBe("image");
    expect(media.sha256).toHaveLength(64);
    expect(media.width).toBe(72);
    expect(media.height).toBe(48);
    expect(media.thumbUrl).toContain("/thumb");

    const original = await app.inject({
      method: "GET",
      url: media.url,
      headers: { cookie }
    });
    expect(original.statusCode).toBe(200);
    expect(original.headers["content-type"]).toContain("image/jpeg");
    expect(original.rawPayload.length).toBe(data.length);

    const thumb = await app.inject({
      method: "GET",
      url: media.thumbUrl,
      headers: { cookie }
    });
    expect(thumb.statusCode).toBe(200);
    expect(thumb.headers["content-type"]).toContain("image/jpeg");

    const range = await app.inject({
      method: "GET",
      url: media.url,
      headers: { cookie, range: "bytes=0-9" }
    });
    expect(range.statusCode).toBe(206);
    expect(range.rawPayload.length).toBe(10);
    expect(range.headers["content-range"]).toBe(`bytes 0-9/${data.length}`);

    const download = await app.inject({
      method: "GET",
      url: `${media.url}?download=1`,
      headers: { cookie }
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers["content-disposition"]).toContain("attachment");

    const anonymous = await app.inject({ method: "GET", url: media.url });
    expect(anonymous.statusCode).toBe(401);
  });

  it("stores video thumbnails and audio duration metadata", async () => {
    const thumb = await testImage();
    const video = await uploadImage({
      mime: "video/mp4",
      kind: "video",
      data: Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18]),
        Buffer.from("ftypmp42\x00\x00\x00\x00mp42isom")
      ]),
      thumb
    });
    expect(video.response.statusCode).toBe(200);
    const videoMedia = video.response.json().media;
    expect(videoMedia.kind).toBe("video");
    expect(videoMedia.width).toBeNull();
    expect(videoMedia.thumbUrl).toContain("/thumb");
    const videoThumb = await app.inject({
      method: "GET",
      url: videoMedia.thumbUrl,
      headers: { cookie }
    });
    expect(videoThumb.statusCode).toBe(200);
    expect(videoThumb.headers["content-type"]).toContain("image/jpeg");

    const audio = await uploadImage({
      mime: "audio/ogg",
      kind: "audio",
      data: Buffer.from("OggS-fake-voice-note"),
      durationS: 12
    });
    expect(audio.response.statusCode).toBe(200);
    const audioMedia = audio.response.json().media;
    expect(audioMedia.kind).toBe("audio");
    expect(audioMedia.durationS).toBe(12);
    expect(audioMedia.thumbUrl).toBeNull();
    const served = await app.inject({
      method: "GET",
      url: audioMedia.url,
      headers: { cookie }
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("audio/ogg");
  });

  it("blocks bhabin from accessing staged media", async () => {
    const uploaded = await uploadImage({ chatJid: "6281111111130@s.whatsapp.net" });
    const media = uploaded.response.json().media;
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "bhabin_pekyon", password: "Demo#12345" }
    });
    const bhabinCookie = sessionCookie(login);
    const denied = await app.inject({
      method: "GET",
      url: media.url,
      headers: { cookie: bhabinCookie }
    });
    expect(denied.statusCode).toBe(403);
  });

  it("deduplicates media by WhatsApp message id", async () => {
    const waMessageId = randomUUID();
    const first = await uploadImage({ waMessageId });
    const second = await uploadImage({ waMessageId });
    expect(first.response.statusCode).toBe(200);
    expect(second.response.statusCode).toBe(200);
    expect(second.response.json().media.id).toBe(first.response.json().media.id);
  });

  it("rejects images above the 16 MB image limit", async () => {
    const { response } = await uploadImage({ data: Buffer.alloc(16 * 1024 * 1024 + 1) });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toContain("16 MB");
  });

  it("rejects unsupported media types", async () => {
    const { response } = await uploadImage({
      mime: "text/plain",
      data: Buffer.from("bukan media")
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("bad_request");
  });

  it("attaches staged media when the WhatsApp report creates a ticket", async () => {
    const sender = "6281111111120@s.whatsapp.net";
    const flow = [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Warga Media" },
      { type: "text" as const, text: "1" },
      { type: "text" as const, text: "Ada keributan dengan foto bukti." },
      { type: "location" as const, location: { lat: -6.26, lng: 106.982 } }
    ];
    for (const step of flow) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
      expect(response.statusCode).toBe(200);
    }

    const uploaded = await uploadImage({ chatJid: sender });
    const mediaId = uploaded.response.json().media.id;
    const mediaMessage = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "image", { mediaIds: [mediaId] })
    });
    expect(mediaMessage.statusCode).toBe(200);

    for (const step of [
      { type: "text" as const, text: "SELESAI" },
      { type: "text" as const, text: "1" }
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
      expect(response.statusCode).toBe(200);
    }

    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const ticket = list
      .json()
      .items.find((item: { reporter: { name: string } }) => item.reporter.name === "Warga Media");
    expect(ticket).toBeTruthy();

    const detail = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}`,
      headers: { cookie }
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().media).toHaveLength(1);
    expect(detail.json().media[0].id).toBe(mediaId);
    expect(detail.json().media[0].thumbUrl).toContain("/thumb");

    const groupMediaQuery = () =>
      app.sqlite
        .prepare(
          "SELECT target_jid, payload_json FROM outbound_messages WHERE kind = 'media' AND target_jid = ?"
        )
        .all(GROUP_JID) as Array<{ target_jid: string; payload_json: string }>;
    expect(groupMediaQuery().some((row) => row.payload_json.includes(mediaId))).toBe(false);
    const accept = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    expect(accept.statusCode).toBe(200);
    const groupMedia = groupMediaQuery();
    expect(groupMedia.length).toBeGreaterThan(0);
    expect(groupMedia.some((row) => row.payload_json.includes(mediaId))).toBe(true);

    const internalMedia = await app.inject({
      method: "GET",
      url: `/internal/media/${mediaId}`,
      headers: internalHeaders()
    });
    expect(internalMedia.statusCode).toBe(200);
    expect(internalMedia.headers["content-type"]).toContain("image/jpeg");
    expect(internalMedia.headers["cache-control"]).toContain("no-store");

    const otherRegion = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "bhabin_jakasetia", password: "Demo#12345" }
    });
    const otherCookie = sessionCookie(otherRegion);
    const denied = await app.inject({
      method: "GET",
      url: detail.json().media[0].url,
      headers: { cookie: otherCookie }
    });
    expect(denied.statusCode).toBe(403);
  });

  it("uses EXIF GPS from a photo when the reporter skips location", async () => {
    const sender = "6281111111121@s.whatsapp.net";
    for (const step of [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Warga GPS Foto" },
      { type: "text" as const, text: "3" },
      { type: "text" as const, text: "Pohon tumbang menutup jalan, foto ada GPS." }
    ]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }

    const uploaded = await uploadImage({
      chatJid: sender,
      exifGps: { lat: -6.26, lng: 106.982 }
    });
    const mediaId = uploaded.response.json().media.id;
    const gpsMessage = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "image", { mediaIds: [mediaId] })
    });
    expect(gpsMessage.statusCode).toBe(200);

    for (const step of [
      { type: "text" as const, text: "SELESAI" },
      { type: "text" as const, text: "1" }
    ]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
    }

    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const ticket = list
      .json()
      .items.find((item: { reporter: { name: string } }) => item.reporter.name === "Warga GPS Foto");
    expect(ticket).toBeTruthy();
    expect(ticket.lat).toBeCloseTo(-6.26, 4);
    expect(ticket.lng).toBeCloseTo(106.982, 4);
    expect(ticket.locationStatus).toBe("verified");
  });

  it("attaches a /selesai group photo to the ticket", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/tickets/manual",
      headers: { cookie },
      payload: {
        reporterName: "Pelapor Grup",
        reporterPhone: "081200000099",
        category: "lain",
        title: "Tiket bukti grup URC",
        description: "Untuk uji lampiran foto grup.",
        address: "Jl. Uji Grup No. 2",
        reporterConsent: true
      }
    });
    expect(created.statusCode).toBe(200);
    const ticket = created.json().ticket;
    const seq = ticket.ticketNo.split("-").at(-1) as string;

    const accepted = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    expect(accepted.statusCode).toBe(200);

    const uploaded = await uploadImage({
      chatJid: GROUP_JID,
      waMessageId: randomUUID()
    });
    const mediaId = uploaded.response.json().media.id;

    for (const [command, note] of [
      ["otw", ""],
      ["tiba", ""]
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/group-command",
        headers: internalHeaders(),
        payload: {
          waMessageId: randomUUID(),
          groupJid: GROUP_JID,
          senderJid: "628000000005@s.whatsapp.net",
          text: `/${command} ${seq} ${note}`.trim(),
          timestamp: new Date().toISOString()
        }
      });
      expect(response.statusCode).toBe(200);
    }

    const finished = await app.inject({
      method: "POST",
      url: "/internal/wa/group-command",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        groupJid: GROUP_JID,
        senderJid: "628000000005@s.whatsapp.net",
        text: `/selesai ${seq} Ditangani dengan bukti foto`,
        mediaIds: [mediaId],
        timestamp: new Date().toISOString()
      }
    });
    expect(finished.statusCode).toBe(200);

    const detail = await app.inject({
      method: "GET",
      url: `/api/tickets/${ticket.id}`,
      headers: { cookie }
    });
    expect(detail.json().ticket.status).toBe("selesai");
    expect(detail.json().media).toHaveLength(1);
    expect(detail.json().media[0].id).toBe(mediaId);
  });
});

describe("Phase 4 operations", () => {
  it("reveals a reporter phone with an audit trail", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=5",
      headers: { cookie }
    });
    const ticket = list.json().items[0] as { id: string };
    const response = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/reveal-phone`,
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().phone).toMatch(/^0?8\d{8,}$/);

    const audits = app.sqlite
      .prepare("SELECT action FROM audit_logs WHERE action = ? AND entity_id = ?")
      .all("reporter.phone.reveal", ticket.id) as Array<{ action: string }>;
    expect(audits.length).toBe(1);

    const bhabinCookie = await loginCookie("bhabin_pekyon", "Demo#12345");
    const denied = await app.inject({
      method: "POST",
      url: `/api/tickets/${ticket.id}/reveal-phone`,
      headers: { cookie: bhabinCookie }
    });
    expect(denied.statusCode).toBe(403);
  });

  it("builds and submits a shift handover", async () => {
    const summary = await app.inject({
      method: "GET",
      url: "/api/handover",
      headers: { cookie }
    });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().counts.active).toBeGreaterThan(0);
    expect(summary.json().checks).toHaveProperty("p1Acknowledged");

    const created = await app.inject({
      method: "POST",
      url: "/api/handover",
      headers: { cookie },
      payload: {
        shift: "siang",
        incomingName: "Bripka Pengganti",
        notes: "Antrean sudah dibaca. P1 dan tunda sudah dicek.",
        signedByName: "Bripka Andi Saputra",
        checklist: {
          p1Acknowledged: true,
          delayedReasons: true,
          namesComplete: true,
          mediaChecked: true,
          queueReviewed: true
        }
      }
    });
    expect(created.statusCode).toBe(200);
    const body = created.json();
    expect(body.ok).toBe(true);
    expect(body.summary.lastHandover.incomingName).toBe("Bripka Pengganti");
    expect(body.summary.lastHandover.signedByName).toBe("Bripka Andi Saputra");
    expect(body.summary.lastHandover.checklist.queueReviewed).toBe(true);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/handover",
      headers: { cookie },
      payload: {
        shift: "siang",
        incomingName: "AB",
        notes: "x",
        signedByName: "AB",
        checklist: {}
      }
    });
    expect(invalid.statusCode).toBe(400);
  });

  it("detects nearby duplicate tickets and merges them", async () => {
    const primary = await createManualTicket({
      reporterName: "Duplikat Utama",
      title: "Tawuran depan pasar malam",
      lat: -6.261,
      lng: 106.982
    });
    const duplicate = await createManualTicket({
      reporterName: "Duplikat Kedua",
      title: "Tawuran di depan pasar malam juga",
      lat: -6.2614,
      lng: 106.9823
    });

    const found = await app.inject({
      method: "GET",
      url: `/api/tickets/${primary.id}/duplicates`,
      headers: { cookie }
    });
    expect(found.statusCode).toBe(200);
    const item = found
      .json()
      .items.find((row: { id: string }) => row.id === duplicate.id);
    expect(item).toBeTruthy();
    expect(item.distanceM).toBeLessThan(100);

    const merged = await app.inject({
      method: "POST",
      url: `/api/tickets/${primary.id}/merge`,
      headers: { cookie },
      payload: { sourceIds: [duplicate.id], note: "Lokasi dan waktu sama" }
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().merged).toBe(1);

    const detail = await app.inject({
      method: "GET",
      url: `/api/tickets/${duplicate.id}`,
      headers: { cookie }
    });
    expect(detail.json().ticket.status).toBe("dibatalkan");
    expect(detail.json().ticket.duplicateOf).toBe(primary.id);
    expect(detail.json().ticket.closeNote).toContain(primary.ticketNo);

    const audits = app.sqlite
      .prepare("SELECT action FROM audit_logs WHERE action = ? AND entity_id = ?")
      .all("ticket.merge", duplicate.id) as Array<{ action: string }>;
    expect(audits.length).toBe(1);
  });

  it("escalates an unacknowledged P1 once to Pawas and Kapolsek", async () => {
    const ticket = await createManualTicket({
      reporterName: "Pelapor Eskalasi",
      category: "tawuran",
      priority: "P1",
      title: "P1 untuk uji eskalasi otomatis",
      lat: -6.26,
      lng: 106.982
    });
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    app.sqlite
      .prepare("UPDATE tickets SET created_at = ?, ack_at = NULL, otw_at = NULL WHERE id = ?")
      .run(old, ticket.id);

    const first = runEscalations(app);
    expect(first.pawas).toBe(1);
    expect(first.kapolsek).toBe(1);

    const targets = app.sqlite
      .prepare("SELECT target_jid, payload_json FROM outbound_messages WHERE payload_json LIKE ?")
      .all(`%${ticket.ticketNo}%`) as Array<{ target_jid: string; payload_json: string }>;
    const jids = targets.map((row) => row.target_jid);
    expect(jids).toContain("628000000003@s.whatsapp.net");
    expect(jids).toContain("628000000004@s.whatsapp.net");
    // Tiket belum diterima piket: eskalasi tidak dikirim ke grup URC.
    expect(jids).not.toContain(GROUP_JID);
    expect(targets.some((row) => row.payload_json.includes("ESKALASI PAWAS"))).toBe(true);
    expect(targets.some((row) => row.payload_json.includes("ESKALASI KAPOLSEK"))).toBe(true);

    const row = app.sqlite
      .prepare("SELECT escalated_pawas_at, escalated_kapolsek_at FROM tickets WHERE id = ?")
      .get(ticket.id) as {
      escalated_pawas_at: string | null;
      escalated_kapolsek_at: string | null;
    };
    expect(row.escalated_pawas_at).toBeTruthy();
    expect(row.escalated_kapolsek_at).toBeTruthy();

    const second = runEscalations(app);
    expect(second.pawas).toBe(0);
    expect(second.kapolsek).toBe(0);
  });
});

describe("Phase 5 analytics, export, and admin", () => {
  it("returns volume, heatmap, hotspots, SLA, and p90 analytics", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/analytics/summary",
      headers: { cookie }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.daily).toHaveLength(14);
    expect(body.heatmap.days).toHaveLength(7);
    expect(body.heatmap.values).toHaveLength(7);
    expect(body.heatmap.values[0]).toHaveLength(24);
    expect(Array.isArray(body.hotspots)).toBe(true);
    expect(body.response).toHaveProperty("p90AckSeconds");
    expect(body.sla).toHaveProperty("p1AckWithinTarget");
    expect(body.targets.ackSeconds).toBeGreaterThan(0);
    expect(typeof body.processing).toBe("number");
    expect(typeof body.waiting).toBe("number");
    expect(body.processing + body.waiting).toBeLessThanOrEqual(body.active);
    expect(Array.isArray(body.topLocations)).toBe(true);
    expect(body.topLocations.length).toBeGreaterThan(0);
    const firstLoc = body.topLocations[0];
    expect(firstLoc.count).toBeGreaterThanOrEqual(body.topLocations.at(-1).count);
    expect(firstLoc.categories.reduce((sum: number, c: { count: number }) => sum + c.count, 0)).toBe(
      firstLoc.count
    );
  });

  it("exports CSV, XLSX, and PDF monthly reports", async () => {
    const month = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit"
    })
      .format(new Date())
      .slice(0, 7);
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=1",
      headers: { cookie }
    });
    const ticketNo = list.json().items[0]?.ticketNo as string | undefined;
    expect(ticketNo).toBeTruthy();

    const csv = await app.inject({
      method: "GET",
      url: `/api/export/tickets.csv?month=${month}`,
      headers: { cookie }
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.headers["content-disposition"]).toContain("attachment");
    expect(csv.rawPayload.toString("utf8")).toContain("No Tiket");
    expect(csv.rawPayload.toString("utf8")).toContain(ticketNo as string);

    const xlsx = await app.inject({
      method: "GET",
      url: `/api/export/tickets.xlsx?month=${month}`,
      headers: { cookie }
    });
    expect(xlsx.statusCode).toBe(200);
    expect(xlsx.headers["content-type"]).toContain("spreadsheetml");
    expect(xlsx.rawPayload.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(xlsx.rawPayload.length).toBeGreaterThan(1000);

    const pdf = await app.inject({
      method: "GET",
      url: `/api/export/monthly.pdf?month=${month}`,
      headers: { cookie }
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");
    expect(pdf.rawPayload.subarray(0, 4).toString("utf8")).toBe("%PDF");

    const audits = app.sqlite
      .prepare("SELECT action FROM audit_logs WHERE action LIKE 'export.%'")
      .all() as Array<{ action: string }>;
    expect(audits.length).toBeGreaterThanOrEqual(3);
  });

  it("queues a daily digest and deduplicates the scheduled run", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");
    const response = await app.inject({
      method: "POST",
      url: "/api/system/digest",
      headers: { cookie: adminCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().queued).toBeGreaterThan(0);

    const digestMessages = app.sqlite
      .prepare(
        "SELECT target_jid, payload_json FROM outbound_messages WHERE payload_json LIKE ?"
      )
      .all("%DIGEST SIGAP%") as Array<{ target_jid: string; payload_json: string }>;
    expect(digestMessages.length).toBeGreaterThan(0);
    expect(digestMessages.some((row) => row.target_jid === "628000000004@s.whatsapp.net")).toBe(true);
    expect(digestMessages.some((row) => row.target_jid === GROUP_JID)).toBe(true);

    const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const scheduledNow = new Date(
      Date.UTC(wibNow.getUTCFullYear(), wibNow.getUTCMonth(), wibNow.getUTCDate(), 1, 0, 0)
    );
    const scheduled = runDailyDigest(app, {
      now: scheduledNow
    });
    expect(scheduled.skipped).toBe("already_sent");
  });

  it("enforces reporter block on WhatsApp reports", async () => {
    const sender = "6281111111199@s.whatsapp.net";
    for (const step of [
      { type: "text" as const, text: "LAPOR" },
      { type: "text" as const, text: "Pelapor Blokir" }
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(sender, step.type, step)
      });
      expect(response.statusCode).toBe(200);
    }

    const adminCookie = await loginCookie("admin", "Admin#12345");
    const reporters = await app.inject({
      method: "GET",
      url: "/api/reporters?q=Pelapor%20Blokir",
      headers: { cookie: adminCookie }
    });
    const reporter = reporters
      .json()
      .items.find((item: { name: string }) => item.name === "Pelapor Blokir") as {
      id: string;
    };
    expect(reporter).toBeTruthy();
    const blocked = await app.inject({
      method: "POST",
      url: `/api/reporters/${reporter.id}/block`,
      headers: { cookie: adminCookie },
      payload: { reason: "Spam laporan" }
    });
    expect(blocked.statusCode).toBe(200);

    const attempt = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(sender, "text", { text: "LAPOR" })
    });
    expect(attempt.statusCode).toBe(200);

    const lastReply = app.sqlite
      .prepare(
        "SELECT payload_json FROM outbound_messages WHERE target_jid = ? ORDER BY created_at DESC LIMIT 1"
      )
      .get(sender) as { payload_json: string } | undefined;
    expect(lastReply?.payload_json).toContain("diblokir");
  });

  it("blocks cross-region ticket access for bhabin", async () => {
    const bhabinCookie = await loginCookie("bhabin_jakasetia", "Demo#12345");
    const list = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie: bhabinCookie }
    });
    const ownTicketId = list.json().items[0]?.id as string | undefined;
    expect(ownTicketId).toBeTruthy();

    const all = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=100",
      headers: { cookie }
    });
    const other = all
      .json()
      .items.find(
        (item: { regionId: string | null; region: string | null }) =>
          item.regionId && item.regionId !== "region_jakasetia"
      ) as { id: string } | undefined;
    expect(other).toBeTruthy();

    const denied = await app.inject({
      method: "GET",
      url: `/api/tickets/${other?.id}`,
      headers: { cookie: bhabinCookie }
    });
    expect(denied.statusCode).toBe(403);
  });

  it("denies bhabin without a region from ticket and media access", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");
    const created = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: "bhabin_noregion",
        name: "Bhabin Tanpa Wilayah",
        role: "bhabin",
        password: "Demo#12345"
      }
    });
    // API sekarang menolak bhabin tanpa wilayah.
    expect(created.statusCode).toBe(400);

    // Data lama yang terlanjur salah konfigurasi tetap harus diblokir aksesnya.
    const now = new Date().toISOString();
    app.sqlite
      .prepare(
        `INSERT INTO officers (id, unit_id, username, password_hash, name, role, active, created_at, updated_at)
         SELECT ?, unit_id, 'bhabin_noregion', ?, 'Bhabin Tanpa Wilayah', 'bhabin', 1, ?, ? FROM officers WHERE username = 'admin'`
      )
      .run(randomUUID(), await hashPassword("Demo#12345"), now, now);
    const bhabinCookie = await loginCookie("bhabin_noregion", "Demo#12345");
    const tickets = await app.inject({
      method: "GET",
      url: "/api/tickets?limit=5",
      headers: { cookie: bhabinCookie }
    });
    expect(tickets.statusCode).toBe(403);

    const media = await app.inject({
      method: "GET",
      url: "/api/media/does-not-exist",
      headers: { cookie: bhabinCookie }
    });
    expect(media.statusCode).toBe(404);

    const uploaded = await uploadImage();
    const mediaId = uploaded.response.json().media.id as string;
    const deniedMedia = await app.inject({
      method: "GET",
      url: `/api/media/${mediaId}`,
      headers: { cookie: bhabinCookie }
    });
    expect(deniedMedia.statusCode).toBe(403);
  });

  it("lets admin manage wa groups and block reporters", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");

    const groups = await app.inject({
      method: "GET",
      url: "/api/wa-groups",
      headers: { cookie: adminCookie }
    });
    expect(groups.statusCode).toBe(200);
    expect(groups.json().items.length).toBeGreaterThan(0);

    const created = await app.inject({
      method: "POST",
      url: "/api/wa-groups",
      headers: { cookie: adminCookie },
      payload: {
        name: "Grup Uji Fase 5",
        jid: "120363999999999999@g.us",
        purpose: "lain",
        active: true
      }
    });
    expect(created.statusCode).toBe(200);
    const groupId = created.json().id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/wa-groups/${groupId}`,
      headers: { cookie: adminCookie },
      payload: { active: false }
    });
    expect(patched.statusCode).toBe(200);

    const reporters = await app.inject({
      method: "GET",
      url: "/api/reporters?limit=5",
      headers: { cookie: adminCookie }
    });
    expect(reporters.statusCode).toBe(200);
    const reporter = reporters.json().items[0] as { id: string };
    expect(reporter).toBeTruthy();

    const blocked = await app.inject({
      method: "POST",
      url: `/api/reporters/${reporter.id}/block`,
      headers: { cookie: adminCookie },
      payload: { reason: "Uji blokir Fase 5" }
    });
    expect(blocked.statusCode).toBe(200);

    const blockedList = await app.inject({
      method: "GET",
      url: "/api/reporters?limit=200",
      headers: { cookie: adminCookie }
    });
    const blockedReporter = blockedList
      .json()
      .items.find((item: { id: string }) => item.id === reporter.id);
    expect(blockedReporter.blockedReason).toBe("Uji blokir Fase 5");

    const unblocked = await app.inject({
      method: "POST",
      url: `/api/reporters/${reporter.id}/unblock`,
      headers: { cookie: adminCookie }
    });
    expect(unblocked.statusCode).toBe(200);
  });

  it("edits and deletes officers and regions", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");

    const createdOfficer = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: "officer_hapus",
        name: "Petugas Hapus",
        role: "piket",
        password: "Demo#12345"
      }
    });
    expect(createdOfficer.statusCode).toBe(200);
    const officerId = createdOfficer.json().id as string;

    const patchedOfficer = await app.inject({
      method: "PATCH",
      url: `/api/officers/${officerId}`,
      headers: { cookie: adminCookie },
      payload: { name: "Petugas Diubah", rank: "Bripka" }
    });
    expect(patchedOfficer.statusCode).toBe(200);

    const officerList = await app.inject({
      method: "GET",
      url: "/api/officers",
      headers: { cookie: adminCookie }
    });
    const edited = officerList
      .json()
      .items.find((item: { id: string }) => item.id === officerId);
    expect(edited.name).toBe("Petugas Diubah");
    expect(edited.rank).toBe("Bripka");

    const deletedOfficer = await app.inject({
      method: "DELETE",
      url: `/api/officers/${officerId}`,
      headers: { cookie: adminCookie }
    });
    expect(deletedOfficer.statusCode).toBe(200);
    // Selalu soft delete: jejak audit tetap menunjuk ke petugas yang ada.
    expect(deletedOfficer.json().mode).toBe("deactivated");

    const afterDelete = await app.inject({
      method: "GET",
      url: "/api/officers",
      headers: { cookie: adminCookie }
    });
    const softDeleted = afterDelete
      .json()
      .items.find((item: { id: string }) => item.id === officerId);
    expect(softDeleted?.active).toBe(false);

    // Petugas dengan riwayat tiket tidak dihapus permanen; dinonaktifkan.
    const historyOfficer = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: "officer_riwayat",
        name: "Petugas Riwayat",
        role: "urc",
        password: "Demo#12345",
        waJid: "6281111111999"
      }
    });
    const historyId = historyOfficer.json().id as string;
    const ticketRow = app.sqlite
      .prepare("SELECT id, assigned_to FROM tickets LIMIT 1")
      .get() as { id: string; assigned_to: string | null };
    app.sqlite
      .prepare("UPDATE tickets SET assigned_to = ? WHERE id = ?")
      .run(historyId, ticketRow.id);

    const deactivated = await app.inject({
      method: "DELETE",
      url: `/api/officers/${historyId}`,
      headers: { cookie: adminCookie }
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().mode).toBe("deactivated");

    const historyList = await app.inject({
      method: "GET",
      url: "/api/officers",
      headers: { cookie: adminCookie }
    });
    const inactive = historyList
      .json()
      .items.find((item: { id: string }) => item.id === historyId);
    expect(inactive.active).toBe(false);
    expect(inactive.waJid).toBeNull();
    app.sqlite
      .prepare("UPDATE tickets SET assigned_to = ? WHERE id = ?")
      .run(ticketRow.assigned_to, ticketRow.id);

    const createdRegion = await app.inject({
      method: "POST",
      url: "/api/regions",
      headers: { cookie: adminCookie },
      payload: {
        name: "Wilayah Uji Hapus",
        geojson: {
          type: "Polygon",
          coordinates: [
            [
              [106.97, -6.27],
              [106.98, -6.27],
              [106.98, -6.26],
              [106.97, -6.26],
              [106.97, -6.27]
            ]
          ]
        },
        active: true
      }
    });
    expect(createdRegion.statusCode).toBe(200);
    const regionId = createdRegion.json().id as string;

    const deletedRegion = await app.inject({
      method: "DELETE",
      url: `/api/regions/${regionId}`,
      headers: { cookie: adminCookie }
    });
    expect(deletedRegion.statusCode).toBe(200);
    expect(deletedRegion.json().mode).toBe("deleted");

    const regionsAfter = await app.inject({
      method: "GET",
      url: "/api/regions",
      headers: { cookie: adminCookie }
    });
    expect(
      regionsAfter.json().items.some((item: { id: string }) => item.id === regionId)
    ).toBe(false);
  });
});

describe("Phase 6 hardening", () => {
  it("rejects mutating requests from a foreign origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example" },
      payload: { username: "piket", password: "Demo#12345" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("csrf_origin");
  });

  it("revokes the session after logout", async () => {
    const session = await loginCookie("piket2", "Demo#12345");
    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: session }
    });
    expect(logout.statusCode).toBe(200);
    const after = await app.inject({
      method: "GET",
      url: "/api/tickets",
      headers: { cookie: session }
    });
    expect(after.statusCode).toBe(401);
  });

  it("stores phone encrypted and hashed, never plaintext", async () => {
    const row = app.sqlite
      .prepare("SELECT phone_enc, phone_hash FROM reporters WHERE name = ?")
      .get("Rizky Maulana") as { phone_enc: string; phone_hash: string } | undefined;
    expect(row).toBeTruthy();
    expect(row?.phone_enc).not.toContain("0812");
    expect(row?.phone_hash).not.toContain("0812");
    expect(row?.phone_hash).toHaveLength(64);
  });

  it("encrypts TOTP secrets at rest", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const encrypted = encryptTotpSecret(secret, app.config.SIGAP_PHONE_KEY);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, app.config.SIGAP_PHONE_KEY)).toBe(secret);
    // Legacy plaintext remains readable until the next setup/enable.
    expect(decryptTotpSecret(secret, app.config.SIGAP_PHONE_KEY)).toBe(secret);
  });

  it("rejects MIME spoofing and traversal media ids", async () => {
    const spoofed = await uploadImage({
      mime: "image/jpeg",
      data: Buffer.from("<html><script>alert(1)</script></html>")
    });
    expect(spoofed.response.statusCode).toBe(400);

    const traversal = await app.inject({
      method: "GET",
      url: "/api/media/..%2F..%2Fetc%2Fpasswd",
      headers: { cookie }
    });
    expect(traversal.statusCode).toBe(404);
  });

  it("registers and removes a Web Push subscription", async () => {
    const key = await app.inject({
      method: "GET",
      url: "/api/push/public-key",
      headers: { cookie }
    });
    expect(key.statusCode).toBe(200);
    expect(key.json().configured).toBe(true);
    expect(key.json().publicKey.length).toBeGreaterThan(80);

    const blocked = await app.inject({
      method: "POST",
      url: "/api/push/subscribe",
      headers: { cookie },
      payload: {
        endpoint: "https://127.0.0.1/internal",
        keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "abcdefghij" }
      }
    });
    expect(blocked.statusCode).toBe(400);

    const endpoint = "https://push.example.test/subscription-1";
    const subscribe = await app.inject({
      method: "POST",
      url: "/api/push/subscribe",
      headers: { cookie },
      payload: {
        endpoint,
        keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "abcdefghij" }
      }
    });
    expect(subscribe.statusCode).toBe(200);
    const row = app.sqlite
      .prepare("SELECT officer_id FROM push_subscriptions WHERE endpoint = ?")
      .get(endpoint) as { officer_id: string } | undefined;
    expect(row?.officer_id).toBeTruthy();

    const unsubscribe = await app.inject({
      method: "POST",
      url: "/api/push/unsubscribe",
      headers: { cookie },
      payload: { endpoint }
    });
    expect(unsubscribe.statusCode).toBe(200);
    const gone = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?")
      .get(endpoint) as { n: number };
    expect(gone.n).toBe(0);
  });

  it("rate-limits repeated login attempts", async () => {
    const limited = await buildApp(
      loadConfig({
        SIGAP_ENV: "test",
        SIGAP_DB_PATH: ":memory:",
        SIGAP_MEDIA_DIR: mediaDir,
        SIGAP_SEED_DEMO: "false",
        SIGAP_ADMIN_PASSWORD: "Admin#12345",
        SIGAP_INTERNAL_TOKEN: "test-internal-token-123456",
        SIGAP_LOG_LEVEL: "silent"
      }),
      { seed: true, logger: false, rateLimit: true }
    );
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { username: "admin", password: "Salah#12345" }
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
      expect(statuses[5]).toBe(429);
    } finally {
      await limited.close();
    }
  }, 60_000);

  it("normalizes plain phone numbers and group IDs into WhatsApp JIDs", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "admin", password: "Admin#12345" }
    });
    const adminCookie = sessionCookie(login);

    const officer = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: "petugas_jid",
        name: "Petugas Uji JID",
        role: "urc",
        password: "Demo#12345",
        waJid: "0812-3456-7890"
      }
    });
    expect(officer.statusCode).toBe(200);

    const officers = await app.inject({
      method: "GET",
      url: "/api/officers",
      headers: { cookie: adminCookie }
    });
    const createdOfficer = officers
      .json()
      .items.find((item: { waJid?: string }) => item.waJid === "6281234567890@s.whatsapp.net");
    expect(createdOfficer).toBeTruthy();

    const group = await app.inject({
      method: "POST",
      url: "/api/wa-groups",
      headers: { cookie: adminCookie },
      payload: {
        name: "Grup Normalisasi",
        jid: "120363012345678901",
        purpose: "urc",
        active: true
      }
    });
    expect(group.statusCode).toBe(200);

    const groups = await app.inject({
      method: "GET",
      url: "/api/wa-groups",
      headers: { cookie: adminCookie }
    });
    const createdGroup = groups
      .json()
      .items.find((item: { jid: string }) => item.jid === "120363012345678901@g.us");
    expect(createdGroup).toBeTruthy();
  });

  it("controls the WhatsApp gateway from the admin API and bot channel", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");
    const denied = await app.inject({
      method: "POST",
      url: "/api/system/gateway/connect",
      headers: { cookie }
    });
    expect(denied.statusCode).toBe(403);

    const connect = await app.inject({
      method: "POST",
      url: "/api/system/gateway/connect",
      headers: { cookie: adminCookie }
    });
    expect(connect.statusCode).toBe(200);
    expect(connect.json().gateway.pendingCommand).toBe("connect");

    const control = await app.inject({
      method: "GET",
      url: "/internal/wa/control",
      headers: internalHeaders()
    });
    expect(control.statusCode).toBe(200);
    const command = control.json().command as { id: string; command: string };
    expect(command.command).toBe("connect");

    const ack = await app.inject({
      method: "POST",
      url: "/internal/wa/control/ack",
      headers: internalHeaders(),
      payload: { id: command.id }
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json().ok).toBe(true);

    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1ZkAAAAASUVORK5CYII=";
    const qr = await app.inject({
      method: "POST",
      url: "/internal/wa/qr",
      headers: internalHeaders(),
      payload: { qrDataUrl: `data:image/png;base64,${png}` }
    });
    expect(qr.statusCode).toBe(200);
    expect(qr.json().gateway.status).toBe("qr");

    const adminState = await app.inject({
      method: "GET",
      url: "/api/system/gateway",
      headers: { cookie: adminCookie }
    });
    expect(adminState.json().gateway.qr).toContain("data:image/png;base64,");

    const piketState = await app.inject({
      method: "GET",
      url: "/api/system/gateway",
      headers: { cookie }
    });
    expect(piketState.statusCode).toBe(200);
    expect(piketState.json().gateway.qr).toBeNull();
    expect(piketState.json().gateway.botOnline).toBe(true);
  });

  it("accepts Baileys payload variations for 1:1 text", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        chatJid: "6281111111122@s.whatsapp.net",
        senderJid: "",
        senderName: 12345,
        isGroup: false,
        type: "text-variant",
        text: "Halo",
        timestamp: 1760000000
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().replies).toBeGreaterThan(0);
  });

  it("reclaims outbox messages stuck in sending", async () => {
    const id = randomUUID();
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    app.sqlite
      .prepare(
        "INSERT INTO outbound_messages (id, unit_id, target_jid, kind, payload_json, status, attempts, next_attempt_at, last_error, created_at, sent_at) VALUES (?, 'unit_main', ?, 'text', ?, 'sending', 1, ?, NULL, ?, NULL)"
      )
      .run(id, "6281111111111@s.whatsapp.net", JSON.stringify({ text: "uji reclaim" }), past, past);

    const response = await app.inject({
      method: "GET",
      url: "/internal/outbox?limit=50",
      headers: internalHeaders()
    });
    expect(response.statusCode).toBe(200);
    const item = response
      .json()
      .items.find((row: { id: string }) => row.id === id);
    expect(item).toBeTruthy();
    expect(item.attempts).toBe(2);
  });
});

describe("Audit hardening regressions", () => {
  it("rejects invalid timezones and SIGAP_SEED_DEMO=true in production config", () => {
    expect(() =>
      loadConfig({
        SIGAP_ENV: "test",
        SIGAP_UNIT_TIMEZONE: "Invalid/Zone"
      })
    ).toThrow();

    expect(() =>
      loadConfig({
        SIGAP_ENV: "production",
        SIGAP_PUBLIC_ORIGIN: "https://sigap.example.go.id",
        SIGAP_API_URL: "https://sigap.example.go.id",
        SIGAP_INTERNAL_TOKEN: "prod-internal-token-very-long-1234",
        SIGAP_SESSION_SECRET: "prod-session-secret-minimum-32-characters-long",
        SIGAP_ADMIN_PASSWORD: "StrongProdPassword#987",
        SIGAP_PHONE_PEPPER: "prod-phone-pepper-minimum-16-chars",
        SIGAP_PHONE_KEY: Buffer.alloc(32, 9).toString("base64"),
        SIGAP_COOKIE_SECURE: "true",
        SIGAP_SEED_DEMO: "true"
      })
    ).toThrow(/SIGAP_SEED_DEMO/i);
  });

  it("ignores client TOTP secret on enable and blocks overwrite once active", async () => {
    const pawasCookie = await loginCookie("pawas", "Demo#12345");
    try {
      const setup = await app.inject({
        method: "POST",
        url: "/api/auth/totp/setup",
        headers: { cookie: pawasCookie }
      });
      expect(setup.statusCode).toBe(200);
      const { secret } = setup.json() as { secret: string; uri: string };
      expect(secret).toBeTruthy();

      const fakeSecret = "JBSWY3DPEHPK3PXQ";
      const wrongEnable = await app.inject({
        method: "POST",
        url: "/api/auth/totp/enable",
        headers: { cookie: pawasCookie },
        payload: {
          secret: fakeSecret,
          code: authenticator.generate(fakeSecret)
        }
      });
      expect(wrongEnable.statusCode).toBe(401);

      const validCode = authenticator.generate(secret);
      const okEnable = await app.inject({
        method: "POST",
        url: "/api/auth/totp/enable",
        headers: { cookie: pawasCookie },
        payload: { code: validCode }
      });
      expect(okEnable.statusCode).toBe(200);

      const secondSetup = await app.inject({
        method: "POST",
        url: "/api/auth/totp/setup",
        headers: { cookie: pawasCookie }
      });
      expect(secondSetup.statusCode).toBe(400);

      const secondEnable = await app.inject({
        method: "POST",
        url: "/api/auth/totp/enable",
        headers: { cookie: pawasCookie },
        payload: { code: authenticator.generate(secret) }
      });
      expect(secondEnable.statusCode).toBe(400);
    } finally {
      app.sqlite
        .prepare("UPDATE officers SET totp_enabled = 0, totp_secret = NULL WHERE username = 'pawas'")
        .run();
    }
  });

  it("masks gateway QR in /api/system/status for non-admin roles", async () => {
    const pngDataUrl = `data:image/png;base64,${Buffer.from("fake-qr-png").toString("base64")}`;
    const setQr = await app.inject({
      method: "POST",
      url: "/internal/wa/qr",
      headers: internalHeaders(),
      payload: { qrDataUrl: pngDataUrl }
    });
    expect(setQr.statusCode).toBe(200);

    const adminCookie = await loginCookie("admin", "Admin#12345");
    const adminStatus = await app.inject({
      method: "GET",
      url: "/api/system/status",
      headers: { cookie: adminCookie }
    });
    expect(adminStatus.statusCode).toBe(200);
    expect(adminStatus.json().gatewayState.qr).toBe(pngDataUrl);

    const kapolsekCookie = await loginCookie("kapolsek", "Demo#12345");
    const kapolsekStatus = await app.inject({
      method: "GET",
      url: "/api/system/status",
      headers: { cookie: kapolsekCookie }
    });
    expect(kapolsekStatus.statusCode).toBe(200);
    expect(kapolsekStatus.json().gatewayState.qr).toBeNull();

    const pawasCookie = await loginCookie("pawas", "Demo#12345");
    const pawasStatus = await app.inject({
      method: "GET",
      url: "/api/system/status",
      headers: { cookie: pawasCookie }
    });
    expect(pawasStatus.statusCode).toBe(200);
    expect(pawasStatus.json().gatewayState.qr).toBeNull();
  });

  it("enforces bhabin region isolation on events, duplicates, and analytics", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");
    const jakasetiaTicket = await createManualTicket({
      reporterName: "Warga Jakasetia",
      title: "Tiket Jakasetia",
      lat: -6.24,
      lng: 106.977
    });
    const bhabinPekyonCookie = await loginCookie("bhabin_pekyon", "Demo#12345");

    const ev = await app.inject({
      method: "GET",
      url: `/api/tickets/${jakasetiaTicket.id}/events`,
      headers: { cookie: bhabinPekyonCookie }
    });
    expect(ev.statusCode).toBe(403);

    const dup = await app.inject({
      method: "GET",
      url: `/api/tickets/${jakasetiaTicket.id}/duplicates`,
      headers: { cookie: bhabinPekyonCookie }
    });
    expect(dup.statusCode).toBe(403);

    const noRegionUsername = `bhabin_noreg_${randomUUID().slice(0, 6)}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: noRegionUsername,
        password: "Password#12345",
        name: "Bhabin Tanpa Wilayah",
        role: "bhabin"
      }
    });
    // API menolak bhabin tanpa wilayah; uji akses memakai baris lama yang
    // dimasukkan langsung (simulasi data salah konfigurasi sebelum perbaikan).
    expect(createRes.statusCode).toBe(400);
    const noRegionId = randomUUID();
    const nowIso = new Date().toISOString();
    app.sqlite
      .prepare(
        `INSERT INTO officers (id, unit_id, username, password_hash, name, role, active, created_at, updated_at)
         SELECT ?, unit_id, ?, ?, 'Bhabin Tanpa Wilayah', 'bhabin', 1, ?, ? FROM officers WHERE username = 'admin'`
      )
      .run(noRegionId, noRegionUsername, await hashPassword("Password#12345"), nowIso, nowIso);

    try {
      const noRegionCookie = await loginCookie(noRegionUsername, "Password#12345");
      const analyticsRes = await app.inject({
        method: "GET",
        url: "/api/analytics/summary",
        headers: { cookie: noRegionCookie }
      });
      expect(analyticsRes.statusCode).toBe(403);
    } finally {
      app.sqlite.prepare("DELETE FROM sessions WHERE officer_id = ?").run(noRegionId);
      app.sqlite.prepare("DELETE FROM officers WHERE id = ?").run(noRegionId);
    }
  });

  it("blocks IPv6/non-443 Web Push SSRF endpoints and prevents cross-officer takeover", async () => {
    const badEndpoints = [
      "https://[::1]/push",
      "https://[::ffff:127.0.0.1]/push",
      "https://[fc00::1]/push",
      "https://push.example.test:8443/sub"
    ];
    for (const endpoint of badEndpoints) {
      const res = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie },
        payload: {
          endpoint,
          keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "abcdefghij" }
        }
      });
      expect(res.statusCode).toBe(400);
    }

    const ownedEndpoint = `https://push.example.test/owned-${randomUUID()}`;
    try {
      const sub1 = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie },
        payload: {
          endpoint: ownedEndpoint,
          keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "abcdefghij" }
        }
      });
      expect(sub1.statusCode).toBe(200);

      const piket2Cookie = await loginCookie("piket2", "Demo#12345");
      const hijack = await app.inject({
        method: "POST",
        url: "/api/push/subscribe",
        headers: { cookie: piket2Cookie },
        payload: {
          endpoint: ownedEndpoint,
          keys: { p256dh: "BAbcdefghijklmnopqrstuvwxyz0123456789", auth: "abcdefghij" }
        }
      });
      expect(hijack.statusCode).toBe(409);
    } finally {
      app.sqlite.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(ownedEndpoint);
    }
  });

  it("blocks admin self-deactivation/demotion and immediately revokes deactivated officer sessions", async () => {
    const adminCookie = await loginCookie("admin", "Admin#12345");
    const meRes = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: { cookie: adminCookie }
    });
    const adminId = meRes.json().user.id as string;

    const selfDeactivate = await app.inject({
      method: "PATCH",
      url: `/api/officers/${adminId}`,
      headers: { cookie: adminCookie },
      payload: { active: false }
    });
    expect(selfDeactivate.statusCode).toBe(400);

    const selfDemote = await app.inject({
      method: "PATCH",
      url: `/api/officers/${adminId}`,
      headers: { cookie: adminCookie },
      payload: { role: "piket" }
    });
    expect(selfDemote.statusCode).toBe(400);

    const tempUsername = `temp_off_${randomUUID().slice(0, 6)}`;
    const createRes = await app.inject({
      method: "POST",
      url: "/api/officers",
      headers: { cookie: adminCookie },
      payload: {
        username: tempUsername,
        password: "Password#12345",
        name: "Petugas Sementara",
        role: "piket"
      }
    });
    expect(createRes.statusCode).toBe(200);
    const tempId = createRes.json().id as string;

    try {
      const tempCookie = await loginCookie(tempUsername, "Password#12345");
      const before = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: tempCookie }
      });
      expect(before.statusCode).toBe(200);

      const deactivate = await app.inject({
        method: "PATCH",
        url: `/api/officers/${tempId}`,
        headers: { cookie: adminCookie },
        payload: { active: false }
      });
      expect(deactivate.statusCode).toBe(200);

      const after = await app.inject({
        method: "GET",
        url: "/api/me",
        headers: { cookie: tempCookie }
      });
      expect(after.statusCode).toBe(401);
    } finally {
      app.sqlite.prepare("DELETE FROM sessions WHERE officer_id = ?").run(tempId);
      app.sqlite.prepare("DELETE FROM officers WHERE id = ?").run(tempId);
    }
  });

  it("rejects video magic-byte spoofing and sanitizes tab-prefixed CSV formulas", async () => {
    const spoofedVideo = await uploadImage({
      mime: "video/mp4",
      kind: "video",
      data: Buffer.from("<html>not-mp4</html>")
    });
    expect(spoofedVideo.response.statusCode).toBe(400);

    const formulaTicket = await createManualTicket({
      reporterName: "Pelapor Formula",
      title: "=CMD|' /C calc'!A0"
    });
    const csvRes = await app.inject({
      method: "GET",
      url: "/api/export/tickets.csv",
      headers: { cookie }
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.body).toContain(formulaTicket.ticketNo);
    expect(csvRes.body).toContain("\"'=CMD|' /C calc'!A0\"");

    app.sqlite
      .prepare("UPDATE tickets SET title = ? WHERE id = ?")
      .run("\t+SUM(1,1)", formulaTicket.id);
    const tabCsvRes = await app.inject({
      method: "GET",
      url: "/api/export/tickets.csv",
      headers: { cookie }
    });
    expect(tabCsvRes.statusCode).toBe(200);
    expect(tabCsvRes.body).toContain("\"'\t+SUM(1,1)\"");
  });

  it("allocates sequential ticket numbers atomically past 999 -> 1000 -> 1001", async () => {
    const cfgRes = await app.inject({ method: "GET", url: "/api/public/config" });
    const unitCode = (cfgRes.json().unit.code as string)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);
    const timeZone = cfgRes.json().unit.timezone as string;
    const dateCode = ticketDateCode(new Date(), timeZone);
    const prefix = `${unitCode}-${dateCode}-`;

    const existingCounter = app.sqlite
      .prepare("SELECT last_seq FROM ticket_counters WHERE unit_id = 'unit_main' AND date_code = ?")
      .get(dateCode) as { last_seq: number } | undefined;
    const reporterRow = app.sqlite
      .prepare("SELECT id FROM reporters LIMIT 1")
      .get() as { id: string };
    const synthId = randomUUID();
    const synthNo = `${prefix}999`;
    const now = new Date().toISOString();

    try {
      app.sqlite
        .prepare("DELETE FROM ticket_counters WHERE unit_id = 'unit_main' AND date_code = ?")
        .run(dateCode);
      app.sqlite
        .prepare(
          "INSERT INTO tickets (id, unit_id, ticket_no, reporter_id, category, priority, status, title, source, is_demo, created_at, updated_at) VALUES (?, 'unit_main', ?, ?, 'kamtibmas', 'P3', 'baru', 'Synthetic 999', 'telepon', 0, ?, ?)"
        )
        .run(synthId, synthNo, reporterRow.id, now, now);

      const n1000 = nextTicketNumber(app.db, app.config, app.sqlite);
      const n1001 = nextTicketNumber(app.db, app.config, app.sqlite);
      expect(n1000).toBe(`${prefix}1000`);
      expect(n1001).toBe(`${prefix}1001`);
    } finally {
      app.sqlite.prepare("DELETE FROM tickets WHERE id = ?").run(synthId);
      app.sqlite
        .prepare("DELETE FROM ticket_counters WHERE unit_id = 'unit_main' AND date_code = ?")
        .run(dateCode);
      if (existingCounter) {
        app.sqlite
          .prepare("INSERT INTO ticket_counters (unit_id, date_code, last_seq) VALUES ('unit_main', ?, ?)")
          .run(dateCode, existingCounter.last_seq);
      }
    }
  });

  it("preserves ackAt on reopen, logs internalNote on ditunda, and skips outbox for demo tickets", async () => {
    const manual = await createManualTicket({
      reporterName: "Warga Transisi",
      reporterPhone: "081277700011",
      title: "Uji Reopen dan Tunda"
    });
    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    expect(acceptRes.statusCode).toBe(200);
    const firstAckAt = acceptRes.json().ticket.ackAt as string;
    expect(firstAckAt).toBeTruthy();

    const otwRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie },
      payload: { to: "otw" }
    });
    expect(otwRes.statusCode).toBe(200);

    const ditkpRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie },
      payload: { to: "ditkp" }
    });
    expect(ditkpRes.statusCode).toBe(200);

    const closeRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie },
      payload: { to: "selesai", note: "Selesai awal" }
    });
    expect(closeRes.statusCode).toBe(200);

    const reporterValid = app.sqlite
      .prepare("SELECT r.valid_count FROM reporters r JOIN tickets t ON t.reporter_id = r.id WHERE t.id = ?")
      .get(manual.id) as { valid_count: number };
    expect(reporterValid.valid_count).toBeGreaterThanOrEqual(1);

    const pawasCookie = await loginCookie("pawas", "Demo#12345");
    const reopenRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie: pawasCookie },
      payload: { to: "diterima", note: "Buka ulang" }
    });
    expect(reopenRes.statusCode).toBe(200);
    expect(reopenRes.json().ticket.ackAt).toBe(firstAckAt);
    expect(reopenRes.json().ticket.closedAt).toBeNull();

    const tundaRes = await app.inject({
      method: "POST",
      url: `/api/tickets/${manual.id}/transition`,
      headers: { cookie },
      payload: { to: "ditunda", note: "Menunggu saksi kunci" }
    });
    expect(tundaRes.statusCode).toBe(200);
    expect(tundaRes.json().ticket.internalNote).toContain("[DITUNDA]");
    expect(tundaRes.json().ticket.internalNote).toContain("Menunggu saksi kunci");

    const demoRow = app.sqlite
      .prepare("SELECT t.id, t.ticket_no, r.phone_enc FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE t.is_demo = 1 AND t.status = 'baru' LIMIT 1")
      .get() as { id: string; ticket_no: string; phone_enc: string } | undefined;
    expect(demoRow).toBeTruthy();
    if (demoRow) {
      const beforeOutbox = app.sqlite
        .prepare("SELECT COUNT(*) AS n FROM outbound_messages WHERE payload_json LIKE ?")
        .get(`%${demoRow.ticket_no}%`) as { n: number };
      const demoTransition = await app.inject({
        method: "POST",
        url: `/api/tickets/${demoRow.id}/transition`,
        headers: { cookie },
        payload: { to: "diterima" }
      });
      expect(demoTransition.statusCode).toBe(200);
      const afterOutbox = app.sqlite
        .prepare("SELECT COUNT(*) AS n FROM outbound_messages WHERE payload_json LIKE ?")
        .get(`%${demoRow.ticket_no}%`) as { n: number };
      expect(afterOutbox.n).toBe(beforeOutbox.n);
    }
  });

  it("hardens bot regex boundaries, emergency lifecycle, expired confirm, rename intent, device JIDs, and dead outbox", async () => {
    // 1. Word-boundary check: "melakukan" / "sapi" must NOT false-trigger emergency P1 ticket
    const boundarySender = "6281900000001@s.whatsapp.net";
    const beforeBoundaryTickets = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets")
      .get() as { n: number };
    const boundaryRes = await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(boundarySender, "text", {
        text: "Saya mau melakukan laporan sapi hilang"
      })
    });
    expect(boundaryRes.statusCode).toBe(200);
    const afterBoundaryTickets = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets")
      .get() as { n: number };
    expect(afterBoundaryTickets.n).toBe(beforeBoundaryTickets.n);

    // 2. Emergency completion clears emergencyTicketId so subsequent LAPOR creates a fresh session/ticket
    const emergSender = "6281900000002@s.whatsapp.net";
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "text", { text: "TOLONG ADA BEGAL" })
    });
    // Kata kunci perlu dikonfirmasi warga sebelum menjadi P1.
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "text", { text: "1" })
    });
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "text", { text: "Slamet Emergency" })
    });
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "location", {
        location: { lat: -6.26, lng: 106.982, accuracyM: 10 }
      })
    });
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "text", { text: "SELESAI" })
    });
    const convAfterEmerg = app.sqlite
      .prepare("SELECT state, context_json FROM conversations WHERE wa_jid = ?")
      .get(emergSender) as { state: string; context_json: string };
    expect(convAfterEmerg.state).toBe("DONE");
    expect(JSON.parse(convAfterEmerg.context_json).emergencyTicketId).toBeUndefined();

    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(emergSender, "text", { text: "LAPOR" })
    });
    const convAfterLapor = app.sqlite
      .prepare("SELECT state, context_json FROM conversations WHERE wa_jid = ?")
      .get(emergSender) as { state: string; context_json: string };
    expect(convAfterLapor.state).toBe("AWAIT_CATEGORY");
    expect(JSON.parse(convAfterLapor.context_json).emergencyTicketId).toBeUndefined();

    // 3. Lokasi darurat di luar wilkum TIDAK menolak tiket otomatis: tiket
    //    tetap aktif, lokasi ditandai "outside", piket yang memutuskan.
    const outsideSender = "6281900000003@s.whatsapp.net";
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(outsideSender, "text", { text: "DARURAT ADA BEGAL" })
    });
    // Tiket darurat baru dibuat setelah nama + lokasi lengkap.
    const outsideConvBefore = app.sqlite
      .prepare("SELECT context_json FROM conversations WHERE wa_jid = ?")
      .get(outsideSender) as { context_json: string };
    expect(JSON.parse(outsideConvBefore.context_json).emergencyTicketId).toBeUndefined();

    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(outsideSender, "text", { text: "Budi Luar" })
    });
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(outsideSender, "location", {
        location: { lat: -6.9, lng: 107.6, accuracyM: 12 }
      })
    });
    const orphanId = (
      app.sqlite
        .prepare(
          "SELECT t.id FROM tickets t JOIN reporters r ON r.id = t.reporter_id WHERE r.wa_jid = ?"
        )
        .get(outsideSender) as { id: string }
    ).id;
    expect(orphanId).toBeTruthy();
    const outsideTicket = app.sqlite
      .prepare("SELECT status, reject_reason, location_status, lat FROM tickets WHERE id = ?")
      .get(orphanId) as {
      status: string;
      reject_reason: string | null;
      location_status: string;
      lat: number;
    };
    // Darurat selalu langsung diteruskan ke grup URC, walau di luar wilkum.
    expect(outsideTicket.status).toBe("diterima");
    expect(outsideTicket.reject_reason).toBeNull();
    expect(outsideTicket.location_status).toBe("outside");
    expect(outsideTicket.lat).toBeCloseTo(-6.9);
    const outsideEvent = app.sqlite
      .prepare("SELECT note FROM ticket_events WHERE ticket_id = ? AND note LIKE '%DI LUAR wilkum%'")
      .get(orphanId) as { note: string } | undefined;
    expect(outsideEvent).toBeTruthy();

    // 4. Expired CONFIRM session rejects "1" and resets cleanly without creating ticket
    const expireSender = "6281900000004@s.whatsapp.net";
    for (const msg of [
      "LAPOR",
      "Warga Kadaluarsa",
      "2",
      "Gangguan kamtibmas di ujung gang",
      "Jl. Ujung Gang RT 01",
      "SELESAI"
    ]) {
      await app.inject({
        method: "POST",
        url: "/internal/wa/inbound",
        headers: internalHeaders(),
        payload: inbound(expireSender, "text", { text: msg })
      });
    }
    const confirmConv = app.sqlite
      .prepare("SELECT state FROM conversations WHERE wa_jid = ?")
      .get(expireSender) as { state: string };
    expect(confirmConv.state).toBe("CONFIRM");

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    app.sqlite
      .prepare("UPDATE conversations SET expires_at = ? WHERE wa_jid = ?")
      .run(oneHourAgo, expireSender);
    const ticketsBeforeExpire = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets")
      .get() as { n: number };

    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(expireSender, "text", { text: "1" })
    });
    const ticketsAfterExpire = app.sqlite
      .prepare("SELECT COUNT(*) AS n FROM tickets")
      .get() as { n: number };
    expect(ticketsAfterExpire.n).toBe(ticketsBeforeExpire.n);
    const expiredConvAfter = app.sqlite
      .prepare("SELECT state FROM conversations WHERE wa_jid = ?")
      .get(expireSender) as { state: string };
    expect(expiredConvAfter.state).toBe("IDLE");

    // 5. NAMA rename updates reporter name and returns to IDLE
    const renameSender = "6281900000005@s.whatsapp.net";
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(renameSender, "text", { text: "NAMA" })
    });
    await app.inject({
      method: "POST",
      url: "/internal/wa/inbound",
      headers: internalHeaders(),
      payload: inbound(renameSender, "text", { text: "Siti Rename" })
    });
    const renameConv = app.sqlite
      .prepare("SELECT state, reporter_id FROM conversations WHERE wa_jid = ?")
      .get(renameSender) as { state: string; reporter_id: string };
    expect(renameConv.state).toBe("IDLE");
    const renamedReporter = app.sqlite
      .prepare("SELECT name FROM reporters WHERE id = ?")
      .get(renameConv.reporter_id) as { name: string };
    expect(renamedReporter.name).toBe("Siti Rename");

    // 6. Group command with :12 device suffix resolves officer and executes /otw
    const groupTicket = await createManualTicket({
      reporterName: "Warga Grup Device",
      title: "Uji Group Device Suffix"
    });
    await app.inject({
      method: "POST",
      url: `/api/tickets/${groupTicket.id}/transition`,
      headers: { cookie },
      payload: { to: "diterima" }
    });
    const shortNo = groupTicket.ticketNo.split("-").at(-1)!;
    const cmdRes = await app.inject({
      method: "POST",
      url: "/internal/wa/group-command",
      headers: internalHeaders(),
      payload: {
        waMessageId: randomUUID(),
        groupJid: GROUP_JID,
        senderJid: "628000000005:12@s.whatsapp.net",
        text: `/otw ${shortNo}`,
        timestamp: new Date().toISOString()
      }
    });
    expect(cmdRes.statusCode).toBe(200);
    const updatedGroupTicket = app.sqlite
      .prepare("SELECT status FROM tickets WHERE id = ?")
      .get(groupTicket.id) as { status: string };
    expect(updatedGroupTicket.status).toBe("otw");

    // 7. Poison outbox row with attempts >= 8 transitions to 'dead'
    const poisonId = randomUUID();
    const past = new Date(Date.now() - 5 * 60_000).toISOString();
    app.sqlite
      .prepare(
        "INSERT INTO outbound_messages (id, unit_id, target_jid, kind, payload_json, status, attempts, next_attempt_at, last_error, created_at, sent_at) VALUES (?, 'unit_main', ?, 'text', ?, 'sending', 8, ?, NULL, ?, NULL)"
      )
      .run(poisonId, "6281111111111@s.whatsapp.net", JSON.stringify({ text: "poison" }), past, past);

    const outboxFetch = await app.inject({
      method: "GET",
      url: "/internal/outbox?limit=50",
      headers: internalHeaders()
    });
    expect(outboxFetch.statusCode).toBe(200);
    expect(
      outboxFetch.json().items.some((row: { id: string }) => row.id === poisonId)
    ).toBe(false);
    const poisonRow = app.sqlite
      .prepare("SELECT status FROM outbound_messages WHERE id = ?")
      .get(poisonId) as { status: string };
    expect(poisonRow.status).toBe("dead");
  });
});

