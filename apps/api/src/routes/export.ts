import { and, asc, eq, gte, lte } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { FastifyInstance } from "fastify";
import PDFDocument from "pdfkit";
import { z } from "zod";
import {
  CATEGORIES,
  CATEGORY_META,
  PRIORITY_META,
  STATUS_META,
  TICKET_STATUSES,
  formatWibDate,
  formatWibTime,
  maskPhone,
  type Category,
  type Priority,
  type TicketStatus
} from "@sigap/core";
import { officers, regions, reporters, tickets } from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { DEFAULT_UNIT_ID } from "../lib/constants.js";
import { reporterPhoneDisplay } from "../lib/reporter-phone.js";
import { badRequest } from "../lib/errors.js";
import { readSettings } from "../lib/settings.js";

const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const exportQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  category: z.enum(CATEGORIES).optional()
});

interface ExportRow {
  id: string;
  ticketNo: string;
  createdAt: string;
  category: string;
  priority: string;
  status: string;
  title: string;
  description: string | null;
  address: string | null;
  regionName: string | null;
  reporterName: string;
  reporterPhoneEnc: string;
  reporterPhoneVerified: boolean;
  assignee: string | null;
  ackAt: string | null;
  otwAt: string | null;
  arriveAt: string | null;
  closedAt: string | null;
  closeNote: string | null;
  source: string;
}

interface Period {
  from: string;
  to: string;
  label: string;
  slug: string;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  if (timeZone === "Asia/Jakarta") return JAKARTA_OFFSET_MS;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
    const asUtc = Date.UTC(
      map.year ?? date.getUTCFullYear(),
      (map.month ?? date.getUTCMonth() + 1) - 1,
      map.day ?? date.getUTCDate(),
      (map.hour ?? 0) % 24,
      map.minute ?? 0,
      map.second ?? 0
    );
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  } catch {
    return JAKARTA_OFFSET_MS;
  }
}

function monthBounds(month: string, timeZone: string): { from: Date; to: Date } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const approxFrom = new Date(Date.UTC(year, monthIndex, 1));
  const approxTo = new Date(Date.UTC(year, monthIndex + 1, 1));
  const from = new Date(Date.UTC(year, monthIndex, 1) - tzOffsetMs(approxFrom, timeZone));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1) - tzOffsetMs(approxTo, timeZone) - 1);
  return { from, to };
}

function resolvePeriod(
  query: { from?: string; to?: string; month?: string },
  timeZone: string
): Period {
  if (query.month) {
    const bounds = monthBounds(query.month, timeZone);
    return {
      from: bounds.from.toISOString(),
      to: bounds.to.toISOString(),
      label: formatWibDate(bounds.from, { timeZone }).replace(/^\d+ /, ""),
      slug: query.month
    };
  }
  const now = new Date();
  const shifted = new Date(now.getTime() + tzOffsetMs(now, timeZone));
  const defaultBounds = monthBounds(
    `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`,
    timeZone
  );
  const from = query.from ? new Date(query.from) : defaultBounds.from;
  const to = query.to ? new Date(query.to) : defaultBounds.to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() > to.getTime()) {
    throw badRequest("Periode ekspor tidak valid");
  }
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: `${formatWibDate(from, { timeZone })} - ${formatWibDate(to, { timeZone })}`,
    slug: `${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}`
  };
}

function loadRows(
  app: FastifyInstance,
  period: Period,
  query: { status?: TicketStatus; category?: Category }
): ExportRow[] {
  const conditions = [
    eq(tickets.unitId, DEFAULT_UNIT_ID),
    gte(tickets.createdAt, period.from),
    lte(tickets.createdAt, period.to)
  ];
  if (query.status) conditions.push(eq(tickets.status, query.status));
  if (query.category) conditions.push(eq(tickets.category, query.category));

  const rows = app.db
    .select({
      id: tickets.id,
      ticketNo: tickets.ticketNo,
      createdAt: tickets.createdAt,
      category: tickets.category,
      priority: tickets.priority,
      status: tickets.status,
      title: tickets.title,
      description: tickets.description,
      address: tickets.address,
      regionName: regions.name,
      reporterName: reporters.name,
      reporterPhoneEnc: reporters.phoneEnc,
      reporterPhoneVerified: reporters.phoneVerified,
      assignee: officers.name,
      ackAt: tickets.ackAt,
      otwAt: tickets.otwAt,
      arriveAt: tickets.arriveAt,
      closedAt: tickets.closedAt,
      closeNote: tickets.closeNote,
      source: tickets.source
    })
    .from(tickets)
    .innerJoin(reporters, eq(tickets.reporterId, reporters.id))
    .leftJoin(regions, eq(tickets.regionId, regions.id))
    .leftJoin(officers, eq(tickets.assignedTo, officers.id))
    .where(and(...conditions))
    .orderBy(asc(tickets.createdAt))
    .limit(EXPORT_MAX_ROWS + 1)
    .all();
  // Dulu data dipotong diam-diam di 10.000 baris; sekarang ditolak dengan jelas.
  if (rows.length > EXPORT_MAX_ROWS) {
    throw badRequest(
      `Data periode ini melebihi ${EXPORT_MAX_ROWS.toLocaleString("id-ID")} tiket. Persempit rentang tanggal export.`
    );
  }
  return rows;
}

