import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BellOff,
  BookOpen,
  Database,
  LogOut,
  Map,
  Maximize2,
  Minimize2,
  Moon,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Sun
} from "lucide-react";
import type { Role, Unit, User, WaGateway } from "../lib/types";
import type { Theme } from "../lib/theme";
import { formatWib, formatWibDate, initials } from "../lib/format";

export type View = "live" | "map" | "analytics" | "data" | "handover" | "system" | "guide";

const VIEWS: Array<{
  id: View;
  label: string;
  title: string;
  icon: typeof Activity;
  roles?: Role[];
}> = [
  { id: "live", label: "Live", title: "Live Board", icon: Activity },
  { id: "map", label: "Peta", title: "Peta Wilkum", icon: Map },
  { id: "analytics", label: "Analitik", title: "Analitik", icon: BarChart3 },
  {
    id: "data",
    label: "Data",
    title: "Data & Registry",
    icon: Database,
    roles: ["admin", "pawas"]
  },
  {
    id: "handover",
    label: "Serah",
    title: "Serah Terima",
    icon: ArrowLeftRight,
    roles: ["admin", "kapolsek", "pawas", "piket", "urc"]
  },
  { id: "system", label: "Sistem", title: "Sistem", icon: Settings },
  { id: "guide", label: "Panduan", title: "Panduan Penggunaan", icon: BookOpen }
];

interface ShellProps {
  user: User;
  unit: Unit;
  view: View;
  onView: (view: View) => void;
  onLogout: () => void;
  sseConnected: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  search: string;
  onSearch: (value: string) => void;
  activeCount: number;
  wallMode: boolean;
  onToggleWall: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  waStatus: WaGateway["status"];
  env?: string;
  children: ReactNode;
}

export function Shell({
  user,
  unit,
  view,
  onView,
  onLogout,
  sseConnected,
  soundEnabled,
  onToggleSound,
  search,
  onSearch,
  activeCount,
  wallMode,
  onToggleWall,
  theme,
  onToggleTheme,
  waStatus,
  env,
  children
}: ShellProps) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: unit.timezone,
      hour: "2-digit",
      hour12: false
    }).format(now)
  );
  const shift =
    hour >= 6 && hour < 14
      ? "Shift Pagi · 06:00–14:00"
      : hour >= 14 && hour < 22
        ? "Shift Siang · 14:00–22:00"
        : "Shift Malam · 22:00–06:00";
  const current = VIEWS.find((item) => item.id === view);

  return (
    <div className="app">
      <aside className="rail" aria-label="Navigasi utama">
        <div className="rail-brand" title="SIGAP">
          <span className="brand-mark">
            <ShieldCheck size={22} strokeWidth={1.8} />
          </span>
          <span className="brand-name">SIGAP</span>
        </div>

        <nav className="rail-nav">
          {VIEWS.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`rail-item ${view === item.id ? "is-active" : ""}`}
                onClick={() => onView(item.id)}
                title={item.title}
                aria-current={view === item.id ? "page" : undefined}
              >
                <Icon className="icon" size={19} strokeWidth={1.7} />
                <span>{item.label}</span>
                {item.id === "live" && activeCount > 0 ? (
                  <i className="rail-badge">{activeCount}</i>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="rail-foot">
          <div className="rail-divider" />
          <button className="rail-user" type="button" title={`${user.name} · ${user.role}`}>
            <span className="avatar avatar-sm">{initials(user.name)}</span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <div className="eyebrow">
              {unit.code} · {unit.name}{" "}
              {env && env !== "production" ? <span className="demo-tag">DEV</span> : null}
            </div>
            <div className="title-row">
              <h1>{current?.title ?? "Live Board"}</h1>
              <span className="shift-tag">{shift}</span>
            </div>
          </div>

          <label className="topbar-search">
            <Search size={15} />
            <input
              id="global-search"
              type="search"
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Cari tiket, nama, wilayah..."
              aria-label="Cari tiket"
            />
            <kbd>/</kbd>
          </label>

          <div className="topbar-actions">
            <div className={`gateway-pill ${sseConnected ? "" : "is-off"}`} title="Status stream real-time">
              <span className="pulse-dot" />
              <span className="gateway-label">SSE</span>
              <b>{sseConnected ? "LIVE" : "OFFLINE"}</b>
            </div>
            <div
              className={`gateway-pill is-wa ${waStatus === "connected" ? "" : "is-off"}`}
              title={`WhatsApp gateway: ${waStatus}`}
            >
              <Radio size={12} />
              <span className="gateway-label">WA</span>
              <b>{waStatus === "connected" ? "AKTIF" : waStatus === "qr" ? "PAIRING" : "OFFLINE"}</b>
            </div>
            <button
              className={`icon-btn ${soundEnabled ? "is-active" : ""}`}
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? "Matikan suara alarm" : "Aktifkan suara alarm"}
              aria-pressed={soundEnabled}
            >
              {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
            <button
              className={`icon-btn ${wallMode ? "is-active" : ""}`}
              type="button"
              onClick={onToggleWall}
              title={wallMode ? "Keluar mode dinding" : "Mode dinding"}
              aria-pressed={wallMode}
            >
              {wallMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={onToggleTheme}
              title={theme === "light" ? "Ganti ke tema gelap" : "Ganti ke tema terang"}
              aria-label={theme === "light" ? "Ganti ke tema gelap" : "Ganti ke tema terang"}
              aria-pressed={theme === "dark"}
            >
              {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <div className="clock" aria-label="Waktu Indonesia Barat">
              <b>{formatWib(now, true)}</b>
              <span>{formatWibDate(now, true)}</span>
            </div>
            <button className="avatar-btn" type="button" title={`${user.name} · ${user.role}`}>
              <span className="avatar">{initials(user.name)}</span>
            </button>
            <button className="icon-btn" type="button" onClick={onLogout} title="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
