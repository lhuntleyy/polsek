import {
  ACTIVE_STATUSES,
  ALLOWED_TRANSITIONS,
  FINAL_STATUSES,
  PRIMARY_NEXT,
  TRANSITION_ROLES
} from "./constants.js";
import type { TicketStatus, TransitionActor } from "./types.js";

export function canTransition(
  from: TicketStatus,
  to: TicketStatus,
  actor: TransitionActor
): boolean {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) return false;
  const allowedActors = TRANSITION_ROLES[`${from}->${to}`];
  return Array.isArray(allowedActors) && allowedActors.includes(actor);
}

export function assertTransition(
  from: TicketStatus,
  to: TicketStatus,
  actor: TransitionActor
): void {
  if (!canTransition(from, to, actor)) {
    throw new Error(`Transisi tiket tidak diizinkan: ${from} -> ${to} oleh ${actor}`);
  }
}

export function isActiveStatus(status: TicketStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isFinalStatus(status: TicketStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

export function primaryNextStatus(status: TicketStatus): TicketStatus | null {
  return PRIMARY_NEXT[status] ?? null;
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  });
  dateFormatters.set(timeZone, formatter);
  return formatter;
}

export function ticketDateCode(date: Date | string, timeZone = "Asia/Jakarta"): string {
  const value = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(value.getTime())) {
    throw new Error("Tanggal tidak valid");
  }
  const parts = getDateFormatter(timeZone).formatToParts(value);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year ?? "00"}${lookup.month ?? "00"}${lookup.day ?? "00"}`;
}

export function formatTicketNumber(
  unitCode: string,
  date: Date | string,
  sequence: number,
  timeZone = "Asia/Jakarta"
): string {
  const code = unitCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (!code) throw new Error("Kode unit tidak valid");
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Sequence tiket harus bilangan bulat positif");
  }
  return `${code}-${ticketDateCode(date, timeZone)}-${String(sequence).padStart(3, "0")}`;
}

export function parseTicketNumber(ticketNo: string): {
  unitCode: string;
  dateCode: string;
  sequence: number;
} | null {
  const match = /^([A-Z0-9]{2,12})-(\d{6})-(\d{3,6})$/.exec(ticketNo.trim().toUpperCase());
  if (!match) return null;
  return {
    unitCode: match[1] as string,
    dateCode: match[2] as string,
    sequence: Number(match[3])
  };
}

export function shortTicketNumber(ticketNo: string): string {
  const parts = ticketNo.split("-");
  return `#${parts[parts.length - 1] ?? ticketNo}`;
}
