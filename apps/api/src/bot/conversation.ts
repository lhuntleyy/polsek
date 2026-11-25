import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, like, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  ALLOWED_TRANSITIONS,
  CATEGORY_META,
  PRIORITY_META,
  STATUS_META,
  TRANSITION_ROLES,
  canTransition,
  classifyLocation,
  formatLocalTime,
  maskPhone,
  stripWhatsAppDevice,
  ticketDateCode,
  type Category,
  type GeoPolygon,
  type RegionInput,
  type Role,
  type TicketStatus
} from "@sigap/core";
import {
  conversations,
  officers,
  regions,
  reporters,
  ticketEvents,
  tickets,
  waGroups
} from "../db/schema.js";
import { writeAudit } from "../lib/audit.js";
import { CONSENT_VERSION, DEFAULT_UNIT_ID } from "../lib/constants.js";
import { encryptPhone, hashPhone } from "../lib/crypto.js";
import { isLidJid, reporterPhoneDisplay } from "../lib/reporter-phone.js";
import { getMediaRow, linkMediaToTicket, listTicketMedia } from "../lib/media.js";
import { enqueueOutbox, type OutboxDraft } from "../lib/outbox.js";
import { sendPushToRoles } from "../lib/push.js";
import { readSettings } from "../lib/settings.js";
import { nextTicketNumber } from "../lib/ticket-number.js";
import {
  groupStatusMessage,
  reporterStatusMessage,
  resolveReporterJid
} from "../lib/wa-status.js";

export interface NormalizedInbound {
  waMessageId: string;
  chatJid: string;
  senderJid: string;
  senderName?: string;
  isGroup: boolean;
  type: "text" | "location" | "image" | "video" | "audio" | "unknown";
  text?: string;
  location?: { lat: number; lng: number; accuracyM?: number };
  mediaIds?: string[];
  mediaError?: string;
  timestamp: string;
}

export interface GroupCommandInput {
  waMessageId: string;
  groupJid: string;
  senderJid: string;
  text: string;
  mediaIds?: string[];
  timestamp: string;
}

export interface ConversationResult {
  replies: OutboxDraft[];
  reason?: string;
  afterCommit?: () => void;
}

interface ConversationContext {
  /**
   * `emergency_draft`: warga memulai DARURAT tetapi keterangan/jenis/nama/lokasi
   * belum lengkap. Tiket P1 baru dibuat setelah semuanya terisi (anti-iseng).
   */
  intent?: "report" | "emergency" | "emergency_draft" | "rename";
  category?: Category;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  regionId?: string | null;
  locationStatus?: string;
  emergencyTicketId?: string;
  mediaIds?: string[];
  /** Teks berkata kunci darurat yang menunggu konfirmasi YA/TIDAK. */
  pendingText?: string;
  /** Nama sudah dijawab dalam sesi darurat ini (objek reporter di memori masih lama). */
  nameDone?: boolean;
  /** Kronologi darurat dikirim sebagai voice note. */
  voiceDesc?: boolean;
  /** Wilayah terdekat bila lokasi darurat di luar wilkum. */
  nearestRegionId?: string | null;
}

const ACTIVE_STATUSES: TicketStatus[] = ["baru", "diterima", "otw", "ditkp", "ditunda"];
const EMERGENCY_REGEX =
  /\b(DARURAT|TAWURAN|KEBAKARAN|BEGAL|RAMPOK|LAKA|KECELAKAAN|BANJIR|POHON TUMBANG|GEMPA|ORANG MENINGGAL|SENJATA|BUNUH)\b/i;

function phoneFromJid(jid: string): string {
  const local = jid.split("@")[0]?.split(":")[0]?.replace(/\D/g, "") ?? "";
  return local || jid;
}

function reply(targetJid: string, text: string): OutboxDraft {
  return { targetJid, kind: "text", payload: { text } };
}

function urcMaps(lat: number | null | undefined, lng: number | null | undefined): string {
  return lat !== null && lat !== undefined && lng !== null && lng !== undefined
    ? `https://maps.google.com/?q=${lat},${lng}`
    : "-";
}

/** Teks yang berisi link (mis. link Google Maps) — dipakai sebagai lokasi, bukan nama. */
function looksLikeLink(text: string): boolean {
  return /(https?:\/\/|www\.|maps\.app\.goo\.gl|goo\.gl\/|maps\.google)/i.test(text);
}

function locationPrompt(): string {
  return "Kirim lokasi kejadian (share location), link Google Maps, atau ketik alamat lengkap/nama desa. Lokasi WAJIB diisi.";
}

function groupMediaDrafts(
  app: FastifyInstance,
  ticketId: string,
  ticketNo: string,
  groupJid: string,
  onlyIds?: string[]
): OutboxDraft[] {
  const all = listTicketMedia(app.db, ticketId);
  const media = onlyIds?.length
    ? all.filter((item) => onlyIds.includes(item.id))
    : all;
  return media.map((item, index) => {
    const caption = [
      // Nomor tiket lengkap supaya anggota bisa me-reply foto ini dengan OTW/TIBA/SELESAI.
      `Lampiran #${ticketNo} (${index + 1}/${media.length})`,
      item.caption ? item.caption.slice(0, 700) : null
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      targetJid: groupJid,
      kind: "media",
      payload: {
        mediaId: item.id,
        mime: item.mime,
        kind: item.kind,
        caption
      }
    };
  });
}

/**
 * Kirim tiket ke grup URC. Dipanggil saat piket pertama kali menerima laporan
 * (baru -> diterima), BUKAN saat laporan masuk, supaya URC hanya menerima
 * laporan yang sudah diverifikasi piket.
 */
export function dispatchTicketToUrc(
  app: FastifyInstance,
  ticketId: string,
  acceptedByName?: string | null
): number {
  const settings = readSettings(app.db, app.config);
  if (!settings.waGroupUrcJid) return 0;
  const ticket = app.db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return 0;
  const reporter = app.db.select().from(reporters).where(eq(reporters.id, ticket.reporterId)).get();
  const phoneDisplay = reporter
    ? reporterPhoneDisplay(reporter, app.config.SIGAP_PHONE_KEY, settings.piiMasking)
    : "••••";
  const regionName = ticket.regionId
    ? (app.db.select().from(regions).where(eq(regions.id, ticket.regionId)).get()?.name ?? null)
    : null;
  const category = CATEGORY_META[ticket.category as Category]?.short ?? ticket.category;
  const lokasi = [
    ticket.address,
    regionName && regionName !== ticket.address ? `Desa/Kel. ${regionName}` : null
  ]
    .filter(Boolean)
    .join(" · ");
  const peta =
    ticket.lat !== null
      ? urcMaps(ticket.lat, ticket.lng)
      : ticket.address && looksLikeLink(ticket.address)
        ? ticket.address
        : "-";
  const text = [
    `${ticket.priority === "P1" ? "🚨 " : ""}*${ticket.priority} · ${category}*`,
    `#${ticket.ticketNo} — ${ticket.title}`,
    ticket.description && ticket.description !== ticket.title
      ? `Kronologi: ${ticket.description.slice(0, 700)}`
      : null,
    `Pelapor: ${reporter?.name ?? "Belum diisi"} (${phoneDisplay})`,
    reporter && reporter.falseCount > 0
      ? `⚠️ Riwayat pelapor: ${reporter.falseCount} laporan palsu dari ${reporter.reportCount} laporan`
      : null,
    `Lokasi: ${lokasi || "Belum dikirim pelapor"}${ticket.locationStatus === "outside" ? " (⚠️ di luar wilkum)" : ""}`,
    `Peta: ${peta}`,
    `Masuk: ${formatLocalTime(ticket.createdAt, settings.unitTimezone)}`,
    acceptedByName ? `Diterima piket: ${acceptedByName}` : null,
    "Aksi: *balas (reply) pesan ini* dengan OTW, TIBA, SELESAI, atau TUNDA <alasan>"
  ]
    .filter(Boolean)
    .join("\n");
  const drafts = [
    reply(settings.waGroupUrcJid, text),
    ...groupMediaDrafts(app, ticket.id, ticket.ticketNo, settings.waGroupUrcJid)
  ];
  for (const draft of drafts) enqueueOutbox(app.db, draft);
  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId: ticket.id,
      actorType: "system",
      actorId: null,
      fromStatus: ticket.status,
      toStatus: ticket.status,
      note: "Diteruskan ke grup URC setelah diterima piket",
      createdAt: new Date().toISOString()
    })
    .run();
  return drafts.length;
}

function parseContext(value: string): ConversationContext {
  try {
    return JSON.parse(value) as ConversationContext;
  } catch {
    return {};
  }
}

function loadRegionInputs(app: FastifyInstance): RegionInput[] {
  return app.db
    .select()
    .from(regions)
    .where(and(eq(regions.unitId, DEFAULT_UNIT_ID), eq(regions.active, true)))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      geojson: JSON.parse(row.geojson) as GeoPolygon,
      center: { lat: row.centroidLat ?? 0, lng: row.centroidLng ?? 0 },
      isDemo: row.isDemo
    }));
}

function findRegionByName(regionList: RegionInput[], text: string): RegionInput | null {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;
  const exactOrContained = regionList.find(
    (region) =>
      region.name.toLowerCase() === needle ||
      needle.includes(region.name.toLowerCase())
  );
  if (exactOrContained) return exactOrContained;
  if (needle.length >= 4) {
    const partial = regionList.filter((region) =>
      region.name.toLowerCase().includes(needle)
    );
    if (partial.length === 1) return partial[0] ?? null;
  }
  return null;
}

