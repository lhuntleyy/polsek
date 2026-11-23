# 26 — Panduan Deploy Produksi SIGAP

**Versi:** v1.2 (setelah audit lanjutan, 23 Nov 2026)
**Target:** Ubuntu 24.04 LTS · Node.js 24 · pnpm 10 · Caddy 2 · systemd · tanpa Docker
**Waktu:** ±60–90 menit untuk instalasi pertama

> **Mau cepat untuk server demo?** Pakai installer satu-perintah: [`deploy/README.md`](../deploy/README.md) (`pnpm release` → upload → `sudo bash deploy/install.sh <domain>`). Installer itu menjalankan langkah 1–8 di bawah secara otomatis.
>
> Dokumen ini adalah urutan kerja lengkap dari server kosong sampai SIGAP menerima laporan WhatsApp. Kerjakan berurutan dan centang setiap langkah. Untuk operasional harian lihat [`17-RUNBOOK.md`](17-RUNBOOK.md); untuk hasil audit lihat [`27-AUDIT-LANJUTAN.md`](27-AUDIT-LANJUTAN.md).

---

## 0. Gambaran arsitektur

```text
Warga (WhatsApp)                         Petugas (browser / PWA)
      │                                           │ HTTPS
      ▼                                           ▼
┌───────────────┐   HTTP internal     ┌──────────────────────┐
│  sigap-bot    │ ──────────────────► │  Caddy :443          │
│  user:        │  127.0.0.1:4000     │  /api, /health → API │
│  sigap-bot    │  + token internal   │  /internal → 404     │
│               │                     │  lainnya → web/dist  │
│ /var/lib/     │                     └──────────┬───────────┘
│ sigap-bot/    │                                │
│  baileys/     │ ◄── sesi WhatsApp              ▼
│  bot-queue/   │ ◄── antrean pesan   ┌──────────────────────┐
└───────────────┘     masuk (disk)    │  sigap-api           │
                                      │  user: sigap         │
                                      │  127.0.0.1:4000      │
                                      │ /var/lib/sigap/      │
                                      │   sigap.db (SQLite)  │
                                      │   media/             │
                                      └──────────────────────┘
```

Prinsip penting:

| Prinsip | Alasan |
|---|---|
| API hanya listen di `127.0.0.1` | Hanya Caddy (dan bot) yang boleh bicara ke API; IP asli dibaca dari proxy loopback. |
| Bot memakai **user Unix dan env file sendiri** | Bot memproses media dari orang tak dikenal. Kalau bot dibobol, penyerang tidak boleh mendapat `SESSION_SECRET`, `PHONE_KEY`, atau akses DB. |
| `/internal/*` diblok di Caddy | Endpoint bot↔API tidak boleh dipanggil dari internet. |
| Antrean pesan masuk ada di disk | Saat API restart/deploy, laporan warga tertahan lalu terkirim ulang, bukan hilang. |

---

## 1. Siapkan server

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git sqlite3 rsync ufw fail2ban age
sudo timedatectl set-timezone Asia/Jakarta
```

Node.js 24 + pnpm:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
node -v   # harus v24.x
```

Caddy: ikuti instruksi resmi Caddy untuk Ubuntu (repo apt Cloudsmith), lalu `caddy version`.

Buat user dan folder:

```bash
# API (pemilik kode + DB + media)
sudo adduser --system --group --home /opt/sigap sigap
# Bot WhatsApp (terpisah dari API)
sudo adduser --system --group --no-create-home sigap-bot

sudo mkdir -p /opt/sigap /var/lib/sigap /var/lib/sigap-bot /var/log/sigap /etc/sigap /var/backups/sigap
sudo chown -R sigap:sigap /opt/sigap /var/lib/sigap /var/backups/sigap
sudo chown -R sigap-bot:sigap-bot /var/lib/sigap-bot
sudo chmod 700 /var/lib/sigap /var/lib/sigap-bot
sudo chown root:root /etc/sigap && sudo chmod 755 /etc/sigap
```

Firewall (hanya 80/443 publik; SSH hanya dari IP admin):

