-- Phase 3: media staging + ticket attachment
-- ticket_id becomes nullable so media can be uploaded before the ticket exists.
DROP INDEX IF EXISTS idx_media_ticket;
ALTER TABLE ticket_media RENAME TO ticket_media_old;

CREATE TABLE ticket_media (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  reporter_id TEXT REFERENCES reporters(id),
  wa_chat_jid TEXT,
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
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL
);

INSERT INTO ticket_media (
  id, ticket_id, kind, original_path, thumb_path, mime, size, sha256,
  width, height, duration_s, exif_gps, wa_message_id, status, created_at
)
SELECT
  id, ticket_id, kind, original_path, thumb_path, mime, size, sha256,
  width, height, duration_s, exif_gps, wa_message_id, status, created_at
FROM ticket_media_old;

DROP TABLE ticket_media_old;
CREATE INDEX idx_media_ticket ON ticket_media(ticket_id);
CREATE INDEX idx_media_staging ON ticket_media(reporter_id, wa_chat_jid, created_at);
CREATE UNIQUE INDEX uq_media_wa_message ON ticket_media(wa_message_id)
  WHERE wa_message_id IS NOT NULL;
