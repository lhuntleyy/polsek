import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppConfig } from "@sigap/config";
import {
  CATEGORY_META,
  formatTicketNumber,
  type Category,
  type Priority,
  type TicketStatus
} from "@sigap/core";
import type { DbHandle } from "./client.js";
import {
  clusters,
  officers,
  regions,
  reporters,
  settings,
  ticketEvents,
  tickets,
  units,
  waGroups
} from "./schema.js";
import { hashPassword } from "../lib/auth.js";
import { encryptPhone, encryptTotpSecret, hashPhone } from "../lib/crypto.js";
import { CONSENT_VERSION, DEFAULT_UNIT_ID } from "../lib/constants.js";
import { ensureDefaultSettings } from "../lib/settings.js";

const nowIso = () => new Date().toISOString();
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const secondsAfter = (iso: string, seconds: number) =>
  new Date(new Date(iso).getTime() + seconds * 1000).toISOString();

function demoPolygon(lat: number, lng: number, rLat = 0.0062, rLng = 0.0068) {
  return {
    type: "Polygon" as const,
    coordinates: [
      [
        [lng - rLng * 0.3, lat + rLat * 0.95],
        [lng + rLng * 0.72, lat + rLat * 0.55],
        [lng + rLng, lat - rLat * 0.1],
        [lng + rLng * 0.55, lat - rLat * 0.78],
        [lng - rLng * 0.35, lat - rLat],
        [lng - rLng * 0.92, lat - rLat * 0.45],
        [lng - rLng * 0.8, lat + rLat * 0.35],
        [lng - rLng * 0.3, lat + rLat * 0.95]
      ]
    ]
  };
}

const DEMO_REGIONS = [
  { id: "region_pekyon", name: "Pekayon Jaya", lat: -6.26, lng: 106.982 },
  { id: "region_jakasetia", name: "Jakasetia", lat: -6.24, lng: 106.977 },
  { id: "region_margajaya", name: "Marga Jaya", lat: -6.267, lng: 106.973 },
  { id: "region_kayuringin", name: "Kayuringin Jaya", lat: -6.244, lng: 106.993 },
  { id: "region_jakamulya", name: "Jakamulya", lat: -6.255, lng: 106.997 }
];

const DEMO_OFFICERS = [
  { username: "piket", name: "Bripka Andi Saputra", rank: "Bripka", role: "piket", regionId: null, waJid: "628000000001@s.whatsapp.net" },
  { username: "piket2", name: "Brigadir Siti Nurhaliza", rank: "Brigadir", role: "piket", regionId: null, waJid: "628000000002@s.whatsapp.net" },
  { username: "pawas", name: "Ipda Fajar Nugroho", rank: "Ipda", role: "pawas", regionId: null, waJid: "628000000003@s.whatsapp.net" },
  { username: "kapolsek", name: "AKP Hendra Wijaya", rank: "AKP", role: "kapolsek", regionId: null, waJid: "628000000004@s.whatsapp.net" },
  { username: "urc", name: "Aiptu Rina Marlina", rank: "Aiptu", role: "urc", regionId: null, waJid: "628000000005@s.whatsapp.net" },
  { username: "urc2", name: "Aipda Bayu Pratama", rank: "Aipda", role: "urc", regionId: null, waJid: "628000000006@s.whatsapp.net" },
  { username: "bhabin_pekyon", name: "Bripka Dedi Kurniawan", rank: "Bripka", role: "bhabin", regionId: "region_pekyon", waJid: "628000000007@s.whatsapp.net" },
  { username: "bhabin_jakasetia", name: "Bripka Sari Wulandari", rank: "Bripka", role: "bhabin", regionId: "region_jakasetia", waJid: "628000000008@s.whatsapp.net" },
  { username: "bhabin_margajaya", name: "Bripka Agus Salim", rank: "Bripka", role: "bhabin", regionId: "region_margajaya", waJid: "628000000009@s.whatsapp.net" }
];

const DEMO_REPORTERS = [
  { name: "Rizky Maulana", phone: "081234567134" },
  { name: "Siti Aminah", phone: "081298765432" },
  { name: "Ahmad Fauzi", phone: "085712345678" },
  { name: "Dewi Lestari", phone: "081377788899" },
  { name: "Bagas Pratama", phone: "082112223333" },
  { name: "Nur Hidayah", phone: "081399900011" },
  { name: "Hendra Gunawan", phone: "081255566677" },
  { name: "Maya Sari", phone: "085800011122" }
];

interface SeedTicket {
  seq: number;
  minutesAgo: number;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  title: string;
  regionId: string;
  address: string;
  lat: number;
  lng: number;
  accuracy: number;
  reporter: string;
  description: string;
  assigneeUsername?: string;
  closeNote?: string;
  rejectReason?: string;
  internalNote?: string;
}