/** Kata kunci yang MUNGKIN darurat; perlu konfirmasi warga sebelum jadi P1. */
function isEmergencyText(text: string): boolean {
  return EMERGENCY_REGEX.test(text);
}

/** Warga secara eksplisit menyatakan darurat: langsung P1 tanpa konfirmasi. */
function isExplicitEmergency(text: string): boolean {
  return /\bDARURAT\b/i.test(text);
}

function inferCategory(text: string): Category {
  if (/\b(TAWURAN|KAMTIBMAS|KERIBUTAN|PREMAN|KEROYOK|DIKEROYOK|PENGEROYOKAN|RIBUT|BENTROK)\b/i.test(text)) {
    return "tawuran";
  }
  if (
    /\b(CURANMOR|MALING|BEGAL|RAMPOK|PENCURIAN|PIDANA|DIBACOK|BACOK|PENGANIAYAAN|DIANIAYA|PENUSUKAN|DITUSUK|JAMBRET|DIJAMBRET|PERAMPOKAN|DIRAMPOK|PENCULIKAN)\b/i.test(
      text
    )
  ) {
    return "pidana";
  }
  if (/\b(BANJIR|POHON|LONGSOR|GEMPA|BENCANA)\b/i.test(text)) return "bencana";
  if (/\b(LAKA|KECELAKAAN|MACET|MOGOK)\b/i.test(text)) return "laka";
  if (/\b(KEBAKARAN|TERBAKAR|DIBAKAR|API)\b/i.test(text)) return "kebakaran";
  return "lain";
}

function parseCategory(text: string): Category | null {
  const value = text.trim().toLowerCase();
  if (value === "1" || value.includes("kamtibmas") || value.includes("tawuran")) return "tawuran";
  if (value === "2" || value.includes("pidana") || value.includes("curanmor") || value.includes("maling")) return "pidana";
  if (value === "3" || value.includes("bencana") || value.includes("banjir") || value.includes("pohon")) return "bencana";
  if (value === "4" || value.includes("laka") || value.includes("macet") || value.includes("kecelakaan")) return "laka";
  if (value === "5" || value.includes("kebakaran")) return "kebakaran";
  if (value === "6" || value.includes("lain")) return "lain";
  return null;
}

function categoryMenu(): string {
  return [
    "Pilih jenis laporan:",
    "1. Gangguan Kamtibmas (tawuran, keributan)",
    "2. Tindak Pidana (curanmor, begal, pencurian)",
    "3. Bencana & Lingkungan (banjir, pohon tumbang)",
    "4. Laka & Kemacetan",
    "5. Kebakaran",
    "6. Lainnya"
  ].join("\n");
}

function welcomeText(name: string | null): string {
  return [
    name ? `Halo ${name}.` : "Selamat datang di layanan laporan Polsek.",
    "Ketik LAPOR untuk mulai membuat laporan.",
    "Untuk darurat, ketik DARURAT lalu sebutkan kejadiannya.",
    "Data Anda diproses hanya untuk penanganan laporan. Dengan melanjutkan, Anda menyetujui pemrosesan tersebut.",
    "Ketik BANTU untuk bantuan."
  ].join("\n");
}

function helpText(): string {
  return [
    "Panduan singkat:",
    "- LAPOR: mulai laporan baru",
    "- DARURAT <kejadian>: laporan prioritas 1, sebutkan kejadiannya (contoh: DARURAT ada tawuran di pasar)",
    "- STATUS: cek tiket terakhir",
    "- STATUS BKS-...: cek tiket tertentu",
    "- NAMA: ubah nama pelapor",
    "- BATAL: batalkan sesi",
    "Untuk darurat nyawa, tetap telepon 110."
  ].join("\n");
}

function confirmText(context: ConversationContext, regionList: RegionInput[]): string {
  const category = context.category ? CATEGORY_META[context.category] : null;
  const region = context.regionId
    ? regionList.find((item) => item.id === context.regionId)?.name
    : context.address;
  return [
    "Ringkasan laporan:",
    `Kategori: ${category?.label ?? "Belum dipilih"}`,
    `Lokasi: ${region ?? "Belum diisi"}`,
    `Deskripsi: ${context.description ?? "-"}`,
    "",
    "1. Kirim",
    "2. Batal",
    "3. Ubah kategori"
  ].join("\n");
}

function conversationExpiry(): string {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function getReporter(app: FastifyInstance, input: NormalizedInbound) {
  const byJid = app.db
    .select()
    .from(reporters)
    .where(eq(reporters.waJid, input.chatJid))
    .get();
  if (byJid) return byJid;

  const phone = phoneFromJid(input.senderJid);
  const phoneHash = hashPhone(phone, app.config.SIGAP_PHONE_PEPPER);
  const existing = app.db
    .select()
    .from(reporters)
    .where(eq(reporters.phoneHash, phoneHash))
    .get();
  if (existing) {
    if (!existing.waJid) {
      app.db
        .update(reporters)
        .set({ waJid: input.chatJid, updatedAt: new Date().toISOString() })
        .where(eq(reporters.id, existing.id))
        .run();
    }
    return existing;
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  app.db
    .insert(reporters)
    .values({
      id,
      unitId: DEFAULT_UNIT_ID,
      phoneHash,
      phoneEnc: encryptPhone(phone, app.config.SIGAP_PHONE_KEY),
      waJid: input.chatJid,
      // Kalau WhatsApp hanya memberi LID, angka yang tersimpan bukan nomor telepon.
      phoneVerified: !isLidJid(input.senderJid) && !isLidJid(input.chatJid),
      name: "Belum diisi",
      consentVersion: CONSENT_VERSION,
      consentAt: now,
      reportCount: 0,
      validCount: 0,
      falseCount: 0,
      blockedAt: null,
      blockedReason: null,
      createdAt: now,
      updatedAt: now
    })
    .run();
  return app.db.select().from(reporters).where(eq(reporters.id, id)).get()!;
}

function getConversation(app: FastifyInstance, waJid: string) {
  const existing = app.db
    .select()
    .from(conversations)
    .where(eq(conversations.waJid, waJid))
    .get();
  if (existing) return existing;

  const id = randomUUID();
  const now = new Date().toISOString();
  app.db
    .insert(conversations)
    .values({
      id,
      waJid,
      reporterId: null,
      state: "IDLE",
      contextJson: "{}",
      expiresAt: conversationExpiry(),
      updatedAt: now
    })
    .run();
  return app.db.select().from(conversations).where(eq(conversations.id, id)).get()!;
}

function saveConversation(
  app: FastifyInstance,
  id: string,
  state: string,
  context: ConversationContext,
  reporterId?: string
): void {
  app.db
    .update(conversations)
    .set({
      state,
      contextJson: JSON.stringify(context),
      reporterId: reporterId ?? null,
      expiresAt: conversationExpiry(),
      updatedAt: new Date().toISOString()
    })
    .where(eq(conversations.id, id))
    .run();
}

function mergeMediaIds(context: ConversationContext, ids: string[] | undefined): void {
  if (!ids?.length) return;
  const current = new Set(context.mediaIds ?? []);
  for (const id of ids) current.add(id);
  context.mediaIds = [...current].slice(-10);
}

function mediaCountText(count: number): string {
  return count === 1 ? "1 media tersimpan" : `${count} media tersimpan`;
}

function recordMediaAttached(app: FastifyInstance, ticketId: string, count: number): void {
  if (count <= 0) return;
  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId,
      actorType: "system",
      actorId: null,
      fromStatus: null,
      toStatus: null,
      note: `${count} media dilampirkan dari WhatsApp`,
      createdAt: new Date().toISOString()
    })
    .run();
}

function updateReporterName(app: FastifyInstance, reporterId: string, name: string): void {
  app.db
    .update(reporters)
    .set({ name, updatedAt: new Date().toISOString() })
    .where(eq(reporters.id, reporterId))
    .run();
}

function rateLimited(app: FastifyInstance, reporterId: string): boolean {
  const active = app.db
    .select()
    .from(tickets)
    .where(and(eq(tickets.reporterId, reporterId), inArray(tickets.status, ACTIVE_STATUSES)))
    .all().length;
  if (active >= 3) return true;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const recent = app.db
    .select()
    .from(tickets)
    .where(and(eq(tickets.reporterId, reporterId), gte(tickets.createdAt, since)))
    .all().length;
  return recent >= 10;
}

