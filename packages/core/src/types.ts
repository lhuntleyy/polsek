import type { MultiPolygon, Polygon } from "geojson";

export const TICKET_STATUSES = [
  "baru",
  "diterima",
  "otw",
  "ditkp",
  "selesai",
  "ditunda",
  "ditolak",
  "dibatalkan"
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CATEGORIES = [
  "tawuran",
  "pidana",
  "bencana",
  "laka",
  "kebakaran",
  "lain"
] as const;
export type Category = (typeof CATEGORIES)[number];

export const ROLES = ["admin", "kapolsek", "pawas", "piket", "urc", "bhabin"] as const;
export type Role = (typeof ROLES)[number];

export type TransitionActor = Role | "system" | "reporter";

export type GeoPolygon = Polygon | MultiPolygon;

export interface RegionInput {
  id: string;
  name: string;
  geojson: GeoPolygon;
  center: { lat: number; lng: number };
  isDemo?: boolean;
}

export interface LocationInput {
  lat: number;
  lng: number;
  accuracyM?: number;
}

export type LocationStatus = "verified" | "needs_verification" | "outside";

export interface LocationClassification {
  status: LocationStatus;
  regionId: string | null;
  nearestRegionId: string | null;
  distanceMeters: number | null;
  reason: string | null;
}

export interface TicketTransitionInput {
  from: TicketStatus;
  to: TicketStatus;
  actor: TransitionActor;
}

export interface TicketRecord {
  id: string;
  unitId: string;
  ticketNo: string;
  reporterId: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  title: string;
  description: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  regionId: string | null;
  locationStatus: LocationStatus | null;
  source: string;
  clusterId: string | null;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  limit: number;
  cursor: string | null;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
