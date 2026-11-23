import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { z } from "zod";

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

const envSchema = z.object({
  SIGAP_ENV: z.enum(["development", "test", "production"]).default("development"),
  SIGAP_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SIGAP_API_HOST: z.string().min(1).default("127.0.0.1"),
  SIGAP_API_PORT: z.coerce.number().int().positive().max(65535).default(4000),
  SIGAP_PUBLIC_ORIGIN: z.string().url().default("http://localhost:5173"),

  SIGAP_DB_PATH: z.string().min(1).default("./data/sigap.db"),
  SIGAP_MEDIA_DIR: z.string().min(1).default("./data/media"),

  SIGAP_API_URL: z.string().url().default("http://127.0.0.1:4000"),
  SIGAP_INTERNAL_TOKEN: z.string().min(16).default("dev-internal-token-change-me"),
  SIGAP_BOT_AUTH_DIR: z.string().min(1).default("./data/baileys"),

  SIGAP_UNIT_CODE: z.string().min(2).max(12).default("POL"),
  SIGAP_UNIT_NAME: z.string().min(2).default("Polsek Contoh"),
  SIGAP_UNIT_ADDRESS: z.string().default(""),
  SIGAP_UNIT_TIMEZONE: z
    .string()
    .trim()
    .min(1)
    .default("Asia/Jakarta")
    .refine(isValidTimeZone, "Zona waktu IANA tidak valid"),

  SIGAP_WA_NUMBER: z.string().default(""),
  SIGAP_WA_OWNER: z.string().default(""),
  SIGAP_WA_GROUP_URC_JID: z.string().default(""),

  SIGAP_DPO_NAME: z.string().default("Project Owner"),
  SIGAP_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

  SIGAP_SLA_P1_ACK_SECONDS: z.coerce.number().int().positive().default(120),
  SIGAP_SLA_P1_OTW_SECONDS: z.coerce.number().int().positive().default(300),
  SIGAP_ESCALATION_PAWAS_SECONDS: z.coerce.number().int().positive().default(180),
  SIGAP_ESCALATION_KAPOLSEK_SECONDS: z.coerce.number().int().positive().default(600),

  SIGAP_SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-change-me-32-chars"),
  SIGAP_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  SIGAP_COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  SIGAP_COOKIE_NAME: z.string().min(1).default("sigap_session"),

  SIGAP_ADMIN_USERNAME: z.string().min(3).default("admin"),
  SIGAP_ADMIN_PASSWORD: z.string().min(8).default("Admin#12345"),
  SIGAP_ADMIN_NAME: z.string().min(2).default("Admin SIGAP"),
  SIGAP_ADMIN_TOTP_SECRET: z.string().default(""),

  SIGAP_PHONE_KEY: z
    .string()
    .trim()
    .default("BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=")
    .refine((value) => {
      try {
        return /^[A-Za-z0-9+/]+=*$/.test(value) && Buffer.from(value, "base64").length === 32;
      } catch {
        return false;
      }
    }, "SIGAP_PHONE_KEY harus 32 byte dalam base64"),
  SIGAP_PHONE_PEPPER: z.string().min(16).default("dev-only-phone-pepper-change-me"),

  SIGAP_VAPID_PUBLIC_KEY: z.string().default(""),
  SIGAP_VAPID_PRIVATE_KEY: z.string().default(""),
  SIGAP_VAPID_SUBJECT: z.string().default("mailto:admin@example.local"),

  SIGAP_SEED_DEMO: z.enum(["true", "false"]).optional()
});

export type Env = z.infer<typeof envSchema>;

export type AppConfig = Env & {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly cookieSecure: boolean;
  readonly seedDemo: boolean;
  readonly dbPath: string;
  readonly mediaDir: string;
  readonly botAuthDir: string;
  readonly version: string;
};

function findProjectRoot(start = process.cwd()): string {
  let current = resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return resolve(start);
}

function resolveProjectPath(value: string): string {
  if (value === ":memory:" || isAbsolute(value)) return value;
  return resolve(findProjectRoot(), value);
}