function createTicket(
  app: FastifyInstance,
  input: NormalizedInbound,
  reporter: typeof reporters.$inferSelect,
  context: ConversationContext,
  options: { emergency: boolean; priority?: "P1" | "P2" | "P3" | "P4" }
): { ticket: typeof tickets.$inferSelect; drafts: OutboxDraft[]; afterCommit: () => void } {
  const settings = readSettings(app.db, app.config);
  const category = context.category ?? inferCategory(context.description ?? "");
  const categoryMeta = CATEGORY_META[category];
  const priority = options.priority ?? (options.emergency ? "P1" : categoryMeta.defaultPriority);
  const description =
    context.description?.trim() || (options.emergency ? "Laporan darurat tanpa deskripsi." : "");
  const emergencyGist = options.emergency ? emergencyDetail(description).slice(0, 90) : "";
  const title = options.emergency
    ? `DARURAT ${categoryMeta.short}${emergencyGist ? `: ${emergencyGist}` : ""}`
    : description.slice(0, 120) || `Laporan ${categoryMeta.short}`;
  const ticketId = randomUUID();
  const ticketNo = nextTicketNumber(app.db, app.config, app.sqlite);
  const now = new Date().toISOString();

  app.db
    .insert(tickets)
    .values({
      id: ticketId,
      unitId: DEFAULT_UNIT_ID,
      ticketNo,
      reporterId: reporter.id,
      category,
      priority,
      status: "baru",
      title,
      description: description || null,
      address: context.address ?? null,
      lat: context.lat ?? null,
      lng: context.lng ?? null,
      accuracyM: context.accuracyM ?? null,
      regionId: context.regionId ?? null,
      locationStatus: context.locationStatus ?? "needs_verification",
      source: "wa",
      clusterId: null,
      assignedTo: null,
      acknowledgedBy: null,
      ackAt: null,
      otwAt: null,
      arriveAt: null,
      closedAt: null,
      closeNote: null,
      rejectReason: null,
      internalNote: options.emergency
        ? "Dibuat otomatis dari kata kunci/lokasi darurat WhatsApp."
        : null,
      isDemo: false,
      createdAt: now,
      updatedAt: now
    })
    .run();

  app.db
    .update(reporters)
    .set({ reportCount: sql`${reporters.reportCount} + 1`, updatedAt: now })
    .where(eq(reporters.id, reporter.id))
    .run();

  const attachedMedia = linkMediaToTicket(app.db, ticketId, context.mediaIds, {
    reporterId: reporter.id,
    waChatJid: input.chatJid
  });

  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId,
      actorType: "system",
      actorId: null,
      fromStatus: null,
      toStatus: "baru",
      note: options.emergency ? "Tiket darurat dibuat dari WhatsApp" : "Tiket dibuat dari WhatsApp",
      createdAt: now
    })
    .run();

  recordMediaAttached(app, ticketId, attachedMedia);

  writeAudit(app.db, {
    unitId: DEFAULT_UNIT_ID,
    actorId: null,
    action: "ticket.create.wa",
    entity: "ticket",
    entityId: ticketId,
    meta: { emergency: options.emergency, category, priority, media: attachedMedia },
    ip: null,
    userAgent: null
  });

  const drafts: OutboxDraft[] = [
    reply(
      input.chatJid,
      [
        options.emergency ? "Laporan DARURAT diterima." : "Laporan diterima.",
        `Nomor tiket: ${ticketNo}`,
        `Prioritas: ${priority} (${PRIORITY_META[priority].label})`,
        "Piket akan menindaklanjuti. Balas STATUS untuk cek status."
      ].join("\n")
    )
  ];

  // Grup URC TIDAK dikabari di sini; tiket diteruskan setelah piket menerima
  // laporan (lihat dispatchTicketToUrc di routes/tickets.ts).

  const afterCommit = () => {
    app.bus.broadcast("ticket.updated", {
      id: ticketId,
      ticketNo,
      status: "baru",
      priority,
      title,
      regionId: context.regionId ?? null
    });
    if (priority === "P1") {
      void sendPushToRoles(app, ["piket", "pawas", "kapolsek"], {
        title: "SIGAP — P1 baru",
        body: `${ticketNo} · ${title}`,
        url: `/?ticket=${ticketId}`,
        tag: `ticket-${ticketId}`
      });
    }
  };

  return {
    ticket: app.db.select().from(tickets).where(eq(tickets.id, ticketId)).get()!,
    drafts,
    afterCommit
  };
}

function updateTicketLocation(
  app: FastifyInstance,
  ticketId: string,
  context: ConversationContext
): void {
  const now = new Date().toISOString();
  app.db
    .update(tickets)
    .set({
      lat: context.lat ?? null,
      lng: context.lng ?? null,
      accuracyM: context.accuracyM ?? null,
      regionId: context.regionId ?? null,
      locationStatus: context.locationStatus ?? "needs_verification",
      address: context.address ?? null,
      updatedAt: now
    })
    .where(eq(tickets.id, ticketId))
    .run();
  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId,
      actorType: "system",
      actorId: null,
      fromStatus: null,
      toStatus: null,
      note: "Lokasi/alamat dilengkapi via WhatsApp",
      createdAt: now
    })
    .run();
  const settings = readSettings(app.db, app.config);
  const ticket = app.db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (settings.waGroupUrcJid && ticket?.ackAt) {
    const regionName = ticket.regionId
      ? (app.db.select().from(regions).where(eq(regions.id, ticket.regionId)).get()?.name ?? null)
      : null;
    const peta =
      ticket.lat !== null
        ? urcMaps(ticket.lat, ticket.lng)
        : ticket.address && looksLikeLink(ticket.address)
          ? ticket.address
          : "-";
    enqueueOutbox(
      app.db,
      reply(
        settings.waGroupUrcJid,
        [
          `📍 Update lokasi #${ticket.ticketNo}`,
          `Lokasi: ${[ticket.address, regionName ? `Desa/Kel. ${regionName}` : null].filter(Boolean).join(" · ") || "-"}`,
          `Peta: ${peta}`
        ].join("\n")
      )
    );
  }
}

/**
 * Lokasi darurat terdeteksi di luar wilkum. Tiket TIDAK ditolak otomatis:
 * lokasi disimpan dengan status "outside", piket & grup diberi tahu, dan
 * keputusan (teruskan ke Polsek tetangga / tolak) tetap di tangan petugas.
 */
function markOutsideEmergencyTicket(
  app: FastifyInstance,
  ticketId: string,
  context: ConversationContext,
  replies: OutboxDraft[],
  hooks: Array<() => void>
): void {
  const ticket = app.db.select().from(tickets).where(eq(tickets.id, ticketId)).get();
  if (!ticket) return;
  const now = new Date().toISOString();
  const note =
    "Lokasi yang dikirim pelapor terdeteksi DI LUAR wilkum. Tiket tetap aktif — piket wajib verifikasi lalu putuskan teruskan ke Polsek terdekat atau tolak.";
  app.db
    .update(tickets)
    .set({
      lat: context.lat ?? null,
      lng: context.lng ?? null,
      accuracyM: context.accuracyM ?? null,
      locationStatus: "outside",
      updatedAt: now
    })
    .where(eq(tickets.id, ticketId))
    .run();
  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId,
      actorType: "system",
      actorId: null,
      fromStatus: ticket.status,
      toStatus: ticket.status,
      note,
      createdAt: now
    })
    .run();
  const settings = readSettings(app.db, app.config);
  if (settings.waGroupUrcJid && ticket.ackAt) {
    const maps =
      context.lat !== undefined && context.lng !== undefined
        ? `https://maps.google.com/?q=${context.lat},${context.lng}`
        : "-";
    replies.push(
      reply(
        settings.waGroupUrcJid,
        `⚠️ ${ticket.ticketNo} — lokasi terdeteksi di luar wilkum (${maps}). Tiket TETAP AKTIF, piket mohon verifikasi.`
      )
    );
  }
  hooks.push(() => {
    app.bus.broadcast("ticket.updated", {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      status: ticket.status,
      priority: ticket.priority,
      title: ticket.title,
      regionId: ticket.regionId
    });
  });
}

function outsideEmergencyReply(
  app: FastifyInstance,
  nearestRegionId: string | null,
  regionList: RegionInput[]
): string {
  const settings = readSettings(app.db, app.config);
  const nearest = regionList.find((region) => region.id === nearestRegionId)?.name;
  return [
    `Lokasi yang Anda kirim tampaknya di luar wilayah hukum ${settings.unitName}.`,
    "Laporan darurat Anda TETAP diteruskan ke piket untuk diverifikasi.",
    nearest ? `Wilayah terdekat kami: ${nearest}.` : null,
    "Untuk respons tercepat, segera telepon 110."
  ]
    .filter(Boolean)
    .join("\n");
}

/** Kata pengisi yang tidak dihitung sebagai keterangan darurat. */
const EMERGENCY_FILLER =
  /\b(DARURAT|DARURATT+|TOLONG|TOLONGIN|SEGERA|CEPAT|URGENT|HELP|PAK|BU|BAPAK|POLISI|POLSEK|LAPOR|LAPORAN|TES|TEST|TESTING|COBA|ISENG|HALO|HAI|P|MIN|ADMIN)\b/gi;

