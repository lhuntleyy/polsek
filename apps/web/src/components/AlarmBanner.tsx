import { AlertTriangle, Bell, X } from "lucide-react";
import type { Ticket } from "../lib/types";
import { timeAgo } from "../lib/format";

interface AlarmBannerProps {
  ticket: Ticket;
  soundEnabled: boolean;
  onEnableSound: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}

export function AlarmBanner({
  ticket,
  soundEnabled,
  onEnableSound,
  onOpen,
  onDismiss
}: AlarmBannerProps) {
  return (
    <div className="alarm-banner" role="alert">
      <div className="alarm-siren">
        <AlertTriangle size={20} />
      </div>
      <div className="alarm-copy">
        <span className="eyebrow">LAPORAN DARURAT BARU</span>
        <b>
          {ticket.categoryLabel} · {ticket.region ?? "Wilayah belum jelas"}
        </b>
        <span className="mono">
          {ticket.ticketNo} · {timeAgo(ticket.createdAt)}
        </span>
      </div>
      {!soundEnabled ? (
        <button className="btn btn-ghost" type="button" onClick={onEnableSound}>
          <Bell size={14} /> Suara
        </button>
      ) : null}
      <button className="btn btn-danger" type="button" onClick={onOpen}>
        Buka Tiket
      </button>
      <button className="icon-btn" type="button" onClick={onDismiss} aria-label="Tutup alarm">
        <X size={16} />
      </button>
    </div>
  );
}
