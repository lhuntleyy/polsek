#!/usr/bin/env bash
# =============================================================================
# SIGAP — installer/updater server (mode production)
#
#   sudo bash deploy/install.sh <domain-atau-IP>
#
# Contoh:
#   sudo bash deploy/install.sh demo.sigap-polsek.id   # HTTPS otomatis (Let's Encrypt)
#   sudo bash deploy/install.sh 203.0.113.10           # HTTPS self-signed (tls internal)
#
# Dijalankan dari folder hasil ekstrak rilis (sigap-vX.Y.Z/). Aman dijalankan
# ulang untuk UPDATE: secret & data yang sudah ada tidak ditimpa.
#
# Yang dilakukan:
#  1. Pasang Node.js 24, pnpm, Caddy, sqlite3 (jika belum ada)
#  2. Buat user `sigap` (API) dan `sigap-bot` (bot WhatsApp) + folder data
#  3. Salin rilis ke /opt/sigap dan pasang dependency produksi (native module
#     dikompilasi untuk Linux di sini)
#  4. Buat /etc/sigap/api.env & bot.env dengan secret acak (sekali saja)
#  5. Pasang systemd, Caddyfile, cron healthcheck; start semua service
# Secret TIDAK pernah ikut di-upload: semuanya dibuat di server ini.
# =============================================================================
set -euo pipefail

APP_DIR=/opt/sigap
ENV_DIR=/etc/sigap
API_ENV="$ENV_DIR/api.env"
BOT_ENV="$ENV_DIR/bot.env"
ADMIN_NOTE=/root/sigap-admin-awal.txt
PNPM_VERSION=10.18.3

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

SITE="${1:-}"
[ -n "$SITE" ] || die "Pemakaian: sudo bash deploy/install.sh <domain-atau-IP>"
[ "$(id -u)" -eq 0 ] || die "Jalankan dengan sudo/root."
command -v apt-get >/dev/null || die "Installer ini untuk Ubuntu/Debian (apt)."

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SRC_DIR/apps/api/dist/server.js" ] || die "Tidak menemukan apps/api/dist/server.js. Jalankan dari folder rilis hasil 'pnpm release'."

