import { useEffect, useState } from "react";
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  GitMerge,
  Image as ImageIcon,
  Inbox,
  Link2,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Play,
  Send,
  ShieldCheck,
  Video,
  X
} from "lucide-react";
import { api } from "../lib/api";
import type {
  DuplicateTicket,
  Officer,
  Role,
  Ticket,
  TicketDetail as TicketDetailType,
  TicketMedia,
  TicketStatus
} from "../lib/types";
import {
  PRIORITY_META,
  STATUS_META,
  formatWib,
  initials,
  primaryLabel,
  primaryNext,
  timeAgo
} from "../lib/format";

const REJECT_REASON_OPTIONS = [
  { value: "palsu", label: "Laporan palsu / prank" },
  { value: "tidak_dapat_diverifikasi", label: "Tidak dapat diverifikasi" },
  { value: "di_luar_wilkum", label: "Di luar wilayah hukum" },
  { value: "duplikat", label: "Duplikat laporan lain" },
  { value: "bukan_kewenangan", label: "Bukan kewenangan Polsek" },
  { value: "lainnya", label: "Lainnya" }
] as const;

const ROLE_TRANSITIONS: Record<string, Role[]> = {
  "baru->diterima": ["piket", "pawas", "admin"],
  "baru->ditolak": ["piket", "pawas", "admin"],
  "diterima->otw": ["piket", "urc", "pawas", "admin"],
  "diterima->ditunda": ["piket", "pawas", "admin"],
  "diterima->ditolak": ["piket", "pawas", "admin"],
  "otw->ditkp": ["urc", "piket", "pawas", "admin"],
  "otw->ditunda": ["urc", "piket", "pawas", "admin"],
  "ditkp->selesai": ["urc", "piket", "pawas", "admin"],
  "ditkp->ditunda": ["urc", "piket", "pawas", "admin"],
  "ditunda->diterima": ["piket", "pawas", "admin"],
  "ditunda->ditolak": ["piket", "pawas", "admin"],
  "selesai->diterima": ["pawas", "admin"],
  "ditolak->diterima": ["pawas", "admin"]
};

function canRoleTransition(from: TicketStatus, to: TicketStatus, role: Role): boolean {
  return Boolean(ROLE_TRANSITIONS[`${from}->${to}`]?.includes(role));
}

interface TicketDetailProps {
  detail: TicketDetailType | null;
  userRole: Role;
  officers: Officer[];
  busy: boolean;
  canRevealPhone: boolean;
  onClose: () => void;
  onTransition: (
    to: TicketStatus,
    options?: { note?: string; reason?: string; assigneeId?: string }
  ) => Promise<void>;
  onNote: (text: string) => Promise<void>;
  onOpenTicket: (id: string) => void;
  onMerged: () => void;
}

function eventLabel(event: TicketDetailType["events"][number]): string {
  if (event.fromStatus === null && event.toStatus === "baru") return "Tiket dibuat";
  if (event.fromStatus === event.toStatus) return "Catatan internal";
  const to = event.toStatus as TicketStatus | null;
  if (!to) return "Aktivitas";
  if (to === "diterima") return "Diterima piket";
  if (to === "otw") return "OTW ke TKP";
  if (to === "ditkp") return "Tiba di TKP";
  if (to === "selesai") return "Selesai — ditangani";
  if (to === "ditunda") return "Ditunda";
  if (to === "ditolak") return "Ditolak";
  return `Status → ${STATUS_META[to]?.label ?? to}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function MediaMeta({ media, verbose = false }: { media: TicketMedia; verbose?: boolean }) {
  const gps = media.exifGps;
  return (
    <div className="media-meta">
      <span>{formatBytes(media.size)}</span>
      {media.width && media.height ? (
        <span>
          {media.width}×{media.height}
        </span>
      ) : null}
      {media.durationS ? <span>{formatDuration(media.durationS)}</span> : null}
      {gps ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${gps.lat},${gps.lng}`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
          title={`EXIF GPS ${gps.lat}, ${gps.lng}`}
        >
          <MapPin size={9} /> EXIF GPS
        </a>
      ) : null}
      <span className="media-hash" title={`SHA-256: ${media.sha256}`}>
        SHA {media.sha256.slice(0, 10)}
      </span>
      {verbose ? <span>{media.mime}</span> : null}
    </div>
  );
}

