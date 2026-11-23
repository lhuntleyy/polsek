#!/usr/bin/env bash
set -euo pipefail

URL="${SIGAP_HEALTH_URL:-http://127.0.0.1:4000/health}"
DISK_PATH="${SIGAP_DISK_PATH:-/var/lib/sigap}"
DISK_ALERT_PCT="${SIGAP_DISK_ALERT_PCT:-85}"
DB_PATH="${SIGAP_DB_PATH:-/var/lib/sigap/sigap.db}"
OUTBOX_ALERT="${SIGAP_OUTBOX_ALERT:-50}"
CHECK_BOT="${SIGAP_CHECK_BOT:-false}"
BOT_STALE_SECONDS="${SIGAP_BOT_STALE_SECONDS:-60}"

response="$(curl -fsS --max-time 5 "$URL")"
if ! grep -q '"ok":true' <<<"$response"; then
  echo "Healthcheck gagal: $response" >&2
  exit 1
fi

if command -v df >/dev/null 2>&1; then
  usage="$(df -P "$DISK_PATH" | awk 'NR==2 {gsub("%", "", $5); print $5}')"
  if [ -n "$usage" ] && [ "$usage" -ge "$DISK_ALERT_PCT" ]; then
    echo "Disk hampir penuh: ${usage}% di $DISK_PATH (ambang ${DISK_ALERT_PCT}%)" >&2
    exit 1
  fi
fi

if [ -f "${DB_PATH}-wal" ]; then
  wal_bytes="$(stat -c %s "${DB_PATH}-wal" 2>/dev/null || echo 0)"
  if [ "$wal_bytes" -gt $((512 * 1024 * 1024)) ]; then
    echo "WAL SQLite terlalu besar: ${wal_bytes} bytes" >&2
    exit 1
  fi
fi

if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DB_PATH" ]; then
  # Timestamp ISO-8601 harus diparse, bukan dibandingkan sebagai string.
  stuck="$(sqlite3 -cmd ".timeout 5000" "$DB_PATH" "SELECT COUNT(*) FROM outbound_messages WHERE status = 'pending' AND datetime(next_attempt_at) < datetime('now', '-15 minutes');")"
  if [ -n "$stuck" ] && [ "$stuck" -ge "$OUTBOX_ALERT" ]; then
    echo "Outbox macet: ${stuck} pesan pending > 15 menit" >&2
    exit 1
  fi

  dead="$(sqlite3 -cmd ".timeout 5000" "$DB_PATH" "SELECT COUNT(*) FROM outbound_messages WHERE status = 'dead' AND datetime(created_at) >= datetime('now', '-24 hours');")"
  if [ -n "$dead" ] && [ "$dead" -ge "$OUTBOX_ALERT" ]; then
    echo "Outbox dead meningkat: ${dead} pesan gagal permanen dalam 24 jam" >&2
    exit 1
  fi

  if [ "$CHECK_BOT" = "true" ]; then
    bot_stale="$(sqlite3 -cmd ".timeout 5000" "$DB_PATH" "SELECT CASE WHEN bot_seen_at IS NULL OR datetime(bot_seen_at) < datetime('now', '-${BOT_STALE_SECONDS} seconds') THEN 1 ELSE 0 END FROM wa_gateway WHERE id = 'main';")"
    if [ "$bot_stale" = "1" ]; then
      echo "Heartbeat bot WhatsApp stale (> ${BOT_STALE_SECONDS}s)" >&2
      exit 1
    fi
  fi
fi

# Antrean pesan masuk bot: file yang menumpuk berarti API tidak menerima
# pesan warga (laporan tertahan). dead/ berisi pesan yang ditolak permanen.
BOT_QUEUE_DIR="${SIGAP_BOT_QUEUE_DIR:-/var/lib/sigap-bot/bot-queue}"
BOT_QUEUE_ALERT="${SIGAP_BOT_QUEUE_ALERT:-5}"
if [ -d "$BOT_QUEUE_DIR" ]; then
  queued="$(find "$BOT_QUEUE_DIR" -maxdepth 1 -name '*.json' -mmin +2 2>/dev/null | wc -l)"
  if [ "$queued" -ge "$BOT_QUEUE_ALERT" ]; then
    echo "Antrean bot menumpuk: ${queued} pesan warga belum diterima API > 2 menit" >&2
    exit 1
  fi
  dead_in="$(find "$BOT_QUEUE_DIR/dead" -maxdepth 1 -name '*.json' -mtime -1 2>/dev/null | wc -l)"
  if [ "$dead_in" -gt 0 ]; then
    echo "Ada ${dead_in} pesan warga ditolak API (lihat $BOT_QUEUE_DIR/dead)" >&2
    exit 1
  fi
fi

echo "Healthcheck OK: $response"
