import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import { normalizePhone } from "@sigap/core";

const AAD = Buffer.from("sigap:phone:v1");
const TOTP_AAD = Buffer.from("sigap:totp:v1");

function encryptValue(value: string, keyBase64: string, aad: Buffer): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptValue(payload: string, keyBase64: string, aad: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Format data terenkripsi tidak valid");
  }
  const key = Buffer.from(keyBase64, "base64");
  const iv = Buffer.from(parts[1] as string, "base64url");
  const tag = Buffer.from(parts[2] as string, "base64url");
  const encrypted = Buffer.from(parts[3] as string, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Format data terenkripsi tidak valid");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashToken(token: string, secret?: string): string {
  return secret ? createHmac("sha256", secret).update(token).digest("hex") : sha256(token);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashPhone(phone: string, pepper: string): string {
  return createHmac("sha256", pepper).update(normalizePhone(phone)).digest("hex");
}

export function encryptPhone(phone: string, keyBase64: string): string {
  return encryptValue(phone, keyBase64, AAD);
}

export function decryptPhone(payload: string, keyBase64: string): string {
  return decryptValue(payload, keyBase64, AAD);
}

export function encryptTotpSecret(secret: string, keyBase64: string): string {
  return encryptValue(secret, keyBase64, TOTP_AAD);
}

export function decryptTotpSecret(payload: string, keyBase64: string): string {
  // Legacy plaintext secrets are accepted once, then re-encrypted on next setup.
  if (!payload.startsWith("v1.")) return payload;
  return decryptValue(payload, keyBase64, TOTP_AAD);
}
