import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, extname, posix, resolve, sep } from "node:path";
import type Database from "better-sqlite3";
import type { AppConfig } from "@sigap/config";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import exifr from "exifr";
import sharp from "sharp";
import type { Db } from "../db/client.js";
import { ticketMedia } from "../db/schema.js";
import { badRequest } from "./errors.js";

export type MediaKind = "image" | "video" | "audio";

export interface GpsPoint {
  lat: number;
  lng: number;
}

export const MEDIA_LIMITS: Record<MediaKind, number> = {
  image: 16 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  audio: 64 * 1024 * 1024
};

export const MEDIA_THUMB_LIMIT = 2 * 1024 * 1024;

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/3gpp",
  "video/quicktime",
  "video/webm"
]);
const AUDIO_MIMES = new Set([
  "audio/ogg",
  "audio/opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/amr",
  "audio/wav",
  "audio/x-wav"
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "audio/wav": "wav",
  "audio/x-wav": "wav"
};

export interface StageMediaInput {
  file: Buffer;
  mime: string;
  kind?: MediaKind;
  originalName?: string | null;
  thumb?: Buffer | null;
  reporterId?: string | null;
  waChatJid?: string | null;
  waMessageId?: string | null;
  durationS?: number | null;
  caption?: string | null;
  exifGps?: GpsPoint | null;
}

export interface MediaDto {
  id: string;
  kind: MediaKind;
  mime: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  exifGps: GpsPoint | null;
  caption: string | null;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
}

type MediaRow = typeof ticketMedia.$inferSelect;

export function normalizeMime(value: string | undefined | null): string {
  if (!value) return "";
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

export function resolveMediaKind(mime: string): MediaKind | null {
  const clean = normalizeMime(mime);
  if (IMAGE_MIMES.has(clean)) return "image";
  if (VIDEO_MIMES.has(clean)) return "video";
  if (AUDIO_MIMES.has(clean)) return "audio";
  return null;
}

export function mimeFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const ext = extname(basename(filename)).slice(1).toLowerCase();
  if (!ext) return null;
  const found = Object.entries(EXT_BY_MIME).find(([, value]) => value === ext);
  return found?.[0] ?? null;
}

function extensionFor(mime: string, originalName?: string | null): string {
  const known = EXT_BY_MIME[normalizeMime(mime)];
  if (known) return known;
  const fallback = originalName ? extname(basename(originalName)).slice(1) : "";
  return /^[a-z0-9]{1,8}$/i.test(fallback) ? fallback.toLowerCase() : "bin";
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function mapGps(value: unknown): GpsPoint | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
  const lat = Number(candidate.lat ?? candidate.latitude);
  const lng = Number(candidate.lng ?? candidate.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function readExifGps(buffer: Buffer): Promise<GpsPoint | null> {
  try {
    const gps = await exifr.gps(buffer);
    return mapGps(gps);
  } catch {
    return null;
  }
}

const MAX_IMAGE_INPUT_PIXELS = 40_000_000;

function matchesMediaMagic(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 4) return false;
  const ftyp = buffer.length >= 8 ? buffer.subarray(4, 8).toString("ascii") : "";
  switch (mime) {
    case "video/mp4":
    case "video/3gpp":
    case "audio/mp4":
      return ftyp === "ftyp";
    case "video/quicktime":
      return ["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(ftyp);
    case "video/webm":
      return (
        buffer[0] === 0x1a &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xdf &&
        buffer[3] === 0xa3
      );
    case "audio/ogg":
      return buffer.subarray(0, 4).toString("ascii") === "OggS";
    case "audio/opus":
      return (
        buffer.subarray(0, 4).toString("ascii") === "OggS" ||
        (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)
      );
    case "audio/mpeg":
      return (
        buffer.subarray(0, 3).toString("ascii") === "ID3" ||
        (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xe0) === 0xe0)
      );
    case "audio/aac":
      return (
        (buffer[0] === 0xff && ((buffer[1] ?? 0) & 0xf0) === 0xf0) ||
        buffer.subarray(0, 4).toString("ascii") === "ADIF" ||
        ftyp === "ftyp"
      );
    case "audio/amr":
      return buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "#!AMR";
    case "audio/wav":
    case "audio/x-wav":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WAVE"
      );
    default:
      return false;
  }
}

async function imageMetadata(
  buffer: Buffer
): Promise<{ width: number | null; height: number | null } | null> {
  try {
    const meta = await sharp(buffer, {
      failOn: "none",
      animated: false,
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS
    }).metadata();
    if (!meta.width || !meta.height) return null;
    const swap = meta.orientation !== undefined && meta.orientation >= 5 && meta.orientation <= 8;
    return {
      width: swap ? meta.height : meta.width,
      height: swap ? meta.width : meta.height
    };
  } catch {
    return null;
  }
}

async function renderThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer, {
      failOn: "none",
      animated: false,
      limitInputPixels: MAX_IMAGE_INPUT_PIXELS
    })
      .rotate()
      .resize({ width: 520, height: 520, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

function mediaDirOf(config: AppConfig): string {
  return resolve(config.mediaDir);
}

function safeJoin(config: AppConfig, relative: string): string {
  const root = mediaDirOf(config);
  const absolute = resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) {
    throw badRequest("Path media tidak valid");
  }
  return absolute;
}

function writeBuffer(config: AppConfig, relative: string, buffer: Buffer): void {
  const absolute = safeJoin(config, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  const temp = `${absolute}.${randomUUID()}.tmp`;
  writeFileSync(temp, buffer, { flag: "wx" });
  renameSync(temp, absolute);
}

function removeFile(config: AppConfig, relative: string | null): void {
  if (!relative) return;
  try {
    rmSync(safeJoin(config, relative), { force: true });
  } catch {
    // Cleanup best effort: a missing/locked file must not break the request.
  }
}

function rowToDto(row: MediaRow): MediaDto {
  let gps: GpsPoint | null = null;
  if (row.exifGps) {
    try {
      gps = mapGps(JSON.parse(row.exifGps));
    } catch {
      gps = null;
    }
  }
  return {
    id: row.id,
    kind: row.kind as MediaKind,
    mime: row.mime,
    size: row.size,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    durationS: row.durationS,
    exifGps: gps,
    caption: row.caption,
    createdAt: row.createdAt,
    url: `/api/media/${row.id}`,
    thumbUrl:
      row.status === "ready" || row.status === "staged"
        ? row.thumbPath
          ? `/api/media/${row.id}/thumb`
          : row.kind === "image"
            ? `/api/media/${row.id}`
            : null
        : null
  };
}

function findByWaMessageId(db: Db, waMessageId: string): MediaRow | undefined {
  return db.select().from(ticketMedia).where(eq(ticketMedia.waMessageId, waMessageId)).get();
}

export async function stageMedia(
  db: Db,
  config: AppConfig,
  input: StageMediaInput
): Promise<MediaDto> {
  const mime = normalizeMime(input.mime) || mimeFromFilename(input.originalName) || "";
  const detectedKind = resolveMediaKind(mime);
  if (!detectedKind) {
    throw badRequest(`Format media tidak didukung (${mime || "tidak diketahui"})`);
  }
  if (input.kind && input.kind !== detectedKind) {
    throw badRequest("Jenis media tidak cocok dengan MIME");
  }
  if (input.file.length === 0) throw badRequest("File media kosong");
  if (input.file.length > MEDIA_LIMITS[detectedKind]) {
    const limitMb = Math.round(MEDIA_LIMITS[detectedKind] / (1024 * 1024));
    throw badRequest(`Ukuran media melebihi batas ${limitMb} MB`);
  }
  if (input.waMessageId) {
    const existing = findByWaMessageId(db, input.waMessageId);
    if (existing) return rowToDto(existing);
  }

  let width: number | null = null;
  let height: number | null = null;
  let thumbBuffer: Buffer | null = null;
  let gps = mapGps(input.exifGps);

  if (detectedKind === "image") {
    const meta = await imageMetadata(input.file);
    if (!meta) throw badRequest("Gambar tidak dapat dibaca");
    width = meta.width;
    height = meta.height;
    thumbBuffer = await renderThumbnail(input.file);
    if (!gps) gps = await readExifGps(input.file);
  } else {
    if (!matchesMediaMagic(input.file, mime)) {
      throw badRequest(`Isi file tidak cocok dengan format ${mime}`);
    }
    if (input.thumb && input.thumb.length > 0 && input.thumb.length <= MEDIA_THUMB_LIMIT) {
      thumbBuffer = await renderThumbnail(input.thumb);
    }
  }

  const id = randomUUID();
  const now = new Date();
  const relativeDir = posix.join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, "0")
  );
  const extension = extensionFor(mime, input.originalName);
  const originalPath = posix.join(relativeDir, `${id}.${extension}`);
  const thumbPath = thumbBuffer ? posix.join(relativeDir, `${id}_thumb.jpg`) : null;
  const digest = sha256(input.file);

  writeBuffer(config, originalPath, input.file);
  if (thumbBuffer && thumbPath) writeBuffer(config, thumbPath, thumbBuffer);

  const createdAt = now.toISOString();
  try {
    db.insert(ticketMedia)
      .values({
        id,
        ticketId: null,
        reporterId: input.reporterId ?? null,
        waChatJid: input.waChatJid ?? null,
        kind: detectedKind,
        originalPath,
        thumbPath,
        mime,
        size: input.file.length,
        sha256: digest,
        width,
        height,
        durationS: input.durationS ?? null,
        exifGps: gps ? JSON.stringify(gps) : null,
        waMessageId: input.waMessageId ?? null,
        caption: input.caption?.trim() ? input.caption.trim().slice(0, 1000) : null,
        status: "staged",
        createdAt
      })
      .run();
  } catch (error) {
    removeFile(config, originalPath);
    removeFile(config, thumbPath);
    if (input.waMessageId) {
      const existing = findByWaMessageId(db, input.waMessageId);
      if (existing) return rowToDto(existing);
    }
    throw error;
  }

  const row = db.select().from(ticketMedia).where(eq(ticketMedia.id, id)).get();
  if (!row) throw badRequest("Media gagal disimpan");
  return rowToDto(row);
}