function emergencyDetail(text: string): string {
  return text
    .replace(EMERGENCY_FILLER, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keterangan darurat dianggap cukup bila, setelah kata pengisi dibuang,
 * masih ada minimal 2 kata berbeda dan 8 huruf. "DARURAT" saja atau
 * "test test" tidak lolos, jadi tidak membuat tiket P1.
 */
function isMeaningfulEmergency(text: string): boolean {
  const detail = emergencyDetail(text);
  const words = new Set(
    detail
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length >= 2)
  );
  return detail.replace(/\s/g, "").length >= 8 && words.size >= 2;
}

function emergencyDescPrompt(): string {
  return [
    "Darurat apa yang sedang terjadi?",
    "Ceritakan singkat: kejadiannya apa, ada korban/pelaku/senjata?",
    'Contoh: "Ada begal bawa celurit, korban luka di depan Indomaret Kosambi".',
    "Boleh juga kirim voice note.",
    "⚠️ Laporan palsu/iseng akan ditolak, dicatat, dan nomor bisa diblokir."
  ].join("\n");
}

function emergencyCategoryMenu(): string {
  return [
    "Jenis kejadian darurat:",
    "1. Tawuran / keributan / pengeroyokan",
    "2. Kejahatan (begal, rampok, pencurian, penganiayaan)",
    "3. Bencana (banjir, pohon tumbang, longsor)",
    "4. Kecelakaan lalu lintas",
    "5. Kebakaran",
    "6. Lainnya",
    "Balas dengan angka."
  ].join("\n");
}

function emergencyConfirmText(): string {
  return [
    "Apakah ini kejadian DARURAT yang sedang berlangsung dan butuh petugas segera?",
    "1. YA — teruskan sebagai DARURAT",
    "2. TIDAK — buat laporan biasa",
    "Untuk darurat nyawa, tetap telepon 110."
  ].join("\n");
}

function outsideReply(
  app: FastifyInstance,
  nearestRegionId: string | null,
  regionList: RegionInput[]
): string {
  const settings = readSettings(app.db, app.config);
  const nearest = regionList.find((region) => region.id === nearestRegionId)?.name;
  return [
    `Lokasi kejadian berada di luar wilayah hukum ${settings.unitName}.`,
    nearest ? `Polsek terdekat/arah wilayah: ${nearest}.` : "Silakan hubungi Polsek terdekat.",
    "Untuk respons cepat, hubungi 110 atau SPKT Polsek setempat.",
    "Jika lokasi ini sebenarnya di dalam wilayah kami, balas BANTU."
  ].join("\n");
}

function statusText(ticket: typeof tickets.$inferSelect, timeZone = "Asia/Jakarta"): string {
  const status = STATUS_META[ticket.status as TicketStatus];
  return [
    `${ticket.ticketNo} · ${status.label}`,
    ticket.title,
    `Prioritas: ${ticket.priority}`,
    `Dibuat: ${formatLocalTime(ticket.createdAt, timeZone)}`,
    ticket.assignedTo ? "Petugas: sudah ditugaskan" : "Petugas: belum ditugaskan"
  ].join("\n");
}

function findLatestTicket(app: FastifyInstance, reporterId: string) {
  return app.db
    .select()
    .from(tickets)
    .where(eq(tickets.reporterId, reporterId))
    .orderBy(desc(tickets.createdAt))
    .limit(1)
    .get();
}

function findTicketByRef(app: FastifyInstance, reporterId: string, ref: string) {
  if (ref.includes("-")) {
    return app.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.reporterId, reporterId), eq(tickets.ticketNo, ref.toUpperCase())))
      .get();
  }
  const seq = ref.padStart(3, "0");
  return app.db
    .select()
    .from(tickets)
    .where(and(eq(tickets.reporterId, reporterId), like(tickets.ticketNo, `%-${seq}`)))
    .orderBy(desc(tickets.createdAt))
    .get();
}

const BLOCKED_NOTICE_INTERVAL_MS = 6 * 3600 * 1000;
/** Pesan per menit dari satu chat sebelum balasan bot ke chat itu ditahan. */
export const FLOOD_MAX_PER_MINUTE = 12;

