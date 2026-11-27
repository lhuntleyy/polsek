import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, RefreshCw, Search, X } from "lucide-react";
import { api, type TicketFilters } from "../lib/api";
import type { Region, Ticket, TicketStatus } from "../lib/types";
import { CATEGORY_META, STATUS_META, formatWib, formatWibDate, shortTicket, timeAgo } from "../lib/format";

interface ReportsPageProps {
  regions: Region[];
  /** Berubah setiap ada tiket baru/terupdate (SSE) agar daftar ikut segar. */
  refreshKey: string;
  onOpenTicket: (id: string) => void;
  onToast: (toast: { title: string; message: string; type: "success" | "danger" | "info" }) => void;
}

interface Filters {
  q: string;
  status: "" | TicketStatus;
  category: string;
  regionId: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { q: "", status: "", category: "", regionId: "", from: "", to: "" };
const PAGE_SIZE = 50;

/** Tanggal dari input (YYYY-MM-DD, WIB) → batas ISO awal/akhir hari. */
function dayStart(date: string): string {
  return new Date(`${date}T00:00:00+07:00`).toISOString();
}
function dayEnd(date: string): string {
  return new Date(`${date}T23:59:59.999+07:00`).toISOString();
}

function toQuery(filters: Filters, cursor?: string): TicketFilters {
  return {
    q: filters.q.trim() || undefined,
    status: filters.status || undefined,
    category: filters.category || undefined,
    regionId: filters.regionId || undefined,
    from: filters.from ? dayStart(filters.from) : undefined,
    to: filters.to ? dayEnd(filters.to) : undefined,
    limit: PAGE_SIZE,
    cursor
  };
}

export function ReportsPage({ regions, refreshKey, onOpenTicket, onToast }: ReportsPageProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<Ticket[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const effective = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  async function load() {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await api.tickets(toQuery(effective));
      if (id !== requestId.current) return;
      setItems(result.items);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      if (id !== requestId.current) return;
      onToast({
        title: "Gagal memuat laporan",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const result = await api.tickets(toQuery(effective, nextCursor));
      if (id !== requestId.current) return;
      setItems((previous) => [...previous, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      onToast({
        title: "Gagal memuat laporan",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, refreshKey]);

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  const hasFilter = Object.entries(filters).some(([, value]) => value !== "");
  const sortedRegions = useMemo(
    () => [...regions].sort((a, b) => a.name.localeCompare(b.name, "id")),
    [regions]
  );

  return (
    <section className="view is-active" data-view-panel="reports" style={{ overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">ARSIP LAPORAN</div>
          <h2>
            Laporan Masuk <span className="muted">· semua tiket</span>
          </h2>
          <p>Cari dan saring laporan berdasarkan jenis kasus, wilayah, status, dan tanggal.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} /> {loading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
      </div>

      <div className="panel data-panel">
        <div className="data-toolbar reports-toolbar">
          <label className="search-box">
            <Search className="icon" />
            <input
              value={filters.q}
              onChange={(event) => set("q", event.target.value)}
              placeholder="Cari nomor tiket, judul, kronologi, atau nama pelapor..."
            />
          </label>
          <div className="reports-filters">
            <select
              aria-label="Jenis kasus"
              value={filters.category}
              onChange={(event) => set("category", event.target.value)}
            >
              <option value="">Semua jenis kasus</option>
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Wilayah"
              value={filters.regionId}
              onChange={(event) => set("regionId", event.target.value)}
            >
              <option value="">Semua wilayah</option>
              {sortedRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Status"
              value={filters.status}
              onChange={(event) => set("status", event.target.value as Filters["status"])}
            >
              <option value="">Semua status</option>
              {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_META[status].label}
                </option>
              ))}
            </select>
            <label className="reports-date">
              <span>Dari</span>
              <input
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(event) => set("from", event.target.value)}
              />
            </label>
            <label className="reports-date">
              <span>Sampai</span>
              <input
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(event) => set("to", event.target.value)}
              />
            </label>
            {hasFilter ? (
              <button className="btn btn-ghost" type="button" onClick={() => setFilters(EMPTY)}>
                <X size={13} /> Reset
              </button>
            ) : null}
          </div>
          <div className="data-toolbar-meta">
            <span className="mono">
              {items.length}
              {nextCursor ? "+" : ""} laporan
            </span>
          </div>
        </div>

        <div className="table-wrap">
          {loading && items.length === 0 ? (
            <div className="data-empty">Memuat laporan...</div>
          ) : items.length === 0 ? (
            <div className="data-empty">
              <FileText size={18} />
              <div>{hasFilter ? "Tidak ada laporan yang cocok dengan filter." : "Belum ada laporan."}</div>
            </div>
          ) : (
            <table className="data-table reports-table">
              <thead>
                <tr>
                  <th>Masuk</th>
                  <th>Tiket</th>
                  <th>Jenis kasus</th>
                  <th>Wilayah</th>
                  <th>Pelapor</th>
                  <th>Status</th>
                  <th>Petugas</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => {
                  const category = CATEGORY_META[ticket.category];
                  const status = STATUS_META[ticket.status];
                  return (
                    <tr
                      key={ticket.id}
                      className="is-clickable"
                      tabIndex={0}
                      onClick={() => onOpenTicket(ticket.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onOpenTicket(ticket.id);
                      }}
                    >
                      <td className="mono" title={ticket.createdAt}>
                        {formatWib(ticket.createdAt)}
                        <span className="cell-sub">
                          {formatWibDate(ticket.createdAt)} · {timeAgo(ticket.createdAt)}
                        </span>
                      </td>
                      <td style={{ maxWidth: 340, whiteSpace: "normal" }}>
                        <span className="cell-name">
                          <span className="mono">{shortTicket(ticket.ticketNo)}</span> · {ticket.title}
                        </span>
                        <span className="cell-sub">{ticket.ticketNo}</span>
                      </td>
                      <td>
                        <span
                          className="reports-cat"
                          style={{ ["--cat" as string]: category?.color ?? "#8A9BAA" }}
                        >
                          {category?.label ?? ticket.categoryLabel}
                        </span>
                      </td>
                      <td>{ticket.region ?? <span className="muted">Belum terpetakan</span>}</td>
                      <td>{ticket.reporter.name}</td>
                      <td>
                        <span className="reports-status" style={{ ["--c" as string]: status.color }}>
                          {status.label}
                        </span>
                      </td>
                      <td>{ticket.assignee ?? <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {nextCursor ? (
          <div className="panel-foot data-foot">
            <button className="btn btn-ghost" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="spin" size={13} /> : null}
              Muat lebih banyak
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
