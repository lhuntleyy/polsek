import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

export type GatewayStatus = "disconnected" | "connecting" | "qr" | "connected";
export type GatewayCommand = "connect" | "disconnect" | "logout" | "restart";

export interface GatewaySnapshot {
  status: GatewayStatus;
  qr: string | null;
  qrExpiresAt: string | null;
  phone: string | null;
  lastSeenAt: string | null;
  botSeenAt: string | null;
  botOnline: boolean;
  error: string | null;
  updatedAt: string | null;
  pendingCommand: GatewayCommand | null;
  pendingCommandId: string | null;
}

interface GatewayRow {
  status: GatewayStatus;
  qr_data_url: string | null;
  qr_expires_at: string | null;
  phone: string | null;
  error: string | null;
  pending_command: GatewayCommand | null;
  command_id: string | null;
  command_requested_at: string | null;
  bot_seen_at: string | null;
  last_seen_at: string | null;
  updated_at: string;
}

const BOT_ONLINE_WINDOW_MS = 15_000;
const COMMAND_TTL_MS = 120_000;

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Status gateway WhatsApp disimpan di SQLite supaya QR/status tidak hilang
 * saat API restart, dan supaya dashboard bisa mengirim command ke bot.
 */
export class GatewayState {
  constructor(private readonly sqlite: Database.Database) {
    this.sqlite
      .prepare(
        "INSERT OR IGNORE INTO wa_gateway (id, status, updated_at) VALUES ('main', 'disconnected', ?)"
      )
      .run(nowIso());
  }

  private row(): GatewayRow {
    const row = this.sqlite
      .prepare("SELECT * FROM wa_gateway WHERE id = 'main'")
      .get() as GatewayRow | undefined;
    if (row) return row;
    this.sqlite
      .prepare(
        "INSERT INTO wa_gateway (id, status, updated_at) VALUES ('main', 'disconnected', ?)"
      )
      .run(nowIso());
    return this.sqlite
      .prepare("SELECT * FROM wa_gateway WHERE id = 'main'")
      .get() as GatewayRow;
  }

  get(): GatewaySnapshot {
    const row = this.row();
    const now = Date.now();
    const qrExpired = row.qr_expires_at ? Date.parse(row.qr_expires_at) <= now : false;
    const botSeen = row.bot_seen_at ? Date.parse(row.bot_seen_at) : 0;
    return {
      status: row.status,
      qr: qrExpired ? null : row.qr_data_url,
      qrExpiresAt: qrExpired ? null : row.qr_expires_at,
      phone: row.phone,
      lastSeenAt: row.last_seen_at,
      botSeenAt: row.bot_seen_at,
      botOnline: botSeen > 0 && now - botSeen <= BOT_ONLINE_WINDOW_MS,
      error: row.error,
      updatedAt: row.updated_at,
      pendingCommand: row.pending_command,
      pendingCommandId: row.command_id
    };
  }

  update(patch: Partial<Omit<GatewaySnapshot, "botOnline">>): GatewaySnapshot {
    const sets: string[] = [];
    const values: unknown[] = [];
    const now = nowIso();

    if (patch.status !== undefined) {
      sets.push("status = ?");
      values.push(patch.status);
      if (patch.status === "connected") {
        sets.push("last_seen_at = ?");
        values.push(now);
      }
      if (patch.status !== "qr") {
        sets.push("qr_data_url = NULL", "qr_expires_at = NULL");
      }
    }
    if (patch.qr !== undefined && (patch.status === undefined || patch.status === "qr")) {
      sets.push("qr_data_url = ?");
      values.push(patch.qr);
    }
    if (patch.qrExpiresAt !== undefined && (patch.status === undefined || patch.status === "qr")) {
      sets.push("qr_expires_at = ?");
      values.push(patch.qrExpiresAt);
    }
    if (patch.phone !== undefined) {
      sets.push("phone = ?");
      values.push(patch.phone);
    }
    if (patch.error !== undefined) {
      sets.push("error = ?");
      values.push(patch.error);
    }
    sets.push("updated_at = ?");
    values.push(now);
    values.push("main");
    this.sqlite
      .prepare(`UPDATE wa_gateway SET ${sets.join(", ")} WHERE id = ?`)
      .run(...values);
    return this.get();
  }

  touchBot(): void {
    this.sqlite
      .prepare("UPDATE wa_gateway SET bot_seen_at = ? WHERE id = 'main'")
      .run(nowIso());
  }

  requestCommand(command: GatewayCommand): { id: string; command: GatewayCommand } {
    const id = randomUUID();
    this.sqlite
      .prepare(
        `UPDATE wa_gateway
         SET pending_command = ?, command_id = ?, command_requested_at = ?, error = NULL, updated_at = ?
         WHERE id = 'main'`
      )
      .run(command, id, nowIso(), nowIso());
    return { id, command };
  }

  pendingCommand(): { id: string; command: GatewayCommand; requestedAt: string | null } | null {
    const row = this.row();
    if (!row.pending_command || !row.command_id) return null;
    const requested = row.command_requested_at ? Date.parse(row.command_requested_at) : 0;
    if (requested > 0 && Date.now() - requested > COMMAND_TTL_MS) {
      this.sqlite
        .prepare(
          "UPDATE wa_gateway SET pending_command = NULL, command_id = NULL, command_requested_at = NULL WHERE id = 'main'"
        )
        .run();
      return null;
    }
    return {
      id: row.command_id,
      command: row.pending_command,
      requestedAt: row.command_requested_at
    };
  }

  ackCommand(id: string): boolean {
    const result = this.sqlite
      .prepare(
        `UPDATE wa_gateway
         SET pending_command = NULL, command_id = NULL, command_requested_at = NULL
         WHERE id = 'main' AND command_id = ?`
      )
      .run(id);
    return result.changes > 0;
  }
}
