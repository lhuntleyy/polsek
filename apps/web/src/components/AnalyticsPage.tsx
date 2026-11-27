import { useState } from "react";
import {
  BarChart3,
  Clock3,
  Download,
  Flame,
  Loader2,
  RefreshCw,
  Send
} from "lucide-react";
import { api } from "../lib/api";
import type { AnalyticsSummary } from "../lib/types";
import { CATEGORY_META, formatWibDate, timeAgo } from "../lib/format";

interface AnalyticsPageProps {
  summary: AnalyticsSummary | null;
  loading: boolean;
  canExport: boolean;
  canDigest: boolean;
  onRefresh: () => void;
  onToast: (toast: { title: string; message: string; type: "success" | "danger" | "info" }) => void;
}

function formatSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 60) return `${Math.round(value)} dtk`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}j ${minutes % 60}m`;
}

function currentMonth(): string {
  const wib = new Date(Date.now() + 7 * 3_600_000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}`;
}

function percent(part: number, total: number): string {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

export function AnalyticsPage({
  summary,
  loading,
  canExport,
  canDigest,
  onRefresh,
  onToast
}: AnalyticsPageProps) {
  const [month, setMonth] = useState(currentMonth());
  const [digesting, setDigesting] = useState(false);

  async function sendDigest() {
    setDigesting(true);
    try {
      const result = await api.triggerDigest();
      onToast({
        title: "Digest dikirim ke antrean",
        message:
          result.queued > 0
            ? `${result.queued} penerima · ${result.date}`
            : `Tidak ada penerima (${result.skipped ?? "unknown"}).`,
        type: result.queued > 0 ? "success" : "info"
      });
    } catch (error) {
      onToast({
        title: "Gagal mengirim digest",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setDigesting(false);
    }
  }

  const maxDaily = Math.max(...(summary?.daily.map((day) => day.total) ?? [1]), 1);
  const maxHeat = Math.max(
    ...(summary?.heatmap.values.flat() ?? [1]),
    1
  );
  const topCategory = summary
    ? Object.entries(summary.byCategory)
        .filter(([, count]) => count > 0)
        .sort(([, a], [, b]) => b - a)[0] ?? null
    : null;
  const topRegion = summary?.topLocations?.find((loc) => loc.id !== null) ?? null;
  const ackPercent = summary
    ? percent(summary.sla.p1AckWithinTarget, summary.sla.p1AckTotal)
    : "—";
  const otwPercent = summary
    ? percent(summary.sla.p1OtwWithinTarget, summary.sla.p1OtwTotal)
    : "—";

  return (
    <section className="view is-active" data-view-panel="analytics" style={{ overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">INTELIJEN OPERASIONAL</div>
          <h2>
            Analitik <span className="muted">· laporan & SLA</span>
          </h2>
          <p>Volume, titik rawan, dan kecepatan respons dari database.</p>
        </div>
        <div className="page-actions">
          <label className="month-picker">
            <span>Bulan laporan</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          {canExport ? (
            <>
              <a className="btn btn-ghost" href={`/api/export/tickets.csv?month=${month}`} download>
                <Download size={13} /> CSV
              </a>
              <a className="btn btn-ghost" href={`/api/export/tickets.xlsx?month=${month}`} download>
                <Download size={13} /> Excel
              </a>
              <a className="btn btn-ghost" href={`/api/export/monthly.pdf?month=${month}`} download>
                <Download size={13} /> PDF
              </a>
            </>
          ) : null}
          {canDigest ? (
            <button className="btn btn-ghost" type="button" onClick={() => void sendDigest()} disabled={digesting}>
              {digesting ? <Loader2 className="spin" size={14} /> : <Send size={14} />}
              Digest
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {!summary ? (
        <div className="panel data-empty">{loading ? "Memuat analitik..." : "Belum ada data."}</div>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Total laporan</div>
              <div className="kpi-value">{summary.total}</div>
              <div className="kpi-delta">{summary.active} masih aktif</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Jenis kasus terbanyak</div>
              <div className="kpi-value">
                {topCategory ? (CATEGORY_META[topCategory[0]]?.short ?? topCategory[0]) : "—"}
              </div>
              <div className="kpi-delta">
                {topCategory ? `${topCategory[1]} laporan (${percent(topCategory[1], summary.total)})` : "Belum ada laporan"}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Wilayah paling rawan</div>
              <div className="kpi-value">{topRegion?.name ?? "—"}</div>
              <div className="kpi-delta">
                {topRegion?.topCategory
                  ? `${topRegion.count} laporan · terbanyak ${topRegion.topCategory.label}`
                  : "Belum ada data wilayah"}
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Median ack</div>
              <div className="kpi-value">{formatSeconds(summary.response.medianAckSeconds)}</div>
              <div className="kpi-delta">p90 {formatSeconds(summary.response.p90AckSeconds)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Median OTW</div>
              <div className="kpi-value">{formatSeconds(summary.response.medianOtwSeconds)}</div>
              <div className="kpi-delta">p90 {formatSeconds(summary.response.p90OtwSeconds)}</div>
            </div>
          </div>

          {summary.topLocations ? (
            <section className="panel chart-card loc-rank-card">
              <header className="card-head">
                <div>
                  <div className="eyebrow">LOKASI TERBANYAK</div>
                  <h3>Jenis kasus tertinggi tiap desa/kelurahan</h3>
                </div>
                <Flame size={18} className="muted" />
              </header>
              <div className="loc-rank">
                <div className="loc-rank-row loc-rank-head">
                  <span>#</span>
                  <span>Lokasi</span>
                  <span>Kasus terbanyak</span>
                  <span>Rincian kasus</span>
                  <span className="num">Total</span>
                </div>
                {summary.topLocations.map((loc, index) => (
                  <div className="loc-rank-row" key={loc.id ?? "none"}>
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="loc-name">
                      {loc.name}
                      <small>Terakhir {timeAgo(loc.lastAt)}</small>
                    </span>
                    <span className="loc-top">
                      {loc.topCategory ? `${loc.topCategory.label} (${loc.topCategory.count})` : "—"}
                    </span>
                    <span className="loc-cats">
                      {loc.categories.map((item) => (
                        <span className="loc-chip" key={item.category}>
                          {CATEGORY_META[item.category]?.short ?? item.label}{" "}
                          <b>{item.count}</b>
                        </span>
                      ))}
                    </span>
                    <span className="num"><b>{loc.count}</b></span>
                  </div>
                ))}
                {summary.topLocations.length === 0 ? (
                  <div className="data-empty">Belum ada laporan pada periode ini.</div>
                ) : null}
              </div>
              <p className="fine-print">
                Diurutkan dari jumlah laporan terbanyak. "Belum terpetakan" = lokasi belum cocok
                dengan polygon desa.
              </p>
            </section>
          ) : null}

          <div className="analytics-grid">
            <section className="panel chart-card span-2">
              <header className="card-head">
                <div>
                  <div className="eyebrow">VOLUME</div>
                  <h3>14 hari terakhir</h3>
                </div>
                <BarChart3 size={18} className="muted" />
              </header>
              <div className="daily-bars">
                {summary.daily.map((day) => (
                  <div
                    className="daily-bar"
                    key={day.date}
                    title={`${formatWibDate(day.date)} · ${day.total} laporan · ${day.closed} selesai · ${day.p1} P1`}
                  >
                    <span
                      className="daily-bar-fill"
                      style={{ height: `${Math.max(4, Math.round((day.total / maxDaily) * 100))}%` }}
                    />
                    <b>{day.total || ""}</b>
                    <i>{day.date.slice(8)}</i>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel chart-card">
              <header className="card-head">
                <div>
                  <div className="eyebrow">RESPONS</div>
                  <h3>SLA internal</h3>
                </div>
                <Clock3 size={18} className="muted" />
              </header>
              <div className="backup-list">
                <div className="kv">
                  <span>Median ack</span>
                  <b>{formatSeconds(summary.response.medianAckSeconds)}</b>
                </div>
                <div className="kv">
                  <span>p90 ack</span>
                  <b>{formatSeconds(summary.response.p90AckSeconds)}</b>
                </div>
                <div className="kv">
                  <span>P1 ack ≤ {formatSeconds(summary.targets.ackSeconds)}</span>
                  <b>{ackPercent} <span className="muted">({summary.sla.p1AckWithinTarget}/{summary.sla.p1AckTotal})</span></b>
                </div>
                <div className="kv">
                  <span>P1 OTW ≤ {formatSeconds(summary.targets.otwSeconds)}</span>
                  <b>{otwPercent} <span className="muted">({summary.sla.p1OtwWithinTarget}/{summary.sla.p1OtwTotal})</span></b>
                </div>
                <div className="kv">
                  <span>Median tutup</span>
                  <b>{formatSeconds(summary.response.medianCloseSeconds)}</b>
                </div>
              </div>
              <p className="fine-print">
                Angka internal, bukan janji layanan publik. Persentase dihitung dari tiket yang sudah
                memiliki timestamp.
              </p>
            </section>

            <section className="panel chart-card span-2">
              <header className="card-head">
                <div>
                  <div className="eyebrow">POLA WAKTU</div>
                  <h3>Heatmap hari × jam (WIB)</h3>
                </div>
                <div className="heat-legend">
                  Rendah <span className="heat-scale" /> Tinggi
                </div>
              </header>
              <div>
                {summary.heatmap.days.map((day, dayIndex) => (
                  <div className="heat-row" key={day}>
                    <span className="heat-day">{day}</span>
                    {(summary.heatmap.values[dayIndex] ?? []).map((count, hour) => (
                      <span
                        key={hour}
                        className="heat-cell"
                        title={`${day} ${String(hour).padStart(2, "0")}:00 · ${count} laporan`}
                        style={{
                          background: `rgba(255, 176, 32, ${
                            count === 0 ? 0.04 : 0.12 + (count / maxHeat) * 0.82
                          })`
                        }}
                      />
                    ))}
                  </div>
                ))}
                <div className="heat-hours">
                  <span />
                  {summary.heatmap.hours.map((hour) => (
                    <span className="heat-hour" key={hour}>
                      {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="panel chart-card">
              <header className="card-head">
                <div>
                  <div className="eyebrow">REPEAT LOCATION</div>
                  <h3>Titik rawan</h3>
                </div>
                <Flame size={18} className="muted" />
              </header>
              <div className="hotspot-table">
                {summary.hotspots.slice(0, 6).map((spot, index) => (
                  <a
                    className="hotspot-table-row"
                    key={`${spot.lat},${spot.lng}`}
                    href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="hs-name">
                      {CATEGORY_META[spot.category]?.short ?? spot.category}
                      <span className="hs-region"> · {spot.region ?? "Tanpa wilayah"} · {timeAgo(spot.lastAt)}</span>
                    </span>
                    <span className="hs-count">{spot.count}</span>
                  </a>
                ))}
                {summary.hotspots.length === 0 ? (
                  <div className="data-empty">Belum ada titik dengan koordinat.</div>
                ) : null}
              </div>
              <p className="fine-print">Cluster koordinat ±100 m. Klik untuk membuka area di Maps.</p>
            </section>

            <section className="panel chart-card span-2">
              <header className="card-head">
                <div>
                  <div className="eyebrow">KOMPOSISI</div>
                  <h3>Kategori laporan</h3>
                </div>
              </header>
              <div className="region-bars">
                {Object.entries(summary.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => {
                    const max = Math.max(...Object.values(summary.byCategory), 1);
                    return (
                      <div className="region-row" key={category}>
                        <span className="region-name">
                          {CATEGORY_META[category]?.label ?? category}
                        </span>
                        <span className="region-track">
                          <span
                            className="region-fill"
                            style={{ width: `${Math.round((count / max) * 100)}%` }}
                          />
                        </span>
                        <span className="region-value">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </section>

            <section className="panel chart-card">
              <header className="card-head">
                <div>
                  <div className="eyebrow">SEBARAN</div>
                  <h3>Per wilayah</h3>
                </div>
              </header>
              <div className="region-bars">
                {summary.byRegion.slice(0, 5).map((region) => {
                  const max = Math.max(...summary.byRegion.map((item) => item.count), 1);
                  return (
                    <div className="region-row" key={region.id}>
                      <span className="region-name">{region.name}</span>
                      <span className="region-track">
                        <span
                          className="region-fill"
                          style={{ width: `${Math.round((region.count / max) * 100)}%` }}
                        />
                      </span>
                      <span className="region-value">{region.count}</span>
                    </div>
                  );
                })}
                {summary.byRegion.length === 0 ? (
                  <div className="data-empty">Belum ada wilayah terklasifikasi.</div>
                ) : null}
              </div>
            </section>

            <section className="panel chart-card span-2">
              <header className="card-head">
                <div>
                  <div className="eyebrow">STATUS</div>
                  <h3>Distribusi tiket</h3>
                </div>
              </header>
              <div className="region-bars">
                {Object.entries(summary.byStatus).map(([status, count]) => {
                  const max = Math.max(...Object.values(summary.byStatus), 1);
                  return (
                    <div className="region-row" key={status}>
                      <span className="region-name">{status.toUpperCase()}</span>
                      <span className="region-track">
                        <span
                          className="region-fill"
                          style={{ width: `${Math.round((count / max) * 100)}%` }}
                        />
                      </span>
                      <span className="region-value">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
