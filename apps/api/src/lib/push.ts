import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { sendNotification, setVapidDetails } from "web-push";
import { officers, pushSubscriptions } from "../db/schema.js";
import { DEFAULT_UNIT_ID } from "./constants.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const PROD_PUSH_HOST_EXACT = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "updates-autopush.stage.mozaws.net",
  "web.push.apple.com"
]);

const PROD_PUSH_HOST_SUFFIXES = [
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com"
];

let configuredCompositeKey = "";

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT 100.64.0.0/10
  if (a === 169 && b === 254) return false; // Link-local
  if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
  if (a === 192 && b === 168) return false; // RFC1918
  if (a === 192 && b === 0 && parts[2] === 0) return false;
  if (a === 192 && b === 0 && parts[2] === 2) return false; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // Benchmark
  if (a >= 224) return false; // Multicast & reserved
  return true;
}

function expandIpv6(ip: string): number[] | null {
  const clean = ip.split("%")[0]?.toLowerCase() ?? "";
  if (!clean) return null;

  // Handle embedded IPv4 tail (e.g. ::ffff:127.0.0.1)
  const lastColon = clean.lastIndexOf(":");
  let tailGroups: number[] = [];
  let headPart = clean;
  if (lastColon !== -1 && clean.slice(lastColon + 1).includes(".")) {
    const v4 = clean.slice(lastColon + 1).split(".").map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    tailGroups = [((v4[0]! << 8) | v4[1]!) >>> 0, ((v4[2]! << 8) | v4[3]!) >>> 0];
    headPart = clean.slice(0, lastColon);
    if (headPart.endsWith(":")) headPart += ":";
  }

  const sides = headPart.split("::");
  if (sides.length > 2) return null;
  const left = sides[0] ? sides[0].split(":").filter(Boolean) : [];
  const right = sides[1] ? sides[1].split(":").filter(Boolean) : [];
  const targetGroups = 8 - tailGroups.length;
  const totalSpecified = left.length + right.length;
  if (sides.length === 1 && totalSpecified !== targetGroups) return null;
  if (sides.length === 2 && totalSpecified > targetGroups) return null;

  const missing = targetGroups - totalSpecified;
  const hexGroups = [
    ...left,
    ...Array.from({ length: Math.max(0, missing) }, () => "0"),
    ...right
  ];
  const parsed = hexGroups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : -1));
  if (parsed.some((n) => n < 0 || n > 0xffff)) return null;
  return [...parsed, ...tailGroups];
}

export function isPublicIpAddress(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  const kind = isIP(normalized);
  if (kind === 4) return isPublicIpv4(normalized);
  if (kind !== 6) return false;

  const groups = expandIpv6(normalized);
  if (!groups || groups.length !== 8) return false;

  const isAllZeroPrefix =
    groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0;
  // :: or ::1
  if (isAllZeroPrefix && groups[5] === 0 && groups[6] === 0 && (groups[7] === 0 || groups[7] === 1)) {
    return false;
  }
  // IPv4-mapped ::ffff:a.b.c.d or IPv4-compatible ::a.b.c.d
  if (isAllZeroPrefix && (groups[5] === 0xffff || groups[5] === 0)) {
    const mappedV4 = [
      (groups[6]! >> 8) & 0xff,
      groups[6]! & 0xff,
      (groups[7]! >> 8) & 0xff,
      groups[7]! & 0xff
    ].join(".");
    return isPublicIpv4(mappedV4);
  }
  // ULA fc00::/7
  if ((groups[0]! & 0xfe00) === 0xfc00) return false;
  // Link-local fe80::/10
  if ((groups[0]! & 0xffc0) === 0xfe80) return false;
  // Multicast ff00::/8
  if ((groups[0]! & 0xff00) === 0xff00) return false;
  // Documentation 2001:db8::/32
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  return true;
}

export function isAllowedPushEndpoint(value: string, isProduction = false): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;

    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      !host ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".home.arpa")
    ) {
      return false;
    }

    if (isIP(host) !== 0) {
      if (isProduction) return false;
      return isPublicIpAddress(host);
    }

    if (isProduction) {
      if (
        !PROD_PUSH_HOST_EXACT.has(host) &&
        !PROD_PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function resolvesToPublicIps(endpoint: string): Promise<boolean> {
  try {
    const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) !== 0) return isPublicIpAddress(host);
    const records = await lookup(host, { all: true });
    if (records.length === 0) return false;
    return records.every((record) => isPublicIpAddress(record.address));
  } catch {
    return false;
  }
}

