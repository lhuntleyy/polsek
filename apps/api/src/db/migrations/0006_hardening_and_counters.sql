-- Phase 10: atomic daily ticket counters and reporter WA JID tracking
CREATE TABLE IF NOT EXISTS ticket_counters (
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  date_code TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (unit_id, date_code)
);

ALTER TABLE reporters ADD COLUMN wa_jid TEXT;
CREATE INDEX IF NOT EXISTS idx_reporters_wa_jid ON reporters(wa_jid);
