# 17 — Runbook Operasional

**Versi:** 1.0 · 14 November 2026
**Target:** VPS Linux, systemd, Caddy, Node 24, tanpa Docker.

---

## 1. Lokasi penting

| Item | Path |
|---|---|
| Aplikasi | `/opt/sigap` |
| Env | `/etc/sigap/api.env` |
| DB | `/var/lib/sigap/sigap.db` |
| Media | `/var/lib/sigap/media` |
| Sesi Baileys | `/var/lib/sigap/baileys` |
| QR | `/var/lib/sigap/baileys-qr.png` |
| Backup | `/var/backups/sigap` |
| Log | journald (`journalctl -u ...`) |

---

## 2. Deploy / update

```bash
cd /opt/sigap
sudo -u sigap pnpm install --frozen-lockfile
sudo -u sigap pnpm --filter @sigap/api build
sudo -u sigap pnpm --filter @sigap/bot build
sudo -u sigap pnpm --filter @sigap/web build
sudo systemctl restart sigap-api sigap-bot
sudo systemctl reload caddy
curl -fsS http://127.0.0.1:4000/health
```

Urutan aman: backup → build → migrate → restart API → restart bot.

Migrasi:

```bash
sudo -u sigap pnpm --filter @sigap/api db:migrate
```

---

## 3. Rollback

```bash
cd /opt/sigap
git checkout <tag-sebelumnya>
sudo -u sigap pnpm install --frozen-lockfile
sudo -u sigap pnpm --filter @sigap/api build
sudo -u sigap pnpm --filter @sigap/bot build
sudo -u sigap pnpm --filter @sigap/web build
sudo systemctl restart sigap-api sigap-bot
```

Jika migrasi bermasalah:
1. Stop API/bot.
2. Restore DB dari backup sebelum migrasi.
3. Checkout kode sebelumnya.
4. Start API/bot.
5. Catat insiden.

---

## 4. Pairing WhatsApp

Pairing dilakukan dari dashboard, bukan terminal.

1. Pastikan service berjalan:

```bash
sudo systemctl status sigap-api sigap-bot
```

2. Login admin → **Sistem → WhatsApp Gateway**.
3. Klik **Hubungkan WhatsApp**, lalu scan QR dari HP:
   **WhatsApp → Perangkat tertaut → Tautkan perangkat**.
4. Tunggu status **TERHUBUNG** dan topbar **WA AKTIF**.
5. Untuk mengganti nomor: **Logout / ganti nomor**, lalu pairing ulang.

Sesi disimpan di `/var/lib/sigap/baileys` dengan permission `0700`. Jangan menyalin folder ini ke mesin lain. QR tidak lagi disimpan sebagai file publik.

Jika bot OFFLINE, periksa:

```bash
sudo systemctl status sigap-bot
sudo journalctl -u sigap-bot -n 100
curl -fsS http://127.0.0.1:4000/health
```

---

## 5. WhatsApp disconnect / banned

### Disconnect biasa
- Bot reconnect dengan backoff otomatis.
- Cek `journalctl -u sigap-bot -n 100`.
- Cek status di **Pengaturan → Sistem**.

### Logout / banned
1. Siapkan nomor cadangan.
2. Hentikan bot.
3. Hapus folder sesi lama **setelah** yakin tidak dibutuhkan.
4. Pairing nomor baru.
5. Update `SIGAP_WA_NUMBER`, poster, dan grup.
6. Umumkan ke warga.
7. Ajukan banding ke WhatsApp jika nomor institusi.

---

## 6. Backup & restore

Backup harian (timer 02:00 WIB):

```bash
sudo systemctl status sigap-backup.timer
sudo /opt/sigap/infra/scripts/backup-db.sh
```

Restore:

```bash
sudo systemctl stop sigap-api sigap-bot
sudo /opt/sigap/infra/scripts/restore-drill.sh /var/backups/sigap/sigap-YYYY....db.gz
gunzip -c /var/backups/sigap/sigap-YYYY....db.gz > /var/lib/sigap/sigap.db
sudo rsync -a --delete /var/backups/sigap/media/ /var/lib/sigap/media/
sudo chown -R sigap:sigap /var/lib/sigap
sudo systemctl start sigap-api sigap-bot
```

Uji restore minimal sebulan sekali dan catat durasi.

---

## 7. Monitoring

```bash
sudo /opt/sigap/infra/scripts/healthcheck.sh
sudo systemctl status sigap-api sigap-bot sigap-backup.timer
```

Healthcheck gagal jika:
- API tidak `ok`,
- disk ≥ `SIGAP_DISK_ALERT_PCT` (default 85%),
- WAL > 512 MB,
- outbox pending > 15 menit ≥ `SIGAP_OUTBOX_ALERT` (default 50).

Alert webhook: `SIGAP_ALERT_WEBHOOK` di `/etc/sigap/api.env`.

---

## 8. Failure drills

| Drill | Langkah | Ekspektasi |
|---|---|---|
| WA disconnect | Putuskan internet HP 1 menit | Status disconnect, reconnect, outbox tertunda lalu terkirim |
| API down | `systemctl stop sigap-api` | Bot gagal kirim, retry; dashboard offline |
| Disk penuh | Isi disk sampai > 85% | Healthcheck gagal, alert |
| Outbox stuck | Set `sending` dengan waktu lampau | Reclaim ke `pending` setelah 60 detik |
| DB corrupt | Restore backup | Integrity ok, data kembali |

---

## 9. Insiden data

1. Putus akses: stop API/bot atau blokir sesi.
2. Rotasi secret: session secret, internal token, VAPID, phone key (hati-hati data lama).
3. Audit `audit_logs` dan akses media.
4. Beri tahu DPO/Kapolsek.
5. Simpan bukti; jangan hapus log.
6. Evaluasi dan perbaiki.

---

## 10. Kontak & eskalasi

| Peran | Tugas |
|---|---|
| Admin unit | Deploy, backup, akun, grup |
| Piket | Operasional tiket |
| Pawas | Eskalasi P1 |
| Kapolsek | Keputusan & komunikasi |
| DPO | Insiden data |

---

## 11. Review bulanan

- Cek audit log dan akses PII.
- Cek kapasitas disk/DB/media.
- Uji restore.
- Review SLA dan tiket ditolak.
- Perbarui SOP/polygon/nomor.
- Catat action item dan PIC.
