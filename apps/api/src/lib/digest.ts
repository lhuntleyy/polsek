import { and, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  CATEGORY_META,
  formatWibDate,
  formatWibTime,
  type Category,
  type TicketStatus
} from "@sigap/core";
import { officers, regions, settings, tickets } from "../db/schema.js";
import { writeAudit } from "./audit.js";
import { DEFAULT_UNIT_ID } from "./constants.js";
import { enqueueOutbox } from "./outbox.js";
import { readSettings } from "./settings.js";

const ACTIVE_STATUSES: TicketStatus[] = ["baru", "diterima", "otw", "ditkp", "ditunda"];
const DIGEST_KEY = "daily_digest_last";

function localClock(
  now: Date,
  timeZone: string
): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${map.year ?? "1970"}-${map.month ?? "01"}-${map.day ?? "01"}`,
    hour: Number(map.hour ?? 0) % 24
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : Math.round(sorted[mid] ?? 0);
}

function durationText(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.round(Math.max(0, seconds));
  if (total < 60) return `${total} dtk`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} mnt`;
  return `${Math.floor(minutes / 60)} jam ${minutes % 60} mnt`;
}

export interface DigestResult {
  ok: boolean;
  queued: number;
  date: string;
  skipped?: "outside_window" | "already_sent" | "no_recipient";
}

export function runDailyDigest(
  app: FastifyInstance,
  options: { force?: boolean; now?: Date } = {}
): DigestResult {
  const now = options.now ?? new Date();
  const unit = readSettings(app.db, app.config);
  const clock = localClock(now, unit.unitTimezone);
  const windowFrom = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const windowTo = now.toISOString();

  if (!options.force && (clock.hour < 7 || clock.hour > 10)) {
    return { ok: true, queued: 0, date: clock.dateKey, skipped: "outside_window" };
  }

  if (!options.force) {
    const last = app.db
      .select()
      .from(settings)
      .where(and(eq(settings.unitId, DEFAULT_UNIT_ID), eq(settings.key, DIGEST_KEY)))
      .get();
    if (last?.value === clock.dateKey) {
      return { ok: true, queued: 0, date: clock.dateKey, skipped: "already_sent" };
    }
  }

  const recentRows = app.db
    .select({
      ticketNo: tickets.ticketNo,
      title: tickets.title,
      category: tickets.category,
      priority: tickets.priority,
      status: tickets.status,
      createdAt: tickets.createdAt,
      ackAt: tickets.ackAt,
      regionName: regions.name
    })
    .from(tickets)
    .leftJoin(regions, eq(tickets.regionId, regions.id))
    .where(
      and(
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        gte(tickets.createdAt, windowFrom),
        lte(tickets.createdAt, windowTo)
      )
    )
    .all();

  const closedRecent = app.db
    .select({ id: tickets.id })
    .from(tickets)
    .where(
      and(
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        eq(tickets.status, "selesai"),
        gte(tickets.closedAt, windowFrom),
        lte(tickets.closedAt, windowTo)
      )
    )
    .all().length;

  const activeRows = app.db
    .select({
      ticketNo: tickets.ticketNo,
      title: tickets.title,
      priority: tickets.priority,
      status: tickets.status,
      regionName: regions.name
    })
    .from(tickets)
    .leftJoin(regions, eq(tickets.regionId, regions.id))
    .where(
      and(
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        inArray(tickets.status, ACTIVE_STATUSES)
      )
    )
    .all();

  const byCategory = new Map<string, number>();
  for (const row of recentRows) {
    byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + 1);
  }
  const categoryText = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([category, count]) => `${CATEGORY_META[category as Category]?.short ?? category} ${count}`)
    .join(", ");

  const ack = median(
    recentRows
      .filter((row) => row.ackAt)
      .map(
        (row) => (new Date(row.ackAt as string).getTime() - new Date(row.createdAt).getTime()) / 1000
      )
  );
  const p1 = recentRows.filter((row) => row.priority === "P1").length;
  const p1Active = activeRows.filter((row) => row.priority === "P1");
  const activeList = activeRows
    .slice(0, 8)
    .map((row) => `#${row.ticketNo.split("-").at(-1) ?? row.ticketNo} ${row.priority} ${row.status}`)
    .join(" · ");

  const tzLabel = unit.unitTimezone === "Asia/Jakarta" ? "WIB" : unit.unitTimezone;
  const text = [
    `📊 *DIGEST SIGAP · ${formatWibDate(now, { timeZone: unit.unitTimezone })}*`,
    unit.unitName,
    `Laporan baru (24 jam): ${recentRows.length}${p1 ? ` (P1 ${p1})` : ""}`,
    `Selesai (24 jam): ${closedRecent}`,
    `Aktif sekarang: ${activeRows.length}`,
    `P1 aktif: ${p1Active.length}`,
    `Median ack: ${durationText(ack)}`,
    categoryText ? `Kategori: ${categoryText}` : null,
    activeList ? `Antrean: ${activeList}` : null,
    `Waktu: ${formatWibTime(now, { timeZone: unit.unitTimezone })} ${tzLabel}`,
    "Buka dashboard SIGAP untuk detail dan tindak lanjut."
  ]
    .filter(Boolean)
    .join("\n");

  const recipients = app.db
    .select()
    .from(officers)
    .where(
      and(
        eq(officers.unitId, DEFAULT_UNIT_ID),
        eq(officers.role, "kapolsek"),
        eq(officers.active, true)
      )
    )
    .all()
    .map((officer) => officer.waJid)
    .filter((jid): jid is string => Boolean(jid));
  if (unit.waGroupUrcJid) recipients.push(unit.waGroupUrcJid);
  const targets = [...new Set(recipients)];
  if (targets.length === 0) {
    return { ok: true, queued: 0, date: clock.dateKey, skipped: "no_recipient" };
  }

  for (const target of targets) {
    enqueueOutbox(app.db, { targetJid: target, kind: "text", payload: { text } });
  }

  app.db
    .insert(settings)
    .values({
      unitId: DEFAULT_UNIT_ID,
      key: DIGEST_KEY,
      value: clock.dateKey,
      updatedBy: null,
      updatedAt: now.toISOString()
    })
    .onConflictDoUpdate({
      target: [settings.unitId, settings.key],
      set: { value: clock.dateKey, updatedAt: now.toISOString() }
    })
    .run();

  writeAudit(app.db, {
    unitId: DEFAULT_UNIT_ID,
    actorId: null,
    action: "digest.send",
    entity: "system",
    entityId: null,
    meta: { date: clock.dateKey, queued: targets.length, manual: Boolean(options.force) },
    ip: null,
    userAgent: null
  });

  return { ok: true, queued: targets.length, date: clock.dateKey };
}
