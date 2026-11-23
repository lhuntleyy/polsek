# Deploy cepat ke server demo (mode production)

Folder ini berisi installer satu-perintah. Ada dua cara mengirim kode ke server; pilih salah satu.

| Cara | Cocok untuk | Build di mana |
|---|---|---|
| **A. Paket rilis** (`.tar.gz`) | Server demo kecil (RAM 1–2 GB), tanpa akses GitHub | Laptop |
| **B. Clone dari GitHub** | Server yang bisa akses repo, update via `git pull` | Server |

Keduanya memakai `deploy/install.sh` yang sama. Installer:
- memasang Node.js 24, pnpm, Caddy, dan sqlite3;
- membuat user `sigap` (API) dan `sigap-bot` (bot);
- **membuat semua secret di server** (tidak ada secret yang di-upload);
- memasang systemd, HTTPS (Caddy), backup harian, dan healthcheck.

Server yang dibutuhkan: **Ubuntu 24.04**, akses `sudo`, port 80/443 terbuka, dan sebaiknya domain/subdomain yang mengarah ke IP server (A record). Tanpa domain tetap bisa memakai IP, tetapi sertifikatnya self-signed sehingga browser memberi peringatan.

> Mode production **mewajibkan HTTPS** karena cookie sesi bertanda `Secure`. Karena itu installer selalu memasang Caddy.

---

## A. Lewat paket rilis

Di laptop (PowerShell, dari root repo):

```powershell
pnpm release
```

Perintah ini menjalankan typecheck, 120 test, build produksi, dan cek CSP, lalu membuat `release\sigap-v1.2.0.tar.gz` (±2 MB). Isinya hanya hasil build, `package.json` + lockfile, `infra/`, dan `deploy/`. **Tidak ada `.env`, `data/`, `node_modules`, atau source code.**

Upload & pasang:

```powershell
scp release/sigap-v1.2.0.tar.gz user@IP_SERVER:~/
ssh user@IP_SERVER
```

```bash
tar -xzf sigap-v1.2.0.tar.gz
cd sigap-v1.2.0
sudo bash deploy/install.sh demo.domainanda.id     # atau: sudo bash deploy/install.sh 203.0.113.10
```

## B. Lewat GitHub

Di server:

```bash
sudo apt install -y git
git clone https://github.com/<akun>/<repo>.git sigap-src
cd sigap-src
corepack enable && pnpm install --frozen-lockfile && pnpm -r build
sudo bash deploy/install.sh demo.domainanda.id
```

---

## Setelah install

1. Ambil password admin awal: `sudo cat /root/sigap-admin-awal.txt`
2. Buka `https://demo.domainanda.id`, login `admin`, lalu **ganti password** (wajib di layar pertama). Setelah itu hapus filenya: `sudo rm /root/sigap-admin-awal.txt`.
3. **Sistem → Identitas unit**: isi nama/kode Polsek demo.
4. **Sistem → Wilayah**: unggah polygon kelurahan (GeoJSON). Mode production tidak membuat data demo.
5. **Sistem → Petugas**: tambah akun (password awal min. 10 karakter; petugas wajib menggantinya).
6. **Sistem → WhatsApp Gateway → Hubungkan**, lalu scan QR dengan nomor WA demo.
7. Uji dari HP lain: kirim `LAPOR` ke nomor itu.

## Update ke versi baru

Paket rilis: upload `.tar.gz` baru, ekstrak, lalu jalankan `sudo bash deploy/install.sh <domain>` lagi.
GitHub: `git pull && pnpm install --frozen-lockfile && pnpm -r build && sudo bash deploy/install.sh <domain>`.

Secret, database, media, dan sesi WhatsApp **tidak disentuh** saat update. Migrasi database berjalan otomatis.

## Perintah berguna di server

```bash
systemctl status sigap-api sigap-bot
journalctl -u sigap-api -f
journalctl -u sigap-bot -f
curl -fsS http://127.0.0.1:4000/health
sudo SIGAP_CHECK_BOT=true /opt/sigap/infra/scripts/healthcheck.sh
ls /var/lib/sigap-bot/bot-queue      # harus kosong saat normal
```

| Lokasi | Isi |
|---|---|
| `/etc/sigap/api.env` | Secret API (jangan dibagikan) |
| `/etc/sigap/bot.env` | Token internal bot |
| `/var/lib/sigap/` | Database & media bukti |
| `/var/lib/sigap-bot/` | Sesi WhatsApp & antrean pesan |
| `/var/backups/sigap/` | Backup harian (02:00 WIB) |

## Masalah umum

| Gejala | Penyebab / solusi |
|---|---|
| Login berhasil tapi langsung keluar lagi | Membuka lewat `http://` atau domain lain dari `SIGAP_PUBLIC_ORIGIN`. Selalu pakai URL yang dicetak installer. |
| `403 Origin tidak diizinkan` | Domain berubah: jalankan ulang `install.sh <domain-baru>`. |
| Peringatan sertifikat di browser | Install memakai IP (`tls internal`). Arahkan domain ke server lalu jalankan ulang installer dengan domain. |
| Caddy gagal dapat sertifikat | DNS belum mengarah ke IP server, atau port 80/443 diblokir firewall/provider. |
| `API tidak sehat` saat install | Lihat `journalctl -u sigap-api -n 50`. Biasanya port 4000 dipakai proses lain atau env salah. |
| Pesan WA tidak jadi tiket | `ls /var/lib/sigap-bot/bot-queue`; bila menumpuk, cek `journalctl -u sigap-bot`. Pesan ditolak permanen ada di `bot-queue/dead/`. |

Panduan produksi lengkap (hardening, backup terenkripsi, rotasi secret, rollback): [`docs/26-DEPLOY.md`](../docs/26-DEPLOY.md).
