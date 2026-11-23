import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeftRight, Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import type { HandoverSummary, TicketStatus, User } from "../lib/types";
import { STATUS_META, initials, shortTicket, timeAgo } from "../lib/format";

interface HandoverPageProps {
  user: User;
  onToast: (toast: { title: string; message: string; type: "success" | "danger" | "info" }) => void;
  onOpenTicket: (id: string) => void;
}

const CHECK_ITEMS = [
  { key: "p1Acknowledged", label: "Semua P1 aktif sudah di-ack", count: "p1" },
  { key: "delayedReasons", label: "Tiket ditunda punya alasan", count: "delayed" },
  { key: "namesComplete", label: "Nama pelapor sudah lengkap", count: "noName" },
  { key: "mediaChecked", label: "Media bermasalah sudah dicek", count: "failedMedia" },
  { key: "queueReviewed", label: "Saya sudah membaca seluruh antrean", count: null }
] as const;

function currentShift(): "pagi" | "siang" | "malam" {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      hour12: false
    }).format(new Date())
  );
  if (hour >= 6 && hour < 14) return "pagi";
  if (hour >= 14 && hour < 22) return "siang";
  return "malam";
}

export function HandoverPage({ user, onToast, onOpenTicket }: HandoverPageProps) {
  const [summary, setSummary] = useState<HandoverSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [shift, setShift] = useState<"pagi" | "siang" | "malam">(currentShift());
  const [incomingName, setIncomingName] = useState("");
  const [notes, setNotes] = useState("");
  const [signedByName, setSignedByName] = useState(user.name);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const result = await api.handover();
      setSummary(result);
      setChecklist({ ...result.checks, queueReviewed: false });
    } catch (cause) {
      onToast({
        title: "Gagal memuat serah terima",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allChecked = CHECK_ITEMS.every((item) => checklist[item.key]);
  const canSubmit = ["piket", "pawas", "kapolsek", "admin"].includes(user.role);
  const p1 = useMemo(
    () => summary?.tickets.filter((ticket) => ticket.priority === "P1") ?? [],
    [summary]
  );

  async function submit() {
    if (!allChecked) {
      setError("Centang semua item checklist sebelum serah terima.");
      return;
    }
    if (incomingName.trim().length < 3 || notes.trim().length < 3) {
      setError("Nama petugas masuk dan catatan shift wajib diisi minimal 3 karakter.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.submitHandover({
        shift,
        incomingName: incomingName.trim(),
        notes: notes.trim(),
        signedByName: signedByName.trim(),
        checklist
      });
      setSummary(result.summary);
      setChecklist({ ...result.summary.checks, queueReviewed: false });
      setNotes("");
      onToast({
        title: "Serah terima tercatat",
        message: `${user.name} → ${incomingName.trim()} · ${result.summary.counts.active} tiket aktif diserahkan.`,
        type: "success"
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan serah terima.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="view is-active" data-view-panel="handover">
      <div className="page-head">
        <div>
          <div className="eyebrow">SERAH TERIMA</div>
          <h2>Pergantian Shift</h2>
          <p>Pastikan semua tiket aktif, P1, tunda, dan media sudah diperiksa sebelum menandatangani.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} /> {loading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
      </div>

      <div className="handover-grid">
        <div className="panel shift-card">
          <div className="eyebrow">SHIFT</div>
          <div className="segmented small" style={{ marginBottom: 12 }}>
            {(["pagi", "siang", "malam"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={shift === value ? "is-active" : ""}
                onClick={() => setShift(value)}
              >
                {value[0]?.toUpperCase()}
                {value.slice(1)}
              </button>
            ))}
          </div>

          <div className="shift-people">
            <div className="shift-person">
              <span className="avatar avatar-sm">{initials(user.name)}</span>
              <div>
                <span className="muted">Petugas keluar</span>
                <b>{user.name}</b>
                <span className="mono">{user.role.toUpperCase()}</span>
              </div>
            </div>
            <div className="shift-arrow">
              <ArrowDown className="icon" />
            </div>
            <div className="shift-person">
              <span className="avatar avatar-sm">{initials(incomingName || "?")}</span>
              <div>
                <span className="muted">Petugas masuk</span>
                <b>{incomingName || "Belum diisi"}</b>
                <span className="mono">serah terima</span>
              </div>
            </div>
          </div>

          <div className="filter-group" style={{ marginTop: 16 }}>
            <label>Checklist</label>
            <div className="checklist">
              {CHECK_ITEMS.map((item) => {
                const count =
                  item.count && summary
                    ? summary.counts[item.count as keyof HandoverSummary["counts"]]
                    : null;
                return (
                  <label className="check-item" key={item.key}>
                    <input
                      type="checkbox"
                      checked={Boolean(checklist[item.key])}
                      onChange={(event) =>
                        setChecklist((previous) => ({
                          ...previous,
                          [item.key]: event.target.checked
                        }))
                      }
                    />
                    <span className="check-box"><Check className="icon" /></span>
                    <span className="check-label">{item.label}</span>
                    {count !== null && count !== undefined ? (
                      <span className="count">{count}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="shift-summary">
            <div>
              <b>{summary?.counts.active ?? "—"}</b>
              <span>Aktif</span>
            </div>
            <div>
              <b>{summary?.counts.p1 ?? "—"}</b>
              <span>P1 aktif</span>
            </div>
            <div>
              <b>{summary?.counts.unassigned ?? "—"}</b>
              <span>Tanpa petugas</span>
            </div>
            <div>
              <b>{summary?.counts.delayed ?? "—"}</b>
              <span>Ditunda</span>
            </div>
          </div>
        </div>

        <div className="panel handover-list">
          <header className="panel-head">
            <div>
              <div className="eyebrow">TIKET TERBUKA</div>
              <h2>
                Diserahkan <span className="count-badge">{summary?.tickets.length ?? 0}</span>
              </h2>
            </div>
            <ArrowLeftRight size={16} className="muted" />
          </header>

          {p1.length > 0 ? (
            <div className="handover-warning">
              <ShieldCheck size={13} /> {p1.length} P1 masih aktif — pastikan sudah dikoordinasikan.
            </div>
          ) : null}

          <div className="handover-tickets">
            {loading && !summary ? (
              <div className="data-empty">Memuat tiket...</div>
            ) : summary && summary.tickets.length === 0 ? (
              <div className="data-empty">Tidak ada tiket aktif. Shift bersih.</div>
            ) : (
              summary?.tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  className="handover-ticket"
                  type="button"
                  onClick={() => onOpenTicket(ticket.id)}
                >
                  <span className="ht-main">
                    <span className="ht-id">
                      {shortTicket(ticket.ticketNo)} · {ticket.categoryLabel}
                    </span>
                    <span className="ht-title">{ticket.title}</span>
                    <span className="ht-meta">
                      {ticket.reporterName} · {ticket.region ?? "Wilayah belum jelas"} ·{" "}
                      {ticket.assignee ?? "Belum ditugaskan"}
                    </span>
                  </span>
                  <span
                    className="status-chip"
                    style={{ ["--c" as string]: STATUS_META[ticket.status as TicketStatus].color }}
                  >
                    <i className="dot" />
                    {STATUS_META[ticket.status as TicketStatus].label}
                  </span>
                  <span className="ht-age">{timeAgo(ticket.createdAt)}</span>
                </button>
              ))
            )}
          </div>

          <div className="fine-print">
            Riwayat serah terima terakhir:{" "}
            {summary?.lastHandover
              ? `${summary.lastHandover.shiftLabel} · ${summary.lastHandover.officerName ?? "—"} → ${
                  summary.lastHandover.incomingName ?? "—"
                } · ${timeAgo(summary.lastHandover.signedAt ?? summary.lastHandover.endedAt ?? summary.generatedAt)}`
              : "belum ada"}
          </div>
        </div>

        <div className="panel handover-notes">
          <header className="panel-head">
            <div>
              <div className="eyebrow">CATATAN & TANDA TANGAN</div>
              <h2>Serah Terima</h2>
            </div>
          </header>

          <label className="field">
            <span>Nama petugas masuk *</span>
            <input
              value={incomingName}
              onChange={(event) => setIncomingName(event.target.value)}
              placeholder="Nama lengkap petugas shift berikutnya"
            />
          </label>

          <label className="field" style={{ marginTop: 10 }}>
            <span>Catatan shift *</span>
            <textarea
              className="textarea"
              rows={6}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Kondisi antrean, P1 yang masih berjalan, tiket tunda, kendala media, atau instruksi untuk shift berikutnya..."
            />
          </label>

          <div className="handover-sign">
            <label className="field">
              <span>Tanda tangan (nama) *</span>
              <input
                value={signedByName}
                onChange={(event) => setSignedByName(event.target.value)}
              />
            </label>
            <div className="sign-line">
              <b>{signedByName || "—"}</b>
              <span>{user.role} · {user.name}</span>
              <span className="mono">{new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</span>
            </div>
            {error ? <div className="login-error" role="alert">{error}</div> : null}
            <button
              className="btn btn-primary btn-block"
              type="button"
              onClick={() => void submit()}
              disabled={submitting || loading || !allChecked || !canSubmit}
            >
              {submitting ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
              {submitting ? "Menyimpan..." : "Tandatangani serah terima"}
            </button>
            <p className="fine-print">
              {canSubmit
                ? "Tanda tangan elektronik berupa nama + audit log. Bukan tanda tangan digital tersertifikasi."
                : "Role Anda hanya dapat melihat ringkasan serah terima. Penandatanganan dilakukan piket/pawas/kapolsek/admin."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
