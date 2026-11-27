import { z } from "zod";
import { REJECT_REASONS } from "./constants.js";
import { CATEGORIES, PRIORITIES, ROLES, TICKET_STATUSES } from "./types.js";
import { MENU_IDS, visibleMenusFor } from "./menu.js";
import {
  isValidPhone,
  isWhatsAppGroupJid,
  isWhatsAppJid,
  toWhatsAppGroupJid,
  toWhatsAppJid
} from "./phone.js";

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const MANUAL_SOURCE_TYPES = ["telepon", "walk-in", "patroli"] as const;

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(200),
  totp: z
    .string()
    .regex(/^\d{6}$/, "Kode TOTP harus 6 digit")
    .optional()
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200)
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(10).max(200)
});

export const totpEnableSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const transitionSchema = z.object({
  to: z.enum(TICKET_STATUSES),
  note: z.string().trim().max(2000).optional(),
  reason: z.enum(REJECT_REASONS).optional(),
  assigneeId: z.string().min(1).optional()
});

export const noteSchema = z.object({
  text: z.string().trim().min(1).max(2000)
});

export const manualTicketSchema = z
  .object({
    reporterName: z.string().trim().min(3).max(120),
    // Nomor tak valid dulu dinormalisasi jadi string kosong sehingga semua
    // laporan tanpa nomor digabung ke satu pelapor. Sekarang wajib valid.
    reporterPhone: z
      .string()
      .trim()
      .min(8)
      .max(20)
      .refine(isValidPhone, "Nomor telepon pelapor tidak valid (contoh: 0812xxxxxxx)"),
    category: z.enum(CATEGORIES),
    priority: z.enum(PRIORITIES).optional(),
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().max(4000).optional(),
    address: z.string().trim().max(500).optional(),
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    accuracyM: z.number().finite().nonnegative().max(5000).optional(),
    regionId: z.string().min(1).optional(),
    source: z.enum(MANUAL_SOURCE_TYPES).default("telepon"),
    reporterConsent: z.literal(true)
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: "Latitude dan longitude harus diisi berpasangan",
    path: ["lat"]
  })
  // Lokasi wajib untuk semua laporan, termasuk yang diinput piket.
  .refine((value) => value.lat !== undefined || (value.address ?? "").trim().length >= 3, {
    message: "Lokasi kejadian wajib diisi (alamat atau titik peta)",
    path: ["address"]
  });

export const regionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  geojson: z.unknown(),
  active: z.boolean().default(true),
  parentId: z.string().min(1).nullable().optional(),
  isDemo: z.boolean().default(false)
});

export const regionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  geojson: z.unknown().optional(),
  active: z.boolean().optional()
});

export const settingsPatchSchema = z
  .object({
    unit_name: z.string().trim().min(2).max(160).optional(),
    unit_code: z.string().trim().min(2).max(12).optional(),
    unit_address: z.string().trim().max(300).optional(),
    unit_timezone: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .refine(isValidTimeZone, "Zona waktu IANA tidak valid (contoh: Asia/Jakarta)")
      .optional(),
    wa_number: z.string().trim().max(30).optional(),
    wa_owner: z.string().trim().max(160).optional(),
    wa_group_urc_jid: z
      .string()
      .trim()
      .max(160)
      .transform(toWhatsAppGroupJid)
      .refine(
        (value) => !value || isWhatsAppGroupJid(value),
        "ID grup tidak valid. Masukkan angka ID grup atau JID ...@g.us"
      )
      .optional(),
    dpo_name: z.string().trim().max(160).optional(),
    retention_days: z.number().int().positive().max(3650).optional(),
    sla_p1_ack_seconds: z.number().int().positive().max(86400).optional(),
    sla_p1_otw_seconds: z.number().int().positive().max(86400).optional(),
    escalation_pawas_seconds: z.number().int().positive().max(86400).optional(),
    escalation_kapolsek_seconds: z.number().int().positive().max(86400).optional(),
    alarm_sound_required: z.boolean().optional(),
    pii_masking: z.boolean().optional(),
    menu_hidden: z
      .partialRecord(z.enum(ROLES), z.array(z.enum(MENU_IDS)).max(MENU_IDS.length))
      .optional()
  })
  .strict()
  .refine(
    (value) => !value.menu_hidden?.admin?.includes("system"),
    { message: "Menu Sistem tidak boleh disembunyikan dari admin", path: ["menu_hidden", "admin"] }
  )
  .refine(
    (value) =>
      !value.menu_hidden ||
      ROLES.every((role) => visibleMenusFor(role, value.menu_hidden ?? {}).length > 0),
    { message: "Setiap role harus punya minimal satu menu yang tampil", path: ["menu_hidden"] }
  )
  .refine(
    (value) =>
      value.escalation_pawas_seconds === undefined ||
      value.escalation_kapolsek_seconds === undefined ||
      value.escalation_kapolsek_seconds >= value.escalation_pawas_seconds,
    {
      message: "Eskalasi Kapolsek minimal sama dengan eskalasi Pawas",
      path: ["escalation_kapolsek_seconds"]
    }
  );

export const ticketQuerySchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  regionId: z.string().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional()
});

export const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});

export const officerCreateSchema = z.object({
  username: z.string().trim().min(3).max(64),
  name: z.string().trim().min(3).max(160),
  rank: z.string().trim().max(40).optional(),
  role: z.enum(ROLES),
  regionId: z.string().min(1).nullable().optional(),
  phone: z.string().trim().max(30).optional(),
  waJid: z
    .string()
    .trim()
    .max(160)
    .transform(toWhatsAppJid)
    .refine(
      (value) => !value || isWhatsAppJid(value),
      "Nomor WhatsApp tidak valid. Masukkan 0812..., 62812..., atau JID ...@s.whatsapp.net"
    )
    .optional(),
  password: z.string().min(8).max(200)
});

export const officerUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    rank: z.string().trim().max(40).nullable().optional(),
    role: z.enum(ROLES).optional(),
    regionId: z.string().min(1).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    waJid: z.string().trim().max(160).nullable().optional(),
    active: z.boolean().optional()
  })
  .strict();

export const blockReporterSchema = z.object({
  reason: z.string().trim().min(3).max(300)
});

export const handoverSchema = z.object({
  shift: z.enum(["pagi", "siang", "malam"]),
  incomingName: z.string().trim().min(3).max(120),
  notes: z.string().trim().min(3).max(2000),
  signedByName: z.string().trim().min(3).max(120),
  checklist: z.record(z.string(), z.boolean()).default({})
});

export const mergeTicketSchema = z.object({
  sourceIds: z.array(z.string().min(1)).min(1).max(20),
  note: z.string().trim().max(500).optional()
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional()
});

export const reporterQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TransitionInput = z.infer<typeof transitionSchema>;
export type ManualTicketInput = z.infer<typeof manualTicketSchema>;
export type RegionInputBody = z.infer<typeof regionSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type OfficerCreateInput = z.infer<typeof officerCreateSchema>;
