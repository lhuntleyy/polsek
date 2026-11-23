# Infra — deployment tanpa Docker

Panduan langkah demi langkah ada di **[`docs/26-DEPLOY.md`](../docs/26-DEPLOY.md)**. File ini hanya peta isi folder `infra/`.

**Target:** Ubuntu 24.04 LTS · Node.js 24 · Caddy 2 · systemd.

## Isi folder

| File | Fungsi |
|---|---|
| `caddy/Caddyfile` | HTTPS, HSTS, CSP, proxy `/api` & `/health` ke API, blok `/internal/*`, fallback SPA |
| `systemd/sigap-api.service` | API Fastify, user `sigap`, env `/etc/sigap/api.env`, data `/var/lib/sigap` |
| `systemd/sigap-bot.service` | Bot WhatsApp, user **`sigap-bot`**, env **`/etc/sigap/bot.env`**, data `/var/lib/sigap-bot` |
| `systemd/sigap-backup.{service,timer}` | Backup DB + media harian |
| `systemd/sigap-alert@.service` | Dipanggil `OnFailure=` bila service mati |
| `bot.env.example` | Template env bot (hanya token internal; tanpa secret API) |
| `scripts/backup-db.sh` | `.backup` SQLite + integrity check + gzip + enkripsi age/gpg + rsync media |
| `scripts/restore-drill.sh` | Uji restore berkala |
| `scripts/healthcheck.sh` | API, disk, WAL, outbox, heartbeat bot, **antrean pesan masuk bot** |
| `scripts/alert-failure.sh` | Kirim alert kegagalan |
| `scripts/csp-hash.mjs` | Hitung hash CSP script inline & cek Caddyfile (`--check`) |

## Tata letak di server

```text
/opt/sigap                  kode (milik sigap, dibaca sigap-bot)
/etc/sigap/api.env          secret API      (sigap, 600)
/etc/sigap/bot.env          token bot       (sigap-bot, 600)
/var/lib/sigap/sigap.db     database        (sigap, 700)
/var/lib/sigap/media/       bukti foto/video/voice note
/var/lib/sigap-bot/baileys/ sesi WhatsApp   (sigap-bot, 700)
/var/lib/sigap-bot/bot-queue/  antrean pesan warga yang belum diterima API
/var/backups/sigap/         backup terenkripsi
```

## Perintah cepat

```bash
sudo systemctl status sigap-api sigap-bot
sudo journalctl -u sigap-api -f
sudo journalctl -u sigap-bot -f
curl -fsS http://127.0.0.1:4000/health
sudo SIGAP_CHECK_BOT=true /opt/sigap/infra/scripts/healthcheck.sh
node /opt/sigap/infra/scripts/csp-hash.mjs --check
ls /var/lib/sigap-bot/bot-queue        # harus kosong saat normal
```

## Catatan

- Port 4000 tidak boleh terbuka ke publik; Caddy satu-satunya pintu masuk.
- Pairing WhatsApp dilakukan dari dashboard (**Sistem → WhatsApp Gateway**), bukan dari terminal.
- Jangan commit `.env`, `/etc/sigap/*.env`, atau folder sesi WhatsApp.
- Upgrade dari instalasi yang bot-nya masih jalan sebagai `sigap`: lihat `docs/26-DEPLOY.md §11`.