```bash
sudo ufw default deny incoming
sudo ufw allow 80,443/tcp
sudo ufw allow from <IP_ADMIN> to any port 22 proto tcp
sudo ufw enable
```

- [ ] Node 24, pnpm, Caddy, sqlite3, age terpasang
- [ ] User `sigap` dan `sigap-bot` ada
- [ ] Port 4000 **tidak** terbuka ke publik

---

## 2. Ambil & build aplikasi

```bash
sudo -u sigap -H bash
cd /opt/sigap
git clone <URL_REPO> .
git checkout <TAG_RILIS>          # mis. v1.2.0 — jangan deploy dari branch acak
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r test                      # harus hijau sebelum lanjut
pnpm -r build
exit
```

Hasil build:

| Komponen | Lokasi |
|---|---|
| API | `/opt/sigap/apps/api/dist/server.js` (+ `dist/migrations/`) |
| Bot | `/opt/sigap/apps/bot/dist/main.js` |
| Web | `/opt/sigap/apps/web/dist/` |

Bot berjalan sebagai `sigap-bot` dan perlu **membaca** kode di `/opt/sigap` (bukan menulis). Default umask `022` sudah cukup; cek:

```bash
sudo -u sigap-bot test -r /opt/sigap/apps/bot/dist/main.js && echo OK
```

---

## 3. Buat secret dan env file

### 3.1 Generate secret

```bash
openssl rand -base64 48   # SIGAP_SESSION_SECRET
openssl rand -base64 32   # SIGAP_PHONE_KEY  (harus tepat 32 byte base64)
openssl rand -hex 32      # SIGAP_PHONE_PEPPER
openssl rand -hex 32      # SIGAP_INTERNAL_TOKEN (min. 32 karakter; sama di API & bot)
```

> **Simpan `SIGAP_PHONE_KEY` dan `SIGAP_PHONE_PEPPER` di password manager institusi.** Kehilangan keduanya = nomor pelapor & TOTP di database dan backup tidak bisa dibaca lagi.

### 3.2 `/etc/sigap/api.env` (milik `sigap`, chmod 600)

Salin dari `.env.example`, lalu minimal isi:

```bash
SIGAP_ENV=production
SIGAP_LOG_LEVEL=info
SIGAP_API_HOST=127.0.0.1
SIGAP_API_PORT=4000
SIGAP_PUBLIC_ORIGIN=https://sigap.polsek-contoh.go.id

SIGAP_DB_PATH=/var/lib/sigap/sigap.db
SIGAP_MEDIA_DIR=/var/lib/sigap/media

SIGAP_UNIT_CODE=BKS
SIGAP_UNIT_NAME="Polsek Contoh"
SIGAP_UNIT_TIMEZONE=Asia/Jakarta

SIGAP_INTERNAL_TOKEN=<hasil openssl>
SIGAP_SESSION_SECRET=<hasil openssl>
SIGAP_COOKIE_SECURE=true
SIGAP_PHONE_KEY=<hasil openssl>
SIGAP_PHONE_PEPPER=<hasil openssl>

SIGAP_ADMIN_USERNAME=admin
SIGAP_ADMIN_PASSWORD=<password awal admin, min. 10 karakter huruf+angka>
SIGAP_ADMIN_NAME="Admin Unit"

SIGAP_SEED_DEMO=false
# Opsional Web Push: node -e "console.log(require('web-push').generateVAPIDKeys())"
SIGAP_VAPID_PUBLIC_KEY=
SIGAP_VAPID_PRIVATE_KEY=
SIGAP_VAPID_SUBJECT="mailto:admin@polsek-contoh.go.id"
```

```bash
sudo install -o sigap -g sigap -m 600 /dev/null /etc/sigap/api.env
sudo nano /etc/sigap/api.env
```

### 3.3 `/etc/sigap/bot.env` (milik `sigap-bot`, chmod 600)

Template: [`infra/bot.env.example`](../infra/bot.env.example). **Jangan** taruh `SESSION_SECRET`, `PHONE_KEY`, `PHONE_PEPPER`, atau password admin di sini.

