#!/usr/bin/env bash
set -euo pipefail
umask 077

DB_PATH="${SIGAP_DB_PATH:-/var/lib/sigap/sigap.db}"
MEDIA_DIR="${SIGAP_MEDIA_DIR:-/var/lib/sigap/media}"
BACKUP_DIR="${SIGAP_BACKUP_DIR:-/var/backups/sigap}"
KEEP_DAYS="${SIGAP_BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 tidak ditemukan. Pasang sqlite3 sebelum backup." >&2
  exit 1
fi
if [ ! -f "$DB_PATH" ]; then
  echo "Database tidak ditemukan: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TMP="$BACKUP_DIR/sigap-$STAMP.db"
ARCHIVE="$BACKUP_DIR/sigap-$STAMP.db.gz"

sqlite3 -cmd ".timeout 5000" "$DB_PATH" ".backup '$TMP'"
CHECK="$(sqlite3 "$TMP" 'PRAGMA integrity_check;')"
if [ "$CHECK" != "ok" ]; then
  echo "Integrity check gagal: $CHECK" >&2
  rm -f "$TMP"
  exit 1
fi
gzip -f "$TMP"

if [ -n "${SIGAP_BACKUP_AGE_RECIPIENT:-}" ]; then
  if ! command -v age >/dev/null 2>&1; then
    echo "SIGAP_BACKUP_AGE_RECIPIENT diisi tetapi age tidak ditemukan." >&2
    exit 1
  fi
  age -r "$SIGAP_BACKUP_AGE_RECIPIENT" -o "$ARCHIVE.age" "$ARCHIVE"
  rm -f "$ARCHIVE"
  ARCHIVE="$ARCHIVE.age"
elif [ -n "${SIGAP_BACKUP_GPG_RECIPIENT:-}" ]; then
  if ! command -v gpg >/dev/null 2>&1; then
    echo "SIGAP_BACKUP_GPG_RECIPIENT diisi tetapi gpg tidak ditemukan." >&2
    exit 1
  fi
  gpg --batch --yes --encrypt --recipient "$SIGAP_BACKUP_GPG_RECIPIENT" "$ARCHIVE"
  rm -f "$ARCHIVE"
  ARCHIVE="$ARCHIVE.gpg"
else
  chmod 600 "$ARCHIVE"
fi

if [ -d "$MEDIA_DIR" ]; then
  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync tidak ditemukan; media TIDAK dibackup. Pasang rsync." >&2
    exit 1
  fi
  mkdir -p "$BACKUP_DIR/media"
  rsync -a --delete "$MEDIA_DIR/" "$BACKUP_DIR/media/"
fi

# Simpan N hari. Gunakan restic/rclone untuk offsite jika tersedia.
find "$BACKUP_DIR" -maxdepth 1 -name 'sigap-*.db.gz*' -mtime "+$KEEP_DAYS" -delete

echo "Backup selesai: $ARCHIVE (retensi ${KEEP_DAYS} hari)"
