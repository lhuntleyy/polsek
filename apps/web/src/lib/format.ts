import type { Priority, Ticket, TicketStatus } from "./types";

const JAKARTA = "Asia/Jakarta";

export function formatWib(value: string | Date, withSeconds = false): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: JAKARTA,
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
    hour12: false
  }).format(new Date(value));
}

export function formatWibDate(value: string | Date, withWeekday = false): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: JAKARTA,
    weekday: withWeekday ? "short" : undefined,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function timeAgo(value: string | Date): string {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const seconds = Math.floor(diff / 1000);
  if (seconds < 20) return "baru saja";
  if (seconds < 60) return `${seconds} dtk lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hr lalu`;
}

export function shortTicket(ticketNo: string): string {
  return `#${ticketNo.split("-").at(-1) ?? ticketNo}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export const CATEGORY_META: Record<string, { label: string; short: string; color: string }> = {
  tawuran: { label: "Gangguan Kamtibmas", short: "Kamtibmas", color: "#FFB020" },
  pidana: { label: "Tindak Pidana", short: "Tindak Pidana", color: "#FF7A45" },
  bencana: { label: "Bencana & Lingkungan", short: "Bencana", color: "#4D9FFF" },
  laka: { label: "Laka & Kemacetan", short: "Laka & Macet", color: "#B18CFF" },
  kebakaran: { label: "Kebakaran", short: "Kebakaran", color: "#FF5A5F" },
  lain: { label: "Lainnya", short: "Lainnya", color: "#8A9BAA" }
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

export function primaryNext(status: TicketStatus): TicketStatus | null {
  if (status === "baru") return "diterima";
  if (status === "diterima") return "otw";
  if (status === "otw") return "ditkp";
  if (status === "ditkp") return "selesai";
  if (status === "ditunda") return "diterima";
  return null;
}

export function primaryLabel(status: TicketStatus): string {
  if (status === "baru") return "Terima & Kirim ke URC";
  if (status === "diterima") return "OTW ke TKP";
  if (status === "otw") return "Tiba di TKP";
  if (status === "ditkp") return "Selesaikan";
  if (status === "ditunda") return "Lanjutkan";
  return "Tiket Final";
}

const STATUS_ORDER: Record<string, number> = {
  baru: 0,
  diterima: 1,
  otw: 2,
  ditkp: 3,
  ditunda: 4,
  selesai: 5,
  ditolak: 6,
  dibatalkan: 7
};

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function isActiveTicket(ticket: Ticket): boolean {
  return ["baru", "diterima", "otw", "ditkp", "ditunda"].includes(ticket.status);
}

export function sortTickets(list: Ticket[]): Ticket[] {
  return [...list].sort((a, b) => {
    const activeA = isActiveTicket(a) ? 0 : 1;
    const activeB = isActiveTicket(b) ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
      return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    }
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function filterTickets(tickets: Ticket[], filter: string, search: string): Ticket[] {
  const term = search.trim().toLowerCase();
  const filtered = tickets.filter((ticket) => {
    if (filter === "baru" && ticket.status !== "baru") return false;
    if (
      filter === "proses" &&
      !["diterima", "otw", "ditkp", "ditunda"].includes(ticket.status)
    ) {
      return false;
    }
    if (filter === "selesai" && ticket.status !== "selesai") return false;
    if (!term) return true;
    return `${ticket.title} ${ticket.ticketNo} ${ticket.reporter.name} ${ticket.region ?? ""}`
      .toLowerCase()
      .includes(term);
  });
  return sortTickets(filtered);
}
