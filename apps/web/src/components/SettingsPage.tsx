import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  Database,
  KeyRound,
  LogOut,
  MapPin,
  Moon,
  Pencil,
  Power,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldOff,
  Sun,
  Trash2,
  TriangleAlert,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import { api } from "../lib/api";
import { passwordProblem } from "./ChangePasswordPage";
import { toWhatsAppGroupJid, toWhatsAppJid } from "../lib/wa";
import type { Theme } from "../lib/theme";
import type {
  Officer,
  Region,
  SystemStatus,
  Unit,
  UnitSettings,
  User,
  WaGateway,
  WaGroup
} from "../lib/types";

interface SettingsPageProps {
  user: User;
  unit: Unit;
  onToast: (toast: { title: string; message: string; type: "success" | "danger" | "info" }) => void;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onTotpEnabled: () => void;
}

function sizeLabel(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function OfficerRow({
  officer,
  regions,
  onToast,
  onChanged
}: {
  officer: Officer;
  regions: Region[];
  onToast: SettingsPageProps["onToast"];
  onChanged: () => void;
}) {
  const [waJid, setWaJid] = useState(officer.waJid ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: officer.name,
    rank: officer.rank ?? "",
    role: officer.role,
    regionId: officer.regionId ?? "",
    active: officer.active
  });

  useEffect(() => {
    setWaJid(officer.waJid ?? "");
    setForm({
      name: officer.name,
      rank: officer.rank ?? "",
      role: officer.role,
      regionId: officer.regionId ?? "",
      active: officer.active
    });
  }, [officer]);

  async function saveWa() {
    setSaving(true);
    try {
      const jid = toWhatsAppJid(waJid);
      await api.updateOfficer(officer.id, { waJid: jid || null });
      onToast({
        title: "Nomor WhatsApp diperbarui",
        message: `${officer.name} · ${jid || "kosong"}`,
        type: "success"
      });
      onChanged();
    } catch (error) {
      onToast({
        title: "Gagal memperbarui JID",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveOfficer() {
    if (form.name.trim().length < 3) {
      onToast({
        title: "Nama terlalu pendek",
        message: "Nama petugas minimal 3 karakter.",
        type: "info"
      });
      return;
    }
    setSaving(true);
    try {
      await api.updateOfficer(officer.id, {
        name: form.name.trim(),
        rank: form.rank.trim() || null,
        role: form.role,
        regionId: form.regionId || null,
        active: form.active
      });
      onToast({
        title: "Petugas diperbarui",
        message: `${form.name.trim()} · ${form.role}`,
        type: "success"
      });
      setEditing(false);
      onChanged();
    } catch (error) {
      onToast({
        title: "Gagal memperbarui petugas",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    const next = window.prompt(
      `Password sementara untuk ${officer.name} (min. 10 karakter, huruf + angka). Petugas wajib menggantinya saat login berikutnya.`
    );
    if (!next) return;
    setSaving(true);
    try {
      await api.resetOfficerPassword(officer.id, next);
      onToast({
        title: "Password direset",
        message: `${officer.name} harus mengganti password saat login. Semua sesinya dicabut.`,
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal mereset password",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  async function resetTotp() {
    if (!window.confirm(`Matikan TOTP ${officer.name}? Petugas bisa login tanpa kode lalu mengaktifkan ulang.`)) {
      return;
    }
    setSaving(true);
    try {
      await api.resetOfficerTotp(officer.id);
      onToast({ title: "TOTP direset", message: `${officer.name} perlu mengaktifkan TOTP lagi.`, type: "success" });
    } catch (error) {
      onToast({
        title: "Gagal mereset TOTP",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(
      `Nonaktifkan petugas ${officer.name}? Akun tidak bisa login lagi dan nomor WhatsApp-nya dilepas. Riwayat & audit tetap tersimpan.`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      await api.deleteOfficer(officer.id);
      onToast({
        title: "Petugas dinonaktifkan",
        message: `${officer.name} dinonaktifkan; riwayat dan jejak audit tetap tersimpan.`,
        type: "success"
      });
      onChanged();
    } catch (error) {
      onToast({
        title: "Gagal menghapus petugas",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="officer-wrap">
      <div className="officer-row">
        <div className="officer-info">
          <b>{officer.name}</b>
          <span>
            {officer.role}
            {officer.rank ? ` · ${officer.rank}` : ""}
            {!officer.active ? " · NONAKTIF" : ""}
          </span>
        </div>
        <input
          className="officer-input"
          value={waJid}
          onChange={(event) => setWaJid(event.target.value)}
          placeholder="0812... atau 628... (otomatis)"
        />
        <div className="officer-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void saveWa()} disabled={saving}>
            <Save size={13} /> {saving ? "..." : "Simpan"}
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setEditing((previous) => !previous)}
          >
            <Pencil size={13} /> Edit
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void resetPassword()} disabled={saving}>
            <KeyRound size={13} /> Reset password
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => void resetTotp()} disabled={saving}>
            <ShieldOff size={13} /> Reset TOTP
          </button>
          <button
            className="btn btn-danger-ghost"
            type="button"
            onClick={() => void remove()}
            disabled={saving}
          >
            <Trash2 size={13} /> Nonaktifkan
          </button>
        </div>
      </div>
      {editing ? (
        <div className="officer-edit">
          <label className="form-field">
            <span>Nama lengkap</span>
            <input
              value={form.name}
              onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Pangkat</span>
            <input
              value={form.rank}
              onChange={(event) => setForm((previous) => ({ ...previous, rank: event.target.value }))}
              placeholder="Opsional"
            />
          </label>
          <label className="form-field">
            <span>Role</span>
            <select
              className="select"
              value={form.role}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, role: event.target.value as Officer["role"] }))
              }
            >
              {["piket", "urc", "bhabin", "pawas", "kapolsek", "admin"].map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Wilayah (bhabin)</span>
            <select
              className="select"
              value={form.regionId}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, regionId: event.target.value }))
              }
            >
              <option value="">Tidak terikat wilayah</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                  {region.active ? "" : " (nonaktif)"}
                </option>
              ))}
            </select>
          </label>
          <label className="toggle-row officer-active">
            <input
              type="checkbox"
              className="switch"
              checked={form.active}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, active: event.target.checked }))
              }
            />
            <span>Aktif</span>
          </label>
          <div className="officer-edit-actions">
            <button className="btn btn-primary" type="button" onClick={() => void saveOfficer()} disabled={saving}>
              <Save size={13} /> Simpan perubahan
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
              <X size={13} /> Batal
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

function PushCard({ onToast }: { onToast: SettingsPageProps["onToast"] }) {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [registrationReady, setRegistrationReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .pushPublicKey()
      .then((result) => setConfigured(result.configured && Boolean(result.publicKey)))
      .catch(() => setConfigured(false));

    if (!supported) return;
    void navigator.serviceWorker.getRegistration().then(async (registration) => {
      setRegistrationReady(Boolean(registration));
      if (!registration) return;
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    });
  }, [supported]);

  async function enable() {
    setBusy(true);
    try {
      if (!configured) {
        throw new Error("VAPID belum dikonfigurasi di server.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Izin notifikasi ditolak browser.");
      }
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        throw new Error("Service worker belum aktif. Push tersedia pada build produksi (HTTPS/localhost).");
      }
      const key = await api.pushPublicKey();
      if (!key.publicKey) throw new Error("Public key Web Push tidak tersedia.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey)
      });
      await api.subscribePush(subscription.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      });
      setSubscribed(true);
      onToast({
        title: "Notifikasi push aktif",
        message: "Perangkat ini akan menerima P1 dan eskalasi.",
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal mengaktifkan push",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      onToast({ title: "Push dimatikan", message: "Perangkat ini tidak lagi menerima notifikasi.", type: "info" });
    } catch (error) {
      onToast({
        title: "Gagal mematikan push",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      const result = await api.testPush();
      onToast({
        title: "Tes push dikirim",
        message: `${result.sent} terkirim · ${result.failed} gagal · ${result.removed} kedaluwarsa`,
        type: result.sent > 0 ? "success" : "info"
      });
    } catch (error) {
      onToast({
        title: "Tes push gagal",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card">
      <header className="card-head">
        <div>
          <div className="eyebrow">NOTIFIKASI</div>
          <h3>Web Push</h3>
        </div>
        <BellRing size={18} className="muted" />
      </header>
      <div className="totp-status">
        <span className={`badge ${subscribed ? "green" : configured ? "amber" : "muted"}`}>
          {subscribed ? "PUSH AKTIF" : configured ? "SIAP DIAKTIFKAN" : "VAPID BELUM DISET"}
        </span>
        <span className="fine-print" style={{ marginTop: 0 }}>
          P1 baru dan eskalasi Pawas/Kapolsek.
        </span>
      </div>
      {!supported ? (
        <p className="fine-print">Browser ini tidak mendukung Web Push.</p>
      ) : !registrationReady ? (
        <p className="fine-print">
          Service worker belum aktif. Push hanya tersedia pada build produksi (HTTPS atau localhost).
        </p>
      ) : (
        <div className="backup-actions" style={{ marginTop: 9 }}>
          {!subscribed ? (
            <button className="btn btn-ghost" type="button" onClick={() => void enable()} disabled={busy || !configured}>
              <BellRing size={13} /> {busy ? "Mengaktifkan..." : "Aktifkan push"}
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" type="button" onClick={() => void test()} disabled={busy}>
                Tes push
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void disable()} disabled={busy}>
                Matikan
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PasswordCard({ onToast }: { onToast: SettingsPageProps["onToast"] }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = passwordProblem(next, confirm);
    if (problem) {
      onToast({ title: "Password belum valid", message: problem, type: "info" });
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      onToast({
        title: "Password diganti",
        message: "Sesi di perangkat lain sudah dicabut.",
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal mengganti password",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel settings-card">
      <header className="card-head">
        <div>
          <div className="eyebrow">KEAMANAN AKUN</div>
          <h3>Ganti password</h3>
        </div>
        <KeyRound size={18} className="muted" />
      </header>
      <p className="fine-print" style={{ marginTop: 0 }}>
        Min. 10 karakter, huruf + angka. Sesi di perangkat lain akan otomatis keluar.
      </p>
      <div className="officer-edit">
        <label className="form-field">
          <span>Password saat ini</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Password baru</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
        </label>
        <label className="form-field">
          <span>Ulangi password baru</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </label>
      </div>
      <button className="btn btn-ghost" type="button" onClick={() => void save()} disabled={saving || !current}>
        <Save size={13} /> {saving ? "Menyimpan..." : "Simpan password"}
      </button>
    </section>
  );
}

function TotpCard({
  user,
  onToast,
  onTotpEnabled
}: {
  user: User;
  onToast: SettingsPageProps["onToast"];
  onTotpEnabled: () => void;
}) {
  const [enabled, setEnabled] = useState(user.totpEnabled);
  const [secret, setSecret] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEnabled(user.totpEnabled);
  }, [user.totpEnabled]);

  async function setup() {
    setBusy(true);
    try {
      const result = await api.totpSetup();
      setSecret(result.secret);
      setUri(result.uri);
      onToast({
        title: "Secret TOTP dibuat",
        message: "Masukkan secret ke aplikasi authenticator, lalu masukkan kode 6 digit.",
        type: "info"
      });
    } catch (error) {
      onToast({
        title: "Gagal membuat TOTP",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    if (code.length !== 6) return;
    setBusy(true);
    try {
      await api.totpEnable(code);
      setEnabled(true);
      setCode("");
      setSecret(null);
      setUri(null);
      onTotpEnabled();
      onToast({
        title: "TOTP aktif",
        message: "Login berikutnya membutuhkan kode 6 digit.",
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal mengaktifkan TOTP",
        message: error instanceof Error ? error.message : "Periksa kode dan coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-card">
      <header className="card-head">
        <div>
          <div className="eyebrow">KEAMANAN AKUN</div>
          <h3>Autentikasi dua faktor</h3>
        </div>
        <KeyRound size={18} className="muted" />
      </header>
      <div className="totp-status">
        <span className={`badge ${enabled ? "green" : "amber"}`}>
          {enabled ? "TOTP AKTIF" : "TOTP BELUM AKTIF"}
        </span>
        <span className="fine-print" style={{ marginTop: 0 }}>
          Disarankan untuk akun piket, pawas, kapolsek, dan admin.
        </span>
      </div>
      {!enabled && !secret ? (
        <button className="btn btn-ghost" type="button" onClick={() => void setup()} disabled={busy} style={{ marginTop: 9 }}>
          <KeyRound size={13} /> {busy ? "Membuat..." : "Mulai setup TOTP"}
        </button>
      ) : null}
      {!enabled && secret ? (
        <div className="totp-setup">
          <div className="totp-secret">
            <span>Secret</span>
            <code>{secret}</code>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void navigator.clipboard.writeText(secret)}
            >
              Salin
            </button>
          </div>
          {uri ? <p className="fine-print">URI: <code>{uri}</code></p> : null}
          <label className="form-field">
            <span>Kode 6 digit dari authenticator</span>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
          </label>
          <button className="btn btn-primary" type="button" onClick={() => void enable()} disabled={busy || code.length !== 6}>
            <ShieldCheck size={13} /> {busy ? "Memeriksa..." : "Aktifkan TOTP"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function gatewayErrorText(error: string): string {
  if (error === "waiting_for_pairing") return "Belum ada sesi WhatsApp. Klik Hubungkan WhatsApp untuk pairing.";
  if (error === "logged_out") return "Sesi sudah logout. Klik Hubungkan WhatsApp untuk pairing nomor baru.";
  if (error === "dashboard_disconnect") return "Koneksi diputuskan dari dashboard. Sesi masih tersimpan.";
  if (error === "restarting") return "Gateway sedang direstart.";
  if (error === "stopped") return "Bot dihentikan.";
  return error;
}

function GatewayCard({ onToast }: { onToast: SettingsPageProps["onToast"] }) {
  const [gateway, setGateway] = useState<WaGateway | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.gateway();
      setGateway(result.gateway);
    } catch {
      // Polling is best-effort; the rest of Settings stays usable.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [load]);

  async function run(
    action: () => Promise<{ gateway: WaGateway }>,
    title: string,
    confirmation?: string
  ) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(true);
    try {
      const result = await action();
      setGateway(result.gateway);
      onToast({ title, message: "Status gateway diperbarui.", type: "success" });
    } catch (error) {
      onToast({
        title: "Aksi gateway gagal",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setBusy(false);
    }
  }

  const status = gateway?.status ?? "disconnected";
  const pending = Boolean(gateway?.pendingCommand);
  const botOnline = Boolean(gateway?.botOnline);
  const label =
    status === "connected"
      ? "TERHUBUNG"
      : status === "qr"
        ? "MENUNGGU SCAN"
        : status === "connecting"
          ? "MENGHUBUNGKAN"
          : "TERPUTUS";

  return (
    <section className="panel settings-card gateway-card">
      <header className="card-head">
        <div>
          <div className="eyebrow">WHATSAPP GATEWAY</div>
          <h3>Koneksi WhatsApp bot</h3>
        </div>
        <QrCode size={18} className="muted" />
      </header>

      <div className="gateway-status-row">
        <span className={`badge ${status === "connected" ? "green" : status === "qr" ? "amber" : "muted"}`}>
          {label}
        </span>
        <span className={`badge ${botOnline ? "green" : "red"}`}>
          {botOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
          {botOnline ? "BOT ONLINE" : "BOT OFFLINE"}
        </span>
        {gateway?.phone ? <span className="mono gateway-phone">+{gateway.phone}</span> : null}
        {pending ? <span className="badge amber">MENUNGGU BOT…</span> : null}
      </div>

      {status === "qr" && gateway?.qr ? (
        <div className="gateway-qr-wrap">
          <img className="gateway-qr" src={gateway.qr} alt="QR pairing WhatsApp" />
          <div className="gateway-qr-help">
            <b>Scan dari HP nomor Polsek</b>
            <p>WhatsApp → Perangkat tertaut → Tautkan perangkat.</p>
            <p>QR berlaku ±90 detik. Kalau kedaluwarsa, bot mengirim QR baru otomatis.</p>
          </div>
        </div>
      ) : (
        <p className="fine-print" style={{ marginTop: 0 }}>
          {status === "connected"
            ? "Bot terhubung. Command grup dan balasan warga berjalan."
            : status === "qr"
              ? "QR kedaluwarsa. Bot akan mengirim QR baru; klik Muat ulang QR jika perlu."
              : botOnline
                ? "Klik Hubungkan WhatsApp untuk menampilkan QR pairing di sini."
                : "Bot belum berjalan. Jalankan service bot (pnpm dev:bot atau systemctl start sigap-bot), lalu klik Hubungkan WhatsApp."}
        </p>
      )}

      {gateway?.error ? (
        <p className="fine-print">
          <TriangleAlert size={11} /> {gatewayErrorText(gateway.error)}
        </p>
      ) : null}

      <div className="gateway-actions">
        {status === "connected" ? (
          <>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(api.gatewayDisconnect, "Gateway diputuskan")}>
              <Power size={13} /> Putuskan sementara
            </button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(api.gatewayRestart, "Gateway direstart")}>
              <RefreshCw size={13} /> Restart
            </button>
            <button
              className="btn btn-danger-ghost"
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  api.gatewayLogout,
                  "Sesi WhatsApp dihapus",
                  "Logout akan menghapus sesi WhatsApp di server. Nomor harus di-pairing ulang. Lanjutkan?"
                )
              }
            >
              <LogOut size={13} /> Logout / ganti nomor
            </button>
          </>
        ) : (
          <>
            {status === "disconnected" ? (
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !botOnline || pending}
                onClick={() => void run(api.gatewayConnect, "Permintaan koneksi dikirim")}
              >
                <QrCode size={13} /> Hubungkan WhatsApp
              </button>
            ) : null}
            {status === "qr" || status === "connecting" ? (
              <>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(api.gatewayRestart, "QR dimuat ulang")}
                >
                  <RefreshCw size={13} /> Muat ulang QR
                </button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(api.gatewayDisconnect, "Koneksi dibatalkan")}>
                  <Power size={13} /> Batalkan
                </button>
              </>
            ) : null}
          </>
        )}
        <span className="fine-print gateway-note">
          Bot harus berjalan sebagai service. Pairing dan logout sekarang dilakukan dari sini, tanpa buka terminal.
        </span>
      </div>
    </section>
  );
}

function ThemeCard({
  theme,
  onThemeChange
}: {
  theme: Theme;
  onThemeChange: SettingsPageProps["onThemeChange"];
}) {
  return (
    <section className="panel settings-card">
      <header className="card-head">
        <div>
          <div className="eyebrow">TAMPILAN</div>
          <h3>Tema dashboard</h3>
        </div>
        {theme === "light" ? <Sun size={18} className="muted" /> : <Moon size={18} className="muted" />}
      </header>
      <p className="fine-print" style={{ marginTop: 0 }}>
        Default terang agar mudah dibaca. Pilihan disimpan di perangkat ini.
      </p>
      <div className="theme-choice" role="group" aria-label="Pilih tema dashboard">
        <button
          type="button"
          className={theme === "light" ? "is-active" : ""}
          aria-pressed={theme === "light"}
          onClick={() => onThemeChange("light")}
        >
          <Sun size={14} /> Terang
        </button>
        <button
          type="button"
          className={theme === "dark" ? "is-active" : ""}
          aria-pressed={theme === "dark"}
          onClick={() => onThemeChange("dark")}
        >
          <Moon size={14} /> Gelap
        </button>
      </div>
    </section>
  );
}

export function SettingsPage({
  user,
  unit,
  onToast,
  theme,
  onThemeChange,
  onTotpEnabled
}: SettingsPageProps) {
  const isAdmin = user.role === "admin";
  const [settings, setSettings] = useState<UnitSettings | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [saving, setSaving] = useState(false);
  const [regionName, setRegionName] = useState("");
  const [regionJson, setRegionJson] = useState("");
  const [officerForm, setOfficerForm] = useState({
    username: "",
    name: "",
    role: "piket",
    password: "",
    waJid: "",
    regionId: ""
  });
  const [savingOfficer, setSavingOfficer] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: "", jid: "", purpose: "urc" });
  const [savingGroup, setSavingGroup] = useState(false);

  const reloadOfficers = useCallback(async () => {
    const result = await api.officers();
    setOfficers(result.items as Officer[]);
  }, []);

  const reloadRegions = useCallback(async () => {
    const result = await api.regions();
    setRegions(result.items);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api.settings(),
      api.systemStatus(),
      api.regions(),
      api.officers(),
      api.groups()
    ])
      .then(([settingsResult, statusResult, regionResult, officerResult, groupResult]) => {
        if (cancelled) return;
        setSettings(settingsResult.settings);
        setStatus(statusResult);
        setRegions(regionResult.items);
        setOfficers(officerResult.items as Officer[]);
        setGroups(groupResult.items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onToast({
            title: "Gagal memuat pengaturan",
            message: error instanceof Error ? error.message : "Coba lagi.",
            type: "danger"
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, onToast]);

  function update<K extends keyof UnitSettings>(key: K, value: UnitSettings[K]) {
    setSettings((previous) => (previous ? { ...previous, [key]: value } : previous));
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const result = await api.updateSettings({
        unit_name: settings.unitName,
        unit_code: settings.unitCode,
        unit_address: settings.unitAddress,
        unit_timezone: settings.unitTimezone,
        wa_number: settings.waNumber,
        wa_owner: settings.waOwner,
        wa_group_urc_jid: toWhatsAppGroupJid(settings.waGroupUrcJid),
        dpo_name: settings.dpoName,
        retention_days: Number(settings.retentionDays) || 365,
        sla_p1_ack_seconds: Number(settings.slaP1AckSeconds) || 120,
        sla_p1_otw_seconds: Number(settings.slaP1OtwSeconds) || 300,
        escalation_pawas_seconds: Number(settings.escalationPawasSeconds) || 180,
        escalation_kapolsek_seconds: Number(settings.escalationKapolsekSeconds) || 600,
        alarm_sound_required: settings.alarmSoundRequired,
        pii_masking: settings.piiMasking
      });
      setSettings(result.settings);
      onToast({
        title: "Pengaturan disimpan",
        message: "Perubahan langsung dipakai API. Seed tidak akan menimpa nilai ini.",
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal menyimpan",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSaving(false);
    }
  }

  async function addRegion() {
    if (!regionName.trim() || !regionJson.trim()) {
      onToast({
        title: "Data wilayah belum lengkap",
        message: "Isi nama dan GeoJSON polygon.",
        type: "info"
      });
      return;
    }
    try {
      const parsed = JSON.parse(regionJson) as unknown;
      await api.createRegion({ name: regionName.trim(), geojson: parsed });
      await reloadRegions();
      window.dispatchEvent(new Event("sigap:regions-changed"));
      setRegionName("");
      setRegionJson("");
      onToast({
        title: "Wilayah ditambahkan",
        message: "Polygon langsung dipakai untuk geofence.",
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal menambah wilayah",
        message: error instanceof Error ? error.message : "GeoJSON tidak valid.",
        type: "danger"
      });
    }
  }

  async function removeRegion(region: Region) {
    const confirmed = window.confirm(
      region.ticketCount > 0
        ? `Hapus wilayah ${region.name}? Wilayah ini punya ${region.ticketCount} tiket, jadi akan dinonaktifkan (bukan dihapus permanen) agar riwayat tetap aman.`
        : `Hapus wilayah ${region.name}? Polygon akan dihapus permanen.`
    );
    if (!confirmed) return;
    try {
      const result = await api.deleteRegion(region.id);
      await reloadRegions();
      window.dispatchEvent(new Event("sigap:regions-changed"));
      onToast({
        title: result.mode === "deleted" ? "Wilayah dihapus" : "Wilayah dinonaktifkan",
        message:
          result.mode === "deleted"
            ? `${region.name} dihapus permanen.`
            : `${region.name} dinonaktifkan karena masih dipakai ${result.tickets ?? region.ticketCount} tiket${result.officers ? ` dan ${result.officers} petugas` : ""}.`,
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal menghapus wilayah",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    }
  }

  async function restoreRegion(region: Region) {
    try {
      await api.updateRegion(region.id, { active: true });
      await reloadRegions();
      window.dispatchEvent(new Event("sigap:regions-changed"));
      onToast({
        title: "Wilayah diaktifkan",
        message: `${region.name} kembali dipakai untuk geofence.`,
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal mengaktifkan wilayah",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    }
  }

  async function addOfficer() {
    if (
      officerForm.username.trim().length < 3 ||
      officerForm.name.trim().length < 3 ||
      officerForm.password.length < 10
    ) {
      onToast({
        title: "Data petugas belum lengkap",
        message: "Username/nama minimal 3 karakter, password minimal 10 karakter (huruf + angka).",
        type: "info"
      });
      return;
    }
    setSavingOfficer(true);
    try {
      await api.createOfficer({
        username: officerForm.username.trim(),
        name: officerForm.name.trim(),
        role: officerForm.role,
        password: officerForm.password,
        waJid: toWhatsAppJid(officerForm.waJid) || undefined,
        regionId: officerForm.regionId || null
      });
      const result = await api.officers();
      setOfficers(result.items as Officer[]);
      setOfficerForm({
        username: "",
        name: "",
        role: "piket",
        password: "",
        waJid: "",
        regionId: ""
      });
      onToast({
        title: "Petugas ditambahkan",
        message: `${officerForm.name.trim()} · ${officerForm.role}`,
        type: "success"
      });
    } catch (error) {
      onToast({
        title: "Gagal menambah petugas",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSavingOfficer(false);
    }
  }

  async function addGroup() {
    if (groupForm.name.trim().length < 2 || groupForm.jid.trim().length < 5) {
      onToast({
        title: "Data grup belum lengkap",
        message: "Isi nama dan JID grup WhatsApp.",
        type: "info"
      });
      return;
    }
    setSavingGroup(true);
    try {
      const jid = toWhatsAppGroupJid(groupForm.jid);
      await api.createGroup({
        name: groupForm.name.trim(),
        jid,
        purpose: groupForm.purpose,
        active: true
      });
      const result = await api.groups();
      setGroups(result.items);
      setGroupForm({ name: "", jid: "", purpose: "urc" });
      onToast({ title: "Grup ditambahkan", message: jid, type: "success" });
    } catch (error) {
      onToast({
        title: "Gagal menambah grup",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    } finally {
      setSavingGroup(false);
    }
  }

  async function toggleGroup(group: WaGroup) {
    try {
      await api.updateGroup(group.id, { active: !group.active });
      const result = await api.groups();
      setGroups(result.items);
    } catch (error) {
      onToast({
        title: "Gagal mengubah grup",
        message: error instanceof Error ? error.message : "Coba lagi.",
        type: "danger"
      });
    }
  }

  if (!isAdmin) {
    return (
      <section className="view is-active" data-view-panel="system" style={{ overflowY: "auto" }}>
        <div className="page-head">
          <div>
            <div className="eyebrow">KESEHATAN SISTEM</div>
            <h2>Sistem</h2>
            <p>Pengaturan unit dan integrasi hanya dapat diubah oleh admin.</p>
          </div>
          <span className="status-chip status-diterima">READ-ONLY</span>
        </div>
        <div className="panel config-card" style={{ maxWidth: 680 }}>
          <header className="card-head">
            <div>
              <div className="eyebrow">UNIT</div>
              <h3>{unit.name}</h3>
            </div>
            <ShieldCheck size={20} className="text-good" />
          </header>
          <div className="backup-list">
            <div className="kv"><span>Kode unit</span><b className="mono">{unit.code}</b></div>
            <div className="kv"><span>Alamat</span><b>{unit.address || "—"}</b></div>
            <div className="kv"><span>Zona waktu</span><b>{unit.timezone}</b></div>
            <div className="kv"><span>Status WhatsApp</span><b>Dikelola admin unit</b></div>
          </div>
          <p className="fine-print">
            Hubungi admin unit untuk perubahan wilayah, nomor WhatsApp, SLA, atau retensi.
          </p>
        </div>
        <div style={{ marginTop: 10, maxWidth: 680, display: "grid", gap: 10 }}>
          <PasswordCard onToast={onToast} />
          <TotpCard user={user} onToast={onToast} onTotpEnabled={onTotpEnabled} />
          <PushCard onToast={onToast} />
          <ThemeCard theme={theme} onThemeChange={onThemeChange} />
        </div>
      </section>
    );
  }

  return (
    <section className="view is-active" data-view-panel="system" style={{ overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">KONFIGURASI & KESEHATAN</div>
          <h2>Sistem</h2>
          <p>Perubahan di sini disimpan ke database, bukan menimpa `.env`.</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={saving || !settings}>
            <Save size={15} /> {saving ? "Menyimpan..." : "Simpan Pengaturan"}
          </button>
        </div>
      </div>

      {loading || !settings ? (
        <div className="panel data-empty">Memuat pengaturan...</div>
      ) : (
        <div className="settings-grid">
          <div style={{ gridColumn: "1 / -1" }}>
            <GatewayCard onToast={onToast} />
          </div>
          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <div className="eyebrow">IDENTITAS</div>
                <h3>Unit Polsek</h3>
              </div>
              <ShieldCheck size={18} className="muted" />
            </header>
            <div className="settings-fields">
              <label className="form-field full">
                <span>Nama Polsek</span>
                <input value={settings.unitName} onChange={(event) => update("unitName", event.target.value)} />
              </label>
              <label className="form-field">
                <span>Kode unit</span>
                <input value={settings.unitCode} onChange={(event) => update("unitCode", event.target.value.toUpperCase())} maxLength={12} />
              </label>
              <label className="form-field">
                <span>Zona waktu</span>
                <input value={settings.unitTimezone} onChange={(event) => update("unitTimezone", event.target.value)} />
              </label>
              <label className="form-field full">
                <span>Alamat</span>
                <input value={settings.unitAddress} onChange={(event) => update("unitAddress", event.target.value)} />
              </label>
            </div>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <div className="eyebrow">INTEGRASI</div>
                <h3>WhatsApp & data</h3>
              </div>
              <Radio size={18} className="muted" />
            </header>
            <div className="settings-fields">
              <label className="form-field">
                <span>Nomor WhatsApp</span>
                <input value={settings.waNumber} onChange={(event) => update("waNumber", event.target.value)} placeholder="08xxxxxxxxxx" />
              </label>
              <label className="form-field">
                <span>Pemilik nomor</span>
                <input value={settings.waOwner} onChange={(event) => update("waOwner", event.target.value)} placeholder="Nama / unit" />
              </label>
              <label className="form-field full">
                <span>ID grup URC</span>
                <input value={settings.waGroupUrcJid} onChange={(event) => update("waGroupUrcJid", event.target.value)} placeholder="120363... (otomatis @g.us)" />
                <small className="field-hint">Cukup angka ID grup. Sistem menambahkan @g.us otomatis.</small>
              </label>
              <label className="form-field">
                <span>DPO / penanggung jawab data</span>
                <input value={settings.dpoName} onChange={(event) => update("dpoName", event.target.value)} />
              </label>
              <label className="form-field">
                <span>Retensi (hari)</span>
                <input type="number" min={30} value={settings.retentionDays} onChange={(event) => update("retentionDays", Number(event.target.value))} />
              </label>
            </div>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <div className="eyebrow">SLA & ESKALASI</div>
                <h3>Target respons (detik)</h3>
              </div>
            </header>
            <div className="settings-fields">
              <label className="form-field">
                <span>P1 ack</span>
                <input type="number" min={10} value={settings.slaP1AckSeconds} onChange={(event) => update("slaP1AckSeconds", Number(event.target.value))} />
              </label>
              <label className="form-field">
                <span>P1 OTW</span>
                <input type="number" min={10} value={settings.slaP1OtwSeconds} onChange={(event) => update("slaP1OtwSeconds", Number(event.target.value))} />
              </label>
              <label className="form-field">
                <span>Eskalasi Pawas</span>
                <input type="number" min={10} value={settings.escalationPawasSeconds} onChange={(event) => update("escalationPawasSeconds", Number(event.target.value))} />
              </label>
              <label className="form-field">
                <span>Eskalasi Kapolsek</span>
                <input type="number" min={10} value={settings.escalationKapolsekSeconds} onChange={(event) => update("escalationKapolsekSeconds", Number(event.target.value))} />
              </label>
            </div>
            <label className="toggle-row">
              <input type="checkbox" className="switch" checked={settings.alarmSoundRequired} onChange={(event) => update("alarmSoundRequired", event.target.checked)} />
              <span>Alarm suara wajib per shift</span>
            </label>
            <label className="toggle-row">
              <input type="checkbox" className="switch" checked={settings.piiMasking} onChange={(event) => update("piiMasking", event.target.checked)} />
              <span>Masking nomor di notifikasi WhatsApp (grup/eskalasi)</span>
            </label>
          </section>

          <section className="panel settings-card span-2">
            <header className="card-head">
              <div>
                <div className="eyebrow">PETUGAS</div>
                <h3>Nomor WhatsApp & role</h3>
              </div>
              <Radio size={18} className="muted" />
            </header>
            <p className="fine-print" style={{ marginTop: 0 }}>
              <b>Petugas</b> = akun personel Polsek (piket, URC, bhabin, pawas, kapolsek, admin) yang
              bisa login dashboard dan/atau memakai command WhatsApp. Pelapor/warga tidak masuk
              daftar ini. Hapus akan menonaktifkan akun jika petugas sudah punya riwayat tiket.
            </p>
            <div className="officer-list">
              {officers.map((officer) => (
                <OfficerRow
                  key={officer.id}
                  officer={officer}
                  regions={regions}
                  onToast={onToast}
                  onChanged={() => void reloadOfficers()}
                />
              ))}
            </div>
            <p className="fine-print">
              Nomor dipakai untuk memvalidasi command grup (<code>/otw</code>, <code>/tiba</code>,{" "}
              <code>/selesai</code>). Cukup ketik 0812... atau 628...; sistem mengubahnya menjadi
              JID <code>...@s.whatsapp.net</code> otomatis. Seed demo memakai 628000000001 dan seterusnya.
            </p>
          </section>

          <section className="panel settings-card span-2">
            <header className="card-head">
              <div>
                <div className="eyebrow">TAMBAH PETUGAS</div>
                <h3>Akun petugas baru</h3>
              </div>
              <ShieldCheck size={18} className="muted" />
            </header>
            <div className="settings-fields">
              <label className="form-field">
                <span>Username</span>
                <input
                  value={officerForm.username}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, username: event.target.value }))
                  }
                  placeholder="piket3"
                />
              </label>
              <label className="form-field">
                <span>Nama lengkap</span>
                <input
                  value={officerForm.name}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="Bripka Nama"
                />
              </label>
              <label className="form-field">
                <span>Role</span>
                <select
                  className="select"
                  value={officerForm.role}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, role: event.target.value }))
                  }
                >
                  {["piket", "urc", "bhabin", "pawas", "kapolsek", "admin"].map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Password awal</span>
                <input
                  type="password"
                  value={officerForm.password}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, password: event.target.value }))
                  }
                  placeholder="min. 10 karakter, huruf + angka"
                />
              </label>
              <label className="form-field">
                <span>Nomor WhatsApp</span>
                <input
                  value={officerForm.waJid}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, waJid: event.target.value }))
                  }
                  placeholder="0812... atau 628... (otomatis)"
                />
                <small className="field-hint">Kosongkan jika petugas tidak memakai command grup.</small>
              </label>
              <label className="form-field">
                <span>Wilayah (untuk bhabin)</span>
                <select
                  className="select"
                  value={officerForm.regionId}
                  onChange={(event) =>
                    setOfficerForm((previous) => ({ ...previous, regionId: event.target.value }))
                  }
                >
                  <option value="">Tidak terikat wilayah</option>
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void addOfficer()} disabled={savingOfficer}>
              <Save size={14} /> {savingOfficer ? "Menyimpan..." : "Tambah petugas"}
            </button>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <div className="eyebrow">GRUP WHATSAPP</div>
                <h3>Grup URC / Bhabin</h3>
              </div>
              <Radio size={18} className="muted" />
            </header>
            <p className="fine-print" style={{ marginTop: 0 }}>
              <b>URC</b> = tujuan forward tiket + command. <b>Bhabin</b> = koordinasi wilayah.{" "}
              <b>Lain</b> = grup tambahan. Hanya grup aktif dan nomor petugas terdaftar yang
              command-nya diterima bot.
            </p>
            <div className="group-list">
              {groups.map((group) => (
                <div className="group-row" key={group.id}>
                  <div>
                    <b>{group.name}</b>
                    <span className="mono">{group.jid}</span>
                  </div>
                  <span className={`badge ${group.active ? "green" : "muted"}`}>
                    {group.active ? "AKTIF" : "NONAKTIF"}
                  </span>
                  <button className="filter-btn" type="button" onClick={() => void toggleGroup(group)}>
                    {group.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              ))}
              {groups.length === 0 ? <div className="data-empty">Belum ada grup.</div> : null}
            </div>
            <div className="divider" />
            <div className="settings-fields">
              <label className="form-field">
                <span>Nama grup</span>
                <input
                  value={groupForm.name}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, name: event.target.value }))
                  }
                  placeholder="URC Polsek"
                />
              </label>
              <label className="form-field">
                <span>ID grup (angka)</span>
                <input
                  value={groupForm.jid}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, jid: event.target.value }))
                  }
                  placeholder="120363... (otomatis @g.us)"
                />
                <small className="field-hint">Jangan tempel link invite. Ambil ID grup dari info grup.</small>
              </label>
              <label className="form-field">
                <span>Fungsi</span>
                <select
                  className="select"
                  value={groupForm.purpose}
                  onChange={(event) =>
                    setGroupForm((previous) => ({ ...previous, purpose: event.target.value }))
                  }
                >
                  <option value="urc">URC</option>
                  <option value="bhabin">Bhabin</option>
                  <option value="lain">Lain</option>
                </select>
              </label>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void addGroup()} disabled={savingGroup}>
              <Radio size={14} /> {savingGroup ? "Menyimpan..." : "Tambah grup"}
            </button>
          </section>

          <section className="panel settings-card">
            <header className="card-head">
              <div>
                <div className="eyebrow">WILAYAH</div>
                <h3>Polygon geofence</h3>
              </div>
              <MapPin size={18} className="muted" />
            </header>
            <div className="region-list">
              {regions.map((region) => (
                <div className="region-item" key={region.id}>
                  <div className="region-info">
                    <b>{region.name}</b>
                    <span>
                      {region.ticketCount} tiket · v{region.version}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      !region.active ? "muted" : region.isDemo ? "amber" : "green"
                    }`}
                  >
                    {!region.active ? "NONAKTIF" : region.isDemo ? "DEMO" : "RESMI"}
                  </span>
                  <div className="region-actions">
                    {region.active ? (
                      <button
                        className="btn btn-danger-ghost"
                        type="button"
                        onClick={() => void removeRegion(region)}
                      >
                        <Trash2 size={12} /> Hapus
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => void restoreRegion(region)}
                      >
                        <RefreshCw size={12} /> Aktifkan
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="settings-fields">
              <label className="form-field full">
                <span>Nama kelurahan baru</span>
                <input value={regionName} onChange={(event) => setRegionName(event.target.value)} placeholder="Contoh: Pekayon Jaya" />
              </label>
              <label className="form-field full">
                <span>GeoJSON Polygon</span>
                <textarea
                  className="textarea"
                  rows={4}
                  value={regionJson}
                  onChange={(event) => setRegionJson(event.target.value)}
                  placeholder='{"type":"Polygon","coordinates":[[[106.97,-6.25],...]]}'
                />
              </label>
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void addRegion()}>
              <MapPin size={14} /> Tambah wilayah
            </button>
            <p className="fine-print">
              Tempel GeoJSON Polygon/MultiPolygon (ring tertutup). Bisa ambil dari geojson.io atau batas
              resmi kelurahan. Polygon demo hanya untuk pengembangan; produksi wajib memakai batas
              resmi yang divalidasi. Hapus wilayah yang masih dipakai tiket akan menonaktifkannya.
            </p>
          </section>

          <section className="panel settings-card span-2">
            <header className="card-head">
              <div>
                <div className="eyebrow">STATUS</div>
                <h3>Kesehatan sistem</h3>
              </div>
              <Database size={18} className="muted" />
            </header>
            {status ? (
              <div className="status-grid">
                <div><span>Versi</span><b>{status.version}</b></div>
                <div><span>Env</span><b>{status.env}</b></div>
                <div><span>Uptime</span><b>{Math.floor(status.uptimeSeconds / 60)} mnt</b></div>
                <div><span>Database</span><b>{sizeLabel(status.db.sizeBytes)}</b></div>
                <div><span>Gateway</span><b>{status.gateway.status === "configured" ? "Terkonfigurasi" : "Belum"}</b></div>
                <div><span>Gateway WA</span><b>Lihat kartu di atas</b></div>
                <div><span>Outbox</span><b>{status.outbox.pending ?? 0} pending</b></div>
                <div><span>Region demo</span><b>{status.demo.regions}</b></div>
                <div><span>Tiket demo</span><b>{status.demo.tickets}</b></div>
              </div>
            ) : (
              <div className="data-empty">Status belum tersedia.</div>
            )}
            {status?.gatewayState?.status === "qr" ? (
              <p className="fine-print">
                <TriangleAlert size={11} /> QR pairing tampil di kartu WhatsApp Gateway di atas.
              </p>
            ) : null}
            <p className="fine-print">
              <TriangleAlert size={11} /> Perubahan pengaturan langsung dipakai API. Seed hanya mengisi nilai awal.
            </p>
          </section>

          <PasswordCard onToast={onToast} />
          <TotpCard user={user} onToast={onToast} onTotpEnabled={onTotpEnabled} />
          <PushCard onToast={onToast} />
          <ThemeCard theme={theme} onThemeChange={onThemeChange} />
        </div>
      )}
    </section>
  );
}
