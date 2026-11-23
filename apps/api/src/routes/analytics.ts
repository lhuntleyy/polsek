import { and, eq, gte, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  analyticsQuerySchema,
  CATEGORIES,
  PRIORITIES,
  TICKET_STATUSES,
  type Category,
  type Priority,
  type TicketStatus
} from "@sigap/core";
import { regions, tickets } from "../db/schema.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { forbidden, notFound } from "../lib/errors.js";
import { readSettings } from "../lib/settings.js";

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const WEEKDAY_MAP: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
};
const ACTIVE_STATUSES: TicketStatus[] = ["baru", "diterima", "otw", "ditkp", "ditunda"];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : Math.round(sorted[mid] ?? 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index] ?? 0);
}

const tzPartsCache = new Map<string, Intl.DateTimeFormat>();

function getTzFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = tzPartsCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23"
  });
  tzPartsCache.set(timeZone, formatter);
  return formatter;
}

function localTimeParts(
  value: Date,
  timeZone: string
): { dateKey: string; dayIndex: number; hour: number } {
  const parts = getTzFormatter(timeZone).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${map.year ?? "1970"}-${map.month ?? "01"}-${map.day ?? "01"}`,
    dayIndex: WEEKDAY_MAP[map.weekday ?? "Mon"] ?? 0,
    hour: Number(map.hour ?? 0) % 24
  };
}

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  app.get(
    "/api/analytics/summary",
    { preHandler: app.authenticate },
    async (request) => {
      const user = request.user;
      if (!user) throw notFound("Sesi tidak ditemukan");
      const query = analyticsQuerySchema.parse(request.query);
      const settings = readSettings(app.db, app.config);

      const conditions = [eq(tickets.unitId, DEFAULT_UNIT_ID)];
      if (query.from) conditions.push(gte(tickets.createdAt, query.from));
      if (query.to) conditions.push(lte(tickets.createdAt, query.to));
      if (user.role === "bhabin") {
        if (!user.regionId) {
          throw forbidden("Akun bhabin belum terikat wilayah");
        }
        conditions.push(eq(tickets.regionId, user.regionId));
      }

      const rows = app.db
        .select({
          status: tickets.status,
          category: tickets.category,
          priority: tickets.priority,
          rejectReason: tickets.rejectReason,
          regionId: tickets.regionId,
          regionName: regions.name,
          lat: tickets.lat,
          lng: tickets.lng,
          createdAt: tickets.createdAt,
          ackAt: tickets.ackAt,
          otwAt: tickets.otwAt,
          closedAt: tickets.closedAt
        })
        .from(tickets)
        .leftJoin(regions, eq(tickets.regionId, regions.id))
        .where(and(...conditions))
        .all();

      const byStatus = Object.fromEntries(TICKET_STATUSES.map((status) => [status, 0])) as Record<
        TicketStatus,
        number
      >;
      const byCategory = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
        Category,
        number
      >;
      const byPriority = Object.fromEntries(PRIORITIES.map((priority) => [priority, 0])) as Record<
        Priority,
        number
      >;
      const byRegion = new Map<string, { name: string; count: number }>();
      const ackSeconds: number[] = [];
      const otwSeconds: number[] = [];
      const closeSeconds: number[] = [];
      const p1AckSeconds: number[] = [];
      const p1OtwSeconds: number[] = [];

      const dailyMap = new Map<string, { total: number; p1: number; closed: number }>();
      const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
      const hotspotMap = new Map<
        string,
        {
          lat: number;
          lng: number;
          categoryCounts: Map<string, number>;
          region: string | null;
          count: number;
          lastAt: string;
        }
      >();

      let falseReports = 0;

      for (const row of rows) {
        byStatus[row.status as TicketStatus] = (byStatus[row.status as TicketStatus] ?? 0) + 1;
        byCategory[row.category as Category] = (byCategory[row.category as Category] ?? 0) + 1;
        byPriority[row.priority as Priority] = (byPriority[row.priority as Priority] ?? 0) + 1;
        if (row.status === "ditolak" && row.rejectReason === "palsu") {
          falseReports += 1;
        }
        if (row.regionId) {
          const entry = byRegion.get(row.regionId) ?? {
            name: row.regionName ?? "Tidak diketahui",
            count: 0
          };
          entry.count += 1;
          byRegion.set(row.regionId, entry);
        }

        const created = new Date(row.createdAt);
        const local = localTimeParts(created, settings.unitTimezone);
        const daily = dailyMap.get(local.dateKey) ?? { total: 0, p1: 0, closed: 0 };
        daily.total += 1;
        if (row.priority === "P1") daily.p1 += 1;
        if (row.status === "selesai") daily.closed += 1;
        dailyMap.set(local.dateKey, daily);

        const dayRow = heatmap[local.dayIndex];
        if (dayRow) dayRow[local.hour] = (dayRow[local.hour] ?? 0) + 1;

        if (row.lat !== null && row.lng !== null) {
          const roundedLat = Math.round(row.lat * 1000) / 1000;
          const roundedLng = Math.round(row.lng * 1000) / 1000;
          const key = `${roundedLat},${roundedLng}`;
          const spot = hotspotMap.get(key) ?? {
            lat: roundedLat,
            lng: roundedLng,
            categoryCounts: new Map<string, number>(),
            region: row.regionName,
            count: 0,
            lastAt: row.createdAt
          };
          spot.count += 1;
          spot.categoryCounts.set(row.category, (spot.categoryCounts.get(row.category) ?? 0) + 1);
          if (new Date(row.createdAt).getTime() >= new Date(spot.lastAt).getTime()) {
            spot.lastAt = row.createdAt;
            if (row.regionName) spot.region = row.regionName;
          }
          hotspotMap.set(key, spot);
        }

        if (row.ackAt) {
          const seconds = (new Date(row.ackAt).getTime() - created.getTime()) / 1000;
          ackSeconds.push(seconds);
          if (row.priority === "P1") p1AckSeconds.push(seconds);
        }
        if (row.otwAt) {
          const seconds = (new Date(row.otwAt).getTime() - created.getTime()) / 1000;
          otwSeconds.push(seconds);
          if (row.priority === "P1") p1OtwSeconds.push(seconds);
        }
        if (row.closedAt) {
          closeSeconds.push((new Date(row.closedAt).getTime() - created.getTime()) / 1000);
        }
      }

      const anchorMs = query.to ? new Date(query.to).getTime() : Date.now();
      const daily: Array<{ date: string; total: number; p1: number; closed: number }> = [];
      for (let index = 13; index >= 0; index -= 1) {
        const date = new Date(anchorMs - index * 86_400_000);
        const key = localTimeParts(date, settings.unitTimezone).dateKey;
        daily.push({ date: key, ...(dailyMap.get(key) ?? { total: 0, p1: 0, closed: 0 }) });
      }

      const active = rows.filter((row) => ACTIVE_STATUSES.includes(row.status as TicketStatus)).length;
      const p1Rows = rows.filter((row) => row.priority === "P1");
      const p1Active = p1Rows.filter((row) =>
        ACTIVE_STATUSES.includes(row.status as TicketStatus)
      ).length;

      const hotspots = Array.from(hotspotMap.values())
        .map((spot) => {
          let dominantCategory = "lain";
          let maxCategoryCount = -1;
          for (const [cat, count] of spot.categoryCounts.entries()) {
            if (count > maxCategoryCount) {
              maxCategoryCount = count;
              dominantCategory = cat;
            }
          }
          return {
            lat: spot.lat,
            lng: spot.lng,
            category: dominantCategory,
            region: spot.region,
            count: spot.count,
            lastAt: spot.lastAt
          };
        })
        .sort((a, b) => b.count - a.count || new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
        .slice(0, 8);

      return {
        period: { from: query.from ?? null, to: query.to ?? null },
        total: rows.length,
        active,
        closed: byStatus.selesai,
        rejected: byStatus.ditolak,
        falseReports,
        p1Active,
        byStatus,
        byCategory,
        byPriority,
        byRegion: Array.from(byRegion.entries())
          .map(([id, value]) => ({ id, name: value.name, count: value.count }))
          .sort((a, b) => b.count - a.count),
        daily,
        heatmap: { days: DAY_LABELS, hours: Array.from({ length: 24 }, (_, hour) => hour), values: heatmap },
        hotspots,
        targets: {
          ackSeconds: settings.slaP1AckSeconds,
          otwSeconds: settings.slaP1OtwSeconds
        },
        sla: {
          p1Total: p1Rows.length,
          p1AckTotal: p1AckSeconds.length,
          p1AckWithinTarget: p1AckSeconds.filter(
            (value) => value <= settings.slaP1AckSeconds
          ).length,
          p1OtwTotal: p1OtwSeconds.length,
          p1OtwWithinTarget: p1OtwSeconds.filter(
            (value) => value <= settings.slaP1OtwSeconds
          ).length
        },
        response: {
          avgAckSeconds: average(ackSeconds),
          medianAckSeconds: median(ackSeconds),
          p90AckSeconds: percentile(ackSeconds, 90),
          avgOtwSeconds: average(otwSeconds),
          medianOtwSeconds: median(otwSeconds),
          p90OtwSeconds: percentile(otwSeconds, 90),
          avgCloseSeconds: average(closeSeconds),
          medianCloseSeconds: median(closeSeconds),
          p90CloseSeconds: percentile(closeSeconds, 90)
        }
      };
    }
  );
}