const DEMO_TICKETS: SeedTicket[] = [
  {
    seq: 1, minutesAgo: 2, category: "tawuran", priority: "P1", status: "baru",
    title: "Tawuran antar kelompok di Jl. Raya Pekayon",
    regionId: "region_pekyon", address: "Jl. Raya Pekayon No. 88, dekat pasar",
    lat: -6.2588, lng: 106.9812, accuracy: 9, reporter: "Rizky Maulana",
    description: "Dua kelompok pemuda terlibat saling lempar di depan pasar. Sekitar 15 orang, ada yang membawa kayu. Warga takut keluar rumah."
  },
  {
    seq: 2, minutesAgo: 6, category: "pidana", priority: "P2", status: "baru",
    title: "Pencurian motor di parkiran minimarket",
    regionId: "region_jakasetia", address: "Jl. Jakasetia Raya, parkiran minimarket",
    lat: -6.2412, lng: 106.9782, accuracy: 14, reporter: "Siti Aminah",
    description: "Motor Honda Beat hitam hilang sekitar 20 menit lalu. Pelaku terlihat memakai jaket hitam dan helm full face. Ada rekaman CCTV."
  },
  {
    seq: 3, minutesAgo: 12, category: "laka", priority: "P2", status: "diterima",
    title: "Laka lantas motor vs mobil, satu korban luka",
    regionId: "region_kayuringin", address: "Jl. Ahmad Yani, depan SPBU",
    lat: -6.2449, lng: 106.9921, accuracy: 11, reporter: "Dewi Lestari",
    description: "Korban pengendara motor tergeletak, sudah dibawa warga ke pinggir jalan. Mobil putih kabur ke arah barat.",
    assigneeUsername: "piket"
  },
  {
    seq: 4, minutesAgo: 18, category: "bencana", priority: "P3", status: "otw",
    title: "Pohon tumbang menutup jalan",
    regionId: "region_margajaya", address: "Jl. Marga Jaya ujung, dekat lapangan",
    lat: -6.2681, lng: 106.9718, accuracy: 22, reporter: "Bagas Pratama",
    description: "Pohon besar tumbang melintang jalan. Belum ada korban, tetapi akses warga terputus.",
    assigneeUsername: "urc"
  },
  {
    seq: 5, minutesAgo: 28, category: "tawuran", priority: "P1", status: "ditkp",
    title: "Tawuran susulan di depan sekolah",
    regionId: "region_pekyon", address: "Jl. Pendidikan, depan SMPN 12",
    lat: -6.2612, lng: 106.984, accuracy: 8, reporter: "Rizky Maulana",
    description: "Tawuran susulan, sekitar 20 orang. Tim sudah di lokasi, situasi mulai terkendali.",
    assigneeUsername: "urc"
  },
  {
    seq: 6, minutesAgo: 48, category: "tawuran", priority: "P3", status: "ditunda",
    title: "Suara petasan sejak pukul 21.00",
    regionId: "region_jakasetia", address: "Jl. Jakasetia RT 02/RW 01",
    lat: -6.2391, lng: 106.9757, accuracy: 28, reporter: "Maya Sari",
    description: "Suara petasan berulang, warga resah. Tidak terlihat sumbernya.",
    internalNote: "Patroli sudah lewat, tidak ditemukan sumber suara. Akan dicek lagi."
  },
  {
    seq: 7, minutesAgo: 72, category: "bencana", priority: "P2", status: "selesai",
    title: "Banjir surut, warga mulai bersih-bersih",
    regionId: "region_margajaya", address: "Jl. Marga Jaya RT 04/RW 02",
    lat: -6.2652, lng: 106.9735, accuracy: 15, reporter: "Ahmad Fauzi",
    description: "Air mulai surut sejak pukul 20.30. Warga bergotong royong membersihkan lumpur.",
    assigneeUsername: "urc",
    closeNote: "Banjir surut pukul 21.05. Pompa air dibantu Damkar. Dua lansia dievakuasi. Situasi kondusif."
  },
  {
    seq: 8, minutesAgo: 105, category: "laka", priority: "P3", status: "selesai",
    title: "Kemacetan panjang akibat kendaraan mogok",
    regionId: "region_kayuringin", address: "Jl. Tol Jatiasih, arah Jakarta",
    lat: -6.2428, lng: 106.995, accuracy: 35, reporter: "Hendra Gunawan",
    description: "Truk mogok di lajur kanan, antrean sekitar 2 km. Petugas derek sudah di lokasi.",
    assigneeUsername: "piket",
    closeNote: "Kendaraan dievakuasi pukul 22.10. Arus lalu lintas kembali normal."
  }
];

