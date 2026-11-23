import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { authenticator } from "otplib";

const ARGON_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
};

let dummyHashPromise: Promise<string> | null = null;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export async function verifyDummyPassword(password: string): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(24).toString("base64url"));
  }
  const dummyHash = await dummyHashPromise;
  await verifyPassword(dummyHash, password);
}

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(username: string, secret: string): string {
  return authenticator.keyuri(username, "SIGAP", secret);
}

/**
 * Verifikasi TOTP dan kembalikan nomor time-step yang dipakai (untuk mencegah
 * replay kode yang sama). null = kode salah.
 */
export function verifyTotpStep(code: string, secret: string, nowMs = Date.now()): number | null {
  try {
    const delta = authenticator.checkDelta(code, secret);
    if (delta === null) return null;
    return Math.floor(nowMs / 30_000) + delta;
  } catch {
    return null;
  }
}

/** Kebijakan password minimum: 10 karakter, ada huruf dan angka. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < 10) return "Password minimal 10 karakter";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password harus mengandung huruf dan angka";
  }
  return null;
}

export function verifyTotp(code: string, secret: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false;
  }
}
