import { useMemo, useState } from "react";
import { Crosshair, MapPin, TriangleAlert } from "lucide-react";
import type { Region, Ticket, TicketStatus } from "../lib/types";
import { PRIORITY_META, STATUS_META, shortTicket, timeAgo } from "../lib/format";
import { regionColor } from "../lib/map";
import { LeafletMap } from "./LeafletMap";

const CATEGORY_CHIPS = [
  { id: "all", label: "Semua", color: "var(--muted)" },
  { id: "tawuran", label: "Kamtibmas", color: "#FFB020" },
  { id: "pidana", label: "Pidana", color: "#FF7A45" },
  { id: "bencana", label: "Bencana", color: "#4D9FFF" },
  { id: "laka", label: "Laka", color: "#B18CFF" },
  { id: "kebakaran", label: "Kebakaran", color: "#FF5A5F" },
  { id: "lain", label: "Lain", color: "#8A9BAA" }
];

const STATUS_CHIPS: Array<{ id: "all" | "active" | "baru" | "proses" | "selesai"; label: string }> = [
  { id: "all", label: "Semua" },
  { id: "active", label: "Aktif" },
  { id: "baru", label: "Baru" },
  { id: "proses", label: "Proses" },
  { id: "selesai", label: "Selesai" }
];

function matchesStatus(ticket: Ticket, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "active") return !["selesai", "ditolak", "dibatalkan"].includes(ticket.status);
  if (filter === "proses") return ["diterima", "otw", "ditkp", "ditunda"].includes(ticket.status);
  return ticket.status === filter;
}

