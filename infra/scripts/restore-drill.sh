#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP="${1:-}"
if [ -z "$BACKUP" ] || [ ! -f "$BACKUP" ]; then
  echo "Pakai: $0 <file-backup.db.gz|.gz.age|.gz.gpg|.age|.gpg>" >&2
  exit 1
fi

TMP="$(mktemp /tmp/sigap-restore-XXXXXX.db)"
cleanup() { rm -f "$TMP"; }
trap cleanup EXIT

case "$BACKUP" in
  *.gz.age)
    if ! command -v age >/dev/null 2>&1; then
      echo "age tidak ditemukan untuk dekripsi." >&2
      exit 1
    fi
    age -d "$BACKUP" | gunzip -c > "$TMP"
    ;;
  *.gz.gpg)
    if ! command -v gpg >/dev/null 2>&1; then
      echo "gpg tidak ditemukan untuk dekripsi." >&2
      exit 1
    fi
    gpg --batch --quiet --decrypt "$BACKUP" | gunzip -c > "$TMP"
    ;;
  *.gz)
    gunzip -c "$BACKUP" > "$TMP"
    ;;
  *.age)
    if ! command -v age >/dev/null 2>&1; then
      echo "age tidak ditemukan untuk dekripsi." >&2
      exit 1
    fi
    age -d -o "$TMP" "$BACKUP"
    ;;
  *.gpg)
    if ! command -v gpg >/dev/null 2>&1; then
      echo "gpg tidak ditemukan untuk dekripsi." >&2
      exit 1
    fi
    gpg --batch --quiet --decrypt --output "$TMP" "$BACKUP"
    ;;
  *)
    cp "$BACKUP" "$TMP"
    ;;
esac

START="$(date +%s%3N)"
CHECK="$(sqlite3 "$TMP" 'PRAGMA integrity_check;')"
if [ "$CHECK" != "ok" ]; then
  echo "Restore GAGAL: integrity_check = $CHECK" >&2
  exit 1
fi

FK_ISSUES="$(sqlite3 "$TMP" 'PRAGMA foreign_key_check;')"
if [ -n "$FK_ISSUES" ]; then
  echo "Restore GAGAL: foreign_key_check menemukan pelanggaran:" >&2
  echo "$FK_ISSUES" >&2
  exit 1
fi

TICKETS="$(sqlite3 "$TMP" 'SELECT COUNT(*) FROM tickets;')"
MEDIA="$(sqlite3 "$TMP" 'SELECT COUNT(*) FROM ticket_media;')"
MIGRATIONS="$(sqlite3 "$TMP" 'SELECT COUNT(*) FROM _migrations;')"
END="$(date +%s%3N)"

echo "Restore OK dalam $((END - START)) ms"
echo "Tiket: $TICKETS | Media: $MEDIA | Migrasi: $MIGRATIONS"
