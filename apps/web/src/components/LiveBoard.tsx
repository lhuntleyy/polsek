import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Inbox, MapPin, PieChart, Plus, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type {
  AnalyticsSummary,
  ManualTicketPayload,
  Officer,
  Region,
  Role,
  Ticket,
  TicketDetail as TicketDetailData
} from "../lib/types";
import {
  CATEGORY_META,
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

interface LiveBoardProps {
  tickets: Ticket[];
  regions: Region[];
  officers: Officer[];
  userRole: Role;
  detail: TicketDetailData | null;
  selectedId: string | null;
  search: string;
  busy: boolean;
  canRevealPhone: boolean;
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
  search,
  busy,
  canRevealPhone,
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
  const waitingCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === "baru").length,
    [tickets]
  );

  // Statistik jenis kasus & kasus tertinggi per wilayah dari API analitik,
  // dimuat ulang (debounce) setiap antrean berubah lewat SSE.
  const [caseStats, setCaseStats] = useState<AnalyticsSummary | null>(null);
  const ticketsKey = useMemo(
    () =>
      tickets.reduce(
        (key, ticket) => (ticket.updatedAt > key ? ticket.updatedAt : key),
        String(tickets.length)
      ),
    [tickets]
  );
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .analytics()
        .then((result) => {
          if (!cancelled) setCaseStats(result);
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ticketsKey]);

  const categoryRows = useMemo(() => {
    if (!caseStats) return [];
    return Object.entries(caseStats.byCategory)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);
  }, [caseStats]);
  const categoryMax = Math.max(1, ...categoryRows.map(([, count]) => count));
  const regionTop = (caseStats?.topLocations ?? []).filter((loc) => loc.topCategory).slice(0, 4);

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

  const visible = useMemo(
    () => filterTickets(tickets, "all", search),
    [tickets, search]
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
      <div className="live-stats is-cases">
        <article className="stat-card case-card">
          <header>
            <span className="stat-icon">
              <PieChart size={16} />
            </span>
            <span className="stat-badge">{caseStats?.total ?? 0} laporan</span>
          </header>
          <div className="stat-label">Jenis kasus</div>
          <div className="case-bars">
            {categoryRows.length === 0 ? (
              <small className="muted">{caseStats ? "Belum ada laporan." : "Memuat..."}</small>
            ) : (
              categoryRows.slice(0, 5).map(([category, count]) => (
                <div className="case-row" key={category}>
                  <span className="case-name">{CATEGORY_META[category]?.short ?? category}</span>
                  <span className="case-track">
                    <span
                      className="case-fill"
                      style={{
                        width: `${Math.round((count / categoryMax) * 100)}%`,
                        background: CATEGORY_META[category]?.color
                      }}
                    />
                  </span>
                  <b className="case-value">{count}</b>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="stat-card case-card">
          <header>
            <span className="stat-icon">
              <MapPin size={16} />
            </span>
            <span className="stat-badge">per wilayah</span>
          </header>
          <div className="stat-label">Kasus tertinggi tiap daerah</div>
          <div className="case-regions">
            {regionTop.length === 0 ? (
              <small className="muted">{caseStats ? "Belum ada data wilayah." : "Memuat..."}</small>
            ) : (
              regionTop.map((loc) => (
                <div className="case-region" key={loc.id ?? "none"}>
                  <span className="case-region-name">{loc.name}</span>
                  <span
                    className="case-region-top"
                    style={{ ["--cat" as string]: CATEGORY_META[loc.topCategory!.category]?.color }}
                  >
                    {CATEGORY_META[loc.topCategory!.category]?.short ?? loc.topCategory!.label}{" "}
                    <b>{loc.topCategory!.count}</b>
                  </span>
                  <small>{loc.count} total</small>
                </div>
              ))
            )}
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
            <b className="stat-value">{String(waitingCount).padStart(2, "0")}</b>
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

          <div className="queue-list">
            {visible.length === 0 ? (
              <div className="data-empty">
                <Inbox size={18} />
                <div>Tidak ada tiket.</div>
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
