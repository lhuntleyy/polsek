import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { CATEGORY_META, formatLocalTime, type Category } from "@sigap/core";
import { officers, regions, reporters, ticketEvents, tickets } from "../db/schema.js";
import { writeAudit } from "./audit.js";
import { DEFAULT_UNIT_ID } from "./constants.js";
import { reporterPhoneDisplay } from "./reporter-phone.js";
import { enqueueOutbox } from "./outbox.js";
import { sendPushToRoles } from "./push.js";
import { readSettings } from "./settings.js";

type EscalationLevel = "pawas" | "kapolsek";

const P1_ACTIVE = ["baru", "diterima"] as const;

function roleFor(level: EscalationLevel): "pawas" | "kapolsek" {
  return level;
}

function escalationLabel(level: EscalationLevel, seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return level === "pawas"
    ? `P1 belum di-ack lebih dari ${minutes} menit`
    : `P1 belum OTW lebih dari ${minutes} menit`;
}

function escalate(
  app: FastifyInstance,
  ticket: typeof tickets.$inferSelect,
  level: EscalationLevel,
  thresholdSeconds: number,
  now: Date
): boolean {
  const settings = readSettings(app.db, app.config);
  const recipients = app.db
    .select()
    .from(officers)
    .where(
      and(
        eq(officers.unitId, DEFAULT_UNIT_ID),
        eq(officers.role, roleFor(level)),
        eq(officers.active, true)
      )
    )
    .all()
    .map((officer) => officer.waJid)
    .filter((jid): jid is string => Boolean(jid));

  if (settings.waGroupUrcJid) recipients.push(settings.waGroupUrcJid);
  const targets = [...new Set(recipients)];

  const reporter = app.db.select().from(reporters).where(eq(reporters.id, ticket.reporterId)).get();
  const phoneDisplay = reporter
    ? reporterPhoneDisplay(reporter, app.config.SIGAP_PHONE_KEY, settings.piiMasking)
    : "••••";

  const regionName = ticket.regionId
    ? app.db
        .select({ name: regions.name })
        .from(regions)
        .where(eq(regions.id, ticket.regionId))
        .get()?.name
    : null;

  const maps =
    ticket.lat !== null && ticket.lng !== null
      ? `https://maps.google.com/?q=${ticket.lat},${ticket.lng}`
      : "-";
  const category = CATEGORY_META[ticket.category as Category]?.short ?? ticket.category;
  const levelLabel = level === "pawas" ? "PAWAS" : "KAPOLSEK";
  const text = [
    `🚨 *ESKALASI ${levelLabel}*`,
    escalationLabel(level, thresholdSeconds),
    `${ticket.ticketNo} · ${ticket.priority} · ${category}`,
    ticket.title,
    `Pelapor: ${reporter?.name ?? "Belum diisi"} (${phoneDisplay})`,
    `Status: ${ticket.status}`,
    `Lokasi: ${ticket.address ?? regionName ?? "Belum diverifikasi"}`,
    `Peta: ${maps}`,
    `Waktu: ${formatLocalTime(now, settings.unitTimezone)}`,
    "Mohon buka dashboard dan koordinasikan piket/URC."
  ].join("\n");

  const nowIso = now.toISOString();
  const patch =
    level === "pawas"
      ? { escalatedPawasAt: nowIso, updatedAt: nowIso }
      : { escalatedKapolsekAt: nowIso, updatedAt: nowIso };

  const persist = () => {
    app.db.update(tickets).set(patch).where(eq(tickets.id, ticket.id)).run();
    app.db
      .insert(ticketEvents)
      .values({
        id: crypto.randomUUID(),
        ticketId: ticket.id,
        actorType: "system",
        actorId: null,
        fromStatus: ticket.status,
        toStatus: ticket.status,
        note: `Eskalasi ${levelLabel}: ${escalationLabel(level, thresholdSeconds)}`,
        createdAt: nowIso
      })
      .run();
    writeAudit(app.db, {
      unitId: DEFAULT_UNIT_ID,
      actorId: null,
      action: "ticket.escalate",
      entity: "ticket",
      entityId: ticket.id,
      meta: { level, thresholdSeconds, targets: targets.length },
      ip: null,
      userAgent: null
    });

    for (const target of targets) {
      enqueueOutbox(app.db, {
        targetJid: target,
        kind: "text",
        payload: { text }
      });
    }
  };
  const tx = app.sqlite.transaction(persist);
  if (app.sqlite.inTransaction) tx();
  else tx.immediate();

  app.bus.broadcast("ticket.escalated", {
    id: ticket.id,
    ticketNo: ticket.ticketNo,
    priority: ticket.priority,
    status: ticket.status,
    title: ticket.title,
    regionId: ticket.regionId,
    level,
    at: nowIso
  });
  void sendPushToRoles(app, [level], {
    title: `SIGAP — Eskalasi ${levelLabel}`,
    body: `${ticket.ticketNo} · ${ticket.title}`,
    url: `/?ticket=${ticket.id}`,
    tag: `ticket-${ticket.id}`
  });
  return true;
}

export function runEscalations(
  app: FastifyInstance,
  now = new Date()
): { pawas: number; kapolsek: number } {
  const settings = readSettings(app.db, app.config);
  const rows = app.db
    .select()
    .from(tickets)
    .where(
      and(
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        eq(tickets.priority, "P1"),
        inArray(tickets.status, [...P1_ACTIVE]),
        eq(tickets.isDemo, false),
        isNull(tickets.duplicateOf)
      )
    )
    .all();

  const result = { pawas: 0, kapolsek: 0 };
  for (const ticket of rows) {
    // Tiket yang dibuka ulang dihitung dari waktu dibuka ulang, bukan createdAt.
    const createdAt = new Date(ticket.reopenedAt ?? ticket.createdAt).getTime();
    if (!Number.isFinite(createdAt)) continue;
    const ageSeconds = Math.max(0, (now.getTime() - createdAt) / 1000);

    if (
      ticket.status === "baru" &&
      !ticket.escalatedPawasAt &&
      ageSeconds >= settings.escalationPawasSeconds
    ) {
      if (escalate(app, ticket, "pawas", settings.escalationPawasSeconds, now)) {
        result.pawas += 1;
      }
    }

    const waitingOtw = ticket.status === "baru" || (ticket.status === "diterima" && !ticket.otwAt);
    if (
      waitingOtw &&
      !ticket.escalatedKapolsekAt &&
      ageSeconds >= settings.escalationKapolsekSeconds
    ) {
      if (escalate(app, ticket, "kapolsek", settings.escalationKapolsekSeconds, now)) {
        result.kapolsek += 1;
      }
    }
  }
  return result;
}