function configure(config: FastifyInstance["config"]): boolean {
  if (!config.SIGAP_VAPID_PUBLIC_KEY || !config.SIGAP_VAPID_PRIVATE_KEY) return false;
  const composite = `${config.SIGAP_VAPID_PUBLIC_KEY}:${config.SIGAP_VAPID_PRIVATE_KEY}:${config.SIGAP_VAPID_SUBJECT}`;
  if (configuredCompositeKey !== composite) {
    setVapidDetails(
      config.SIGAP_VAPID_SUBJECT,
      config.SIGAP_VAPID_PUBLIC_KEY,
      config.SIGAP_VAPID_PRIVATE_KEY
    );
    configuredCompositeKey = composite;
  }
  return true;
}

export function pushPublicKey(app: FastifyInstance): string | null {
  return configure(app.config) ? app.config.SIGAP_VAPID_PUBLIC_KEY : null;
}

async function dispatchOne(
  app: FastifyInstance,
  row: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<"sent" | "removed" | "failed"> {
  if (!isAllowedPushEndpoint(row.endpoint, app.config.isProduction)) {
    app.log.warn({ subscriptionId: row.id }, "Endpoint Web Push ditolak oleh kebijakan SSRF");
    return "failed";
  }
  if (!(await resolvesToPublicIps(row.endpoint))) {
    app.log.warn({ subscriptionId: row.id }, "DNS endpoint Web Push mengarah ke IP privat/lokal");
    return "failed";
  }

  try {
    await sendNotification(
      {
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth }
      },
      JSON.stringify(payload),
      { TTL: 300, timeout: 10_000 }
    );
    if (app.sqlite.open) {
      app.db
        .update(pushSubscriptions)
        .set({ lastSeenAt: new Date().toISOString() })
        .where(eq(pushSubscriptions.id, row.id))
        .run();
    }
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      if (app.sqlite.open) {
        app.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, row.id)).run();
      }
      return "removed";
    }
    app.log.warn(
      { err: error, statusCode, subscriptionId: row.id },
      "Gagal mengirim Web Push"
    );
    return "failed";
  }
}

async function dispatch(
  app: FastifyInstance,
  rows: Array<{ id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload
): Promise<{ sent: number; removed: number; failed: number }> {
  let sent = 0;
  let removed = 0;
  let failed = 0;
  const BATCH_SIZE = 5;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((row) => dispatchOne(app, row, payload))
    );
    for (const item of results) {
      if (item.status === "fulfilled") {
        if (item.value === "sent") sent += 1;
        else if (item.value === "removed") removed += 1;
        else failed += 1;
      } else {
        failed += 1;
      }
    }
  }
  return { sent, removed, failed };
}

export async function sendPushToRoles(
  app: FastifyInstance,
  roles: string[],
  payload: PushPayload
): Promise<{ sent: number; removed: number; failed: number }> {
  if (!configure(app.config)) return { sent: 0, removed: 0, failed: 0 };
  const rows = app.db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth
    })
    .from(pushSubscriptions)
    .innerJoin(officers, eq(pushSubscriptions.officerId, officers.id))
    .where(
      and(
        eq(pushSubscriptions.unitId, DEFAULT_UNIT_ID),
        eq(officers.active, true),
        inArray(officers.role, roles)
      )
    )
    .all();
  if (rows.length === 0) return { sent: 0, removed: 0, failed: 0 };
  return dispatch(app, rows, payload);
}

export async function sendPushToOfficer(
  app: FastifyInstance,
  officerId: string,
  payload: PushPayload
): Promise<{ sent: number; removed: number; failed: number }> {
  if (!configure(app.config)) return { sent: 0, removed: 0, failed: 0 };
  const rows = app.db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth
    })
    .from(pushSubscriptions)
    .innerJoin(officers, eq(pushSubscriptions.officerId, officers.id))
    .where(
      and(
        eq(pushSubscriptions.unitId, DEFAULT_UNIT_ID),
        eq(pushSubscriptions.officerId, officerId),
        eq(officers.active, true)
      )
    )
    .all();
  return dispatch(app, rows, payload);
}
