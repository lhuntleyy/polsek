-- Phase 4: escalation, duplicate merge, and shift handover metadata
ALTER TABLE tickets ADD COLUMN escalated_pawas_at TEXT;
ALTER TABLE tickets ADD COLUMN escalated_kapolsek_at TEXT;
ALTER TABLE tickets ADD COLUMN duplicate_of TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_duplicate ON tickets(duplicate_of);

ALTER TABLE shifts ADD COLUMN checklist_json TEXT;
ALTER TABLE shifts ADD COLUMN signed_by_name TEXT;
ALTER TABLE shifts ADD COLUMN incoming_name TEXT;
