#!/usr/bin/env bash
# =============================================================================
# Impor polygon wilkum (GeoJSON FeatureCollection) ke SIGAP di server.
#
#   sudo bash /opt/sigap/deploy/import-wilkum.sh                         # Teluknaga (bawaan)
#   sudo bash /opt/sigap/deploy/import-wilkum.sh /path/wilkum.geojson    # file lain
#   sudo bash /opt/sigap/deploy/import-wilkum.sh <file> --dry-run        # lihat rencana saja
#
# Default: --deactivate-demo (wilayah demo dinonaktifkan). Wilayah tidak pernah
# dihapus. Aman dijalankan saat API hidup; perubahan langsung berlaku.
# =============================================================================
set -euo pipefail
APP_DIR=/opt/sigap
FILE="$APP_DIR/docs/wilkum/teluknaga.geojson"
# Argumen pertama boleh file atau langsung opsi (--dry-run, dst.).
if [ $# -gt 0 ] && [[ "$1" != --* ]]; then FILE="$1"; shift; fi
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo." >&2; exit 1; }
[ -f "$FILE" ] || { echo "File tidak ditemukan: $FILE" >&2; exit 1; }
[ -f /etc/sigap/api.env ] || { echo "/etc/sigap/api.env belum ada. Jalankan deploy/install.sh dulu." >&2; exit 1; }

EXTRA=("$@")
# --deactivate-demo selalu ikut kecuali --deactivate-others dipilih.
if [[ " ${EXTRA[*]-} " != *" --deactivate-others "* ]]; then EXTRA+=(--deactivate-demo); fi

# File harus bisa dibaca user sigap.
TMP="$(mktemp /tmp/sigap-wilkum-XXXXXX.geojson)"
cp "$FILE" "$TMP"; chown sigap:sigap "$TMP"; chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT

sudo -u sigap bash -c "set -a; . /etc/sigap/api.env; set +a; cd '$APP_DIR/apps/api' && node dist/import-regions.js '$TMP' ${EXTRA[*]}"