export async function seedDatabase(config: AppConfig, handle: DbHandle): Promise<void> {
  const { db } = handle;
  const createdAt = nowIso();

  db.insert(units)
    .values({
      id: DEFAULT_UNIT_ID,
      code: config.SIGAP_UNIT_CODE.toUpperCase(),
      name: config.SIGAP_UNIT_NAME,
      address: config.SIGAP_UNIT_ADDRESS,
      timezone: config.SIGAP_UNIT_TIMEZONE,
      createdAt
    })
    .onConflictDoNothing()
    .run();

  ensureDefaultSettings(db, config);

  await ensureOfficer(db, config, {
    username: config.SIGAP_ADMIN_USERNAME,
    password: config.SIGAP_ADMIN_PASSWORD,
    name: config.SIGAP_ADMIN_NAME,
    rank: null,
    role: "admin",
    regionId: null,
    waJid: null,
    totpSecret: config.SIGAP_ADMIN_TOTP_SECRET || null
  });

  if (config.isProduction || !config.seedDemo) return;

  for (const region of DEMO_REGIONS) {
    const existing = db.select().from(regions).where(eq(regions.id, region.id)).get();
    if (existing) continue;
    const geojson = demoPolygon(region.lat, region.lng);
    db.insert(regions)
      .values({
        id: region.id,
        unitId: DEFAULT_UNIT_ID,
        name: region.name,
        level: "kelurahan",
        parentId: null,
        geojson: JSON.stringify(geojson),
        centroidLat: region.lat,
        centroidLng: region.lng,
        active: true,
        isDemo: true,
        version: 1,
        createdAt,
        updatedAt: createdAt
      })
      .run();
  }

  const officerIds = new Map<string, string>();
  for (const officer of DEMO_OFFICERS) {
    const id = await ensureOfficer(db, config, {
      username: officer.username,
      password: "Demo#12345",
      name: officer.name,
      rank: officer.rank,
      role: officer.role,
      regionId: officer.regionId,
      waJid: officer.waJid,
      totpSecret: null
    });
    officerIds.set(officer.username, id);
  }

  if (config.SIGAP_WA_GROUP_URC_JID) {
    const existingGroup = db
      .select()
      .from(waGroups)
      .where(eq(waGroups.jid, config.SIGAP_WA_GROUP_URC_JID))
      .get();
    if (!existingGroup) {
      db.insert(waGroups)
        .values({
          id: randomUUID(),
          unitId: DEFAULT_UNIT_ID,
          name: "URC (demo)",
          jid: config.SIGAP_WA_GROUP_URC_JID,
          purpose: "urc",
          active: true,
          createdAt: nowIso()
        })
        .run();
    }
  }

  const reporterIds = new Map<string, string>();
  for (const reporter of DEMO_REPORTERS) {
    const id = ensureReporter(db, config, reporter.name, reporter.phone);
    reporterIds.set(reporter.name, id);
  }

  const demoCount = db.select().from(tickets).all().filter((t) => t.isDemo).length;
  if (demoCount > 0) return;

  const date = new Date();
  for (const item of DEMO_TICKETS) {
    const createdAtTicket = minutesAgo(item.minutesAgo);
    const ticketNo = formatTicketNumber(
      config.SIGAP_UNIT_CODE,
      date,
      item.seq,
      config.SIGAP_UNIT_TIMEZONE
    );
    const ticketId = randomUUID();
    const reporterId = reporterIds.get(item.reporter);
    if (!reporterId) continue;
    const assignee = item.assigneeUsername
      ? officerIds.get(item.assigneeUsername) ?? null
      : null;
    const ackAt =
      item.status === "baru" || item.status === "ditolak"
        ? null
        : secondsAfter(createdAtTicket, 60);
    const otwAt =
      ["otw", "ditkp", "selesai"].includes(item.status)
        ? secondsAfter(createdAtTicket, 240)
        : null;
    const arriveAt =
      ["ditkp", "selesai"].includes(item.status)
        ? secondsAfter(createdAtTicket, 840)
        : null;
    const closedAt = item.status === "selesai" ? secondsAfter(createdAtTicket, 2520) : null;

    db.insert(tickets)
      .values({
        id: ticketId,
        unitId: DEFAULT_UNIT_ID,
        ticketNo,
        reporterId,
        category: item.category,
        priority: item.priority,
        status: item.status,
        title: item.title,
        description: item.description,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        accuracyM: item.accuracy,
        regionId: item.regionId,
        locationStatus: "verified",
        source: "demo",
        clusterId: null,
        assignedTo: assignee,
        acknowledgedBy: ackAt ? officerIds.get("piket") ?? null : null,
        ackAt,
        otwAt,
        arriveAt,
        closedAt,
        closeNote: item.closeNote ?? null,
        rejectReason: item.rejectReason ?? null,
        internalNote: item.internalNote ?? null,
        isDemo: true,
        createdAt: createdAtTicket,
        updatedAt: nowIso()
      })
      .run();

    db.insert(ticketEvents)
      .values({
        id: randomUUID(),
        ticketId,
        actorType: "system",
        actorId: null,
        fromStatus: null,
        toStatus: "baru",
        note: "Tiket demo dibuat",
        createdAt: createdAtTicket
      })
      .run();

    if (item.status !== "baru") {
      db.insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId,
          actorType: "officer",
          actorId: officerIds.get("piket") ?? null,
          fromStatus: "baru",
          toStatus: "diterima",
          note: null,
          createdAt: ackAt ?? createdAtTicket
        })
        .run();
    }
    if (otwAt) {
      db.insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId,
          actorType: "officer",
          actorId: assignee,
          fromStatus: "diterima",
          toStatus: "otw",
          note: null,
          createdAt: otwAt
        })
        .run();
    }
    if (arriveAt) {
      db.insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId,
          actorType: "officer",
          actorId: assignee,
          fromStatus: "otw",
          toStatus: "ditkp",
          note: null,
          createdAt: arriveAt
        })
        .run();
    }
    if (closedAt) {
      db.insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId,
          actorType: "officer",
          actorId: assignee,
          fromStatus: "ditkp",
          toStatus: "selesai",
          note: item.closeNote ?? null,
          createdAt: closedAt
        })
        .run();
    }
    if (item.status === "ditunda") {
      db.insert(ticketEvents)
        .values({
          id: randomUUID(),
          ticketId,
          actorType: "officer",
          actorId: officerIds.get("piket") ?? null,
          fromStatus: "diterima",
          toStatus: "ditunda",
          note: item.internalNote ?? null,
          createdAt: secondsAfter(createdAtTicket, 360)
        })
        .run();
    }
  }

  for (const reporter of DEMO_REPORTERS) {
    const reporterId = reporterIds.get(reporter.name);
    if (!reporterId) continue;
    const count = db
      .select()
      .from(tickets)
      .all()
      .filter((t) => t.reporterId === reporterId).length;
    db.update(reporters)
      .set({ reportCount: count, validCount: count, updatedAt: nowIso() })
      .where(eq(reporters.id, reporterId))
      .run();
  }
}

