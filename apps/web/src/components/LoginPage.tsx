import { useState, type FormEvent } from "react";
import { AlertCircle, KeyRound, Loader2, LogIn, ShieldCheck } from "lucide-react";
import type { PublicConfig } from "../lib/types";

interface LoginPageProps {
  config: PublicConfig | null;
  error: string | null;
  onLogin: (username: string, password: string, totp: string) => Promise<void>;
}

export function LoginPage({ config, error, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onLogin(username.trim(), password, totp.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-ambient" aria-hidden="true" />
      <main className="login-card">
        <div className="login-brand">
          <span className="brand-mark login-brand-mark">
            <ShieldCheck size={24} strokeWidth={1.7} />
          </span>
          <div>
            <span className="eyebrow">SIGAP · COMMAND BOARD</span>
            <h1>{config?.unit.name ?? "Memuat unit..."}</h1>
          </div>
        </div>

        <p className="login-sub">
          Kanal pelaporan warga dan tiket piket. Masuk dengan akun petugas yang
          terdaftar.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Username</span>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="contoh: piket"
              required
            />
          </label>

          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          <details className="login-totp">
            <summary>
              <KeyRound size={13} /> Kode TOTP (jika aktif)
            </summary>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={totp}
              onChange={(event) => setTotp(event.target.value.replace(/\D/g, ""))}
              placeholder="6 digit"
            />
          </details>

          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="btn btn-primary btn-block login-submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
            {submitting ? "Memeriksa..." : "Masuk"}
          </button>
        </form>

        {config?.demoEnabled ? (
          <div className="login-demo">
            <span className="eyebrow">DEMO DEVELOPMENT</span>
            <div>
              <code>piket</code> / <code>Demo#12345</code>
              <span className="dot-sep">·</span>
              <code>admin</code> / <code>Admin#12345</code>
            </div>
          </div>
        ) : null}

        <footer className="login-footer">
          <span>SIGAP v{config?.version ?? "1.2.0"}</span>
          <span className="dot-sep">·</span>
          <span>Sistem Pelaporan Piket Polsek</span>
        </footer>
      </main>
    </div>
  );
}