function MediaTile({ media, onOpen }: { media: TicketMedia; onOpen: () => void }) {
  if (media.kind === "audio") {
    return (
      <div className="media-audio">
        <div className="media-audio-head">
          <span className="media-chip">
            <Mic size={11} /> Voice note
          </span>
          <span className="media-duration">{formatDuration(media.durationS)}</span>
        </div>
        <audio controls preload="metadata" src={media.url} />
        <MediaMeta media={media} />
      </div>
    );
  }

  return (
    <div
      className={`media-tile media-${media.kind}`}
      role="button"
      tabIndex={0}
      aria-label={media.kind === "video" ? "Buka video bukti" : "Buka foto bukti"}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {media.thumbUrl ? (
        <img src={media.thumbUrl} alt={media.kind === "video" ? "Thumbnail video" : "Foto laporan"} loading="lazy" />
      ) : (
        <span className="media-placeholder">
          {media.kind === "video" ? <Video size={20} /> : <ImageIcon size={20} />}
        </span>
      )}
      {media.kind === "video" ? (
        <span className="media-play">
          <Play size={15} fill="currentColor" />
        </span>
      ) : null}
      <span className="media-chip media-tile-chip">
        {media.kind === "video" ? <Video size={10} /> : <ImageIcon size={10} />}
        {media.kind === "video" ? "Video" : "Foto"}
      </span>
      <span className="media-tile-meta">
        <MediaMeta media={media} />
      </span>
    </div>
  );
}