```bash
SIGAP_ENV=production
SIGAP_API_URL=http://127.0.0.1:4000
SIGAP_INTERNAL_TOKEN=<SAMA dengan api.env>
SIGAP_BOT_AUTH_DIR=/var/lib/sigap-bot/baileys
SIGAP_UNIT_NAME="Polsek Contoh"
```

```bash
sudo install -o sigap-bot -g sigap-bot -m 600 /dev/null /etc/sigap/bot.env
sudo nano /etc/sigap/bot.env
```

API maupun bot **menolak start** di produksi bila secret masih default, `INTERNAL_TOKEN` < 32 karakter, cookie tidak secure, atau seed demo aktif. Itu disengaja.

- [ ] `api.env` dan `bot.env` chmod 600, pemilik benar
- [ ] `SIGAP_INTERNAL_TOKEN` sama persis di kedua file
- [ ] Kunci telepon disimpan di password manager

---

## 4. Pasang systemd

```bash
cd /opt/sigap
sudo chmod +x infra/scripts/*.sh
sudo cp infra/systemd/sigap-api.service      /etc/systemd/system/
sudo cp infra/systemd/sigap-bot.service      /etc/systemd/system/
sudo cp infra/systemd/sigap-alert@.service   /etc/systemd/system/
sudo cp infra/systemd/sigap-backup.service   /etc/systemd/system/
sudo cp infra/systemd/sigap-backup.timer     /etc/systemd/system/
sudo systemctl daemon-reload
```

Jalankan API dulu. Saat start, API menjalankan **migrasi** dan **seed idempoten** (unit, settings, admin awal):

```bash
sudo systemctl enable --now sigap-api
sudo journalctl -u sigap-api -n 50 --no-pager
curl -fsS http://127.0.0.1:4000/health
```

Lalu bot:

```bash
sudo systemctl enable --now sigap-bot
sudo journalctl -u sigap-bot -n 50 --no-pager
```

Bot akan berstatus *menunggu pairing* sampai Anda menautkan nomor dari dashboard (langkah 7).

---

## 5. Caddy (HTTPS) + CSP

1. Ganti domain di `infra/caddy/Caddyfile` (`sigap.example.go.id`).
2. **Cek hash CSP** cocok dengan hasil build (wajib setiap kali `index.html` berubah):

   ```bash
   node /opt/sigap/infra/scripts/csp-hash.mjs --check
   ```

   Bila gagal, salin hash yang dicetak ke direktif `script-src` di Caddyfile.
