export type Role = "admin" | "kapolsek" | "pawas" | "piket" | "urc" | "bhabin";

export type TicketStatus =
  | "baru"
  | "diterima"
  | "otw"
  | "ditkp"
  | "selesai"
  | "ditunda"
  | "ditolak"
  | "dibatalkan";

export type Priority = "P1" | "P2" | "P3" | "P4";

export interface User {
  id: string;
  username: string | null;
  name: string;
  role: Role;
  unitId: string;
  regionId: string | null;
  totpEnabled: boolean;
  /** Password awal/reset dari admin; wajib diganti sebelum memakai aplikasi. */
  mustChangePassword?: boolean;
}

export interface Unit {
  name: string;
  code: string;
  address?: string;
  timezone: string;
}

export interface Reporter {
  name: string;
  phoneMasked: string;
  reportCount: number;
  validCount: number;
  verified: boolean;
}

export interface Ticket {
  id: string;
  ticketNo: string;
  title: string;
  category: string;
  categoryLabel: string;
  priority: Priority;
  status: TicketStatus;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  regionId: string | null;
  region: string | null;
  locationStatus: string | null;
  source: string;
  assignedTo: string | null;
  assignee: string | null;
  ackAt: string | null;
  otwAt: string | null;
  arriveAt: string | null;
  closedAt: string | null;
  closeNote: string | null;
  rejectReason: string | null;
  internalNote: string | null;
  escalatedPawasAt: string | null;
  escalatedKapolsekAt: string | null;
  duplicateOf: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  reporter: Reporter;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorType: string;
  actorId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: string;
}

export interface TicketMedia {
  id: string;
  kind: "image" | "video" | "audio";
  mime: string;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationS: number | null;
  exifGps: { lat: number; lng: number } | null;
  caption: string | null;
  createdAt: string;
  url: string;
  thumbUrl: string | null;
}

export interface TicketDetail {
  ticket: Ticket;
  events: TicketEvent[];
  media?: TicketMedia[];
}

export interface PublicConfig {
  unit: Unit;
  version: string;
  env?: string;
  demoEnabled?: boolean;
  features: { whatsapp: boolean; map: boolean };
}

export interface Officer {
  id: string;
  name: string;
  rank: string | null;
  role: Role;
  regionId: string | null;
  waJid: string | null;
  active: boolean;
}

export interface UnitSettings {
  unitName: string;
  unitCode: string;
  unitAddress: string;
  unitTimezone: string;
  waNumber: string;
  waOwner: string;
  waGroupUrcJid: string;
  dpoName: string;
  retentionDays: number;
  slaP1AckSeconds: number;
  slaP1OtwSeconds: number;
  escalationPawasSeconds: number;
  escalationKapolsekSeconds: number;
  alarmSoundRequired: boolean;
  piiMasking: boolean;
}

export interface SystemStatus {
  version: string;
  env: string;
  uptimeSeconds: number;
  db: { sizeBytes: number | null; wal: boolean };
  gateway: { number: string | null; owner: string | null; status: string };
  gatewayState?: WaGateway;
  outbox: Record<string, number>;
  demo: { regions: number; tickets: number; enabled: boolean };
  retentionDays: number;
  dpoName: string;
}

export interface WaGateway {
  status: "disconnected" | "connecting" | "qr" | "connected";
  qr: string | null;
  qrExpiresAt: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  botSeenAt: string | null;
  botOnline: boolean;
  error: string | null;
  updatedAt: string | null;
  pendingCommand: "connect" | "disconnect" | "logout" | "restart" | null;
  pendingCommandId: string | null;
}

export interface Region {
  id: string;
  name: string;
  level: string;
  parentId: string | null;
  geojson: unknown;
  center: { lat: number; lng: number };
  active: boolean;
  isDemo: boolean;
  version: number;
  ticketCount: number;
}

export interface DuplicateTicket {
  id: string;
  ticketNo: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  lat: number | null;
  lng: number | null;
  regionId: string | null;
  region: string | null;
  createdAt: string;
  reporterName: string;
  distanceM: number | null;
  minutesAgo: number;
}

export interface HandoverTicket {
  id: string;
  ticketNo: string;
  title: string;
  category: string;
  categoryLabel: string;
  priority: Priority;
  status: TicketStatus;
  region: string | null;
  assignee: string | null;
  reporterName: string;
  createdAt: string;
  ackAt: string | null;
  otwAt: string | null;
  internalNote: string | null;
  ageMinutes: number;
}

export interface HandoverRecord {
  id: string;
  shift: string;
  shiftLabel: string;
  officerName: string | null;
  incomingName: string | null;
  signedByName: string | null;
  startedAt: string;
  endedAt: string | null;
  signedAt: string | null;
  notes: string | null;
  checklist: Record<string, boolean>;
}

export interface HandoverSummary {
  generatedAt: string;
  tickets: HandoverTicket[];
  counts: {
    active: number;
    p1: number;
    unassigned: number;
    waitingAck: number;
    waitingOtw: number;
    delayed: number;
    noName: number;
    failedMedia: number;
  };
  checks: {
    p1Acknowledged: boolean;
    delayedReasons: boolean;
    namesComplete: boolean;
    mediaChecked: boolean;
    queueReviewed: boolean;
  };
  lastHandover: HandoverRecord | null;
  history: HandoverRecord[];
}

export interface HandoverPayload {
  shift: "pagi" | "siang" | "malam";
  incomingName: string;
  notes: string;
  signedByName: string;
  checklist: Record<string, boolean>;
}

export interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

export interface ManualTicketPayload {
  reporterName: string;
  reporterPhone: string;
  category: string;
  priority?: Priority;
  title: string;
  description?: string;
  address?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  regionId?: string;
  source: string;
  reporterConsent: true;
}

export interface AnalyticsSummary {
  period: { from: string | null; to: string | null };
  total: number;
  active: number;
  closed: number;
  rejected?: number;
  falseReports: number;
  p1Active: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  byRegion: Array<{ id: string; name: string; count: number }>;
  daily: Array<{ date: string; total: number; p1: number; closed: number }>;
  heatmap: { days: string[]; hours: number[]; values: number[][] };
  hotspots: Array<{
    lat: number;
    lng: number;
    category: string;
    region: string | null;
    count: number;
    lastAt: string;
  }>;
  targets: { ackSeconds: number; otwSeconds: number };
  sla: {
    p1Total: number;
    p1AckTotal: number;
    p1AckWithinTarget: number;
    p1OtwTotal: number;
    p1OtwWithinTarget: number;
  };
  response: {
    avgAckSeconds: number | null;
    medianAckSeconds: number | null;
    p90AckSeconds: number | null;
    avgOtwSeconds: number | null;
    medianOtwSeconds: number | null;
    p90OtwSeconds: number | null;
    avgCloseSeconds: number | null;
    medianCloseSeconds: number | null;
    p90CloseSeconds: number | null;
  };
}

export interface WaGroup {
  id: string;
  unitId: string;
  name: string;
  jid: string;
  purpose: string;
  active: boolean;
  createdAt: string;
}

export interface ReporterRecord {
  id: string;
  name: string;
  phoneMasked: string;
  reportCount: number;
  validCount: number;
  falseCount: number;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export interface PushKeyResponse {
  publicKey: string | null;
  configured: boolean;
}

export interface DigestResult {
  ok: boolean;
  queued: number;
  date: string;
  skipped?: "outside_window" | "already_sent" | "no_recipient";
}