async function ensureOfficer(
  db: DbHandle["db"],
  config: AppConfig,
  input: {
    username: string;
    password: string;
    name: string;
    rank: string | null;
    role: string;
    regionId: string | null;
    waJid: string | null;
    totpSecret: string | null;
  }
): Promise<string> {
  const existing = db.select().from(officers).where(eq(officers.username, input.username)).get();
  if (existing) {
    if (input.waJid && !existing.waJid) {
      db.update(officers)
        .set({ waJid: input.waJid, updatedAt: nowIso() })
        .where(eq(officers.id, existing.id))
        .run();
    }
    return existing.id;
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  db.insert(officers)
    .values({
      id,
      unitId: DEFAULT_UNIT_ID,
      username: input.username,
      passwordHash,
      totpSecret: input.totpSecret
        ? encryptTotpSecret(input.totpSecret, config.SIGAP_PHONE_KEY)
        : null,
      totpEnabled: Boolean(input.totpSecret),
      // Di produksi, password admin awal berasal dari file env yang dibaca
      // banyak orang saat deploy; wajib diganti saat login pertama.
      mustChangePassword: config.isProduction,
      name: input.name,
      rank: input.rank,
      role: input.role,
      phone: null,
      waJid: input.waJid,
      regionId: input.regionId,
      active: true,
      lastLoginAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    })
    .run();
  return id;
}

function ensureReporter(
  db: DbHandle["db"],
  config: AppConfig,
  name: string,
  phone: string
): string {
  const phoneHash = hashPhone(phone, config.SIGAP_PHONE_PEPPER);
  const existing = db.select().from(reporters).where(eq(reporters.phoneHash, phoneHash)).get();
  if (existing) return existing.id;

  const id = randomUUID();
  db.insert(reporters)
    .values({
      id,
      unitId: DEFAULT_UNIT_ID,
      phoneHash,
      phoneEnc: encryptPhone(phone, config.SIGAP_PHONE_KEY),
      name,
      consentVersion: CONSENT_VERSION,
      consentAt: nowIso(),
      reportCount: 0,
      validCount: 0,
      falseCount: 0,
      blockedAt: null,
      blockedReason: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    })
    .run();
  return id;
}