3. Pasang:

   ```bash
   sudo cp /opt/sigap/infra/caddy/Caddyfile /etc/caddy/Caddyfile
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

4. CSP awalnya `Content-Security-Policy-Report-Only`. Setelah 1–2 minggu tanpa pelanggaran di console browser, ganti nama header menjadi `Content-Security-Policy` (enforce).

Uji dari luar server:

```bash
curl -I https://sigap.polsek-contoh.go.id/                 # 200, header HSTS
curl -s -o /dev/null -w "%{http_code}\n" https://sigap.polsek-contoh.go.id/internal/health   # 404
```

- [ ] HTTPS valid, `/internal/*` = 404
- [ ] `csp-hash.mjs --check` hijau

---

## 6. Login pertama & akun petugas

1. Buka `https://<domain>` → login `admin` dengan `SIGAP_ADMIN_PASSWORD`.
2. Di produksi, admin awal **wajib mengganti password** di layar pertama (password di `api.env` dibaca banyak orang saat deploy). Seed tidak pernah menimpa admin yang sudah ada, jadi nilai di `api.env` setelah ini tidak berlaku lagi.
3. Aktifkan **TOTP** di **Sistem → Keamanan akun** (wajib untuk admin, pawas, kapolsek). Password juga bisa diganti kapan saja dari kartu **Ganti password** di menu yang sama.
4. Isi **Sistem → Identitas unit**, **SLA**, **DPO**, **Retensi**.
5. Unggah polygon wilayah kelurahan (GeoJSON) di **Sistem → Wilayah**.
6. Tambah petugas di **Sistem → Petugas**:
   - Password awal min. 10 karakter (huruf + angka). **Petugas wajib mengganti password saat login pertama**; admin tidak akan tahu password akhir mereka.
   - Akun **Bhabinkamtibmas wajib** dipilihkan wilayah.
   - Nomor WhatsApp petugas harus unik (dipakai untuk perintah grup `/otw`, `/tiba`, `/selesai`).
7. Lupa password / kehilangan HP TOTP → admin pakai tombol **Reset password** / **Reset TOTP** di baris petugas. Akun terkunci 15 menit setelah 10 kali gagal; reset password oleh admin juga membuka kunci.

---

## 7. Pairing WhatsApp

1. Siapkan **nomor khusus unit** (bukan nomor pribadi) dengan verifikasi dua langkah aktif.
2. Login admin → **Sistem → WhatsApp Gateway → Hubungkan WhatsApp**.
3. Scan QR dari **WhatsApp → Perangkat tertaut → Tautkan perangkat** (QR berlaku ±90 detik).
4. Tunggu status **TERHUBUNG**.
5. Buat grup URC, masukkan nomor unit, kirim `/id` di grup → salin angka ID ke **Sistem → ID grup URC**.
6. Uji: kirim `LAPOR` dari HP lain ke nomor unit; pastikan tiket muncul di Live Board dan pesan masuk ke grup.

---

## 8. Backup, healthcheck, alert

### Backup (terenkripsi wajib)

Tambahkan ke `/etc/sigap/api.env` (atau override service backup):

```bash
SIGAP_BACKUP_AGE_RECIPIENT=age1...   # public key; private key disimpan DI LUAR server
```

```bash
sudo systemctl enable --now sigap-backup.timer
sudo systemctl start sigap-backup.service      # uji sekali
ls -l /var/backups/sigap/
```

Backup sesi WhatsApp (`/var/lib/sigap-bot/baileys`) **terpisah** dan ikut dienkripsi; tanpa itu, pairing ulang diperlukan setelah server hilang.

Uji restore setiap bulan: `sudo /opt/sigap/infra/scripts/restore-drill.sh`.

### Healthcheck (jalankan sebagai root, tiap 5 menit)

Healthcheck membaca DB API dan antrean bot (`/var/lib/sigap-bot/bot-queue`), jadi perlu root:

```bash
sudo crontab -e
*/5 * * * * SIGAP_CHECK_BOT=true /opt/sigap/infra/scripts/healthcheck.sh >/dev/null 2>&1 || /opt/sigap/infra/scripts/alert-failure.sh healthcheck
```

Yang diperiksa: API hidup, disk, ukuran WAL, outbox macet/dead, heartbeat bot, **antrean pesan warga menumpuk** (API tidak menerima pesan) dan **pesan ditolak permanen** di `bot-queue/dead/`.

---

## 9. Smoke test setelah deploy (wajib, ±10 menit)

| # | Uji | Hasil yang diharapkan |
|---|---|---|
| 1 | `curl -fsS http://127.0.0.1:4000/health` | `"ok":true` |
| 2 | Login admin + TOTP | masuk Live Board |
| 3 | Buat petugas uji → login sebagai petugas | diminta ganti password |
| 4 | WA: `LAPOR` → nama → `1` → deskripsi → share location → `SELESAI` → `1` | tiket P2 muncul, grup URC dapat pesan |
| 5 | WA: `ada banjir di depan rumah` | bot **bertanya** "Apakah ini DARURAT?" (belum ada P1) |
| 6 | WA: `DARURAT kebakaran` | P1 langsung dibuat, alarm dashboard bunyi |
| 7 | Grup: `/otw <nomor lengkap tiket>` dari nomor URC terdaftar | status OTW, pelapor dapat notifikasi |
| 8 | `sudo systemctl restart sigap-api` sambil kirim pesan WA | pesan tetap jadi tiket setelah API hidup (antrean bot) |
| 9 | `ls /var/lib/sigap-bot/bot-queue` | kosong setelah API pulih |
| 10 | Hapus petugas uji | status *nonaktif*, tetap tampil di audit |

---

## 10. Update rilis