const EXPORT_MAX_ROWS = 10_000;

function phoneMasked(app: FastifyInstance, row: ExportRow): string {
  return reporterPhoneDisplay(
    { phoneEnc: row.reporterPhoneEnc, phoneVerified: row.reporterPhoneVerified },
    app.config.SIGAP_PHONE_KEY,
    true
  );
}

function sanitizeSpreadsheetCell(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return /^[\s\t\r]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

function csvCell(value: unknown): string {
  const text = sanitizeSpreadsheetCell(value);
  return `"${text.replaceAll('"', '""').replace(/\r?\n/g, " ")}"`;
}

function formatStamp(value: string, timeZone: string): string {
  return `${formatWibDate(value, { timeZone })} ${formatWibTime(value, { timeZone })}`;
}

function buildCsv(app: FastifyInstance, rows: ExportRow[], timeZone: string): string {
  const header = [
    "No Tiket",
    "Waktu",
    "Kategori",
    "Prioritas",
    "Status",
    "Judul",
    "Deskripsi",
    "Alamat",
    "Wilayah",
    "Pelapor",
    "Telepon (masked)",
    "Petugas",
    "Ack",
    "OTW",
    "Tiba",
    "Selesai",
    "Catatan Penutup",
    "Sumber"
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.ticketNo,
        formatStamp(row.createdAt, timeZone),
        CATEGORY_META[row.category as Category]?.label ?? row.category,
        `${row.priority} ${PRIORITY_META[row.priority as Priority]?.label ?? ""}`.trim(),
        STATUS_META[row.status as TicketStatus]?.label ?? row.status,
        row.title,
        row.description,
        row.address,
        row.regionName,
        row.reporterName,
        phoneMasked(app, row),
        row.assignee,
        row.ackAt ? formatStamp(row.ackAt, timeZone) : "",
        row.otwAt ? formatStamp(row.otwAt, timeZone) : "",
        row.arriveAt ? formatStamp(row.arriveAt, timeZone) : "",
        row.closedAt ? formatStamp(row.closedAt, timeZone) : "",
        row.closeNote,
        row.source
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function summaryCounts(rows: ExportRow[]) {
  const byStatus: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    byCategory[row.category] = (byCategory[row.category] ?? 0) + 1;
    byRegion[row.regionName ?? "Tidak diketahui"] =
      (byRegion[row.regionName ?? "Tidak diketahui"] ?? 0) + 1;
  }
  return { byStatus, byCategory, byRegion };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2)
    : Math.round(sorted[mid] ?? 0);
}

function responseMedian(rows: ExportRow[], field: "ackAt" | "otwAt" | "closedAt"): number | null {
  const values = rows
    .filter((row) => row[field])
    .map(
      (row) =>
        (new Date(row[field] as string).getTime() - new Date(row.createdAt).getTime()) / 1000
    );
  return median(values);
}

function secondsText(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} dtk`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} mnt` : `${Math.floor(minutes / 60)} jam ${minutes % 60} mnt`;
}