export function linkMediaToTicket(
  db: Db,
  ticketId: string,
  mediaIds: string[] | undefined | null,
  owner?: { reporterId?: string | null; waChatJid?: string | null }
): number {
  const ids = [...new Set((mediaIds ?? []).filter(Boolean))];
  if (ids.length === 0) return 0;

  const conditions = [inArray(ticketMedia.id, ids), isNull(ticketMedia.ticketId)];
  if (owner && (owner.reporterId || owner.waChatJid)) {
    const ownerClauses = [
      and(isNull(ticketMedia.reporterId), isNull(ticketMedia.waChatJid))
    ];
    if (owner.reporterId) ownerClauses.push(eq(ticketMedia.reporterId, owner.reporterId));
    if (owner.waChatJid) ownerClauses.push(eq(ticketMedia.waChatJid, owner.waChatJid));
    const ownerCheck = or(...ownerClauses);
    if (ownerCheck) conditions.push(ownerCheck);
  }

  const result = db
    .update(ticketMedia)
    .set({ ticketId, status: "ready" })
    .where(and(...conditions))
    .run();
  return result.changes;
}

export function listTicketMedia(db: Db, ticketId: string): MediaDto[] {
  return db
    .select()
    .from(ticketMedia)
    .where(eq(ticketMedia.ticketId, ticketId))
    .orderBy(asc(ticketMedia.createdAt))
    .all()
    .map(rowToDto);
}

