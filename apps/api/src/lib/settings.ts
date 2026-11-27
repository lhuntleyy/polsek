import { eq } from "drizzle-orm";
import type { AppConfig } from "@sigap/config";
import { sanitizeMenuHidden, type MenuHidden, type SettingsPatch } from "@sigap/core";
import type { Db } from "../db/client.js";
import { settings } from "../db/schema.js";
import { DEFAULT_UNIT_ID } from "./constants.js";

export interface UnitSettings {
  unitName: string;
  unitCode: string;
  unitAddress: string;
  unitTimezone: string;
  waNumber: string;
  waOwner: string;
  waGroupUrcJid: string;
  dpoName: string;
  retentionDays: number;
  slaP1AckSeconds: number;
  slaP1OtwSeconds: number;
  escalationPawasSeconds: number;
  escalationKapolsekSeconds: number;
  alarmSoundRequired: boolean;
  piiMasking: boolean;
  /** Menu yang disembunyikan admin per role. */
  menuHidden: MenuHidden;
}

export function defaultsFromConfig(config: AppConfig): UnitSettings {
  return {
    unitName: config.SIGAP_UNIT_NAME,
    unitCode: config.SIGAP_UNIT_CODE,
    unitAddress: config.SIGAP_UNIT_ADDRESS,
    unitTimezone: config.SIGAP_UNIT_TIMEZONE,
    waNumber: config.SIGAP_WA_NUMBER,
    waOwner: config.SIGAP_WA_OWNER,
    waGroupUrcJid: config.SIGAP_WA_GROUP_URC_JID,
    dpoName: config.SIGAP_DPO_NAME,
    retentionDays: config.SIGAP_RETENTION_DAYS,
    slaP1AckSeconds: config.SIGAP_SLA_P1_ACK_SECONDS,
    slaP1OtwSeconds: config.SIGAP_SLA_P1_OTW_SECONDS,
    escalationPawasSeconds: config.SIGAP_ESCALATION_PAWAS_SECONDS,
    escalationKapolsekSeconds: config.SIGAP_ESCALATION_KAPOLSEK_SECONDS,
    alarmSoundRequired: true,
    piiMasking: true,
    menuHidden: {}
  };
}

export function readSettings(db: Db, config: AppConfig): UnitSettings {
  const result = defaultsFromConfig(config);
  const rows = db
    .select()
    .from(settings)
    .where(eq(settings.unitId, DEFAULT_UNIT_ID))
    .all();

  for (const row of rows) {
    const key = row.key;
    if (key === "unit_name") result.unitName = row.value;
    else if (key === "unit_code") result.unitCode = row.value;
    else if (key === "unit_address") result.unitAddress = row.value;
    else if (key === "unit_timezone") result.unitTimezone = row.value;
    else if (key === "wa_number") result.waNumber = row.value;
    else if (key === "wa_owner") result.waOwner = row.value;
    else if (key === "wa_group_urc_jid") result.waGroupUrcJid = row.value;
    else if (key === "dpo_name") result.dpoName = row.value;
    else if (key === "retention_days") result.retentionDays = Number(row.value) || result.retentionDays;
    else if (key === "sla_p1_ack_seconds") result.slaP1AckSeconds = Number(row.value) || result.slaP1AckSeconds;
    else if (key === "sla_p1_otw_seconds") result.slaP1OtwSeconds = Number(row.value) || result.slaP1OtwSeconds;
    else if (key === "escalation_pawas_seconds") result.escalationPawasSeconds = Number(row.value) || result.escalationPawasSeconds;
    else if (key === "escalation_kapolsek_seconds") result.escalationKapolsekSeconds = Number(row.value) || result.escalationKapolsekSeconds;
    else if (key === "alarm_sound_required") result.alarmSoundRequired = row.value === "true";
    else if (key === "pii_masking") result.piiMasking = row.value === "true";
    else if (key === "menu_hidden") {
      try {
        result.menuHidden = sanitizeMenuHidden(JSON.parse(row.value));
      } catch {
        result.menuHidden = {};
      }
    }
  }

  return result;
}

export function ensureDefaultSettings(db: Db, config: AppConfig): void {
  const defaults = defaultsFromConfig(config);
  const values: Record<string, string> = {
    unit_name: defaults.unitName,
    unit_code: defaults.unitCode,
    unit_address: defaults.unitAddress,
    unit_timezone: defaults.unitTimezone,
    wa_number: defaults.waNumber,
    wa_owner: defaults.waOwner,
    wa_group_urc_jid: defaults.waGroupUrcJid,
    dpo_name: defaults.dpoName,
    retention_days: String(defaults.retentionDays),
    sla_p1_ack_seconds: String(defaults.slaP1AckSeconds),
    sla_p1_otw_seconds: String(defaults.slaP1OtwSeconds),
    escalation_pawas_seconds: String(defaults.escalationPawasSeconds),
    escalation_kapolsek_seconds: String(defaults.escalationKapolsekSeconds),
    alarm_sound_required: String(defaults.alarmSoundRequired),
    pii_masking: String(defaults.piiMasking)
  };
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(values)) {
    db.insert(settings)
      .values({
        unitId: DEFAULT_UNIT_ID,
        key,
        value,
        updatedBy: null,
        updatedAt: now
      })
      .onConflictDoNothing()
      .run();
  }
}

export function writeSettings(
  db: Db,
  patch: SettingsPatch,
  actorId: string | null
): void {
  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    // Patch keys are already the snake_case keys used in the settings table.
    const dbKey = key;
    const serialized =
      key === "menu_hidden"
        ? JSON.stringify(sanitizeMenuHidden(value))
        : typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : String(value);
    db.insert(settings)
      .values({
        unitId: DEFAULT_UNIT_ID,
        key: dbKey,
        value: serialized,
        updatedBy: actorId,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [settings.unitId, settings.key],
        set: { value: serialized, updatedBy: actorId, updatedAt: now }
      })
      .run();
  }
}
