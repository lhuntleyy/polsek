import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { CATEGORY_META, handoverSchema, isActiveStatus, type Category, type TicketStatus } from "@sigap/core";
import { officers, regions, reporters, shifts, ticketMedia, tickets } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { notFound } from "../lib/errors.js";

function safeJson(value: string | null): Record<string, boolean> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

function shiftLabel(value: string): string {
  if (value === "pagi") return "Pagi";
  if (value === "siang") return "Siang";
  if (value === "malam") return "Malam";
  return value;
}

function buildSummary(app: FastifyInstance) {
  const activeRows = app.db
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      title: tickets.title,
      category: tickets.category,
      priority: tickets.priority,
      status: tickets.status,
      region: regions.name,
      assignee: officers.name,
      reporterName: reporters.name,
      createdAt: tickets.createdAt,
      ackAt: tickets.ackAt,
      otwAt: tickets.otwAt,
      internalNote: tickets.internalNote
    })
    .from(tickets)
    .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
    .leftJoin(regions, eq(tickets.regionId, regions.id))
    .leftJoin(officers, eq(tickets.assignedTo, officers.id))
    .where(
      and(
        eq(tickets.unitId, DEFAULT_UNIT_ID),
        inArray(tickets.status, ["baru", "diterima", "otw", "ditkp", "ditunda"])
      )
    )
    .orderBy(asc(tickets.priority), desc(tickets.createdAt))
    .all();

  const active = activeRows
    .filter((row) => isActiveStatus(row.status as TicketStatus))
    .map((row) => ({
      ...row,
      categoryLabel: CATEGORY_META[row.category as Category]?.label ?? row.category,
      ageMinutes: Math.max(
        0,
        Math.round((Date.now() - new Date(row.createdAt).getTime()) / 60_000)
      )
    }));

  const failedMedia = Number(
    app.db
      .select({ count: sql<number>`count(*)` })
      .from(ticketMedia)
      .where(eq(ticketMedia.status, "failed"))
      .get()?.count ?? 0
  );

  const historyRows = app.db
    .select({
      id: shifts.id,
      shift: shifts.shift,
      officerName: officers.name,
      incomingName: shifts.incomingName,
      signedByName: shifts.signedByName,
      startedAt: shifts.startedAt,
      endedAt: shifts.endedAt,
      signedAt: shifts.signedAt,
      notes: shifts.notes,
      checklistJson: shifts.checklistJson
    })
    .from(shifts)
    .leftJoin(officers, eq(shifts.officerId, officers.id))
    .where(eq(shifts.unitId, DEFAULT_UNIT_ID))
    .orderBy(desc(shifts.signedAt))
    .limit(12)
    .all();

  const history = historyRows.map((row) => ({
    ...row,
    shiftLabel: shiftLabel(row.shift),
    checklist: safeJson(row.checklistJson),
    checklistJson: undefined
  }));

  const p1Rows = active.filter((row) => row.priority === "P1");
  const checks = {
    p1Acknowledged: p1Rows.every((row) => Boolean(row.ackAt)),
    delayedReasons: active.filter((row) => row.status === "ditunda").every((row) => Boolean(row.internalNote)),
    namesComplete: active.every((row) => row.reporterName !== "Belum diisi"),
    mediaChecked: failedMedia === 0,
    queueReviewed: false
  };

  return {
    generatedAt: new Date().toISOString(),
    tickets: active,
    counts: {
      active: active.length,
      p1: p1Rows.length,
      unassigned: active.filter((row) => !row.assignee).length,
      waitingAck: active.filter((row) => row.status === "baru").length,
      waitingOtw: active.filter(
        (row) => row.status === "baru" || (row.status === "diterima" && !row.otwAt)
      ).length,
      delayed: active.filter((row) => row.status === "ditunda").length,
      noName: active.filter((row) => row.reporterName === "Belum diisi").length,
      failedMedia
    },
    checks,
    lastHandover: history[0] ?? null,
    history
  };
}

export function registerHandoverRoutes(app: FastifyInstance): void {
  app.get(
    "/api/handover",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin", "urc") },
    async () => buildSummary(app)
  );

  app.post(
    "/api/handover",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin") },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const input = handoverSchema.parse(request.body);

      const now = new Date();
      const nowIso = now.toISOString();
      const previous = app.db
        .select()
        .from(shifts)
        .where(eq(shifts.unitId, DEFAULT_UNIT_ID))
        .orderBy(desc(shifts.signedAt))
        .get();
      const startedAt = previous?.endedAt ?? previous?.signedAt ?? new Date(now.getTime() - 12 * 3_600_000).toISOString();

      const summaryBefore = buildSummary(app);
      const id = randomUUID();
      app.db
        .insert(shifts)
        .values({
          id,
          unitId: DEFAULT_UNIT_ID,
          shift: input.shift,
          officerId: user.id,
          startedAt,
          endedAt: nowIso,
          notes: input.notes,
          checklistJson: JSON.stringify(input.checklist),
          signedByName: input.signedByName,
          incomingName: input.incomingName,
          signedAt: nowIso
        })
        .run();

      writeAudit(app.db, {
        unitId: DEFAULT_UNIT_ID,
        actorId: user.id,
        action: "handover.submit",
        entity: "shift",
        entityId: id,
        meta: {
          shift: input.shift,
          incomingName: input.incomingName,
          signedByName: input.signedByName,
          checklist: input.checklist,
          verifiedChecks: summaryBefore.checks
        },
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? null
      });

      return { ok: true, id, summary: buildSummary(app) };
    }
  );
}
