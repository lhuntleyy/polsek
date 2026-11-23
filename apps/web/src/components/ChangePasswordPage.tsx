import { useState, type FormEvent } from "react";
import { AlertCircle, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import type { User } from "../lib/types";

interface ChangePasswordPageProps {
  user: User;
  unitName: string;
  onDone: () => void;
  onLogout: () => void;
}

/** Validasi sisi klien; server tetap memeriksa ulang kebijakan yang sama. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < 10) return "Password baru minimal 10 karakter.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password baru harus mengandung huruf dan angka.";
  }
  if (password !== confirm) return "Konfirmasi password tidak sama.";
  return null;
}

/**
 * Layar wajib ganti password: muncul setelah login bila akun baru dibuat atau
 * password direset admin. Admin tidak boleh tahu password petugas selamanya.
 */
export function ChangePasswordPage({ user, unitName, onDone, onLogout }: ChangePasswordPageProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const problem = passwordProblem(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengganti password");
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
            <span className="eyebrow">GANTI PASSWORD</span>
            <h1>{unitName}</h1>
          </div>
        </div>

        <p className="login-sub">
          Halo {user.name}. Password Anda dibuat atau direset oleh admin. Demi keamanan,
          buat password baru yang hanya Anda ketahui sebelum melanjutkan.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-field">
            <span>Password saat ini</span>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
              autoFocus
            />
          </label>
          <label className="login-field">
            <span>Password baru (min. 10 karakter, huruf + angka)</span>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
          </label>
          <label className="login-field">
            <span>Ulangi password baru</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
          </label>

          {error ? (
            <div className="login-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          ) : null}

          <button className="btn btn-primary btn-block login-submit" type="submit" disabled={submitting}>
            {submitting ? <Loader2 className="spin" size={16} /> : <KeyRound size={16} />}
            {submitting ? "Menyimpan..." : "Simpan password baru"}
          </button>
          <button className="btn btn-block" type="button" onClick={onLogout}>
            <LogOut size={16} /> Keluar
          </button>
        </form>
      </main>
    </div>
  );
}
