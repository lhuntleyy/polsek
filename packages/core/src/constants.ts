import type {
  Category,
  Priority,
  Role,
  TicketStatus,
  TransitionActor
} from "./types.js";

export const CATEGORY_META: Record<
  Category,
  { label: string; short: string; icon: string; color: string; defaultPriority: Priority }
> = {
  tawuran: {
    label: "Gangguan Kamtibmas",
    short: "Kamtibmas",
    icon: "i-fight",
    color: "#FFB020",
    defaultPriority: "P2"
  },
  pidana: {
    label: "Tindak Pidana",
    short: "Tindak Pidana",
    icon: "i-shield",
    color: "#FF7A45",
    defaultPriority: "P2"
  },
  bencana: {
    label: "Bencana & Lingkungan",
    short: "Bencana",
    icon: "i-disaster",
    color: "#4D9FFF",
    defaultPriority: "P2"
  },
  laka: {
    label: "Laka & Kemacetan",
    short: "Laka & Macet",
    icon: "i-traffic",
    color: "#B18CFF",
    defaultPriority: "P2"
  },
  kebakaran: {
    label: "Kebakaran",
    short: "Kebakaran",
    icon: "i-fire",
    color: "#FF5A5F",
    defaultPriority: "P1"
  },
  lain: {
    label: "Lainnya",
    short: "Lainnya",
    icon: "i-alert",
    color: "#8A9BAA",
    defaultPriority: "P3"
  }
};

export const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  baru: { label: "BARU", color: "#FFB020" },
  diterima: { label: "DITERIMA", color: "#4D9FFF" },
  otw: { label: "OTW", color: "#8B8CFF" },
  ditkp: { label: "DI TKP", color: "#2DD4BF" },
  selesai: { label: "SELESAI", color: "#36D399" },
  ditunda: { label: "DITUNDA", color: "#94A3B8" },
  ditolak: { label: "DITOLAK", color: "#64748B" },
  dibatalkan: { label: "DIBATALKAN", color: "#64748B" }
};

export const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  P1: { label: "DARURAT", color: "#FF5A5F" },
  P2: { label: "TINGGI", color: "#FFB020" },
  P3: { label: "NORMAL", color: "#8A9BAA" },
  P4: { label: "INFORMASI", color: "#5D7080" }
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  kapolsek: "Kapolsek",
  pawas: "Perwira Pengawas",
  piket: "Piket SPKT",
  urc: "URC / Patroli",
  bhabin: "Bhabinkamtibmas"
};

export const ACTIVE_STATUSES: TicketStatus[] = [
  "baru",
  "diterima",
  "otw",
  "ditkp",
  "ditunda"
];

export const FINAL_STATUSES: TicketStatus[] = ["selesai", "ditolak", "dibatalkan"];

export const PRIMARY_NEXT: Partial<Record<TicketStatus, TicketStatus>> = {
  baru: "diterima",
  diterima: "otw",
  otw: "ditkp",
  ditkp: "selesai",
  ditunda: "diterima"
};

export const STATUS_SORT_ORDER: Record<TicketStatus, number> = {
  baru: 0,
  diterima: 1,
  otw: 2,
  ditkp: 3,
  ditunda: 4,
  selesai: 5,
  ditolak: 6,
  dibatalkan: 7
};

export const PRIORITY_SORT_ORDER: Record<Priority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3
};

export const SLA_TARGETS: Record<
  Priority,
  { ackSeconds: number; otwSeconds: number; arriveSeconds: number; closeSeconds: number }
> = {
  P1: { ackSeconds: 120, otwSeconds: 300, arriveSeconds: 900, closeSeconds: 0 },
  P2: { ackSeconds: 600, otwSeconds: 1800, arriveSeconds: 3600, closeSeconds: 28800 },
  P3: { ackSeconds: 1800, otwSeconds: 7200, arriveSeconds: 14400, closeSeconds: 86400 },
  P4: { ackSeconds: 14400, otwSeconds: 0, arriveSeconds: 0, closeSeconds: 259200 }
};

/**
 * Transisi yang valid secara domain. Actor/role diperiksa terpisah.
 */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  baru: ["diterima", "ditolak", "dibatalkan"],
  diterima: ["otw", "ditunda", "ditolak"],
  otw: ["ditkp", "ditunda"],
  ditkp: ["selesai", "ditunda"],
  ditunda: ["diterima", "otw", "ditolak"],
  selesai: ["diterima"],
  ditolak: ["diterima"],
  dibatalkan: []
};

/**
 * Role yang boleh melakukan transisi. "system" hanya untuk pembatalan otomatis
 * dan "reporter" hanya untuk membatalkan laporan sebelum diterima.
 */
export const TRANSITION_ROLES: Record<string, TransitionActor[]> = {
  "baru->diterima": ["piket", "pawas", "admin"],
  "baru->ditolak": ["piket", "pawas", "admin"],
  "baru->dibatalkan": ["reporter", "system"],
  "diterima->otw": ["piket", "urc", "pawas", "admin"],
  "diterima->ditunda": ["piket", "pawas", "admin"],
  "diterima->ditolak": ["piket", "pawas", "admin"],
  "otw->ditkp": ["urc", "piket", "pawas", "admin"],
  "otw->ditunda": ["urc", "piket", "pawas", "admin"],
  "ditkp->selesai": ["urc", "piket", "pawas", "admin"],
  "ditkp->ditunda": ["urc", "piket", "pawas", "admin"],
  "ditunda->diterima": ["piket", "pawas", "admin"],
  "ditunda->otw": ["piket", "pawas", "admin"],
  "ditunda->ditolak": ["piket", "pawas", "admin"],
  "selesai->diterima": ["pawas", "admin"],
  "ditolak->diterima": ["pawas", "admin"]
};

export const REJECT_REASONS = [
  "palsu",
  "tidak_dapat_diverifikasi",
  "di_luar_wilkum",
  "duplikat",
  "bukan_kewenangan",
  "lainnya"
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const SOURCE_TYPES = ["wa", "telepon", "walk-in", "patroli", "demo"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
