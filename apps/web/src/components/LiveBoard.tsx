import { lazy, Suspense, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Inbox, Layers, Plus, RefreshCw } from "lucide-react";
import type {
  ManualTicketPayload,
  Officer,
  Region,
  Role,
  Ticket,
  TicketDetail as TicketDetailData
} from "../lib/types";
import {
  PRIORITY_META,
  STATUS_META,
  filterTickets,
  initials,
  isActiveTicket,
  shortTicket,
  timeAgo
} from "../lib/format";
import { TicketDetail } from "./TicketDetail";
import { ManualTicketModal } from "./ManualTicketModal";

const WebMap = lazy(() =>
  import("./WebMap").then((module) => ({ default: module.WebMap }))
);

export type LiveFilter = "all" | "baru" | "proses" | "selesai";

interface LiveBoardProps {
  tickets: Ticket[];
  regions: Region[];
  officers: Officer[];
  userRole: Role;
  detail: TicketDetailData | null;
  selectedId: string | null;
  filter: LiveFilter;
  search: string;
  busy: boolean;
  canRevealPhone: boolean;
  onFilter: (filter: LiveFilter) => void;
  onSelect: (id: string) => void;
  onCloseDetail: () => void;
  onRefresh: () => void;
  onTransition: (
    to: Ticket["status"],
    options?: { note?: string; reason?: string; assigneeId?: string }
  ) => Promise<void>;
  onNote: (text: string) => Promise<void>;
  onCreateManual: (payload: ManualTicketPayload) => Promise<void>;
  onMerged: () => void;
}