export function getMediaRow(db: Db, id: string): MediaRow | undefined {
  return db.select().from(ticketMedia).where(eq(ticketMedia.id, id)).get();
}

export function mediaFilePath(
  config: AppConfig,
  row: MediaRow,
  variant: "original" | "thumb"
): { path: string; mime: string; size: number } | null {
  const relative = variant === "thumb" ? row.thumbPath : row.originalPath;
  if (!relative) return null;
  const absolute = safeJoin(config, relative);
  if (!existsSync(absolute)) return null;
  return {
    path: absolute,
    mime: variant === "thumb" ? "image/jpeg" : row.mime,
    size: statSync(absolute).size
  };
}

export function sweepStagedMedia(
  db: Db,
  config: AppConfig,
  olderThanHours = 24
): number {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
  const rows = db
    .select()
    .from(ticketMedia)
    .where(and(isNull(ticketMedia.ticketId), lt(ticketMedia.createdAt, cutoff)))
    .all();
  for (const row of rows) {
    removeFile(config, row.originalPath);
    removeFile(config, row.thumbPath);
    db.delete(ticketMedia).where(eq(ticketMedia.id, row.id)).run();
  }
  return rows.length;
}

export function sweepMaintenance(
  sqlite: Database.Database,
  retentionDays = 30
): { sessions: number; messages: number } {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const deletedSessions = sqlite
    .prepare(
      "DELETE FROM sessions WHERE (revoked_at IS NOT NULL AND revoked_at < ?) OR expires_at < ?"
    )
    .run(cutoff, cutoff).changes;
  const deletedMessages = sqlite
    .prepare("DELETE FROM message_log WHERE received_at < ?")
    .run(cutoff).changes;
  return { sessions: deletedSessions, messages: deletedMessages };
}
