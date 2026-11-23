-- SIGAP initial schema
-- SQLite, WAL. All timestamps are ISO-8601 UTC strings.

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (unit_id, key)
);

CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'kelurahan',
  parent_id TEXT REFERENCES regions(id),
  geojson TEXT NOT NULL,
  centroid_lat REAL,
  centroid_lng REAL,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_regions_unit ON regions(unit_id, active);

CREATE TABLE IF NOT EXISTS officers (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  password_hash TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  rank TEXT,
  role TEXT NOT NULL,
  phone TEXT,
  wa_jid TEXT,
  region_id TEXT REFERENCES regions(id),
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_officers_role ON officers(unit_id, role, active);

CREATE TABLE IF NOT EXISTS reporters (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  phone_hash TEXT NOT NULL UNIQUE,
  phone_enc TEXT NOT NULL,
  name TEXT NOT NULL,
  consent_version TEXT,
  consent_at TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  false_count INTEGER NOT NULL DEFAULT 0,
  blocked_at TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reporters_phone ON reporters(phone_hash);

CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  region_id TEXT REFERENCES regions(id),
  category TEXT NOT NULL,
  center_lat REAL,
  center_lng REAL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  ticket_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  ticket_no TEXT NOT NULL,
  reporter_id TEXT NOT NULL REFERENCES reporters(id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  accuracy_m REAL,
  region_id TEXT REFERENCES regions(id),
  location_status TEXT,
  source TEXT NOT NULL,
  cluster_id TEXT REFERENCES clusters(id),
  assigned_to TEXT REFERENCES officers(id),
  acknowledged_by TEXT REFERENCES officers(id),
  ack_at TEXT,
  otw_at TEXT,
  arrive_at TEXT,
  closed_at TEXT,
  close_note TEXT,
  reject_reason TEXT,
  internal_note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (unit_id, ticket_no)
);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(unit_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_region ON tickets(unit_id, region_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tickets_reporter ON tickets(reporter_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ticket ON ticket_events(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_media (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  original_path TEXT NOT NULL,
  thumb_path TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_s REAL,
  exif_gps TEXT,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_ticket ON ticket_media(ticket_id);

CREATE TABLE IF NOT EXISTS wa_groups (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  jid TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  wa_jid TEXT NOT NULL UNIQUE,
  reporter_id TEXT REFERENCES reporters(id),
  state TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_log (
  wa_message_id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,
  wa_jid TEXT,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  target_jid TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbound_messages(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  officer_id TEXT NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  shift TEXT NOT NULL,
  officer_id TEXT REFERENCES officers(id),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  notes TEXT,
  signed_at TEXT
);
