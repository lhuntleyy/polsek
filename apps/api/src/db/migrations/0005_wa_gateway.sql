-- Phase 9: WhatsApp gateway control + QR pairing from dashboard
CREATE TABLE IF NOT EXISTS wa_gateway (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'disconnected',
  qr_data_url TEXT,
  qr_expires_at TEXT,
  phone TEXT,
  error TEXT,
  pending_command TEXT,
  command_id TEXT,
  command_requested_at TEXT,
  bot_seen_at TEXT,
  last_seen_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO wa_gateway (id, status, updated_at)
VALUES ('main', 'disconnected', '1970-01-01T00:00:00.000Z');