interface MapPageProps {
  tickets: Ticket[];
  regions: Region[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenTicket: (id: string) => void;
}

export function MapPage({ tickets, regions, selectedId, onSelect, onOpenTicket }: MapPageProps) {
  const [status, setStatus] = useState<(typeof STATUS_CHIPS)[number]["id"]>("active");
  const [category, setCategory] = useState("all");
  const [regionId, setRegionId] = useState("all");

  const visible = useMemo(
    () =>
      tickets.filter(
        (ticket) =>
          matchesStatus(ticket, status) &&
          (category === "all" || ticket.category === category) &&
          (regionId === "all" || ticket.regionId === regionId)
      ),
    [tickets, status, category, regionId]
  );

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;
  const regionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ticket of tickets) {
      if (!ticket.regionId) continue;
      if (["selesai", "ditolak", "dibatalkan"].includes(ticket.status)) continue;
      counts.set(ticket.regionId, (counts.get(ticket.regionId) ?? 0) + 1);
    }
    return counts;
  }, [tickets]);

  const p1 = visible.filter((ticket) => ticket.priority === "P1").length;
  const active = visible.filter((ticket) => matchesStatus(ticket, "active")).length;

  return (
    <section className="map-page">
      <aside className="panel map-side">
        <header className="panel-head">
          <div>
            <div className="eyebrow">PETA WILKUM</div>
            <h2>
              Sebaran Tiket <span className="count-badge">{visible.length}</span>
            </h2>
          </div>
          <Crosshair size={16} className="muted" />
        </header>

        <div className="map-side-scroll">
          <p className="map-help">
            <b>Polygon berwarna</b> = batas wilayah hukum. <b>Pin</b> = lokasi kejadian (TKP),
            bukan domisili pelapor. Klik wilayah untuk memfilter.
          </p>

          <div className="filter-group">
            <label>Status</label>
            <div className="chip-wrap">
              {STATUS_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`mini-chip ${status === chip.id ? "is-active" : ""}`}
                  onClick={() => setStatus(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Kategori</label>
            <div className="chip-wrap">
              {CATEGORY_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={`mini-chip ${category === chip.id ? "is-active" : ""}`}
                  onClick={() => setCategory(chip.id)}
                >
                  <i style={{ ["--c" as string]: chip.color }} />
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <label>Wilayah</label>
            <select
              className="select"
              value={regionId}
              onChange={(event) => setRegionId(event.target.value)}
            >
              <option value="all">Semua wilayah</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          </div>

          <div className="map-side-stats">
            <div>
              <span>Aktif</span>
              <b>{active}</b>
            </div>
            <div>
              <span>P1</span>
              <b>{p1}</b>
            </div>
          </div>

          {selected ? (
            <div className="map-selected">
              <div className="map-selected-head">
                <span className="mono">{shortTicket(selected.ticketNo)}</span>
                <span
                  className="status-chip"
                  style={{ ["--c" as string]: STATUS_META[selected.status as TicketStatus].color }}
                >
                  <i className="dot" />
                  {STATUS_META[selected.status as TicketStatus].label}
                </span>
              </div>
              <b>{selected.title}</b>
              <span className="map-selected-meta">
                {selected.categoryLabel} · {selected.region ?? "Wilayah belum jelas"} ·{" "}
                {timeAgo(selected.createdAt)}
              </span>
              <div className="map-selected-actions">
                <button className="btn btn-primary" type="button" onClick={() => onOpenTicket(selected.id)}>
                  Buka detail
                </button>
                <span className="mono" style={{ color: PRIORITY_META[selected.priority].color }}>
                  {selected.priority}
                </span>
              </div>
            </div>
          ) : (
            <div className="map-side-note">
              <MapPin className="icon" />
              <span>Klik pin atau pilih tiket untuk melihat ringkasan. Detail penuh ada di Live Board.</span>
            </div>
          )}

          <div className="filter-group" style={{ marginTop: 16 }}>
            <label>Wilayah hukum</label>
            <div className="hotspot-list">
              {regions.map((region, index) => (
                <button
                  key={region.id}
                  type="button"
                  className={`hotspot-row ${regionId === region.id ? "is-active" : ""}`}
                  onClick={() => setRegionId(regionId === region.id ? "all" : region.id)}
                  aria-pressed={regionId === region.id}
                >
                  <span
                    className="region-dot"
                    style={{ ["--c" as string]: regionColor(index) }}
                    aria-hidden="true"
                  />
                  <span className="hotspot-main">
                    <b>{region.name}</b>
                    <span>{region.ticketCount} tiket tercatat</span>
                  </span>
                  <span className="hotspot-count">{regionCounts.get(region.id) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {regions.length === 0 ? (
            <div className="map-side-note">
              <TriangleAlert className="icon" />
              <span>Polygon wilayah belum tersedia. Pin tetap tampil berdasarkan koordinat tiket.</span>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="panel map-full-panel">
        <div className="map-head">
          <div className="map-title">
            <span className="live-dot" />
            <b>Peta Interaktif</b>
            <span className="mono">{visible.length} pin</span>
          </div>
          <div className="map-layers">
            <span className="layer-chip is-active">OpenStreetMap</span>
          </div>
        </div>

        <LeafletMap
          tickets={visible}
          regions={regions}
          selectedId={selectedId}
          onSelect={onSelect}
          className="map-page-leaflet"
        />

        <div className="map-legend">
          <span><i className="legend-dot" style={{ ["--c" as string]: STATUS_META.baru.color }} />Baru</span>
          <span><i className="legend-dot" style={{ ["--c" as string]: STATUS_META.diterima.color }} />Diterima</span>
          <span><i className="legend-dot" style={{ ["--c" as string]: STATUS_META.otw.color }} />OTW</span>
          <span><i className="legend-dot" style={{ ["--c" as string]: STATUS_META.ditkp.color }} />Di TKP</span>
          <span><i className="legend-dot" style={{ ["--c" as string]: STATUS_META.selesai.color }} />Selesai</span>
          <span><i className="legend-ring" />P1</span>
        </div>
        <div className="map-foot">
          <span className="pulse-dot" /> Live
          <span className="dot-sep">·</span>
          <span>{regions.length} wilayah</span>
          <span className="map-disclaimer">
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              © OpenStreetMap
            </a>{" "}
            · tile terang
          </span>
        </div>
      </div>
    </section>
  );
}