function mergeEnv(overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

export const DEV_DEFAULTS = {
  SIGAP_SESSION_SECRET: "dev-only-session-secret-change-me-32-chars",
  SIGAP_PHONE_KEY: "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
  SIGAP_PHONE_PEPPER: "dev-only-phone-pepper-change-me",
  SIGAP_INTERNAL_TOKEN: "dev-internal-token-change-me",
  SIGAP_ADMIN_PASSWORD: "Admin#12345"
} as const;

/** Nama secret yang masih memakai nilai default publik dari repo. */
export function defaultSecretsInUse(config: AppConfig): string[] {
  return (Object.keys(DEV_DEFAULTS) as Array<keyof typeof DEV_DEFAULTS>).filter(
    (key) => config[key] === DEV_DEFAULTS[key]
  );
}

export interface LoadConfigOptions {
  /**
   * "bot" hanya memvalidasi secret yang dipakai bot (token internal), sehingga
   * bot bisa dijalankan dengan env file sendiri tanpa memegang secret API.
   */
  component?: "api" | "bot";
}

export function loadConfig(
  overrides: NodeJS.ProcessEnv = {},
  options: LoadConfigOptions = {}
): AppConfig {
  const parsed = envSchema.parse(mergeEnv(overrides));
  const isProduction = parsed.SIGAP_ENV === "production";

  const cookieSecure = parsed.SIGAP_COOKIE_SECURE
    ? parsed.SIGAP_COOKIE_SECURE === "true"
    : isProduction;
  const seedDemo = parsed.SIGAP_SEED_DEMO
    ? parsed.SIGAP_SEED_DEMO === "true"
    : parsed.SIGAP_ENV === "development";

  const config: AppConfig = {
    ...parsed,
    isProduction,
    isDevelopment: parsed.SIGAP_ENV === "development",
    isTest: parsed.SIGAP_ENV === "test",
    cookieSecure,
    seedDemo,
    dbPath: resolveProjectPath(parsed.SIGAP_DB_PATH),
    mediaDir: resolveProjectPath(parsed.SIGAP_MEDIA_DIR),
    botAuthDir: resolveProjectPath(parsed.SIGAP_BOT_AUTH_DIR),
    version: "1.2.0"
  };

  if (isProduction) {
    if (options.component === "bot") assertBotProductionConfig(config);
    else assertProductionConfig(config);
  }

  return config;
}

function assertBotProductionConfig(config: AppConfig): void {
  const problems: string[] = [];
  if (config.SIGAP_INTERNAL_TOKEN.startsWith("dev-")) {
    problems.push("SIGAP_INTERNAL_TOKEN masih memakai nilai development");
  }
  if (config.SIGAP_INTERNAL_TOKEN.length < 32) {
    problems.push("SIGAP_INTERNAL_TOKEN minimal 32 karakter di produksi");
  }
  if (problems.length > 0) {
    throw new Error(`Konfigurasi bot produksi belum aman:\n- ${problems.join("\n- ")}`);
  }
}

function assertProductionConfig(config: AppConfig): void {
  const problems: string[] = [];
  if (config.SIGAP_SESSION_SECRET.startsWith("dev-")) {
    problems.push("SIGAP_SESSION_SECRET masih memakai nilai development");
  }
  if (config.SIGAP_ADMIN_PASSWORD === "Admin#12345") {
    problems.push("SIGAP_ADMIN_PASSWORD masih memakai password default");
  }
  if (config.SIGAP_PHONE_PEPPER.startsWith("dev-")) {
    problems.push("SIGAP_PHONE_PEPPER masih memakai nilai development");
  }
  if (config.SIGAP_PHONE_KEY === "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=") {
    problems.push("SIGAP_PHONE_KEY masih memakai nilai development");
  }
  if (config.SIGAP_INTERNAL_TOKEN.startsWith("dev-")) {
    problems.push("SIGAP_INTERNAL_TOKEN masih memakai nilai development");
  }
  if (config.SIGAP_INTERNAL_TOKEN.length < 32) {
    problems.push("SIGAP_INTERNAL_TOKEN minimal 32 karakter di produksi");
  }
  if (Boolean(config.SIGAP_VAPID_PUBLIC_KEY) !== Boolean(config.SIGAP_VAPID_PRIVATE_KEY)) {
    problems.push("SIGAP_VAPID_PUBLIC_KEY dan SIGAP_VAPID_PRIVATE_KEY harus diisi berpasangan");
  }
  if (!config.cookieSecure) {
    problems.push("SIGAP_COOKIE_SECURE harus true di produksi");
  }
  if (config.seedDemo) {
    problems.push("SIGAP_SEED_DEMO harus false di produksi");
  }
  if (problems.length > 0) {
    throw new Error(`Konfigurasi produksi belum aman:\n- ${problems.join("\n- ")}`);
  }
}