function recentInboundCount(app: FastifyInstance, chatJid: string): number {
  const since = new Date(Date.now() - 60_000).toISOString();
  const row = app.sqlite
    .prepare(
      "SELECT COUNT(*) AS n FROM message_log WHERE direction = 'inbound' AND wa_jid = ? AND received_at >= ?"
    )
    .get(chatJid, since) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

/**
 * Pintu masuk pesan 1:1. Pesan tetap DIPROSES (laporan tidak boleh hilang),
 * tetapi bila satu chat membanjiri bot, balasan ke chat itu ditahan agar nomor
 * unit tidak dibanned WhatsApp karena mengirim ratusan pesan.
 */
export function handleInbound(
  app: FastifyInstance,
  input: NormalizedInbound
): ConversationResult {
  const result = handleInboundCore(app, input);
  if (input.isGroup) return result;
  const count = recentInboundCount(app, input.chatJid);
  if (count <= FLOOD_MAX_PER_MINUTE) return result;
  const others = result.replies.filter((draft) => draft.targetJid !== input.chatJid);
  if (count === FLOOD_MAX_PER_MINUTE + 1) {
    others.push(
      reply(
        input.chatJid,
        "Pesan Anda terlalu banyak dalam waktu singkat. Pesan tetap kami catat; balasan otomatis dijeda sebentar. Untuk darurat nyawa, telepon 110."
      )
    );
  }
  return { ...result, replies: others, reason: result.reason ?? "flood_throttled" };
}

function handleInboundCore(
  app: FastifyInstance,
  input: NormalizedInbound
): ConversationResult {
  if (input.isGroup) return { replies: [], reason: "group_message" };

  const text = (input.text ?? "").trim();
  const upper = text.toUpperCase();
  const reporter = getReporter(app, input);
  const conversation = getConversation(app, input.chatJid);
  let context = parseContext(conversation.contextJson);
  let state = conversation.state;
  const regionList = loadRegionInputs(app);
  const replies: OutboxDraft[] = [];
  const afterCommitHooks: Array<() => void> = [];
  const combineAfterCommit = () =>
    afterCommitHooks.length > 0
      ? () => {
          for (const fn of afterCommitHooks) fn();
        }
      : undefined;

  /**
   * Alur DARURAT anti-iseng: tiket P1 baru dibuat setelah keterangan kejadian,
   * jenis, nama, dan lokasi terisi. Setiap pemanggilan meminta bagian yang
   * masih kurang, atau membuat tiket bila sudah lengkap.
   */
  const advanceEmergency = (): ConversationResult => {
    if (!isMeaningfulEmergency(context.description ?? "") && !context.voiceDesc) {
      saveConversation(app, conversation.id, "AWAIT_EMERGENCY_DESC", context, reporter.id);
      replies.push(reply(input.chatJid, emergencyDescPrompt()));
      return { replies, afterCommit: combineAfterCommit() };
    }
    if (!context.category) {
      saveConversation(app, conversation.id, "AWAIT_EMERGENCY_CATEGORY", context, reporter.id);
      replies.push(reply(input.chatJid, emergencyCategoryMenu()));
      return { replies, afterCommit: combineAfterCommit() };
    }
    if (reporter.name === "Belum diisi" && !context.nameDone) {
      saveConversation(app, conversation.id, "AWAIT_NAME", context, reporter.id);
      replies.push(
        reply(input.chatJid, "Sebutkan nama lengkap Anda (nama asli) untuk laporan darurat ini.")
      );
      return { replies, afterCommit: combineAfterCommit() };
    }
    if (context.lat === undefined && !context.address) {
      saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Di mana kejadiannya? Lokasi WAJIB: kirim share location, link Google Maps, atau ketik alamat lengkap/nama desa."
        )
      );
      return { replies, afterCommit: combineAfterCommit() };
    }
    if (rateLimited(app, reporter.id)) {
      saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Anda masih memiliki 3 laporan aktif atau sudah mencapai batas 10 laporan/24 jam. Tunggu laporan sebelumnya ditangani. Untuk darurat nyawa, telepon 110."
        )
      );
      return { replies };
    }
    // Lokasi di luar wilkum TIDAK menolak laporan darurat; piket yang memutuskan.
    const outside = context.locationStatus === "outside";
    const nearestId = context.nearestRegionId ?? null;
    context.intent = "emergency";
    delete context.nameDone;
    delete context.voiceDesc;
    delete context.nearestRegionId;
    const created = createTicket(app, input, reporter, context, {
      emergency: true,
      priority: "P1"
    });
    afterCommitHooks.push(created.afterCommit);
    context.emergencyTicketId = created.ticket.id;
    replies.push(...created.drafts);
    if (outside) {
      app.db
        .insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId: created.ticket.id,
          actorType: "system",
          actorId: null,
          fromStatus: "baru",
          toStatus: "baru",
          note: "Lokasi yang dikirim pelapor terdeteksi DI LUAR wilkum. Tiket tetap aktif — piket wajib verifikasi lalu putuskan teruskan ke Polsek terdekat atau tolak.",
          createdAt: new Date().toISOString()
        })
        .run();
      replies.push(reply(input.chatJid, outsideEmergencyReply(app, nearestId, regionList)));
    }
    saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
    replies.push(reply(input.chatJid, "Kirim foto/video kejadian jika ada, atau ketik SELESAI."));
    return { replies, afterCommit: combineAfterCommit() };
  };

  const setDraftLocation = (loc: { lat: number; lng: number; accuracyM?: number }): void => {
    const classification = classifyLocation(loc, regionList);
    context.lat = loc.lat;
    context.lng = loc.lng;
    context.accuracyM = loc.accuracyM;
    context.regionId = classification.status === "outside" ? null : classification.regionId;
    context.locationStatus = classification.status;
    if (classification.status === "outside") {
      context.nearestRegionId = classification.nearestRegionId;
    }
  };

  const startEmergency = (
    sourceText: string,
    base: ConversationContext
  ): ConversationResult => {
    if (rateLimited(app, reporter.id)) {
      replies.push(
        reply(
          input.chatJid,
          "Anda masih memiliki 3 laporan aktif atau sudah mencapai batas 10 laporan/24 jam. Tunggu laporan sebelumnya ditangani. Untuk darurat nyawa, telepon 110."
        )
      );
      return { replies };
    }
    const description = [base.description, sourceText]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join("\n");
    const inferred = inferCategory(description);
    context = {
      ...(base.mediaIds?.length ? { mediaIds: base.mediaIds } : {}),
      intent: "emergency_draft",
      category: base.category ?? (inferred !== "lain" ? inferred : undefined),
      description,
      address: base.address,
      lat: base.lat,
      lng: base.lng,
      accuracyM: base.accuracyM,
      regionId: base.regionId ?? null,
      locationStatus: base.locationStatus ?? "needs_verification",
      ...(base.nameDone ? { nameDone: true } : {}),
      ...(base.voiceDesc ? { voiceDesc: true } : {})
    };
    if (input.location) setDraftLocation(input.location);
    return advanceEmergency();
  };

  if (
    reporter.blockedAt &&
    !(upper === "STATUS" || /^STATUS\s+[A-Z0-9-]+$/i.test(text)) &&
    upper !== "BANTU" &&
    upper !== "HELP"
  ) {
    // Balas pemberitahuan blokir paling banyak sekali per 6 jam; selebihnya
    // diam, supaya nomor yang diblokir tidak bisa memancing ratusan balasan.
    const lastNotice = reporter.lastNoticeAt ? new Date(reporter.lastNoticeAt).getTime() : 0;
    if (Date.now() - lastNotice < BLOCKED_NOTICE_INTERVAL_MS) {
      return { replies: [], reason: "blocked_silent" };
    }
    app.db
      .update(reporters)
      .set({ lastNoticeAt: new Date().toISOString() })
      .where(eq(reporters.id, reporter.id))
      .run();
    replies.push(
      reply(
        input.chatJid,
        "Nomor ini diblokir dari pembuatan laporan baru. Silakan hubungi SPKT Polsek untuk klarifikasi."
      )
    );
    return { replies };
  }

  // Expiry check runs FIRST before attaching media or reading stale context.
  if (
    conversation.expiresAt &&
    new Date(conversation.expiresAt) < new Date() &&
    state !== "IDLE" &&
    state !== "DONE"
  ) {
    context = {};
    state = "IDLE";
    saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
    const freshStart =
      upper === "LAPOR" ||
      upper === "LAPORAN" ||
      upper === "BANTU" ||
      upper === "HELP" ||
      upper === "BATAL" ||
      upper === "STATUS" ||
      /^STATUS\s+[A-Z0-9-]+$/i.test(text) ||
      isEmergencyText(text) ||
      input.type === "location";
    if (!freshStart) {
      replies.push(
        reply(
          input.chatJid,
          "Sesi laporan sebelumnya sudah kedaluwarsa. Ketik LAPOR untuk memulai lagi."
        )
      );
      return { replies };
    }
  }

  if (upper === "BATAL") {
    if (context.emergencyTicketId && state !== "IDLE" && state !== "DONE") {
      replies.push(
        reply(
          input.chatJid,
          "Laporan darurat sudah dibuat dan tidak bisa dibatalkan dari chat. Hubungi piket jika sudah tidak diperlukan."
        )
      );
      saveConversation(app, conversation.id, "DONE", {}, reporter.id);
    } else {
      saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
      replies.push(reply(input.chatJid, "Sesi dibatalkan. Ketik LAPOR jika ingin memulai lagi."));
    }
    return { replies };
  }

  if (upper === "BANTU" || upper === "HELP") {
    replies.push(reply(input.chatJid, helpText()));
    return { replies };
  }

  if (upper === "STATUS" || /^STATUS\s+[A-Z0-9-]+$/i.test(text)) {
    const ref = text.replace(/^STATUS\s*/i, "").trim();
    const ticket = ref ? findTicketByRef(app, reporter.id, ref) : findLatestTicket(app, reporter.id);
    replies.push(
      reply(
        input.chatJid,
        ticket
          ? statusText(ticket, readSettings(app.db, app.config).unitTimezone)
          : "Belum ada tiket atas nomor ini. Ketik LAPOR untuk membuat laporan."
      )
    );
    return { replies };
  }

  if (
    (state === "IDLE" || state === "DONE") &&
    (upper === "NAMA" || /^NAMA\s+\S+/i.test(text))
  ) {
    const newName = text.replace(/^NAMA\s*/i, "").trim();
    if (newName.length >= 3 && !/^\d+$/.test(newName)) {
      updateReporterName(app, reporter.id, newName);
      replies.push(reply(input.chatJid, `Nama diperbarui menjadi ${newName}.`));
      return { replies };
    }
    saveConversation(app, conversation.id, "AWAIT_NAME", { intent: "rename" }, reporter.id);
    replies.push(reply(input.chatJid, "Siapa nama lengkap Anda?"));
    return { replies };
  }

  if (input.mediaIds?.length) {
    mergeMediaIds(context, input.mediaIds);
    saveConversation(app, conversation.id, state, context, reporter.id);
    if (context.emergencyTicketId && state !== "IDLE" && state !== "DONE") {
      recordMediaAttached(
        app,
        context.emergencyTicketId,
        linkMediaToTicket(app.db, context.emergencyTicketId, input.mediaIds, {
          reporterId: reporter.id,
          waChatJid: input.chatJid
        })
      );
      const settings = readSettings(app.db, app.config);
      const emergencyTicket = app.db
        .select({ ticketNo: tickets.ticketNo, ackAt: tickets.ackAt })
        .from(tickets)
        .where(eq(tickets.id, context.emergencyTicketId))
        .get();
      // Media hanya diteruskan ke grup bila tiket sudah diterima piket.
      if (settings.waGroupUrcJid && emergencyTicket?.ackAt) {
        replies.push(
          ...groupMediaDrafts(
            app,
            context.emergencyTicketId,
            emergencyTicket.ticketNo,
            settings.waGroupUrcJid,
            input.mediaIds
          )
        );
      }
    }
  }

  if (
    input.mediaIds?.length &&
    context.lat === undefined &&
    ["AWAIT_LOCATION", "AWAIT_MEDIA"].includes(state)
  ) {
    let gps: { lat: number; lng: number } | null = null;
    for (const mediaId of input.mediaIds) {
      const media = getMediaRow(app.db, mediaId);
      if (!media?.exifGps) continue;
      try {
        const parsed = JSON.parse(media.exifGps) as { lat?: number; lng?: number };
        if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
          gps = { lat: parsed.lat as number, lng: parsed.lng as number };
          break;
        }
      } catch {
        // Ignore malformed EXIF JSON.
      }
    }
    if (gps && context.intent === "emergency_draft") {
      setDraftLocation(gps);
      replies.push(reply(input.chatJid, "Lokasi dari GPS foto digunakan."));
      return advanceEmergency();
    }
    if (gps) {
      const classification = classifyLocation({ ...gps }, regionList);
      if (classification.status === "outside") {
        replies.push(
          reply(
            input.chatJid,
            "GPS foto berada di luar wilayah hukum. Kirim lokasi kejadian secara manual (share location)."
          )
        );
        return { replies, afterCommit: combineAfterCommit() };
      }
      context.lat = gps.lat;
      context.lng = gps.lng;
      context.regionId = classification.regionId;
      context.locationStatus = classification.status;
      if (context.emergencyTicketId) {
        updateTicketLocation(app, context.emergencyTicketId, context);
      }
      saveConversation(
        app,
        conversation.id,
        state === "AWAIT_LOCATION" ? "AWAIT_MEDIA" : state,
        context,
        reporter.id
      );
      replies.push(
        reply(
          input.chatJid,
          `Lokasi dari GPS foto digunakan (${classification.status === "verified" ? "dalam wilayah" : "perlu verifikasi"}). Kirim media lain atau ketik SELESAI.`
        )
      );
      return { replies, afterCommit: combineAfterCommit() };
    }
  }

  const explicitEmergency = isExplicitEmergency(text);
  const idleLike = state === "IDLE" || state === "DONE";
  // Sesi darurat yang sedang dilengkapi (emergency_draft) tidak diulang dari awal
  // bila warga mengetik "darurat" lagi (mis. nama "Warga Darurat").
  const inReportFlow =
    !idleLike &&
    state !== "AWAIT_EMERGENCY_CONFIRM" &&
    !context.emergencyTicketId &&
    context.intent !== "emergency_draft";

  // Kata kunci (BANJIR, LAKA, dst.) dulu langsung membuat P1. Sekarang warga
  // diminta konfirmasi agar pesan biasa tidak memicu alarm & eskalasi palsu.
  if (state === "AWAIT_EMERGENCY_CONFIRM") {
    const pending = context.pendingText ?? "";
    if (explicitEmergency || ["1", "YA", "Y", "IYA"].includes(upper)) {
      return startEmergency(pending, { mediaIds: context.mediaIds });
    }
    if (["2", "TIDAK", "T", "BUKAN", "GAK", "NGGAK"].includes(upper)) {
      const category = inferCategory(pending);
      const next: ConversationContext = {
        intent: "report",
        ...(category !== "lain" ? { category } : {}),
        description: pending,
        ...(context.mediaIds?.length ? { mediaIds: context.mediaIds } : {})
      };
      if (reporter.name === "Belum diisi") {
        saveConversation(app, conversation.id, "AWAIT_NAME", next, reporter.id);
        replies.push(reply(input.chatJid, "Baik, kami catat sebagai laporan biasa. Siapa nama lengkap Anda?"));
        return { replies };
      }
      if (!next.category) {
        saveConversation(app, conversation.id, "AWAIT_CATEGORY", next, reporter.id);
        replies.push(reply(input.chatJid, `Baik, kami catat sebagai laporan biasa.\n${categoryMenu()}`));
        return { replies };
      }
      saveConversation(app, conversation.id, "AWAIT_LOCATION", next, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Baik, kami catat sebagai laporan biasa. Kirim lokasi kejadian (share location), atau ketik alamat/kelurahan. Lokasi WAJIB diisi."
        )
      );
      return { replies };
    }
    replies.push(reply(input.chatJid, emergencyConfirmText()));
    return { replies };
  }

  if (explicitEmergency && (idleLike || inReportFlow)) {
    const base: ConversationContext = inReportFlow
      ? context
      : { mediaIds: state === "IDLE" ? context.mediaIds : undefined };
    return startEmergency(text, base);
  }

  if (idleLike && isEmergencyText(text)) {
    saveConversation(
      app,
      conversation.id,
      "AWAIT_EMERGENCY_CONFIRM",
      {
        pendingText: text,
        ...(state === "IDLE" && context.mediaIds?.length ? { mediaIds: context.mediaIds } : {})
      },
      reporter.id
    );
    replies.push(reply(input.chatJid, emergencyConfirmText()));
    return { replies };
  }

  // Share location tanpa konteks: mulai laporan dengan lokasi terisi, bukan P1.
  if (idleLike && input.type === "location" && input.location) {
    if (rateLimited(app, reporter.id)) {
      replies.push(
        reply(
          input.chatJid,
          "Anda masih memiliki 3 laporan aktif atau sudah mencapai batas 10 laporan/24 jam. Tunggu laporan sebelumnya ditangani."
        )
      );
      return { replies };
    }
    const classification = classifyLocation(input.location, regionList);
    if (classification.status === "outside") {
      replies.push(
        reply(input.chatJid, outsideReply(app, classification.nearestRegionId, regionList))
      );
      saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
      return { replies };
    }
    const next: ConversationContext = {
      intent: "report",
      lat: input.location.lat,
      lng: input.location.lng,
      accuracyM: input.location.accuracyM,
      regionId: classification.regionId,
      locationStatus: classification.status,
      ...(state === "IDLE" && context.mediaIds?.length ? { mediaIds: context.mediaIds } : {})
    };
    if (reporter.name === "Belum diisi") {
      saveConversation(app, conversation.id, "AWAIT_NAME", next, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Lokasi diterima. Jika ini DARURAT yang sedang terjadi, ketik DARURAT.\nSebelum lanjut, siapa nama lengkap Anda?"
        )
      );
      return { replies };
    }
    saveConversation(app, conversation.id, "AWAIT_CATEGORY", next, reporter.id);
    replies.push(
      reply(
        input.chatJid,
        `Lokasi diterima. Jika ini DARURAT yang sedang terjadi, ketik DARURAT.\n${categoryMenu()}`
      )
    );
    return { replies };
  }

  if (
    input.type === "location" &&
    input.location &&
    context.intent === "emergency_draft" &&
    state !== "IDLE" &&
    state !== "DONE"
  ) {
    setDraftLocation(input.location);
    return advanceEmergency();
  }

  if (input.type === "location" && state === "AWAIT_LOCATION") {
    const classification = classifyLocation(input.location!, regionList);
    if (classification.status === "outside") {
      if (context.emergencyTicketId) {
        // Jangan tolak otomatis: polygon/GPS bisa meleset dan darurat di
        // perbatasan tetap butuh keputusan petugas.
        context.lat = input.location!.lat;
        context.lng = input.location!.lng;
        context.accuracyM = input.location!.accuracyM;
        context.locationStatus = "outside";
        markOutsideEmergencyTicket(app, context.emergencyTicketId, context, replies, afterCommitHooks);
        replies.push(
          reply(input.chatJid, outsideEmergencyReply(app, classification.nearestRegionId, regionList))
        );
        saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
        return { replies, afterCommit: combineAfterCommit() };
      }
      replies.push(
        reply(input.chatJid, outsideReply(app, classification.nearestRegionId, regionList))
      );
      saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
      return { replies, afterCommit: combineAfterCommit() };
    }
    context.lat = input.location!.lat;
    context.lng = input.location!.lng;
    context.accuracyM = input.location!.accuracyM;
    context.regionId = classification.regionId;
    context.locationStatus = classification.status;
    if (context.emergencyTicketId) {
      updateTicketLocation(app, context.emergencyTicketId, context);
      saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
      replies.push(reply(input.chatJid, "Lokasi tersimpan. Kirim detail/foto atau ketik SELESAI."));
    } else {
      saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
      replies.push(reply(input.chatJid, "Lokasi diterima. Kirim foto/video atau ketik SELESAI."));
    }
    return { replies };
  }

  switch (state) {
    case "IDLE":
    case "DONE": {
      if (upper === "LAPOR" || upper === "1" || upper === "LAPORAN") {
        const idleMediaIds = state === "IDLE" ? context.mediaIds : undefined;
        if (rateLimited(app, reporter.id)) {
          replies.push(
            reply(
              input.chatJid,
              "Anda masih memiliki 3 laporan aktif atau sudah mencapai batas 10 laporan/24 jam. Tunggu laporan sebelumnya ditangani."
            )
          );
          return { replies };
        }
        const freshContext: ConversationContext = {
          intent: "report",
          ...(idleMediaIds?.length ? { mediaIds: idleMediaIds } : {})
        };
        if (reporter.name === "Belum diisi") {
          saveConversation(app, conversation.id, "AWAIT_NAME", freshContext, reporter.id);
          replies.push(reply(input.chatJid, "Sebelum mulai, siapa nama lengkap Anda?"));
          return { replies };
        }
        saveConversation(app, conversation.id, "AWAIT_CATEGORY", freshContext, reporter.id);
        replies.push(reply(input.chatJid, categoryMenu()));
        return { replies };
      }
      if (input.mediaIds?.length) {
        replies.push(
          reply(
            input.chatJid,
            `${mediaCountText(context.mediaIds?.length ?? input.mediaIds.length)}. Ketik LAPOR untuk membuat laporan dengan media ini.`
          )
        );
        return { replies };
      }
      replies.push(
        reply(
          input.chatJid,
          welcomeText(reporter.name === "Belum diisi" ? null : reporter.name)
        )
      );
      return { replies };
    }

    case "AWAIT_NAME": {
      // Warga sering mengirim link lokasi saat ditanya nama. Link dipakai
      // sebagai lokasi, bukan disimpan sebagai nama pelapor.
      if (looksLikeLink(text)) {
        if (context.intent !== "rename" && context.lat === undefined && !context.address) {
          context.address = text.slice(0, 500);
          context.locationStatus = "needs_verification";
          if (context.emergencyTicketId) {
            updateTicketLocation(app, context.emergencyTicketId, context);
          }
          saveConversation(app, conversation.id, "AWAIT_NAME", context, reporter.id);
          replies.push(
            reply(input.chatJid, "Link lokasi dicatat. Sekarang ketik nama lengkap Anda (bukan link).")
          );
          return { replies };
        }
        replies.push(reply(input.chatJid, "Itu terlihat seperti link, bukan nama. Ketik nama lengkap Anda."));
        return { replies };
      }
      if (text.length < 3 || /^\d+$/.test(text)) {
        replies.push(reply(input.chatJid, "Nama minimal 3 karakter. Siapa nama lengkap Anda?"));
        return { replies };
      }
      updateReporterName(app, reporter.id, text);
      replies.push(reply(input.chatJid, `Terima kasih, ${text}.`));
      if (context.intent === "rename") {
        saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
        return { replies };
      }
      if (context.intent === "emergency_draft") {
        context.nameDone = true;
        return advanceEmergency();
      }
      if (context.intent === "emergency") {
        if (context.lat !== undefined || context.address) {
          saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
          replies.push(reply(input.chatJid, "Kirim detail/foto jika ada, atau ketik SELESAI."));
        } else {
          saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
          replies.push(
            reply(
              input.chatJid,
              "Lokasi kejadian WAJIB diisi agar tim bisa meluncur: kirim share location, link Google Maps, atau ketik alamat lengkap/nama desa."
            )
          );
        }
        return { replies };
      }
      // Laporan biasa yang kategori/deskripsinya sudah terisi (mis. dari
      // konfirmasi "bukan darurat") langsung lanjut ke tahap berikutnya.
      if (context.category && context.description) {
        const nextState =
          context.lat !== undefined || context.address ? "AWAIT_MEDIA" : "AWAIT_LOCATION";
        saveConversation(app, conversation.id, nextState, context, reporter.id);
        replies.push(
          reply(
            input.chatJid,
            nextState === "AWAIT_MEDIA"
              ? "Kirim foto/video atau ketik SELESAI."
              : "Kirim lokasi kejadian (share location), atau ketik alamat/kelurahan. Lokasi WAJIB diisi."
          )
        );
        return { replies };
      }
      saveConversation(app, conversation.id, "AWAIT_CATEGORY", context, reporter.id);
      replies.push(reply(input.chatJid, categoryMenu()));
      return { replies };
    }

    case "AWAIT_EMERGENCY_DESC": {
      if (input.type === "audio" && input.mediaIds?.length) {
        context.voiceDesc = true;
        context.description = [context.description, "(Kronologi via voice note)"]
          .filter(Boolean)
          .join("\n");
        return advanceEmergency();
      }
      if (isMeaningfulEmergency(text)) {
        context.description = [context.description, text]
          .filter((part): part is string => Boolean(part && part.trim()))
          .join("\n")
          .slice(0, 4000);
        if (!context.category) {
          const inferred = inferCategory(text);
          if (inferred !== "lain") context.category = inferred;
        }
        return advanceEmergency();
      }
      replies.push(reply(input.chatJid, `Keterangan belum jelas. ${emergencyDescPrompt()}`));
      return { replies };
    }

    case "AWAIT_EMERGENCY_CATEGORY": {
      const category = parseCategory(text);
      if (!category) {
        replies.push(reply(input.chatJid, emergencyCategoryMenu()));
        return { replies };
      }
      context.category = category;
      return advanceEmergency();
    }

    case "AWAIT_CATEGORY": {
      const category = parseCategory(text);
      if (!category) {
        replies.push(reply(input.chatJid, categoryMenu()));
        return { replies };
      }
      context.category = category;
      if (context.description && context.description.length >= 3) {
        // Deskripsi sudah ada (pesan awal "bukan darurat" atau "Ubah kategori"
        // dari ringkasan): jangan minta ulang.
        if (context.lat !== undefined || context.address) {
          saveConversation(app, conversation.id, "CONFIRM", context, reporter.id);
          replies.push(reply(input.chatJid, confirmText(context, regionList)));
          return { replies };
        }
        saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
        replies.push(
          reply(
            input.chatJid,
            "Kirim lokasi kejadian (share location), atau ketik alamat/kelurahan. Lokasi WAJIB diisi."
          )
        );
        return { replies };
      }
      context.description = undefined;
      saveConversation(app, conversation.id, "AWAIT_DESC", context, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Ceritakan kejadiannya secara singkat. Anda juga bisa kirim voice note."
        )
      );
      return { replies };
    }

    case "AWAIT_DESC": {
      if (upper === "LEWATI") {
        context.description = "";
      } else if (input.type !== "text" && input.type !== "unknown") {
        context.description = text || `Lampiran ${input.type} dari WhatsApp.`;
      } else if (text.length >= 3) {
        context.description = text;
      } else {
        replies.push(reply(input.chatJid, "Deskripsi terlalu pendek. Ceritakan minimal 3 karakter."));
        return { replies };
      }
      if (context.lat !== undefined || context.address) {
        // Lokasi sudah dikirim di awal (share location/link); jangan ditanya lagi.
        saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
        replies.push(
          reply(input.chatJid, "Lokasi sudah tersimpan. Kirim foto/video atau ketik SELESAI.")
        );
        return { replies };
      }
      saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          "Sekarang kirim lokasi kejadian (share location), atau ketik alamat/kelurahan. Lokasi WAJIB diisi."
        )
      );
      return { replies };
    }

    case "AWAIT_LOCATION": {
      // Lokasi wajib untuk semua laporan (biasa maupun darurat).
      if (upper === "LEWATI" || upper === "SELESAI") {
        replies.push(
          reply(input.chatJid, `Laporan tidak bisa diproses tanpa lokasi. ${locationPrompt()}`)
        );
        return { replies, afterCommit: combineAfterCommit() };
      }
      if (text.length >= 3 && context.intent === "emergency_draft") {
        const region = findRegionByName(regionList, text);
        context.address = text.slice(0, 500);
        context.regionId = region?.id ?? null;
        context.locationStatus = "needs_verification";
        return advanceEmergency();
      }
      if (text.length >= 3) {
        const region = findRegionByName(regionList, text);
        context.address = text;
        context.regionId = region?.id ?? null;
        context.locationStatus = "needs_verification";
        if (context.emergencyTicketId) updateTicketLocation(app, context.emergencyTicketId, context);
        saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
        replies.push(
          reply(
            input.chatJid,
            "Alamat dicatat. Piket akan memverifikasi. Kirim foto/video atau ketik SELESAI."
          )
        );
        return { replies };
      }
      replies.push(reply(input.chatJid, locationPrompt()));
      return { replies, afterCommit: combineAfterCommit() };
    }

    case "AWAIT_MEDIA": {
      if (input.mediaError) {
        replies.push(
          reply(
            input.chatJid,
            "Media gagal diunduh dari WhatsApp. Silakan kirim ulang, atau ketik SELESAI untuk melanjutkan tanpa media."
          )
        );
        return { replies, afterCommit: combineAfterCommit() };
      }
      if (input.mediaIds?.length) {
        const total = context.mediaIds?.length ?? input.mediaIds.length;
        replies.push(
          reply(
            input.chatJid,
            `${mediaCountText(total)}. Kirim media lain, atau ketik SELESAI untuk ${
              context.emergencyTicketId ? "menyelesaikan" : "membuat tiket"
            }.`
          )
        );
        return { replies, afterCommit: combineAfterCommit() };
      }
      if (["SELESAI", "KIRIM", "1"].includes(upper)) {
        if (context.lat === undefined && !context.address) {
          saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
          replies.push(reply(input.chatJid, `Lokasi kejadian belum ada. ${locationPrompt()}`));
          return { replies, afterCommit: combineAfterCommit() };
        }
        if (context.emergencyTicketId) {
          saveConversation(app, conversation.id, "DONE", {}, reporter.id);
          replies.push(
            reply(
              input.chatJid,
              "Laporan darurat Anda sudah diteruskan ke piket. Setelah diterima piket, tim URC akan meluncur. Balas STATUS untuk cek status."
            )
          );
        } else {
          saveConversation(app, conversation.id, "CONFIRM", context, reporter.id);
          replies.push(reply(input.chatJid, confirmText(context, regionList)));
        }
        return { replies };
      }
      if (input.type === "text" && text.length >= 2) {
        if (context.emergencyTicketId) {
          const ticket = app.db
            .select()
            .from(tickets)
            .where(eq(tickets.id, context.emergencyTicketId))
            .get();
          if (ticket) {
            const now = new Date().toISOString();
            const mergedDesc = ticket.description
              ? `${ticket.description}\n${text}`
              : text;
            app.db
              .update(tickets)
              .set({ description: mergedDesc.slice(0, 4000), updatedAt: now })
              .where(eq(tickets.id, ticket.id))
              .run();
            app.db
              .insert(ticketEvents)
              .values({
                id: randomUUID(),
                ticketId: ticket.id,
                actorType: "reporter",
                actorId: reporter.id,
                fromStatus: ticket.status,
                toStatus: ticket.status,
                note: `Detail tambahan: ${text.slice(0, 500)}`,
                createdAt: now
              })
              .run();
            afterCommitHooks.push(() => {
              app.bus.broadcast("ticket.updated", {
                id: ticket.id,
                ticketNo: ticket.ticketNo,
                status: ticket.status,
                priority: ticket.priority,
                title: ticket.title,
                regionId: ticket.regionId
              });
            });
          }
          replies.push(
            reply(input.chatJid, "Detail tambahan dicatat. Kirim foto/video lain atau ketik SELESAI.")
          );
          return { replies, afterCommit: combineAfterCommit() };
        }
        context.description = context.description
          ? `${context.description}\n${text}`.slice(0, 4000)
          : text;
        saveConversation(app, conversation.id, "AWAIT_MEDIA", context, reporter.id);
        replies.push(
          reply(
            input.chatJid,
            "Detail tambahan dicatat. Kirim foto/video atau ketik SELESAI untuk melanjutkan."
          )
        );
        return { replies };
      }
      replies.push(
        reply(
          input.chatJid,
          `Ketik SELESAI untuk ${
            context.emergencyTicketId ? "menyelesaikan" : "membuat tiket"
          }, atau kirim foto/video/voice note.`
        )
      );
      return { replies };
    }

    case "CONFIRM": {
      if (["1", "KIRIM", "YA"].includes(upper)) {
        if (context.lat === undefined && !context.address) {
          saveConversation(app, conversation.id, "AWAIT_LOCATION", context, reporter.id);
          replies.push(reply(input.chatJid, `Lokasi kejadian belum ada. ${locationPrompt()}`));
          return { replies };
        }
        if (rateLimited(app, reporter.id)) {
          saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
          replies.push(
            reply(input.chatJid, "Batas laporan aktif tercapai. Tunggu laporan sebelumnya ditangani.")
          );
          return { replies };
        }
        const created = createTicket(app, input, reporter, context, { emergency: false });
        replies.push(...created.drafts);
        saveConversation(app, conversation.id, "DONE", {}, reporter.id);
        return { replies, afterCommit: created.afterCommit };
      }
      if (["2", "BATAL"].includes(upper)) {
        saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
        replies.push(reply(input.chatJid, "Laporan dibatalkan. Ketik LAPOR untuk memulai lagi."));
        return { replies };
      }
      if (["3", "UBAH"].includes(upper)) {
        saveConversation(app, conversation.id, "AWAIT_CATEGORY", context, reporter.id);
        replies.push(reply(input.chatJid, categoryMenu()));
        return { replies };
      }
      replies.push(reply(input.chatJid, confirmText(context, regionList)));
      return { replies };
    }

    default: {
      saveConversation(app, conversation.id, "IDLE", {}, reporter.id);
      replies.push(
        reply(
          input.chatJid,
          welcomeText(reporter.name === "Belum diisi" ? null : reporter.name)
        )
      );
      return { replies };
    }
  }
}