```bash
# 1. Backup dulu
sudo systemctl start sigap-backup.service

# 2. Ambil rilis
sudo -u sigap -H bash -c '
  cd /opt/sigap &&
  git fetch --tags &&
  git checkout <TAG_BARU> &&
  pnpm install --frozen-lockfile &&
  pnpm -r test &&
  pnpm -r build
'

# 3. Cek CSP & Caddy
node /opt/sigap/infra/scripts/csp-hash.mjs --check

# 4. Restart (API dulu; pesan WA yang masuk selama restart ditahan antrean bot)
sudo cp /opt/sigap/infra/systemd/*.service /opt/sigap/infra/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart sigap-api
curl -fsS http://127.0.0.1:4000/health
sudo systemctl restart sigap-bot

# 5. Jalankan smoke test #1, #2, #4, #9
```

Migrasi database berjalan otomatis saat API start dan bersifat **aditif** (menambah kolom/tabel), sehingga kode versi sebelumnya tetap bisa membaca DB yang sudah dimigrasi.

### Rollback

```bash
sudo -u sigap -H bash -c 'cd /opt/sigap && git checkout <TAG_SEBELUMNYA> && pnpm install --frozen-lockfile && pnpm -r build'
sudo systemctl restart sigap-api sigap-bot
```

Restore DB dari backup **hanya** bila rilis baru merusak data (lihat `17-RUNBOOK.md` bagian restore).

---

## 11. Upgrade dari instalasi lama (bot masih jalan sebagai user `sigap`)

Rilis v1.2 memisahkan bot ke user `sigap-bot`. Sekali saja:

```bash
sudo systemctl stop sigap-bot
sudo adduser --system --group --no-create-home sigap-bot
sudo mkdir -p /var/lib/sigap-bot
sudo mv /var/lib/sigap/baileys /var/lib/sigap-bot/baileys
sudo chown -R sigap-bot:sigap-bot /var/lib/sigap-bot && sudo chmod 700 /var/lib/sigap-bot
sudo install -o sigap-bot -g sigap-bot -m 600 /opt/sigap/infra/bot.env.example /etc/sigap/bot.env
sudo nano /etc/sigap/bot.env     # isi SIGAP_INTERNAL_TOKEN dari api.env
sudo cp /opt/sigap/infra/systemd/sigap-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl start sigap-bot
```

Sesi WhatsApp ikut pindah, jadi **tidak perlu scan ulang**. Pastikan juga `SIGAP_INTERNAL_TOKEN` minimal 32 karakter (rilis ini menolak token lebih pendek di produksi).

---

## 12. Rotasi secret

Lakukan bila secret pernah bocor, saat serah terima pengelola, atau bila environment pernah memakai nilai default dari repo:

```bash
sudo systemctl stop sigap-bot sigap-api
sudo -u sigap -H bash -c 'cd /opt/sigap/apps/api && set -a && . /etc/sigap/api.env && set +a && pnpm secrets:rotate -- --write-env /etc/sigap/api.env'
# Salin SIGAP_INTERNAL_TOKEN baru ke /etc/sigap/bot.env
sudo systemctl start sigap-api sigap-bot
```

Skrip ini membackup DB, mendekripsi nomor pelapor & TOTP dengan kunci lama, mengenkripsi ulang dengan kunci baru, menghitung ulang hash nomor, dan mencabut semua sesi. Semua petugas perlu login ulang.

---

## 13. Checklist go-live

- [ ] Semua test hijau pada tag yang dideploy
- [ ] Secret unik, tersimpan di password manager, bukan nilai default
- [ ] `SIGAP_SEED_DEMO=false`, `SIGAP_COOKIE_SECURE=true`
- [ ] Bot jalan sebagai `sigap-bot` dengan `bot.env` sendiri
- [ ] HTTPS + HSTS aktif, `/internal/*` = 404, CSP hash cocok
- [ ] TOTP aktif untuk admin/pawas/kapolsek
- [ ] Polygon wilayah resmi (bukan demo) terpasang
- [ ] Grup URC terdaftar, nomor petugas unik dan benar
- [ ] Backup terenkripsi berjalan + restore drill pertama dicatat
- [ ] Healthcheck cron + alert aktif
- [ ] Smoke test 1–10 lulus
- [ ] SOP fallback bila nomor WA diblokir sudah dilatih (`08-SOP.md`)