IS_IP=false
if [[ "$SITE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then IS_IP=true; fi
PUBLIC_ORIGIN="https://$SITE"

# ---------------------------------------------------------------------------
log "1/7 Paket sistem"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq curl ca-certificates gnupg sqlite3 rsync openssl \
  build-essential python3 debian-keyring debian-archive-keyring apt-transport-https >/dev/null

if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  log "Memasang Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
corepack prepare "pnpm@$PNPM_VERSION" --activate >/dev/null

if ! command -v caddy >/dev/null; then
  log "Memasang Caddy (repo resmi)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------------------------------------------------------------------------
log "2/7 User & folder"
id sigap >/dev/null 2>&1 || adduser --system --group --home "$APP_DIR" sigap >/dev/null
id sigap-bot >/dev/null 2>&1 || adduser --system --group --no-create-home sigap-bot >/dev/null
mkdir -p "$APP_DIR" /var/lib/sigap /var/lib/sigap-bot /var/log/sigap "$ENV_DIR" /var/backups/sigap
chown sigap:sigap /var/lib/sigap /var/backups/sigap /var/log/sigap
chown sigap-bot:sigap-bot /var/lib/sigap-bot
chmod 700 /var/lib/sigap /var/lib/sigap-bot
chmod 755 "$ENV_DIR"
# Kode harus bisa DIBACA sigap-bot (Ubuntu 24 membuat home 0750).
chmod 755 "$APP_DIR"

# Migrasi dari instalasi lama yang menyimpan sesi bot di /var/lib/sigap/baileys
if [ -d /var/lib/sigap/baileys ] && [ ! -d /var/lib/sigap-bot/baileys ]; then
  log "Memindahkan sesi WhatsApp lama ke /var/lib/sigap-bot/baileys"
  systemctl stop sigap-bot 2>/dev/null || true
  mv /var/lib/sigap/baileys /var/lib/sigap-bot/baileys
  chown -R sigap-bot:sigap-bot /var/lib/sigap-bot
fi

# ---------------------------------------------------------------------------
log "3/7 Salin rilis ke $APP_DIR"
if [ "$SRC_DIR" != "$APP_DIR" ]; then
  rsync -a --delete \
    --exclude '/node_modules' --exclude '/apps/*/node_modules' --exclude '/packages/*/node_modules' \
    --exclude '/.cache' --exclude '/.local' --exclude '/.npm' \
    "$SRC_DIR/" "$APP_DIR/"
fi
chown -R sigap:sigap "$APP_DIR"
chmod 755 "$APP_DIR"
chmod +x "$APP_DIR"/infra/scripts/*.sh "$APP_DIR"/deploy/*.sh

log "4/7 Dependency produksi (kompilasi native module untuk Linux)"
sudo -u sigap -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -c "
  cd '$APP_DIR' &&
  corepack prepare pnpm@$PNPM_VERSION --activate >/dev/null &&
  pnpm install --frozen-lockfile --prod --filter '@sigap/api...' --filter '@sigap/bot...'
"

# ---------------------------------------------------------------------------
log "5/7 Environment (secret dibuat di server, sekali saja)"
if [ ! -f "$API_ENV" ]; then
  ADMIN_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 14)Sg7"
  INTERNAL_TOKEN="$(openssl rand -hex 32)"
  install -o sigap -g sigap -m 600 /dev/null "$API_ENV"
  cat > "$API_ENV" <<EOF
# Dibuat oleh deploy/install.sh pada $(date -Iseconds). JANGAN commit / bagikan.
SIGAP_ENV=production
SIGAP_LOG_LEVEL=info
SIGAP_API_HOST=127.0.0.1
SIGAP_API_PORT=4000
SIGAP_PUBLIC_ORIGIN=$PUBLIC_ORIGIN

SIGAP_DB_PATH=/var/lib/sigap/sigap.db
SIGAP_MEDIA_DIR=/var/lib/sigap/media

SIGAP_UNIT_CODE=DEMO
SIGAP_UNIT_NAME="Polsek Demo"
SIGAP_UNIT_ADDRESS=""
SIGAP_UNIT_TIMEZONE=Asia/Jakarta

SIGAP_API_URL=http://127.0.0.1:4000
SIGAP_INTERNAL_TOKEN=$INTERNAL_TOKEN

SIGAP_SESSION_SECRET=$(openssl rand -hex 48)
SIGAP_SESSION_TTL_HOURS=12
SIGAP_COOKIE_SECURE=true
SIGAP_COOKIE_NAME=sigap_session

SIGAP_PHONE_KEY=$(openssl rand -base64 32)
SIGAP_PHONE_PEPPER=$(openssl rand -hex 32)

SIGAP_ADMIN_USERNAME=admin
SIGAP_ADMIN_PASSWORD=$ADMIN_PASS
SIGAP_ADMIN_NAME="Admin SIGAP"

SIGAP_SEED_DEMO=false
SIGAP_DPO_NAME="Project Owner"
SIGAP_RETENTION_DAYS=365

# Opsional: Web Push (node -e "console.log(require('web-push').generateVAPIDKeys())")
SIGAP_VAPID_PUBLIC_KEY=
SIGAP_VAPID_PRIVATE_KEY=
SIGAP_VAPID_SUBJECT="mailto:admin@example.local"

# Opsional: enkripsi backup (public key age; private key simpan DI LUAR server)
# SIGAP_BACKUP_AGE_RECIPIENT=age1...
EOF
  chown sigap:sigap "$API_ENV"; chmod 600 "$API_ENV"
  install -m 600 /dev/null "$ADMIN_NOTE"
  printf 'URL     : %s\nUsername: admin\nPassword: %s\n(Wajib diganti saat login pertama. Hapus file ini setelah dicatat.)\n' \
    "$PUBLIC_ORIGIN" "$ADMIN_PASS" > "$ADMIN_NOTE"
  log "Secret baru dibuat. Password admin awal disimpan di $ADMIN_NOTE"
else
  log "$API_ENV sudah ada — dipertahankan"
  # Jaga origin tetap sesuai domain/IP yang dipakai sekarang.
  sed -i "s#^SIGAP_PUBLIC_ORIGIN=.*#SIGAP_PUBLIC_ORIGIN=$PUBLIC_ORIGIN#" "$API_ENV"
fi

TOKEN_LINE="$(grep '^SIGAP_INTERNAL_TOKEN=' "$API_ENV")"
if [ ! -f "$BOT_ENV" ]; then
  install -o sigap-bot -g sigap-bot -m 600 /dev/null "$BOT_ENV"
  cat > "$BOT_ENV" <<EOF
# Env khusus bot: hanya token internal, tanpa secret API.
SIGAP_ENV=production
SIGAP_LOG_LEVEL=info
SIGAP_API_URL=http://127.0.0.1:4000
$TOKEN_LINE
SIGAP_BOT_AUTH_DIR=/var/lib/sigap-bot/baileys
SIGAP_UNIT_NAME="Polsek Demo"
EOF
  chown sigap-bot:sigap-bot "$BOT_ENV"; chmod 600 "$BOT_ENV"
else
  # Token bot harus selalu sama dengan API.
  sed -i "s#^SIGAP_INTERNAL_TOKEN=.*#$TOKEN_LINE#" "$BOT_ENV"
fi

# ---------------------------------------------------------------------------
log "6/7 systemd, Caddy, healthcheck"
cp "$APP_DIR"/infra/systemd/sigap-*.service "$APP_DIR"/infra/systemd/sigap-backup.timer /etc/systemd/system/
systemctl daemon-reload

CADDY_SITE="$SITE"
TLS_LINE=""
if $IS_IP; then
  CADDY_SITE="https://$SITE"
  TLS_LINE="  tls internal"
  warn "Memakai IP: sertifikat self-signed (browser akan memberi peringatan). Pakai domain untuk HTTPS valid."
fi
[ -f /etc/caddy/Caddyfile ] && cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date +%Y%m%d%H%M%S)"
awk -v site="$CADDY_SITE" -v tls="$TLS_LINE" '
  /^sigap\.example\.go\.id \{/ { print site " {"; if (tls != "") print tls; next }
  { print }
' "$APP_DIR/infra/caddy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null 2>&1 || true
systemctl reload caddy 2>/dev/null || systemctl restart caddy

cat > /etc/cron.d/sigap-healthcheck <<EOF
# Healthcheck SIGAP tiap 5 menit (butuh root untuk membaca DB & antrean bot)
*/5 * * * * root SIGAP_CHECK_BOT=true $APP_DIR/infra/scripts/healthcheck.sh >/dev/null 2>&1 || $APP_DIR/infra/scripts/alert-failure.sh healthcheck
EOF
chmod 644 /etc/cron.d/sigap-healthcheck

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80,443/tcp >/dev/null
fi

# ---------------------------------------------------------------------------
log "7/7 Start service"
systemctl enable sigap-api sigap-bot sigap-backup.timer >/dev/null
systemctl restart sigap-api
for _ in $(seq 1 30); do
  if curl -fsS --max-time 2 http://127.0.0.1:4000/health >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS --max-time 3 http://127.0.0.1:4000/health >/dev/null \
  || { journalctl -u sigap-api -n 40 --no-pager; die "API tidak sehat. Lihat log di atas."; }
systemctl restart sigap-bot
systemctl start sigap-backup.timer

echo
log "SELESAI"
echo "  Dashboard : $PUBLIC_ORIGIN"
[ -f "$ADMIN_NOTE" ] && echo "  Login awal: sudo cat $ADMIN_NOTE"
echo "  Status    : systemctl status sigap-api sigap-bot"
echo "  Log       : journalctl -u sigap-api -f   |   journalctl -u sigap-bot -f"
echo "  Langkah berikut: login → ganti password → Sistem → WhatsApp Gateway → Hubungkan (scan QR)."
if ! ufw status 2>/dev/null | grep -q "Status: active"; then
  warn "Firewall belum aktif. Disarankan: ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable"
fi
