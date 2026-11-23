import { lazy, Suspense, useMemo, useState } from "react";
import { Inbox, Plus, RefreshCw } from "lucide-react";
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
      p1: active.filter((ticket) => ticket.priority === "P1").length
    };
  }, [tickets]);

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
                  className="icon-btn"
                  type="button"
                  onClick={() => setManualOpen(true)}
                  title="Tiket manual"
                >
                  <Plus size={16} />
                </button>
              ) : null}
              <button className="icon-btn" type="button" onClick={onRefresh} title="Muat ulang">
                <RefreshCw size={15} />
              </button>
            </div>
          </header>

          <div className="queue-stats">
            <div className="qstat is-amber">
              <span>Baru</span>
              <b>{stats.baru}</b>
            </div>
            <div className="qstat is-red">
              <span>P1 aktif</span>
              <b>{stats.p1}</b>
            </div>
            <div className="qstat is-green">
              <span>Selesai</span>
              <b>{stats.selesai}</b>
            </div>
          </div>

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