async function buildWorkbook(
  app: FastifyInstance,
  rows: ExportRow[],
  period: Period
): Promise<Buffer> {
  const settings = readSettings(app.db, app.config);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SIGAP";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Tiket", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.columns = [
    { header: "No Tiket", key: "ticketNo", width: 18 },
    { header: "Waktu", key: "time", width: 20 },
    { header: "Kategori", key: "category", width: 18 },
    { header: "Prioritas", key: "priority", width: 14 },
    { header: "Status", key: "status", width: 14 },
    { header: "Judul", key: "title", width: 40 },
    { header: "Wilayah", key: "region", width: 18 },
    { header: "Pelapor", key: "reporter", width: 20 },
    { header: "Telepon", key: "phone", width: 16 },
    { header: "Petugas", key: "assignee", width: 22 },
    { header: "Ack", key: "ack", width: 18 },
    { header: "OTW", key: "otw", width: 18 },
    { header: "Selesai", key: "closed", width: 18 },
    { header: "Catatan", key: "note", width: 45 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF14212D" }
  };
  sheet.autoFilter = "A1:N1";

  for (const row of rows) {
    sheet.addRow({
      ticketNo: sanitizeSpreadsheetCell(row.ticketNo),
      time: formatStamp(row.createdAt, settings.unitTimezone),
      category: CATEGORY_META[row.category as Category]?.label ?? row.category,
      priority: row.priority,
      status: STATUS_META[row.status as TicketStatus]?.label ?? row.status,
      title: sanitizeSpreadsheetCell(row.title),
      region: sanitizeSpreadsheetCell(row.regionName ?? ""),
      reporter: sanitizeSpreadsheetCell(row.reporterName),
      phone: phoneMasked(app, row),
      assignee: sanitizeSpreadsheetCell(row.assignee ?? ""),
      ack: row.ackAt ? formatStamp(row.ackAt, settings.unitTimezone) : "",
      otw: row.otwAt ? formatStamp(row.otwAt, settings.unitTimezone) : "",
      closed: row.closedAt ? formatStamp(row.closedAt, settings.unitTimezone) : "",
      note: sanitizeSpreadsheetCell(row.closeNote ?? "")
    });
  }

  const summary = workbook.addWorksheet("Ringkasan");
  summary.columns = [{ width: 28 }, { width: 48 }];
  const counts = summaryCounts(rows);
  const lines: Array<[string, string]> = [
    ["Unit", settings.unitName],
    ["Periode", period.label],
    ["Total tiket", String(rows.length)],
    ["P1", String(rows.filter((row) => row.priority === "P1").length)],
    ["Selesai", String(counts.byStatus.selesai ?? 0)],
    ["Ditolak", String(counts.byStatus.ditolak ?? 0)],
    ["Median ack", secondsText(responseMedian(rows, "ackAt"))],
    ["Median OTW", secondsText(responseMedian(rows, "otwAt"))],
    ["Median tutup", secondsText(responseMedian(rows, "closedAt"))],
    ["", ""],
    ["Kategori", "Jumlah"],
    ...Object.entries(counts.byCategory).map(
      ([key, value]): [string, string] => [
        CATEGORY_META[key as Category]?.label ?? key,
        String(value)
      ]
    ),
    ["", ""],
    ["Wilayah", "Jumlah"],
    ...Object.entries(counts.byRegion).map(
      ([key, value]): [string, string] => [key, String(value)]
    )
  ];
  for (const [label, value] of lines) {
    summary.addRow([label, value]);
  }
  summary.getColumn(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildPdf(
  app: FastifyInstance,
  rows: ExportRow[],
  period: Period
): Promise<Buffer> {
  const settings = readSettings(app.db, app.config);
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const counts = summaryCounts(rows);
  const p1 = rows.filter((row) => row.priority === "P1").length;
  const categoryEntries = Object.entries(counts.byCategory).sort((a, b) => b[1] - a[1]);
  const regionEntries = Object.entries(counts.byRegion).sort((a, b) => b[1] - a[1]);

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(18).text("LAPORAN BULANAN SIGAP");
  doc.moveDown(0.2);
  doc.fillColor("#374151").font("Helvetica").fontSize(11).text(settings.unitName);
  doc.fillColor("#6b7280").fontSize(9).text(`Periode: ${period.label}`);
  doc.moveDown(0.8);

  doc.fillColor("#111827").font("Helvetica-Bold").fontSize(12).text("Ringkasan");
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  doc.text(`Total tiket: ${rows.length}`);
  doc.text(`P1: ${p1}`);
  doc.text(`Selesai: ${counts.byStatus.selesai ?? 0}`);
  doc.text(`Ditolak: ${counts.byStatus.ditolak ?? 0}`);
  doc.text(`Median ack: ${secondsText(responseMedian(rows, "ackAt"))}`);
  doc.text(`Median OTW: ${secondsText(responseMedian(rows, "otwAt"))}`);
  doc.text(`Median tutup: ${secondsText(responseMedian(rows, "closedAt"))}`);
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Kategori");
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  for (const [category, count] of categoryEntries) {
    doc.text(`${CATEGORY_META[category as Category]?.label ?? category}: ${count}`);
  }
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Wilayah");
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor("#374151");
  for (const [region, count] of regionEntries) {
    doc.text(`${region}: ${count}`);
  }
  doc.moveDown(0.8);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Daftar Tiket");
  doc.moveDown(0.3);

  const columns = [
    { key: "ticketNo", label: "No", width: 78 },
    { key: "time", label: "Waktu", width: 62 },
    { key: "category", label: "Kategori", width: 78 },
    { key: "status", label: "Status", width: 50 },
    { key: "reporter", label: "Pelapor", width: 85 },
    { key: "region", label: "Wilayah", width: 72 },
    { key: "title", label: "Judul", width: 90 }
  ] as const;
  let y = doc.y;
  const startX = 40;
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
  let x = startX;
  for (const column of columns) {
    doc.text(column.label, x, y, { width: column.width, lineBreak: false });
    x += column.width;
  }
  y += 14;
  doc.font("Helvetica").fontSize(7.5).fillColor("#374151");
  for (const row of rows.slice(0, 32)) {
    if (y > 760) {
      doc.addPage();
      y = 40;
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827");
      let headerX = startX;
      for (const column of columns) {
        doc.text(column.label, headerX, y, { width: column.width, lineBreak: false });
        headerX += column.width;
      }
      y += 14;
      doc.font("Helvetica").fontSize(7.5).fillColor("#374151");
    }
    const values = [
      row.ticketNo,
      `${formatWibDate(row.createdAt)} ${formatWibTime(row.createdAt)}`,
      CATEGORY_META[row.category as Category]?.short ?? row.category,
      STATUS_META[row.status as TicketStatus]?.label ?? row.status,
      row.reporterName,
      row.regionName ?? "—",
      row.title
    ];
    x = startX;
    values.forEach((value, index) => {
      const column = columns[index];
      if (!column) return;
      doc.text(String(value).slice(0, 46), x, y, { width: column.width, lineBreak: false });
      x += column.width;
    });
    y += 13;
  }
  if (rows.length > 32) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Oblique").fontSize(8).text(`... dan ${rows.length - 32} tiket lainnya di file Excel/CSV.`);
  }

  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.font("Helvetica").fontSize(7).fillColor("#9ca3af").text(
      `SIGAP - ${settings.unitName} - halaman ${index + 1} dari ${range.count}`,
      40,
      800,
      { width: 515, align: "right", lineBreak: false }
    );
  }

  doc.end();
  return done;
}

function recordExport(
  app: FastifyInstance,
  actorId: string,
  format: string,
  period: Period,
  count: number,
  request: { ip: string; headers: Record<string, unknown> }
): void {
  writeAudit(app.db, {
    unitId: DEFAULT_UNIT_ID,
    actorId,
    action: `export.${format}`,
    entity: "ticket",
    entityId: null,
    meta: { from: period.from, to: period.to, count },
    ip: request.ip,
    userAgent: (request.headers["user-agent"] as string | undefined) ?? null
  });
}

export function registerExportRoutes(app: FastifyInstance): void {
  app.get(
    "/api/export/tickets.csv",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin") },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: { code: "unauthorized", message: "Sesi tidak valid" } });
      const query = exportQuerySchema.parse(request.query);
      const settings = readSettings(app.db, app.config);
      const period = resolvePeriod(query, settings.unitTimezone);
      const rows = loadRows(app, period, query);
      recordExport(app, user.id, "csv", period, rows.length, request);
      const csv = buildCsv(app, rows, settings.unitTimezone);
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="sigap-tiket-${period.slug}.csv"`)
        .send(csv);
    }
  );

  app.get(
    "/api/export/tickets.xlsx",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin") },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: { code: "unauthorized", message: "Sesi tidak valid" } });
      const query = exportQuerySchema.parse(request.query);
      const settings = readSettings(app.db, app.config);
      const period = resolvePeriod(query, settings.unitTimezone);
      const rows = loadRows(app, period, query);
      const buffer = await buildWorkbook(app, rows, period);
      recordExport(app, user.id, "xlsx", period, rows.length, request);
      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="sigap-tiket-${period.slug}.xlsx"`)
        .send(buffer);
    }
  );

  app.get(
    "/api/export/monthly.pdf",
    { preHandler: app.requireRole("piket", "pawas", "kapolsek", "admin") },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.code(401).send({ error: { code: "unauthorized", message: "Sesi tidak valid" } });
      const query = exportQuerySchema.parse(request.query);
      const settings = readSettings(app.db, app.config);
      const period = resolvePeriod(query, settings.unitTimezone);
      const rows = loadRows(app, period, query);
      const buffer = await buildPdf(app, rows, period);
      recordExport(app, user.id, "pdf", period, rows.length, request);
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", `attachment; filename="sigap-laporan-${period.slug}.pdf"`)
        .send(buffer);
    }
  );
}
