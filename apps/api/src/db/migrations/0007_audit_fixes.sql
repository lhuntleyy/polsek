-- Audit lanjutan (Nov 2026): replay TOTP, lockout akun, wajib ganti password,
-- acuan SLA saat tiket dibuka ulang, penanda nomor pelapor belum terverifikasi,
-- dan throttle balasan bot per pelapor.
ALTER TABLE officers ADD COLUMN totp_last_step INTEGER;
ALTER TABLE officers ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE officers ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE officers ADD COLUMN locked_until TEXT;
CREATE INDEX IF NOT EXISTS idx_officers_wa_jid ON officers(wa_jid);

ALTER TABLE tickets ADD COLUMN reopened_at TEXT;

ALTER TABLE reporters ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 1;
ALTER TABLE reporters ADD COLUMN last_notice_at TEXT;
