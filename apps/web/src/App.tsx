import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { ApiError, api } from "./lib/api";
import type {
  AnalyticsSummary,
  ManualTicketPayload,
  Officer,
  PublicConfig,
  Region,
  Ticket,
  TicketDetail,
  TicketStatus,
  User,
  WaGateway
} from "./lib/types";
import { STATUS_META, filterTickets, shortTicket } from "./lib/format";
import { applyTheme, getInitialTheme, type Theme } from "./lib/theme";
import { LoginPage } from "./components/LoginPage";
import { ChangePasswordPage } from "./components/ChangePasswordPage";
import { Shell, type View } from "./components/Shell";
import { LiveBoard, type LiveFilter } from "./components/LiveBoard";
import { AlarmBanner } from "./components/AlarmBanner";

const MapPage = lazy(() =>
  import("./components/MapPage").then((module) => ({ default: module.MapPage }))
);
const HandoverPage = lazy(() =>
  import("./components/HandoverPage").then((module) => ({ default: module.HandoverPage }))
);
const DataPage = lazy(() =>
  import("./components/DataPage").then((module) => ({ default: module.DataPage }))
);
const AnalyticsPage = lazy(() =>
  import("./components/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage }))
);
const SettingsPage = lazy(() =>
  import("./components/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);
const GuidePage = lazy(() =>
  import("./components/GuidePage").then((module) => ({ default: module.GuidePage }))
);

type ToastState = { title: string; message: string; type: "success" | "danger" | "info" };

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // Pengguna yang sudah login tetapi wajib ganti password dulu. Disimpan
  // terpisah agar efek pemuatan data tidak jalan (server menjawab 403).
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const acceptUser = useCallback((next: User) => {
    if (next.mustChangePassword) {
      setPendingUser(next);
      setUser(null);
    } else {
      setPendingUser(null);
      setUser(next);
    }
  }, []);
  const [bootLoading, setBootLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [view, setView] = useState<View>("live");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<LiveFilter>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [waStatus, setWaStatus] = useState<WaGateway["status"]>("disconnected");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alarm, setAlarm] = useState<Ticket | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [wallMode, setWallMode] = useState(() => {
    try {
      return window.localStorage.getItem("sigap.wall") === "1";
    } catch {
      return false;
    }
  });

  const selectedRef = useRef<string | null>(null);
  const detailSeqRef = useRef(0);
  const deepLinkHandled = useRef(false);
  const knownIds = useRef<Set<string>>(new Set());
  const hasLoaded = useRef(false);
  const autoSelected = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);

  const showToast = useCallback((next: ToastState) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const playAlarm = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const ctx = audioContext.current ?? new AudioContext();
      audioContext.current = ctx;
      if (ctx.state === "suspended") void ctx.resume();
      const beep = (frequency: number, start: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(ctx.currentTime + start);
        oscillator.stop(ctx.currentTime + start + duration + 0.03);
      };
      beep(880, 0, 0.13);
      beep(660, 0.19, 0.13);
      beep(880, 0.38, 0.2);
    } catch {
      // Audio is best-effort; visual alarm remains.
    }
  }, []);

  const refreshTickets = useCallback(async () => {
    try {
      const result = await api.tickets({ limit: 100 });
      setTickets(result.items);
      if (hasLoaded.current) {
        const incoming = result.items.find(
          (ticket) =>
            ticket.priority === "P1" &&
            ticket.status === "baru" &&
            !knownIds.current.has(ticket.id)
        );
        if (incoming) {
          setAlarm(incoming);
          playAlarm();
          if (window.innerWidth > 1200) {
            selectedRef.current = incoming.id;
            setSelectedId(incoming.id);
          }
        }
      }
      knownIds.current = new Set(result.items.map((ticket) => ticket.id));
      hasLoaded.current = true;

      if (
        !selectedRef.current &&
        !autoSelected.current &&
        window.innerWidth > 1200 &&
        result.items[0]
      ) {
        autoSelected.current = true;
        selectedRef.current = result.items[0].id;
        setSelectedId(result.items[0].id);
        try {
          const seq = ++detailSeqRef.current;
          const initialDetail = await api.ticket(result.items[0].id);
          if (seq === detailSeqRef.current) setDetail(initialDetail);
        } catch {
          // Keep the queue usable even if the detail request fails.
        }
      } else if (selectedRef.current) {
        try {
          const seq = ++detailSeqRef.current;
          const nextDetail = await api.ticket(selectedRef.current);
          if (seq === detailSeqRef.current) setDetail(nextDetail);
        } catch {
          // Selected ticket may no longer be visible; keep the list usable.
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        return;
      }
      showToast({
        title: "Gagal memuat tiket",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    }
  }, [playAlarm, showToast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [configResult, meResult] = await Promise.allSettled([
        api.publicConfig(),
        api.me()
      ]);
      if (cancelled) return;
      if (configResult.status === "fulfilled") setConfig(configResult.value);
      if (meResult.status === "fulfilled") acceptUser(meResult.value.user);
      setBootLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) void refreshTickets();
  }, [user, refreshTickets]);

  useEffect(() => {
    if (!user) {
      setWaStatus("disconnected");
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.gateway();
        if (!cancelled) setWaStatus(result.gateway.status);
      } catch {
        if (!cancelled) setWaStatus("disconnected");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const source = new EventSource("/api/stream");
    source.onopen = () => setSseConnected(true);
    source.onerror = () => setSseConnected(false);
    const handler = () => {
      setSseConnected(true);
      void refreshTickets();
    };
    const helloHandler = () => setSseConnected(true);
    const escalatedHandler = (event: MessageEvent) => {
      setSseConnected(true);
      try {
        const data = JSON.parse(event.data) as {
          ticketNo?: string;
          title?: string;
          level?: string;
        };
        showToast({
          title: `Eskalasi ${data.level === "kapolsek" ? "Kapolsek" : "Pawas"}`,
          message: `${data.ticketNo ?? "P1"} · ${data.title ?? "Tiket belum direspons"}`,
          type: "danger"
        });
      } catch {
        // Ignore malformed real-time payloads.
      }
      void refreshTickets();
    };
    source.addEventListener("hello", helloHandler);
    source.addEventListener("ticket.updated", handler);
    source.addEventListener("ticket.escalated", escalatedHandler as EventListener);
    const openCheck = window.setTimeout(() => {
      if (source.readyState === EventSource.OPEN) setSseConnected(true);
    }, 800);
    return () => {
      window.clearTimeout(openCheck);
      source.removeEventListener("hello", helloHandler);
      source.removeEventListener("ticket.updated", handler);
      source.removeEventListener("ticket.escalated", escalatedHandler as EventListener);
      source.close();
      setSseConnected(false);
    };
  }, [user, refreshTickets, showToast]);

  useEffect(() => {
    if (!user || view !== "analytics") return;
    let cancelled = false;
    setSummaryLoading(true);
    void api
      .analytics()
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showToast({
            title: "Gagal memuat analitik",
            message: error instanceof Error ? error.message : "Coba lagi.",
            type: "danger"
          });
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, view, showToast]);

  useEffect(() => {
    if (!user) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      void api
        .regions()
        .then((result) => {
          if (!cancelled) setRegions(result.items.filter((region) => region.active));
        })
        .catch(() => {
          if (!cancelled) setRegions([]);
        });
    };
    load();
    const onChanged = () => load();
    window.addEventListener("sigap:regions-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("sigap:regions-changed", onChanged);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !["admin", "pawas", "piket"].includes(user.role)) {
      setOfficers([]);
      return;
    }
    let cancelled = false;
    void api
      .officers()
      .then((result) => {
        if (!cancelled) setOfficers(result.items as Officer[]);
      })
      .catch(() => {
        if (!cancelled) setOfficers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const ticketId = params.get("ticket");
    if (!ticketId) return;
    autoSelected.current = true;
    void selectTicket(ticketId);
    if (window.innerWidth <= 1200) document.body.classList.add("detail-open");
    params.delete("ticket");
    const nextSearch = params.toString();
    const cleanUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", cleanUrl);
  }, [user]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    document.body.classList.toggle("wall", wallMode);
    try {
      window.localStorage.setItem("sigap.wall", wallMode ? "1" : "0");
    } catch {
      // Storage can be unavailable in private mode.
    }
    return () => document.body.classList.remove("wall");
  }, [wallMode]);

  useEffect(() => {
    if (!user) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (event.key === "Escape") {
        if (document.querySelector(".media-lightbox, .modal-backdrop")) return;
        setAlarm(null);
        closeDetail();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "/") {
        event.preventDefault();
        document.getElementById("global-search")?.focus();
        return;
      }
      if (key === "w") {
        toggleWall();
        return;
      }
      if (key === "j" || key === "k") {
        const list = filterTickets(tickets, filter, search);
        if (list.length === 0) return;
        const currentIndex = selectedRef.current
          ? list.findIndex((ticket) => ticket.id === selectedRef.current)
          : -1;
        const nextIndex =
          key === "j"
            ? Math.min(list.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
        const next = list[nextIndex];
        if (!next) return;
        event.preventDefault();
        void selectTicket(next.id);
        if (window.innerWidth <= 1200) document.body.classList.add("detail-open");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [user, tickets, filter, search]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      if (audioContext.current) void audioContext.current.close();
    };
  }, []);

  async function handleLogin(username: string, password: string, totp: string) {
    setLoginError(null);
    try {
      const result = await api.login(username, password, totp);
      acceptUser(result.user);
      setConfig((previous) =>
        previous
          ? { ...previous, unit: result.unit }
          : { unit: result.unit, version: "1.2.0", features: { whatsapp: false, map: true } }
      );
      setLoginError(null);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login gagal");
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // Best-effort; clear local state regardless.
    }
    document.body.classList.remove("detail-open");
    detailSeqRef.current += 1;
    setUser(null);
    setPendingUser(null);
    setTickets([]);
    setDetail(null);
    setSelectedId(null);
    selectedRef.current = null;
    autoSelected.current = false;
    knownIds.current = new Set();
    hasLoaded.current = false;
    setAlarm(null);
    setView("live");
    setRegions([]);
    setOfficers([]);
    setWallMode(false);
  }

  async function selectTicket(id: string) {
    setSelectedId(id);
    selectedRef.current = id;
    const seq = ++detailSeqRef.current;
    try {
      const nextDetail = await api.ticket(id);
      if (seq === detailSeqRef.current) {
        setDetail(nextDetail);
      }
    } catch (error) {
      if (seq === detailSeqRef.current) {
        showToast({
          title: "Gagal membuka tiket",
          message: error instanceof Error ? error.message : "Coba lagi.",
          type: "danger"
        });
      }
    }
  }

  function closeDetail() {
    detailSeqRef.current += 1;
    setSelectedId(null);
    selectedRef.current = null;
    setDetail(null);
  }

  async function handleTransition(
    to: TicketStatus,
    options: { note?: string; reason?: string; assigneeId?: string } = {}
  ) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api.transition(selectedId, to, options);
      setDetail(result);
      setTickets((previous) =>
        previous.map((ticket) => (ticket.id === result.ticket.id ? result.ticket : ticket))
      );
      showToast({
        title: `Tiket ${shortTicket(result.ticket.ticketNo)} → ${STATUS_META[to].label}`,
        message: "Status tersimpan dan tercatat di audit log.",
        type: "success"
      });
      if (["diterima", "selesai", "ditolak"].includes(to)) {
        setAlarm((previous) =>
          previous && previous.id === result.ticket.id ? null : previous
        );
      }
    } catch (error) {
      showToast({
        title: "Aksi gagal",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
      throw error;
    } finally {
      setBusy(false);
      void refreshTickets();
    }
  }

  async function handleNote(text: string) {
    if (!selectedId) return;
    setBusy(true);
    try {
      const result = await api.note(selectedId, text);
      setDetail(result);
      setTickets((previous) =>
        previous.map((ticket) => (ticket.id === result.ticket.id ? result.ticket : ticket))
      );
      showToast({
        title: "Catatan ditambahkan",
        message: "Hanya terlihat oleh petugas.",
        type: "success"
      });
    } catch (error) {
      showToast({
        title: "Gagal menambah catatan",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateManual(payload: ManualTicketPayload) {
    try {
      const result = await api.manualTicket(payload);
      setView("live");
      setDetail(result);
      setSelectedId(result.ticket.id);
      selectedRef.current = result.ticket.id;
      setTickets((previous) => [result.ticket, ...previous]);
      showToast({
        title: `Tiket ${shortTicket(result.ticket.ticketNo)} dibuat`,
        message: "Laporan manual masuk antrean dan audit log.",
        type: "success"
      });
      void refreshTickets();
    } catch (error) {
      showToast({
        title: "Gagal membuat tiket manual",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
      throw error;
    }
  }

  function openTicketFromMap(id: string) {
    setWallMode(false);
    setView("live");
    void selectTicket(id);
    if (window.innerWidth <= 1200) document.body.classList.add("detail-open");
  }

  function handleMerged() {
    void refreshTickets();
    if (selectedRef.current) {
      void selectTicket(selectedRef.current);
    }
  }

  function toggleWall() {
    setWallMode((previous) => {
      const next = !previous;
      try {
        if (next && !document.fullscreenElement) {
          void document.documentElement.requestFullscreen().catch(() => undefined);
        } else if (!next && document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        }
      } catch {
        // Fullscreen is optional; the wall layout still applies.
      }
      return next;
    });
  }

  function toggleSound() {
    if (!soundEnabled) {
      try {
        const ctx = audioContext.current ?? new AudioContext();
        audioContext.current = ctx;
        if (ctx.state === "suspended") void ctx.resume();
      } catch {
        // Visual alarm still works.
      }
      soundRef.current = true;
      setSoundEnabled(true);
      playAlarm();
      showToast({
        title: "Suara alarm aktif",
        message: "Alarm akan berbunyi saat ada P1 baru.",
        type: "success"
      });
    } else {
      soundRef.current = false;
      setSoundEnabled(false);
      showToast({
        title: "Suara alarm dimatikan",
        message: "Alarm visual tetap berjalan.",
        type: "info"
      });
    }
  }

  function openAlarm() {
    if (!alarm) return;
    setAlarm(null);
    setView("live");
    void selectTicket(alarm.id);
    if (window.innerWidth <= 1200) document.body.classList.add("detail-open");
  }

  function handleView(next: View) {
    setView(next);
    document.body.classList.remove("detail-open");
  }

  if (bootLoading) {
    return <div className="loading-screen">Memuat SIGAP...</div>;
  }

  if (!user && pendingUser) {
    return (
      <ChangePasswordPage
        user={pendingUser}
        unitName={config?.unit.name ?? "SIGAP"}
        onDone={() => acceptUser({ ...pendingUser, mustChangePassword: false })}
        onLogout={() => void handleLogout()}
      />
    );
  }

  if (!user) {
    return <LoginPage config={config} error={loginError} onLogin={handleLogin} />;
  }

  const unit = config?.unit ?? {
    name: "Polsek",
    code: "POL",
    timezone: "Asia/Jakarta"
  };
  const activeCount = tickets.filter((ticket) =>
    ["baru", "diterima", "otw", "ditkp", "ditunda"].includes(ticket.status)
  ).length;
  const canRevealPhone = ["admin", "pawas", "piket", "kapolsek", "urc"].includes(user.role);

  return (
    <>
      {alarm ? (
        <AlarmBanner
          ticket={alarm}
          soundEnabled={soundEnabled}
          onEnableSound={toggleSound}
          onOpen={openAlarm}
          onDismiss={() => setAlarm(null)}
        />
      ) : null}

      <Shell
        user={user}
        unit={unit}
        view={view}
        onView={handleView}
        onLogout={() => void handleLogout()}
        sseConnected={sseConnected}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        search={search}
        onSearch={setSearch}
        activeCount={activeCount}
        wallMode={wallMode}
        onToggleWall={toggleWall}
        theme={theme}
        onToggleTheme={() => setTheme((previous) => (previous === "light" ? "dark" : "light"))}
        waStatus={waStatus}
        env={config?.env}
      >
        <Suspense fallback={<div className="panel data-empty">Memuat modul...</div>}>
        {view === "live" ? (
          <LiveBoard
            tickets={tickets}
            regions={regions}
            officers={officers}
            userRole={user.role}
            detail={detail}
            selectedId={selectedId}
            filter={filter}
            search={search}
            busy={busy}
            canRevealPhone={canRevealPhone}
            onFilter={setFilter}
            onSelect={(id) => void selectTicket(id)}
            onCloseDetail={closeDetail}
            onRefresh={() => void refreshTickets()}
            onTransition={handleTransition}
            onNote={handleNote}
            onCreateManual={handleCreateManual}
            onMerged={handleMerged}
          />
        ) : null}

        {view === "analytics" ? (
          <AnalyticsPage
            summary={summary}
            loading={summaryLoading}
            canExport={["admin", "pawas", "kapolsek", "piket"].includes(user.role)}
            canDigest={["admin", "pawas", "kapolsek"].includes(user.role)}
            onRefresh={() => {
              setSummaryLoading(true);
              void api
                .analytics()
                .then(setSummary)
                .finally(() => setSummaryLoading(false));
            }}
            onToast={showToast}
          />
        ) : null}

        {view === "map" ? (
          <MapPage
            tickets={tickets}
            regions={regions}
            selectedId={selectedId}
            onSelect={(id) => void selectTicket(id)}
            onOpenTicket={openTicketFromMap}
          />
        ) : null}

        {view === "data" ? <DataPage onToast={showToast} /> : null}

        {view === "handover" ? (
          <HandoverPage user={user} onToast={showToast} onOpenTicket={openTicketFromMap} />
        ) : null}

        {view === "system" ? (
          <SettingsPage
            user={user}
            unit={unit}
            onToast={showToast}
            theme={theme}
            onThemeChange={setTheme}
            onTotpEnabled={() =>
              setUser((previous) => (previous ? { ...previous, totpEnabled: true } : previous))
            }
          />
        ) : null}

        {view === "guide" ? <GuidePage /> : null}
        </Suspense>
      </Shell>

      {toast ? (
        <div className="toast-stack" role="status" aria-live="polite">
          <div className={`toast is-${toast.type}`}>
            {toast.type === "success" ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            <div>
              <b>{toast.title}</b>
              <span>{toast.message}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

