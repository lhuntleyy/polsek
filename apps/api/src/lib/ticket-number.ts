import type Database from "better-sqlite3";
import type { AppConfig } from "@sigap/config";
import { formatTicketNumber, parseTicketNumber, ticketDateCode } from "@sigap/core";
import type { Db } from "../db/client.js";
import { DEFAULT_UNIT_ID } from "./constants.js";
import { readSettings } from "./settings.js";

export function nextTicketNumber(
  db: Db,
  config: AppConfig,
  sqlite?: Database.Database
): string {
  const unitSettings = readSettings(db, config);
  const now = new Date();
  const code = unitSettings.unitCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  const dateCode = ticketDateCode(now, unitSettings.unitTimezone);
  const prefix = `${code}-${dateCode}-`;

  const raw =
    sqlite ?? (db as unknown as { $client?: Database.Database }).$client;
  if (!raw) {
    throw new Error("SQLite client tidak tersedia untuk penomoran tiket");
  }

  const run = (): number => {
    const existing = raw
      .prepare("SELECT last_seq FROM ticket_counters WHERE unit_id = ? AND date_code = ?")
      .get(DEFAULT_UNIT_ID, dateCode) as { last_seq: number } | undefined;

    if (!existing) {
      const rows = raw
        .prepare("SELECT ticket_no FROM tickets WHERE unit_id = ? AND ticket_no LIKE ?")
        .all(DEFAULT_UNIT_ID, `${prefix}%`) as Array<{ ticket_no: string }>;
      let maxSeq = 0;
      for (const row of rows) {
        const seq = parseTicketNumber(row.ticket_no)?.sequence ?? 0;
        if (seq > maxSeq) maxSeq = seq;
      }
      const nextSeq = maxSeq + 1;
      raw
        .prepare("INSERT INTO ticket_counters (unit_id, date_code, last_seq) VALUES (?, ?, ?)")
        .run(DEFAULT_UNIT_ID, dateCode, nextSeq);
      return nextSeq;
    }

    const updated = raw
      .prepare(
        "UPDATE ticket_counters SET last_seq = last_seq + 1 WHERE unit_id = ? AND date_code = ? RETURNING last_seq"
      )
      .get(DEFAULT_UNIT_ID, dateCode) as { last_seq: number };
    return updated.last_seq;
  };

  const tx = raw.transaction(run);
  const sequence = raw.inTransaction ? tx() : tx.immediate();
  return formatTicketNumber(code, now, sequence, unitSettings.unitTimezone);
}