type GroupRefResult =
  | { kind: "found"; ticket: typeof tickets.$inferSelect }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "none" };

/**
 * Nomor urut tiket reset setiap hari, jadi "/selesai 003" tidak boleh asal
 * mengambil tiket 003 terbaru (bisa milik kemarin). Urutan:
 * 1. tiket hari ini (zona waktu unit) dengan nomor urut itu;
 * 2. kalau tidak ada: tiket AKTIF dengan nomor urut itu — hanya bila tepat satu;
 * 3. lebih dari satu kandidat → minta nomor lengkap.
 */
export function resolveGroupTicketRef(app: FastifyInstance, ref: string): GroupRefResult {
  if (ref.includes("-")) {
    const ticket = app.db
      .select()
      .from(tickets)
      .where(eq(tickets.ticketNo, ref.toUpperCase()))
      .get();
    return ticket ? { kind: "found", ticket } : { kind: "none" };
  }
  const digits = ref.replace(/\D/g, "");
  if (!digits) return { kind: "none" };
  const seq = digits.padStart(3, "0");
  const settings = readSettings(app.db, app.config);
  const today = ticketDateCode(new Date(), settings.unitTimezone);
  const todays = app.db
    .select()
    .from(tickets)
    .where(like(tickets.ticketNo, `%-${today}-${seq}`))
    .orderBy(desc(tickets.createdAt))
    .get();
  if (todays) return { kind: "found", ticket: todays };

  const active = app.db
    .select()
    .from(tickets)
    .where(and(like(tickets.ticketNo, `%-${seq}`), inArray(tickets.status, ACTIVE_STATUSES)))
    .orderBy(desc(tickets.createdAt))
    .limit(5)
    .all();
  if (active.length === 1) return { kind: "found", ticket: active[0]! };
  if (active.length > 1) {
    return { kind: "ambiguous", candidates: active.map((item) => item.ticketNo) };
  }
  return { kind: "none" };
}