export function LiveBoard({
  tickets,
  regions,
  officers,
  userRole,
  detail,
  selectedId,
  filter,
  search,
  busy,
  canRevealPhone,
  onFilter,
  onSelect,
  onCloseDetail,
  onRefresh,
  onTransition,
  onNote,
  onCreateManual,
  onMerged
}: LiveBoardProps) {
  const canCreateManual = ["piket", "pawas", "admin"].includes(userRole);
  const [manualOpen, setManualOpen] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const stats = useMemo(() => {
    const active = tickets.filter(isActiveTicket);
    return {
      all: tickets.length,
      baru: tickets.filter((ticket) => ticket.status === "baru").length,
      proses: tickets.filter((ticket) => ["diterima", "otw", "ditkp", "ditunda"].includes(ticket.status))
        .length,
      selesai: tickets.filter((ticket) => ticket.status === "selesai").length,
      active: active.length,
      p1: active.filter((ticket) => ticket.priority === "P1").length,
      p1Waiting: active.filter((ticket) => ticket.priority === "P1" && ticket.status === "baru").length
    };
  }, [tickets]);

  // Laporan masuk per jam selama 12 jam terakhir, untuk sparkline kartu "Tiket aktif".
  const hourly = useMemo(() => {
    const buckets = new Array(12).fill(0) as number[];
    const now = Date.now();
    for (const ticket of tickets) {
      const age = (now - new Date(ticket.createdAt).getTime()) / 3_600_000;
      if (age >= 0 && age < 12) buckets[11 - Math.floor(age)] += 1;
    }
    return buckets;
  }, [tickets]);

  const waiting = useMemo(
    () =>
      tickets
        .filter((ticket) => ticket.status === "baru")
        .sort((a, b) => {
          if (a.priority === "P1" && b.priority !== "P1") return -1;
          if (b.priority === "P1" && a.priority !== "P1") return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        })
        .slice(0, 2),
    [tickets]
  );

  const doneShare = stats.all > 0 ? stats.selesai / stats.all : 0;
  const doneSegments = 20;
  const doneFilled = Math.round(doneShare * doneSegments);

  const visible = useMemo(
    () => filterTickets(tickets, filter, search),
    [tickets, filter, search]
  );

  function selectTicket(id: string) {
    onSelect(id);
    if (window.innerWidth <= 1200) document.body.classList.add("detail-open");
  }

  function closeDetail() {
    document.body.classList.remove("detail-open");
    onCloseDetail();
  }

  return (
    <section className="view is-active" data-view-panel="live">
      <div className="live-stats">
        <article className="stat-card">
          <header>
            <span className="stat-icon">
              <Layers size={16} />
            </span>
            <span className="stat-badge">{stats.baru} baru</span>
          </header>
          <div className="stat-label">Tiket aktif</div>
          <div className="stat-body">
            <div>
              <b className="stat-value">{stats.active}</b>
              <small>{stats.proses} sedang diproses</small>
            </div>
            <Sparkline values={hourly} />
          </div>
        </article>

        <article className={`stat-card ${stats.p1 > 0 ? "is-danger" : ""}`}>
          <header>
            <span className="stat-icon">
              <AlertTriangle size={16} />
            </span>
            <span className="stat-badge">{stats.p1 > 0 ? "DARURAT" : "Aman"}</span>
          </header>
          <div className="stat-label">P1 darurat aktif</div>
          <div className="stat-body">
            <div>
              <b className="stat-value">{String(stats.p1).padStart(2, "0")}</b>
              <small>
                {stats.p1 > 0
                  ? `${stats.p1Waiting} belum diterima piket`
                  : "Tidak ada laporan darurat aktif"}
              </small>
            </div>
          </div>
        </article>

        <article className="stat-card">
          <header>
            <span className="stat-icon">
              <CheckCircle2 size={16} />
            </span>
            <span className="stat-badge is-good">{Math.round(doneShare * 100)}%</span>
          </header>
          <div className="stat-label">Selesai</div>
          <div className="stat-body is-column">
            <div>
              <b className="stat-value">{stats.selesai}</b>
              <small>dari {stats.all} tiket</small>
            </div>
            <div className="segment-bar" aria-hidden="true">
              {Array.from({ length: doneSegments }, (_, index) => (
                <i key={index} className={index < doneFilled ? "is-on" : ""} />
              ))}
            </div>
          </div>
        </article>

        <article className="stat-card is-ink">
          <header>
            <span className="stat-label">Menunggu diterima</span>
            <span className="stat-badge">
              <span className="live-dot" /> Langsung
            </span>
          </header>
          <div className="ink-body">
            <b className="stat-value">{String(stats.baru).padStart(2, "0")}</b>
            <div className="ink-list">
              {waiting.length === 0 ? (
                <small>Semua laporan sudah diterima.</small>
              ) : (
                waiting.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    className={`ink-item ${ticket.priority === "P1" ? "is-p1" : ""}`}
                    onClick={() => selectTicket(ticket.id)}
                  >
                    <i />
                    <span>
                      <b>
                        {shortTicket(ticket.ticketNo)} · {ticket.title}
                      </b>
                      <small>
                        {ticket.region ?? "Wilayah belum jelas"} · {timeAgo(ticket.createdAt)}
                      </small>
                    </span>
                    <ArrowUpRight size={14} />
                  </button>
                ))
              )}
            </div>
          </div>
        </article>
      </div>

      <div className="board">
        <aside className="panel queue-panel">
          <header className="panel-head queue-head">
            <div>
              <div className="eyebrow">ANTREAN LANGSUNG</div>
              <h2>
                Laporan Masuk <span className="count-badge">{visible.length}</span>
              </h2>
            </div>
            <div className="queue-head-actions">
              {canCreateManual ? (
                <button
                  className="btn btn-primary btn-pill"
                  type="button"
                  onClick={() => setManualOpen(true)}
                  title="Tiket manual"
                >
                  <Plus size={15} />
                  <span>Tiket manual</span>
                </button>
              ) : null}
              <button className="icon-btn" type="button" onClick={onRefresh} title="Muat ulang">
                <RefreshCw size={15} />
              </button>
            </div>
          </header>

          <div className="filter-row">
            {(
              [
                ["all", "Semua", stats.all],
                ["baru", "Baru", stats.baru],
                ["proses", "Proses", stats.proses],
                ["selesai", "Selesai", stats.selesai]
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                className={`filter-chip ${filter === value ? "is-active" : ""}`}
                type="button"
                onClick={() => onFilter(value)}
              >
                {label} <b>{count}</b>
              </button>
            ))}
          </div>

          <div className="queue-list">
            {visible.length === 0 ? (
              <div className="data-empty">
                <Inbox size={18} />
                <div>Tidak ada tiket pada filter ini.</div>
              </div>
            ) : (
              visible.map((ticket) => {
                const status = STATUS_META[ticket.status];
                const priority = PRIORITY_META[ticket.priority];
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    className={`ticket-row ${ticket.id === selectedId ? "is-selected" : ""} ${
                      ticket.priority === "P1" ? "is-p1" : ""
                    } ${ticket.status === "baru" ? "is-unread" : ""}`}
                    style={{ ["--cat" as string]: priority.color, ["--c" as string]: status.color }}
                    onClick={() => selectTicket(ticket.id)}
                  >
                    <div className="row-top">
                      <span className="row-id">{shortTicket(ticket.ticketNo)}</span>
                      {ticket.status === "baru" ? <span className="row-new" /> : null}
                      <span className="row-status">
                        <i />
                        {status.label}
                      </span>
                      <span className="row-time">{timeAgo(ticket.createdAt).replace(" lalu", "")}</span>
                    </div>
                    <div className="row-title">{ticket.title}</div>
                    <div className="row-meta">
                      <span
                        className="row-cat-dot"
                        style={{ background: priority.color }}
                      />
                      <b>{ticket.categoryLabel}</b>
                      <span className="dot-sep">·</span>
                      <span>{ticket.region ?? "Wilayah belum jelas"}</span>
                    </div>
                    <div className="row-foot">
                      <span className="row-person">
                        <span className="mini-avatar">{initials(ticket.reporter.name)}</span>
                        <span>{ticket.reporter.name}</span>
                      </span>
                      <span className="row-extra">
                        {ticket.assignee ? <span>{ticket.assignee}</span> : <span>Belum ditugaskan</span>}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <footer className="panel-foot queue-foot">
            <span className="live-dot" />
            <span>Stream aktif</span>
            <span className="kbd-hint">
              <kbd>J</kbd>
              <kbd>K</kbd> navigasi
            </span>
          </footer>
        </aside>

        <Suspense
          fallback={
            <section className="panel map-panel">
              <div className="data-empty">Memuat peta...</div>
            </section>
          }
        >
          <WebMap
            tickets={tickets}
            regions={regions}
            selectedId={selectedId}
            onSelect={selectTicket}
          />
        </Suspense>

        <TicketDetail
          detail={detail}
          userRole={userRole}
          officers={officers}
          busy={busy}
          canRevealPhone={canRevealPhone}
          onClose={closeDetail}
          onTransition={onTransition}
          onNote={onNote}
          onOpenTicket={selectTicket}
          onMerged={onMerged}
        />
      </div>

      <ManualTicketModal
        open={manualOpen}
        busy={creatingManual}
        onClose={() => setManualOpen(false)}
        onCreate={async (payload) => {
          setCreatingManual(true);
          try {
            await onCreateManual(payload);
            setManualOpen(false);
          } finally {
            setCreatingManual(false);
          }
        }}
      />
    </section>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120;
  const height = 44;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => [index * step, height - 4 - (value / max) * (height - 10)] as const);
  const line = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = points[points.length - 1];
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Laporan masuk per jam, 12 jam terakhir">
      <title>Laporan masuk per jam, 12 jam terakhir</title>
      <path className="sparkline-area" d={area} />
      <path className="sparkline-line" d={line} />
      {last ? <circle className="sparkline-dot" cx={last[0]} cy={last[1]} r={3} /> : null}
    </svg>
  );
}
