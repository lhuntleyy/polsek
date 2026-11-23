import { useEffect, useRef } from "react";
import L, { type FeatureGroup, type LayerGroup, type Map as LeafletMapInstance } from "leaflet";
import type { GeoJsonObject } from "geojson";
import "leaflet/dist/leaflet.css";
import type { Region, Ticket } from "../lib/types";
import { PRIORITY_META, STATUS_META, shortTicket } from "../lib/format";
import { regionColor } from "../lib/map";

const INITIAL_CENTER: [number, number] = [-6.255, 106.99];

interface LeafletMapProps {
  tickets: Ticket[];
  regions: Region[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
  showTiles?: boolean;
  showRegionLabels?: boolean;
}

function isActive(ticket: Ticket): boolean {
  return !["selesai", "ditolak", "dibatalkan"].includes(ticket.status);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return map[character] ?? character;
  });
}

function markerHtml(ticket: Ticket, selected: boolean): string {
  const status = STATUS_META[ticket.status];
  const active = isActive(ticket);
  const classes = [
    "sigap-pin",
    active ? "is-active" : "is-done",
    selected ? "is-selected" : "",
    ticket.priority === "P1" ? "is-p1" : ""
  ]
    .filter(Boolean)
    .join(" ");
  return `<span class="${classes}" style="--c:${status.color};--cat:${PRIORITY_META[ticket.priority].color}">
    <i class="sigap-pin-dot"></i>
    <b>${shortTicket(ticket.ticketNo)}</b>
    ${ticket.priority === "P1" && active ? '<em class="sigap-pin-alert">!</em>' : ""}
  </span>`;
}

export function LeafletMap({
  tickets,
  regions,
  selectedId,
  onSelect,
  className = "",
  showTiles = true,
  showRegionLabels = true
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMapInstance | null>(null);
  const regionLayerRef = useRef<FeatureGroup | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  const didFitTickets = useRef(false);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      center: INITIAL_CENTER,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: false
    });
    mapRef.current = map;
    L.control.zoom({ position: "bottomright" }).addTo(map);

    if (showTiles) {
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Kalau tile OSM diblokir jaringan, pakai basemap Esri yang tetap terang.
      let tileErrors = 0;
      let fallbackAdded = false;
      tiles.on("tileerror", () => {
        tileErrors += 1;
        if (fallbackAdded || tileErrors < 3) return;
        fallbackAdded = true;
        map.removeLayer(tiles);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri"
          }
        ).addTo(map);
      });
    }

    const resize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const resizeTimer = window.setTimeout(resize, 80);

    return () => {
      window.clearTimeout(resizeTimer);
      observer.disconnect();
      regionLayerRef.current?.remove();
      markerLayerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      regionLayerRef.current = null;
      markerLayerRef.current = null;
      didFitTickets.current = false;
    };
  }, [showTiles]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    regionLayerRef.current?.remove();
    const group = L.featureGroup().addTo(map);
    regionLayerRef.current = group;

    for (const [index, region] of regions.entries()) {
      try {
        const color = regionColor(index);
        const layer = L.geoJSON(region.geojson as GeoJsonObject, {
          style: {
            color,
            weight: 2.2,
            opacity: 0.95,
            fillColor: color,
            fillOpacity: 0.16,
            lineJoin: "round"
          }
        });
        layer.bindTooltip(escapeHtml(region.name), {
          sticky: true,
          direction: "top",
          className: "leaflet-region-tooltip"
        });
        layer.addTo(group);

        if (showRegionLabels) {
          const bounds = layer.getBounds();
          if (bounds.isValid()) {
            const label = L.tooltip({
              permanent: true,
              direction: "center",
              className: "leaflet-region-label",
              opacity: 1,
              interactive: false
            })
              .setLatLng(bounds.getCenter())
              .setContent(
                `<b>${escapeHtml(region.name)}</b><small>batas wilayah hukum</small>`
              );
            group.addLayer(label);
          }
        }
      } catch {
        // Invalid geometry is skipped; pins still render.
      }
    }

    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.08), { animate: false });
      didFitTickets.current = true;
    }
  }, [regions, showRegionLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markerLayerRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    markerLayerRef.current = group;

    for (const ticket of tickets) {
      if (ticket.lat === null || ticket.lng === null) continue;
      const status = STATUS_META[ticket.status];
      const marker = L.marker([ticket.lat, ticket.lng], {
        icon: L.divIcon({
          className: "sigap-pin-wrap",
          html: markerHtml(ticket, ticket.id === selectedId),
          iconSize: [40, 26],
          iconAnchor: [20, 13]
        }),
        title: `${ticket.ticketNo} · ${ticket.title}`,
        riseOnHover: true
      });
      marker.bindTooltip(
        `<b>${escapeHtml(shortTicket(ticket.ticketNo))}</b> ${escapeHtml(ticket.title)}<span>${status.label} · ${ticket.priority}</span>`,
        { direction: "top", offset: [0, -12], className: "leaflet-ticket-tooltip" }
      );
      marker.on("click", () => onSelectRef.current(ticket.id));
      marker.addTo(group);
    }

    if (!didFitTickets.current) {
      const points = tickets
        .filter((ticket) => ticket.lat !== null && ticket.lng !== null)
        .map((ticket) => [ticket.lat as number, ticket.lng as number] as [number, number]);
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points).pad(0.2), { animate: false });
        didFitTickets.current = true;
      }
    }
  }, [tickets, selectedId]);

  return <div ref={containerRef} className={`leaflet-map ${className}`.trim()} />;
}
