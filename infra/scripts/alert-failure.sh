#!/usr/bin/env bash
set -euo pipefail

UNIT="${1:-unknown}"
MESSAGE="SIGAP unit failed: $UNIT at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

logger -t sigap-alert "$MESSAGE" || true
echo "$MESSAGE" >&2

# Opsional: kirim webhook jika SIGAP_ALERT_WEBHOOK diisi.
if [ -n "${SIGAP_ALERT_WEBHOOK:-}" ]; then
  ESCAPED_MESSAGE="${MESSAGE//\\/\\\\}"
  ESCAPED_MESSAGE="${ESCAPED_MESSAGE//\"/\\\"}"
  ESCAPED_MESSAGE="${ESCAPED_MESSAGE//$'\n'/\\n}"
  curl -fsS --max-time 5 -X POST -H "Content-Type: application/json" \
    -d "{\"text\":\"$ESCAPED_MESSAGE\"}" "$SIGAP_ALERT_WEBHOOK" || true
fi