function DuplicatesPanel({
  ticket,
  onOpenTicket,
  onMerged
}: {
  ticket: Ticket;
  onOpenTicket: (id: string) => void;
  onMerged: () => void;
}) {
  const [items, setItems] = useState<DuplicateTicket[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const final = ["selesai", "ditolak", "dibatalkan"].includes(ticket.status);

  useEffect(() => {
    setItems(null);
    setError(null);
    if (final) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void api
      .duplicates(ticket.id)
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ticket.id, ticket.status, final]);

  if (!items || items.length === 0) return null;

  async function merge(source: DuplicateTicket) {
    setBusyId(source.id);
    setError(null);
    try {
      await api.mergeTicket(ticket.id, [source.id], "Digabung dari detail tiket");
      setItems((previous) => previous?.filter((item) => item.id !== source.id) ?? []);
      onMerged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menggabungkan tiket.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="detail-section">
      <div className="detail-section-title">
        Kemungkinan duplikat
        <span className="section-count">{items.length}</span>
      </div>
      <div className="duplicate-list">
        {items.map((item) => (
          <div className="duplicate-row" key={item.id}>
            <button
              className="duplicate-main"
              type="button"
              onClick={() => onOpenTicket(item.id)}
              title="Buka tiket ini"
            >
              <span className="mono">{item.ticketNo}</span>
              <b>{item.title}</b>
              <span>
                {item.distanceM !== null ? `±${item.distanceM} m` : "Wilayah sama"} ·{" "}
                {item.minutesAgo} mnt lalu · {item.reporterName}
              </span>
            </button>
            <button
              className="btn btn-ghost duplicate-merge"
              type="button"
              onClick={() => void merge(item)}
              disabled={busyId === item.id}
            >
              {busyId === item.id ? <Loader2 className="spin" size={12} /> : <GitMerge size={12} />}
              Gabung
            </button>
          </div>
        ))}
      </div>
      {error ? <div className="login-error" style={{ marginTop: 6 }}>{error}</div> : null}
      <p className="fine-print">
        <Link2 size={10} /> Tiket sumber akan dibatalkan, media dipindahkan, dan aksi tercatat di audit.
      </p>
    </div>
  );
}

export function TicketDetail({
  detail,
  userRole,
  officers,
  busy,
  canRevealPhone,
  onClose,
  onTransition,
  onNote,
  onOpenTicket,
  onMerged
}: TicketDetailProps) {
  const [noteText, setNoteText] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [actionMode, setActionMode] = useState<null | "tunda" | "tolak">(null);
  const [delayNote, setDelayNote] = useState("");
  const [rejectReason, setRejectReason] = useState<string>("tidak_dapat_diverifikasi");
  const [rejectNote, setRejectNote] = useState("");
  const [copyState, setCopyState] = useState(false);
  const [preview, setPreview] = useState<TicketMedia | null>(null);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const ticket = detail?.ticket ?? null;
  const ticketMedia = detail?.media ?? [];

  useEffect(() => {
    setNoteText("");
    setCloseNote("");
    setAssigneeId(ticket?.assignedTo ?? "");
    setActionMode(null);
    setDelayNote("");
    setRejectReason("tidak_dapat_diverifikasi");
    setRejectNote("");
    setCopyState(false);
    setPreview(null);
    setRevealedPhone(null);
    setPhoneError(null);
  }, [ticket?.id, ticket?.assignedTo]);

  useEffect(() => {
    if (!revealedPhone) return;
    const timer = window.setTimeout(() => setRevealedPhone(null), 30_000);
    return () => window.clearTimeout(timer);
  }, [revealedPhone]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  if (!ticket) {
    return (
      <aside className="panel detail-panel" aria-label="Detail tiket">
        <div className="detail-empty">
          <div className="empty-icon">
            <Inbox size={24} />
          </div>
          <b>Belum ada tiket dipilih</b>
          <p>Pilih tiket dari antrean atau pin di peta untuk melihat detail dan mengambil tindakan.</p>
          <div className="empty-keys">
            <kbd>J</kbd>
            <kbd>K</kbd>
            <span className="muted">navigasi</span>
          </div>
        </div>
      </aside>
    );
  }

  const status = STATUS_META[ticket.status];
  const priority = PRIORITY_META[ticket.priority];
  const next = primaryNext(ticket.status);
  const canPrimary = Boolean(next && canRoleTransition(ticket.status, next, userRole));
  const canDelay = canRoleTransition(ticket.status, "ditunda", userRole);
  const canReject = canRoleTransition(ticket.status, "ditolak", userRole);
  const canReopen =
    (ticket.status === "selesai" || ticket.status === "ditolak") &&
    canRoleTransition(ticket.status, "diterima", userRole);
  const assignableOfficers = officers.filter(
    (officer) => officer.active && ["urc", "piket", "bhabin"].includes(officer.role)
  );
  const showAssigneeSelect =
    next === "otw" &&
    canPrimary &&
    ["piket", "pawas", "admin"].includes(userRole) &&
    assignableOfficers.length > 0;
  const mapsUrl =
    ticket.lat !== null && ticket.lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${ticket.lat},${ticket.lng}`
      : null;

  async function handlePrimary() {
    if (!next || !canPrimary) return;
    try {
      if (next === "selesai") {
        const note = closeNote.trim();
        if (!note) return;
        await onTransition("selesai", { note });
        setCloseNote("");
        return;
      }
      if (next === "otw") {
        await onTransition("otw", { assigneeId: assigneeId || undefined });
        return;
      }
      await onTransition(next);
    } catch {
      // App already shows the failure toast.
    }
  }

  async function handleDelay() {
    const note = delayNote.trim();
    if (!note) return;
    try {
      await onTransition("ditunda", { note });
      setDelayNote("");
      setActionMode(null);
    } catch {
      // Toast shown by parent.
    }
  }

  async function handleReject() {
    if (!rejectReason) return;
    try {
      await onTransition("ditolak", {
        reason: rejectReason,
        note: rejectNote.trim() || undefined
      });
      setRejectNote("");
      setActionMode(null);
    } catch {
      // Toast shown by parent.
    }
  }

  async function handleReopen() {
    try {
      await onTransition("diterima", { note: "Tiket dibuka kembali dari dashboard" });
    } catch {
      // Toast shown by parent.
    }
  }

  async function handleNote() {
    const text = noteText.trim();
    if (!text) return;
    try {
      await onNote(text);
      setNoteText("");
    } catch {
      // App already shows the failure toast.
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(ticket?.ticketNo ?? "");
    setCopyState(true);
    window.setTimeout(() => setCopyState(false), 1600);
  }

  async function handleRevealPhone() {
    if (!ticket || revealing) return;
    if (revealedPhone) {
      setRevealedPhone(null);
      return;
    }
    setRevealing(true);
    setPhoneError(null);
    try {
      const result = await api.revealPhone(ticket.id);
      setRevealedPhone(result.phone);
    } catch (cause) {
      setPhoneError(cause instanceof Error ? cause.message : "Gagal menampilkan nomor.");
    } finally {
      setRevealing(false);
    }
  }

  return (
    <aside className="panel detail-panel" aria-label="Detail tiket">
      <div className="detail-head">
        <div className="detail-id-row">
          <span className="detail-id">{ticket.ticketNo}</span>
          <button className="icon-btn" type="button" onClick={() => void handleCopy()} title="Salin ID">
            {copyState ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <span className="status-chip" style={{ ["--c" as string]: status.color }}>
            <i className="dot" />
            {status.label}
          </span>
          <button className="icon-btn detail-close" type="button" onClick={onClose} title="Tutup">
            <X size={16} />
          </button>
        </div>
        <h2 className="detail-title">{ticket.title}</h2>
        <div className="detail-sub">
          <b>{ticket.categoryLabel}</b>
          <span className="dot-sep">·</span>
          <MapPin size={11} />
          <b>{ticket.region ?? "Wilayah belum jelas"}</b>
          <span className="dot-sep">·</span>
          <Clock size={11} />
          <span>{formatWib(ticket.createdAt)} WIB</span>
        </div>
      </div>

      <div className="detail-scroll">
        <div className="priority-banner" style={{ ["--c" as string]: priority.color }}>
          <b>
            {ticket.priority} · {priority.label}
          </b>
          <span>{ticket.priority === "P1" ? "Target ack 2 menit" : "Target ack 10 menit"}</span>
          {ticket.escalatedPawasAt ? (
            <span className="escalation-chip">Pawas {formatWib(ticket.escalatedPawasAt)}</span>
          ) : null}
          {ticket.escalatedKapolsekAt ? (
            <span className="escalation-chip is-red">Kapolsek {formatWib(ticket.escalatedKapolsekAt)}</span>
          ) : null}
          <span className="mono">{timeAgo(ticket.createdAt)}</span>
        </div>

        {ticket.duplicateOf ? (
          <div className="duplicate-banner">
            <GitMerge size={13} />
            <span>
              Tiket ini sudah digabung ke tiket lain dan dibatalkan.
              {ticket.closeNote ? ` ${ticket.closeNote}` : ""}
            </span>
          </div>
        ) : null}

        <div className="detail-section">
          <div className="detail-section-title">Pelapor</div>
          <div className="person-card">
            <span className="avatar">{initials(ticket.reporter.name)}</span>
            <div className="person-main">
              <div className="person-name">
                {ticket.reporter.name}
                {ticket.reporter.verified ? (
                  <span className="verified">
                    <ShieldCheck size={9} /> Terverifikasi
                  </span>
                ) : null}
              </div>
              <div className="person-sub">
                <span className="phone-line">
                  {revealedPhone ? (
                    <b className="mono">{revealedPhone}</b>
                  ) : (
                    ticket.reporter.phoneMasked
                  )}
                  {canRevealPhone ? (
                    <button
                      className="link-btn"
                      type="button"
                      onClick={() => void handleRevealPhone()}
                      disabled={revealing}
                      title={revealedPhone ? "Sembunyikan nomor" : "Tampilkan nomor (tercatat di audit)"}
                    >
                      {revealing ? (
                        <Loader2 className="spin" size={10} />
                      ) : revealedPhone ? (
                        <EyeOff size={10} />
                      ) : (
                        <Eye size={10} />
                      )}
                      {revealedPhone ? "Sembunyikan" : "Tampilkan"}
                    </button>
                  ) : null}
                </span>
                · <b>{ticket.reporter.reportCount} laporan</b> · {ticket.reporter.validCount} valid
              </div>
              {phoneError ? <div className="phone-error">{phoneError}</div> : null}
            </div>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Lokasi kejadian</div>
          <div className="location-card">
            <div className="location-visual">
              <span className="location-pin">
                <MapPin size={13} />
              </span>
            </div>
            <div className="location-body">
              <div className="coord-row">
                <span>
                  LAT <b>{ticket.lat?.toFixed(5) ?? "—"}</b>
                </span>
                <span>
                  LNG <b>{ticket.lng?.toFixed(5) ?? "—"}</b>
                </span>
                <span>±{ticket.accuracyM ?? "—"} m</span>
              </div>
              <div className="location-address">{ticket.address ?? "Alamat belum diisi"}</div>
              <div className="location-meta">
                {ticket.region ?? "Wilayah belum diverifikasi"} · {ticket.locationStatus ?? "—"}
              </div>
              {mapsUrl ? (
                <div className="location-actions">
                  <a className="btn btn-ghost" href={mapsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={12} /> Buka Maps
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Deskripsi</div>
          <div className="description">{ticket.description ?? "Tidak ada deskripsi."}</div>
        </div>

        <DuplicatesPanel ticket={ticket} onOpenTicket={onOpenTicket} onMerged={onMerged} />

        <div className="detail-section">
          <div className="detail-section-title">
            Media
            {ticketMedia.length > 0 ? (
              <span className="section-count">{ticketMedia.length}</span>
            ) : null}
          </div>
          {ticketMedia.length === 0 ? (
            <div className="empty-line">
              Belum ada media. Foto, video, dan voice note dari WhatsApp akan muncul di sini
              beserta hash SHA-256 dan metadata GPS.
            </div>
          ) : (
            <div className="media-grid">
              {ticketMedia.map((item) => (
                <MediaTile key={item.id} media={item} onOpen={() => setPreview(item)} />
              ))}
            </div>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Riwayat</div>
          <ul className="timeline">
            {detail?.events.map((event, index) => (
              <li
                key={event.id}
                className={index === (detail.events.length - 1) ? "is-current" : ""}
              >
                <div className="tl-rail">
                  <span className="tl-dot" />
                  <span className="tl-line" />
                </div>
                <div className="tl-body">
                  <div className="tl-label">{eventLabel(event)}</div>
                  <div className="tl-meta">
                    {formatWib(event.createdAt)} WIB ·{" "}
                    {event.actorType === "system" ? "SIGAP" : "Petugas"}
                    {event.note ? ` · ${event.note}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Catatan internal</div>
          {ticket.internalNote ? <div className="note-history">{ticket.internalNote}</div> : null}
          <div className="note-box">
            <input
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleNote();
                }
              }}
              placeholder="Tambah catatan (hanya petugas)..."
            />
            <button
              className="icon-btn"
              type="button"
              onClick={() => void handleNote()}
              disabled={busy || !noteText.trim()}
              title="Simpan catatan"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="detail-actions">
        {ticket.status === "ditkp" && canPrimary ? (
          <textarea
            className="textarea"
            rows={2}
            value={closeNote}
            onChange={(event) => setCloseNote(event.target.value)}
            placeholder="Catatan penanganan wajib diisi sebelum menutup tiket..."
          />
        ) : null}
        {showAssigneeSelect ? (
          <select
            className="select"
            style={{ marginBottom: 7 }}
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            aria-label="Petugas pelaksana"
          >
            <option value="">Pilih petugas URC / piket (opsional)</option>
            {assignableOfficers.map((officer) => (
              <option key={officer.id} value={officer.id}>
                {officer.name} ({officer.role.toUpperCase()})
              </option>
            ))}
          </select>
        ) : null}
        {actionMode === "tunda" ? (
          <div style={{ marginBottom: 8, display: "grid", gap: 6 }}>
            <textarea
              className="textarea"
              rows={2}
              value={delayNote}
              onChange={(event) => setDelayNote(event.target.value)}
              placeholder="Alasan penundaan wajib diisi..."
            />
            <div className="action-row">
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !delayNote.trim()}
                onClick={() => void handleDelay()}
              >
                Simpan Tunda
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setActionMode(null)}
              >
                Batal
              </button>
            </div>
          </div>
        ) : null}
        {actionMode === "tolak" ? (
          <div style={{ marginBottom: 8, display: "grid", gap: 6 }}>
            <select
              className="select"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              aria-label="Alasan penolakan"
            >
              {REJECT_REASON_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <textarea
              className="textarea"
              rows={2}
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder="Catatan penolakan (opsional)..."
            />
            <div className="action-row">
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={() => void handleReject()}
              >
                Konfirmasi Tolak
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setActionMode(null)}
              >
                Batal
              </button>
            </div>
          </div>
        ) : null}
        <div className="action-row">
          {next ? (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void handlePrimary()}
              disabled={busy || !canPrimary || (next === "selesai" && !closeNote.trim())}
              title={canPrimary ? undefined : `Role ${userRole} tidak dapat melakukan aksi ini`}
            >
              {busy ? <MessageSquare size={15} /> : <Check size={15} />}
              {primaryLabel(ticket.status)}
            </button>
          ) : canReopen ? (
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void handleReopen()}
              disabled={busy}
            >
              Buka Ulang Tiket
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled>
              <Check size={15} />
              Tiket Final
            </button>
          )}
          {canDelay ? (
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => setActionMode((prev) => (prev === "tunda" ? null : "tunda"))}
            >
              Tunda
            </button>
          ) : null}
          {canReject ? (
            <button
              className="btn btn-danger-ghost"
              type="button"
              disabled={busy}
              onClick={() => setActionMode((prev) => (prev === "tolak" ? null : "tolak"))}
            >
              Tolak
            </button>
          ) : null}
        </div>
        <div className="fine">Semua aksi tercatat di audit log. P1 dieskalasi otomatis.</div>
      </div>

      {preview ? (
        <div
          className="media-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau media"
          onClick={() => setPreview(null)}
        >
          <div className="media-lightbox-body" onClick={(event) => event.stopPropagation()}>
            <div className="media-lightbox-head">
              <div className="media-lightbox-title">
                <b>
                  {preview.kind === "video"
                    ? "Video bukti"
                    : preview.kind === "audio"
                      ? "Voice note"
                      : "Foto bukti"}
                </b>
                <span>
                  {formatWib(preview.createdAt)} WIB · {formatBytes(preview.size)}
                </span>
              </div>
              <div className="media-lightbox-actions">
                <a
                  className="icon-btn"
                  href={`${preview.url}?download=1`}
                  title="Unduh media"
                  download
                >
                  <Download size={16} />
                </a>
                <button
                  className="icon-btn"
                  type="button"
                  onClick={() => setPreview(null)}
                  title="Tutup"
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <div className="media-lightbox-content">
              {preview.kind === "image" ? (
                <img src={preview.url} alt="Foto bukti laporan" />
              ) : null}
              {preview.kind === "video" ? (
                <video src={preview.url} controls autoPlay playsInline />
              ) : null}
              {preview.kind === "audio" ? (
                <div className="media-lightbox-audio">
                  <Mic size={28} />
                  <audio src={preview.url} controls autoPlay />
                </div>
              ) : null}
            </div>
            {preview.caption ? <p className="media-caption">{preview.caption}</p> : null}
            <MediaMeta media={preview} verbose />
          </div>
        </div>
      ) : null}
    </aside>
  );
}
