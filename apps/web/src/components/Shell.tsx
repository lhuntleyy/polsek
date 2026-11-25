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
import { formatWib, initials } from "../lib/format";

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

const VIEW_SUBTITLE: Record<View, string> = {
  live: "ini ringkasan piket hari ini.",
  map: "sebaran laporan di wilayah hukum.",
  analytics: "tren laporan dan kinerja respons.",
  data: "data tiket, wilayah, dan registry.",
  handover: "catatan serah terima antar-shift.",
  system: "pengaturan unit dan WhatsApp gateway.",
  guide: "panduan penggunaan SIGAP."
};

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
  const visibleViews = VIEWS.filter((item) => !item.roles || item.roles.includes(user.role));
  const greeting =
    hour >= 4 && hour < 11
      ? "Selamat pagi"
      : hour >= 11 && hour < 15
        ? "Selamat siang"
        : hour >= 15 && hour < 18
          ? "Selamat sore"
          : "Selamat malam";
  const dayNumber = new Intl.DateTimeFormat("id-ID", { timeZone: unit.timezone, day: "numeric" }).format(now);
  const dayName = new Intl.DateTimeFormat("id-ID", { timeZone: unit.timezone, weekday: "short" }).format(now);
  const monthName = new Intl.DateTimeFormat("id-ID", { timeZone: unit.timezone, month: "long" }).format(now);

  return (
    <div className="app">
      <aside className="rail" aria-label="Navigasi utama (mobile)">
        <nav className="rail-nav">
          {visibleViews.map((item) => {
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
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-brand" title={`${unit.code} · ${unit.name}`}>
            <span className="brand-mark">
              <ShieldCheck size={18} strokeWidth={2} />
            </span>
            <span className="brand-text">
              <b>SIGAP</b>
              <small>
                {unit.name}
                {env && env !== "production" ? <span className="demo-tag">DEV</span> : null}
              </small>
            </span>
          </div>

          <nav className="pill-nav" aria-label="Navigasi utama">
            {visibleViews.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`pill-nav-item ${view === item.id ? "is-active" : ""}`}
                onClick={() => onView(item.id)}
                title={item.title}
                aria-current={view === item.id ? "page" : undefined}
              >
                {item.label}
                {item.id === "live" && activeCount > 0 ? (
                  <i className="pill-nav-badge">{activeCount}</i>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="topbar-actions">
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
            <div className="user-chip" title={`${user.name} · ${user.role}`}>
              <span className="avatar">{initials(user.name)}</span>
              <span className="user-chip-text">
                <b>{user.name}</b>
                <small>{user.role}</small>
              </span>
              <button className="icon-btn" type="button" onClick={onLogout} title="Keluar" aria-label="Keluar">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        <section className="greet-row" aria-label={current?.title ?? "Live Board"}>
          <div className="greet-text">
            <h1>
              {greeting}, {user.name}
            </h1>
            <p>{VIEW_SUBTITLE[view]}</p>
          </div>

          <div className="greet-meta">
            <div className="date-chip" aria-label="Waktu Indonesia Barat">
              <b>{dayNumber}</b>
              <span>
                {dayName}, {monthName}
                <small>{formatWib(now, true)} WIB</small>
              </span>
            </div>
            <span className="shift-tag">{shift}</span>
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
          </div>
        </section>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}