export function handleGroupCommand(
  app: FastifyInstance,
  input: GroupCommandInput
): ConversationResult {
  const trimmed = input.text.trim();

  if (/^\/id\b/i.test(trimmed)) {
    const numericId = input.groupJid.split("@")[0] ?? input.groupJid;
    return {
      replies: [
        reply(
          input.groupJid,
          [
            `*ID grup ini:* ${numericId}`,
            `JID lengkap: ${input.groupJid}`,
            "",
            "Salin angka ID grup ke Sistem → ID grup URC atau Sistem → Grup WhatsApp.",
            "Jangan memakai link invite."
          ].join("\n")
        )
      ]
    };
  }

  const match = /^\/(otw|tiba|selesai|tunda|status)\s+([A-Za-z0-9-]+)\s*([\s\S]*)$/i.exec(trimmed);
  if (!match) return { replies: [], reason: "invalid_command" };

  const command = (match[1] ?? "").toLowerCase();
  const ref = (match[2] ?? "").trim();
  const note = (match[3] ?? "").trim();
  const group = app.db.select().from(waGroups).where(eq(waGroups.jid, input.groupJid)).get();
  if (!group || !group.active) return { replies: [], reason: "group_not_registered" };

  const cleanSenderJid = stripWhatsAppDevice(input.senderJid);
  const officer = app.db
    .select()
    .from(officers)
    .where(eq(officers.waJid, cleanSenderJid))
    .get();
  if (!officer || !officer.active) {
    return {
      replies: [
        reply(
          input.groupJid,
          [
            "Nomor WhatsApp pengirim belum terdaftar sebagai petugas SIGAP.",
            "Minta admin mendaftarkan nomor ini di menu Petugas, lalu kirim ulang perintah."
          ].join("\n")
        )
      ],
      reason: "unknown_officer"
    };
  }

  const resolved = resolveGroupTicketRef(app, ref);
  if (resolved.kind === "ambiguous") {
    return {
      replies: [
        reply(
          input.groupJid,
          [
            `Nomor pendek ${ref} cocok dengan beberapa tiket aktif: ${resolved.candidates.join(", ")}.`,
            `Ulangi perintah dengan nomor lengkap, contoh: /${command} ${resolved.candidates[0]}`
          ].join("\n")
        )
      ],
      reason: "ambiguous_ref"
    };
  }
  const ticket = resolved.kind === "found" ? resolved.ticket : null;

  if (!ticket) {
    return { replies: [reply(input.groupJid, `Tiket ${ref} tidak ditemukan.`)] };
  }

  if (command === "status") {
    return { replies: [reply(input.groupJid, statusText(ticket, readSettings(app.db, app.config).unitTimezone))] };
  }

  const to: TicketStatus =
    command === "otw"
      ? "otw"
      : command === "tiba"
        ? "ditkp"
        : command === "selesai"
          ? "selesai"
          : "ditunda";
  if (!canTransition(ticket.status as TicketStatus, to, officer.role as Role)) {
    const statusAllowed = ALLOWED_TRANSITIONS[ticket.status as TicketStatus]?.includes(to);
    const allowedRoles = (TRANSITION_ROLES[`${ticket.status}->${to}`] ?? []).filter(
      (role) => role !== "system" && role !== "reporter"
    );
    return {
      replies: [
        reply(
          input.groupJid,
          statusAllowed
            ? [
                `Nomor ini terdaftar sebagai *${officer.role}*. Role ${officer.role} tidak berhak \`/${command}\` untuk tiket status ${ticket.status}.`,
                `Role yang diizinkan: ${allowedRoles.join(", ") || "-"}.`
              ].join("\n")
            : `Tidak bisa ${command} ${ticket.ticketNo} dari status ${ticket.status}.`
        )
      ]
    };
  }
  if (to === "ditunda" && !note) {
    return {
      replies: [
        reply(
          input.groupJid,
          `Sertakan alasan: balas pesan tiket dengan TUNDA <alasan>, atau /tunda ${ref} <alasan>`
        )
      ]
    };
  }

  const attachedMedia =
    command === "selesai"
      ? linkMediaToTicket(app.db, ticket.id, input.mediaIds, { waChatJid: input.groupJid })
      : 0;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const patch: Record<string, unknown> = { status: to, updatedAt: now };
  if (to === "otw") {
    patch.assignedTo = officer.id;
    patch.otwAt = now;
  }
  if (to === "ditkp") patch.arriveAt = now;
  if (to === "selesai") {
    patch.closedAt = now;
    patch.closeNote = note || "Ditangani via grup URC";
  }
  if (to === "ditunda") {
    const stamp = `${formatLocalTime(nowDate, readSettings(app.db, app.config).unitTimezone)} · ${officer.name}`;
    const entry = `[${stamp}] [DITUNDA] ${note}`;
    patch.internalNote = ticket.internalNote ? `${ticket.internalNote}\n${entry}` : entry;
  }

  app.db.update(tickets).set(patch).where(eq(tickets.id, ticket.id)).run();
  if (to === "selesai" && ticket.status !== "selesai") {
    app.db
      .update(reporters)
      .set({ validCount: sql`${reporters.validCount} + 1`, updatedAt: now })
      .where(eq(reporters.id, ticket.reporterId))
      .run();
  }
  app.db
    .insert(ticketEvents)
    .values({
      id: randomUUID(),
      ticketId: ticket.id,
      actorType: "officer",
      actorId: officer.id,
      fromStatus: ticket.status,
      toStatus: to,
      note: note || null,
      createdAt: now
    })
    .run();
  recordMediaAttached(app, ticket.id, attachedMedia);
  writeAudit(app.db, {
    unitId: DEFAULT_UNIT_ID,
    actorId: officer.id,
    action: "ticket.group_command",
    entity: "ticket",
    entityId: ticket.id,
    meta: { command, from: ticket.status, to, media: attachedMedia },
    ip: null,
    userAgent: null
  });

  const replies: OutboxDraft[] = [
    reply(input.groupJid, groupStatusMessage(ticket.ticketNo, to, note, attachedMedia, officer.name))
  ];

  if (!ticket.isDemo) {
    const reporter = app.db
      .select()
      .from(reporters)
      .where(eq(reporters.id, ticket.reporterId))
      .get();
    const targetJid = reporter
      ? resolveReporterJid(reporter, app.config.SIGAP_PHONE_KEY)
      : null;
    if (targetJid) {
      replies.push(reply(targetJid, reporterStatusMessage(ticket.ticketNo, to, note, officer.name)));
    }
  }

  return {
    replies,
    afterCommit: () => {
      app.bus.broadcast("ticket.updated", {
        id: ticket.id,
        ticketNo: ticket.ticketNo,
        status: to,
        priority: ticket.priority,
        title: ticket.title,
        regionId: ticket.regionId
      });
    }
  };
}

export function enqueueConversationReplies(
  app: FastifyInstance,
  replies: OutboxDraft[]
): void {
  for (const draft of replies) enqueueOutbox(app.db, draft);
}
