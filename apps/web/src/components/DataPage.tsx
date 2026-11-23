import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldAlert, ShieldBan, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import type { AuditEntry, ReporterRecord } from "../lib/types";
import { formatWib, formatWibDate, timeAgo } from "../lib/format";

type DataTab = "audit" | "reporters";

interface DataPageProps {
  onToast: (toast: { title: string; message: string; type: "success" | "danger" | "info" }) => void;
}

function metaSummary(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  return Object.entries(meta as Record<string, unknown>)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : String(value)}`)
    .join(" · ");
}

export function DataPage({ onToast }: DataPageProps) {
  const [tab, setTab] = useState<DataTab>("audit");
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [reporters, setReporters] = useState<ReporterRecord[]>([]);
  const [reportersLoading, setReportersLoading] = useState(false);
  const [reporterSearch, setReporterSearch] = useState("");

  async function loadAudit() {
    setLoading(true);
    try {
      const result = await api.audit(200);
      setItems(result.items);
    } catch (cause) {
      onToast({
        title: "Gagal memuat audit",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadReporters(term = reporterSearch) {
    setReportersLoading(true);
    try {
      const result = await api.reporters(term, 200);
      setReporters(result.items);
    } catch (cause) {
      onToast({
        title: "Gagal memuat pelapor",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setReportersLoading(false);
    }
  }

  useEffect(() => {
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "reporters" && reporters.length === 0) {
      void loadReporters("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const actions = useMemo(() => {
    const prefixes = new Map<string, number>();
    for (const item of items) {
      const prefix = item.action.split(".").slice(0, 2).join(".");
      prefixes.set(prefix, (prefixes.get(prefix) ?? 0) + 1);
    }
    return [...prefixes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (action !== "all" && !item.action.startsWith(action)) return false;
      if (!term) return true;
      return `${item.action} ${item.actorName ?? ""} ${item.entity ?? ""} ${item.entityId ?? ""} ${
        item.ip ?? ""
      }`
        .toLowerCase()
        .includes(term);
    });
  }, [items, action, search]);

  async function toggleBlock(reporter: ReporterRecord) {
    if (reporter.blockedAt) {
      try {
        await api.unblockReporter(reporter.id);
        onToast({ title: "Blokir dibuka", message: reporter.name, type: "success" });
        void loadReporters();
      } catch (cause) {
        onToast({
          title: "Gagal membuka blokir",
          message: cause instanceof Error ? cause.message : "Coba lagi.",
          type: "danger"
        });
      }
      return;
    }
    const reason = window.prompt(`Alasan memblokir ${reporter.name}?`, "Laporan palsu berulang");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      onToast({ title: "Alasan terlalu pendek", message: "Minimal 3 karakter.", type: "danger" });
      return;
    }
    try {
      await api.blockReporter(reporter.id, reason.trim());
      onToast({ title: "Nomor diblokir", message: `${reporter.name} · ${reason.trim()}`, type: "success" });
      void loadReporters();
    } catch (cause) {
      onToast({
        title: "Gagal memblokir",
        message: cause instanceof Error ? cause.message : "Coba lagi.",
        type: "danger"
      });
    }
  }

  return (
    <section className="view is-active" data-view-panel="data">
      <div className="page-head">
        <div>
          <div className="eyebrow">AUDIT & REGISTRY</div>
          <h2>{tab === "audit" ? "Jejak Aktivitas" : "Registry Pelapor"}</h2>
          <p>
            {tab === "audit"
              ? "Semua aksi petugas, perubahan tiket, dan akses data sensitif tercatat append-only."
              : "Nomor dimasker. Blokir hanya untuk laporan palsu/abuse dengan alasan yang tercatat."}
          </p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => (tab === "audit" ? void loadAudit() : void loadReporters())}
            disabled={loading || reportersLoading}
          >
            <RefreshCw size={13} /> {loading || reportersLoading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>
      </div>

      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={tab === "audit" ? "is-active" : ""} type="button" onClick={() => setTab("audit")}>
          Audit Log <span className="tab-count">{items.length}</span>
        </button>
        <button
          className={tab === "reporters" ? "is-active" : ""}
          type="button"
          onClick={() => setTab("reporters")}
        >
          Pelapor <span className="tab-count">{reporters.length}</span>
        </button>
      </div>

      {tab === "audit" ? (
        <div className="panel data-panel">
          <div className="tabs">
            <button className={`tab ${action === "all" ? "is-active" : ""}`} type="button" onClick={() => setAction("all")}>
              Semua <span className="tab-count">{items.length}</span>
            </button>
            {actions.map(([prefix, count]) => (
              <button
                key={prefix}
                className={`tab ${action === prefix ? "is-active" : ""}`}
                type="button"
                onClick={() => setAction(prefix)}
              >
                {prefix} <span className="tab-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="data-toolbar">
            <label className="search-box">
              <Search className="icon" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari aksi, aktor, entitas, atau IP..."
              />
            </label>
            <div className="data-toolbar-meta">
              <span className="mono">{visible.length} baris</span>
              <span className="badge muted">append-only</span>
            </div>
          </div>

          <div className="table-wrap">
            {loading && items.length === 0 ? (
              <div className="data-empty">Memuat audit log...</div>
            ) : visible.length === 0 ? (
              <div className="data-empty">
                <ShieldAlert size={18} />
                <div>Tidak ada audit yang cocok.</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Aksi</th>
                    <th>Aktor</th>
                    <th>Entitas</th>
                    <th>Detail</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td className="mono" title={item.createdAt}>
                        {formatWib(item.createdAt)}
                        <span className="cell-sub">
                          {formatWibDate(item.createdAt)} · {timeAgo(item.createdAt)}
                        </span>
                      </td>
                      <td>
                        <span className="cell-name">{item.action}</span>
                      </td>
                      <td>{item.actorName ?? "Sistem"}</td>
                      <td className="mono">
                        {item.entity ?? "—"}
                        {item.entityId ? (
                          <span className="cell-sub">{item.entityId.slice(0, 18)}…</span>
                        ) : null}
                      </td>
                      <td className="cell-sub" style={{ maxWidth: 320, whiteSpace: "normal" }}>
                        {metaSummary(item.meta) || "—"}
                      </td>
                      <td className="mono">{item.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel-foot data-foot">
            <span className="live-dot" />
            <span className="muted">Audit tidak bisa dihapus dari aplikasi. Retensi mengikuti kebijakan DPO.</span>
          </div>
        </div>
      ) : (
        <div className="panel data-panel">
          <div className="data-toolbar">
            <label className="search-box">
              <Search className="icon" />
              <input
                value={reporterSearch}
                onChange={(event) => setReporterSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadReporters(reporterSearch);
                }}
                placeholder="Cari nama pelapor..."
              />
            </label>
            <div className="data-toolbar-meta">
              <button className="filter-btn" type="button" onClick={() => void loadReporters(reporterSearch)}>
                Cari
              </button>
              <span className="mono">{reporters.length} pelapor</span>
            </div>
          </div>

          <div className="table-wrap">
            {reportersLoading && reporters.length === 0 ? (
              <div className="data-empty">Memuat pelapor...</div>
            ) : reporters.length === 0 ? (
              <div className="data-empty">Belum ada pelapor.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Telepon</th>
                    <th>Laporan</th>
                    <th>Valid</th>
                    <th>Palsu</th>
                    <th>Status</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {reporters.map((reporter) => (
                    <tr key={reporter.id}>
                      <td className="cell-name">{reporter.name}</td>
                      <td className="mono">{reporter.phoneMasked}</td>
                      <td className="mono">{reporter.reportCount}</td>
                      <td className="mono">{reporter.validCount}</td>
                      <td className="mono">{reporter.falseCount}</td>
                      <td>
                        {reporter.blockedAt ? (
                          <span className="badge red">
                            <ShieldBan size={9} /> DIBLOKIR
                          </span>
                        ) : (
                          <span className="badge green">
                            <ShieldCheck size={9} /> AKTIF
                          </span>
                        )}
                        {reporter.blockedReason ? (
                          <span className="cell-sub">{reporter.blockedReason}</span>
                        ) : null}
                      </td>
                      <td>
                        <button className="filter-btn" type="button" onClick={() => void toggleBlock(reporter)}>
                          {reporter.blockedAt ? "Buka blokir" : "Blokir"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="panel-foot data-foot">
            <span className="live-dot" />
            <span className="muted">
              Blokir mencegah pembuatan tiket baru dari nomor tersebut. Keputusan bisa dibuka kembali.
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
