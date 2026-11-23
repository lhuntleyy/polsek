import { CircleAlert } from "lucide-react";
import type { Region, Ticket } from "../lib/types";
import { STATUS_META } from "../lib/format";
import { LeafletMap } from "./LeafletMap";

interface WebMapProps {
  tickets: Ticket[];
  regions: Region[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function WebMap({ tickets, regions, selectedId, onSelect }: WebMapProps) {
  const active = tickets.filter(
    (ticket) => !["selesai", "ditolak", "dibatalkan"].includes(ticket.status)
  );
  const p1 = active.filter((ticket) => ticket.priority === "P1").length;
  const baru = active.filter((ticket) => ticket.status === "baru").length;
  const otw = active.filter((ticket) => ticket.status === "otw" || ticket.status === "ditkp").length;

  return (
    <section className="panel map-panel" aria-label="Peta wilayah hukum">
      <div className="map-head">
        <div className="map-title">
          <span className="live-dot" />
          <b>Peta Wilkum</b>
          <span className="mono">{active.length} tiket aktif</span>
        </div>
        <div className="map-layers">
          <span className="layer-chip is-active">Live</span>
        </div>
      </div>

      <LeafletMap
        tickets={tickets}
        regions={regions}
        selectedId={selectedId}
        onSelect={onSelect}
        className="web-map-leaflet"
        showRegionLabels={false}
      />

      {regions.length === 0 ? (
        <div className="map-fallback-hint">
          <CircleAlert size={13} />
          <span>Polygon wilayah belum diunggah. Pin tetap tampil dari koordinat tiket.</span>
        </div>
      ) : null}

      <div className="map-stats">
        <div className="map-stat is-red">
          <span>P1</span>
          <b>{p1}</b>
        </div>
        <div className="map-stat is-amber">
          <span>Baru</span>
          <b>{baru}</b>
        </div>
        <div className="map-stat">
          <span>OTW</span>
          <b>{otw}</b>
        </div>
      </div>

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
    </section>
  );
}
