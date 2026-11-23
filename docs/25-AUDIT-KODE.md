# 25 — Audit Kode & Script SIGAP

**Tanggal:** 15 November 2026
**Ruang lingkup:** `apps/api`, `apps/bot`, `apps/web`, `packages/*`, `infra/scripts`, `infra/systemd`, `infra/caddy`, konfigurasi build.
**Metode:** review kode statis, 49 test API, 23 test domain, 9 test bot, build produksi, `pnpm audit --prod`, load test, restore drill, dan uji manual browser untuk peta/tema/pairing WhatsApp.

> Dokumen ini sengaja kritis. Tujuannya menemukan kekurangan sebelum pilot, bukan mencari pembenaran.

---

## 1. Ringkasan eksekutif

**Yang sudah kuat:**

- TypeScript strict, validasi Zod, query SQL parameterized (Drizzle).
- Session cookie HttpOnly + Argon2id + rate limit login.
- Nomor pelapor dienkripsi AES-256-GCM + hash HMAC.
- Media divalidasi MIME/ukuran, disimpan di luar webroot, disajikan dengan sesi.
- Audit untuk aksi sensitif, state machine tiket, RBAC, IDOR bhabin.
- Backup + restore drill + healthcheck + systemd unit.
- Pemisahan bot sebagai transport dan API sebagai sumber kebenaran.
- Pairing WhatsApp sekarang dari dashboard, bukan terminal/file.

**Risiko utama yang masih terbuka:**

1. **Baileys tidak resmi** — nomor WhatsApp bisa diblokir. Ini risiko operasional tertinggi dan tidak bisa dihilangkan dengan kode.
2. **Backup belum wajib terenkripsi** dan media hanya dicerminkan (bukan snapshot) — salah hapus bisa ikut terhapus di backup.
3. **Belum ada job retensi otomatis** — retensi 12 bulan masih kebijakan, bukan eksekusi.
4. **CSP belum ada** — XSS sudah dimitigasi React escaping, tetapi pertahanan lapis kedua belum.
5. **TOTP belum punya recovery codes** — petugas bisa terkunci.
6. **`trustProxy: true`** — aman hanya jika API benar-benar loopback; salah konfigurasi bisa memalsukan IP.
7. **Bukti media inline tidak diaudit** — hanya unduhan eksplisit yang tercatat.
8. **Belum ada E2E Playwright/coverage/lint** — regresi UI masih bergantung uji manual.

**Status temuan:** 35 temuan — 2 kritis (ditutup), 11 tinggi (9 ditutup, 2 terbuka), 11 sedang (7 ditutup, 4 terbuka), 10 rendah (1 sebagian, 1 accepted, 7 terbuka, 1 ditutup), 1 info.

---

## 2. Temuan dan tindakan

| ID | Severity | Area | Temuan | Alasan | Rekomendasi | Status |
|---|---|---|---|---|---|---|
| A-01 | **Kritis** | RBAC | Bhabin tanpa `regionId` bisa melihat semua tiket dan media | Kondisi lama hanya memblokir jika region terisi; akun tanpa wilayah menjadi bypass | Tolak bhabin tanpa wilayah; filter list ke region atau 403 | **Fixed + test** |
| A-02 | **Kritis** | Secret | `totp_secret` disimpan plaintext | Backup/DB bocor = TOTP bisa dibaca dan dipakai | Enkripsi AES-256-GCM dengan AAD TOTP; legacy plaintext fallback | **Fixed + test** |
| A-03 | **Tinggi** | Pairing WA | QR pairing hanya di terminal/`data/baileys-qr.png` | Operator harus akses server; QR file bisa tertinggal | Kontrol dari Settings, QR PNG data URL di DB, TTL 90 detik, admin-only | **Fixed + manual test** |
| A-04 | **Tinggi** | Gateway state | Status/QR gateway hanya di memori | Restart API menghilangkan QR/status; bot tidak punya kontrol | Tabel `wa_gateway` + command queue + heartbeat | **Fixed** |
| A-05 | **Tinggi** | Media | `Cache-Control: private, max-age=86400` | Bukti sensitif tersimpan 24 jam di browser workstation bersama | Ganti ke `private, no-store` | **Fixed** |
| A-06 | **Tinggi** | Deploy | Caddy `try_files` berpotensi menelan `/api/*` | Urutan route bisa mengarahkan API ke SPA | API/health/internal di `handle` terpisah; fallback SPA di `handle` terakhir | **Fixed (belum `caddy validate`)** |
| A-07 | **Tinggi** | Backup | Media tidak dibackup diam-diam jika `rsync` tidak ada | Operator mengira backup lengkap | Gagal dengan pesan jelas jika media ada tapi rsync tidak ada | **Fixed** |
| A-08 | **Tinggi** | Test | Test bergantung tanggal `2026-11-14` | Gagal otomatis saat lewat tengah malam | Bulan/tanggal dinamis + digest date dinamis | **Fixed** |
| A-09 | **Tinggi** | Healthcheck | Perbandingan timestamp outbox sebagai string | `T` vs spasi membuat deteksi outbox macet tidak akurat | `datetime(next_attempt_at)` | **Fixed** |
| A-10 | **Tinggi** | Backup | Enkripsi backup opsional | Backup plaintext berisi PII | Wajibkan age/gpg di produksi; simpan kunci terpisah | **Open** |
| A-11 | **Tinggi** | Backup | Media hanya mirror `rsync --delete` | File yang terhapus di live ikut hilang di backup | Snapshot/restic/Borg + retensi terpisah | **Open** |
| A-12 | **Sedang** | Log | URL request dapat memuat query PII | Pencarian nama/nomor bisa masuk log | Serializer membuang query string | **Fixed** |
| A-13 | **Sedang** | Build | Sourcemap produksi aktif | Source code terekspos jika `.map` diakses | Default off; opt-in `SIGAP_SOURCEMAP=true` | **Fixed** |
| A-14 | **Sedang** | Bot | Folder sesi Baileys bisa permission longgar | Sesi = akses akun WhatsApp | `0700` + systemd `UMask=0077` | **Fixed** |
| A-15 | **Sedang** | Gateway API | Aksi connect/logout bisa dispam | Bisa memicu QR churn/ban | Rate limit 10/menit + audit + admin-only | **Fixed** |
| A-16 | **Sedang** | UI | Topbar selalu menampilkan `WA AKTIF` | Operator salah mengira bot connected | Poll status nyata; tampil AKTIF/PAIRING/OFFLINE | **Fixed** |
| A-17 | **Sedang** | Web Push | Endpoint push bisa diarahkan ke IP privat (SSRF) | Server melakukan POST ke endpoint pendaftar | Tolak non-HTTPS dan host privat/loopback; tetap pasang egress firewall untuk DNS rebinding | **Fixed (host check)** |
| A-18 | **Sedang** | Web | Tidak ada CSP | XSS defense-in-depth belum ada | CSP report-only, lalu enforce; nonce/hash untuk inline theme script | **Open** |
| A-19 | **Sedang** | Proxy | `trustProxy: true` | Jika API tidak loopback, IP/rate limit bisa dipalsukan | Bind `127.0.0.1`; set trusted proxy eksplisit | **Open** |
| A-20 | **Sedang** | Retensi | Belum ada worker hapus data 12 bulan/legal hold | Kepatuhan retensi belum otomatis | Job retensi + legal hold flag + audit | **Open** |
| A-21 | **Sedang** | TOTP | Tidak ada recovery codes | Petugas kehilangan HP = terkunci | Generate 8 recovery codes sekali pakai, hash di DB | **Open** |
| A-22 | **Rendah** | Audit | Audit log tidak hash-chained | Admin DB bisa mengubah log tanpa jejak | Hash chain + ekspor offsite berkala | **Open** |
| A-23 | **Rendah** | Media | Media inline tidak diaudit | Tidak ada jejak siapa membuka bukti | Audit `media.view` per sesi/tiket, bukan per range request | **Open** |
| A-24 | **Rendah** | EXIF | File asli dengan EXIF GPS disajikan | Metadata perangkat/lokasi ikut terunduh | Strip EXIF pada salinan serve atau beri kebijakan retensi | **Open** |
| A-25 | **Rendah** | Scale | SQLite single writer, tanpa lock multi-instance | Dua API instance bisa double escalation/digest | Tetap 1 instance; atau Postgres + advisory lock | **Accepted** |
| A-26 | **Rendah** | Search | `LIKE %term%` tanpa FTS | Melambat saat data besar | FTS5 untuk judul/deskripsi/nama | **Open** |
| A-27 | **Rendah** | Test | Belum ada Playwright, coverage threshold, lint/format | Regresi UI/format tidak otomatis | Playwright smoke, c8 threshold, ESLint/Prettier | **Open** |
| A-28 | **Rendah** | Ops | Load test sekuensial dan menulis data nyata | Bukan gambaran beban; bisa mengotori DB | Guard production + timeout (fixed); lanjut k6 + DB disposable | **Partially fixed** |
| A-29 | **Rendah** | PWA | Versi cache SW manual | Deploy bisa menyajikan shell lama | Generate cache name dari build hash | **Open** |
| A-30 | **Info** | Docs | Status task/test pernah tidak sinkron | Membingungkan review | Dokumen ini + update `05/06/13/14/24` | **Fixed** |
| A-31 | **Tinggi** | Bot/API | Pesan 1:1 teks ditolak 400, sementara `/id` grup berhasil | `message.key.participant` kosong (`""`) pada chat 1:1 LID; `??` tidak fallback, schema `senderJid` min 3 menolak | Bot: fallback ke `chatJid` + utamakan JID telepon (`remoteJidAlt`/`participantAlt`); API: fallback `senderJid`; test regresi | **Fixed + test** |
| A-32 | **Tinggi** | Media/grup | Forward tiket ke grup hanya teks; foto/video/voice note tidak ikut terkirim | Bukti visual tidak sampai ke URC; petugas harus buka dashboard | Outbox `kind=media` + endpoint internal media; bot kirim image/video/audio dengan caption; media darurat diteruskan per item | **Fixed + test + live** |
| A-33 | **Sedang** | PII | Nomor pelapor selalu masked di grup/eskalasi, tidak bisa ditampilkan penuh | Operasional butuh nomor lengkap untuk menghubungi pelapor; masking dashboard sudah terpisah | Setting `pii_masking` mengatur grup/eskalasi; dashboard tetap masked + reveal ber-audit | **Fixed + test** |
| A-34 | **Rendah** | Command grup | Pesan role salah: "tidak bisa otw dari status diterima" menyesatkan; nomor tak terdaftar didiamkan | Petugas salah paham dan mengulang command | Pesan menyebut role pengirim + role yang diizinkan; nomor tak terdaftar dibalas agar admin mendaftarkan | **Fixed + test** |
| A-35 | **Rendah** | Outbox | `sendMessage` resolve dianggap sukses; stanza bisa ditolak server setelahnya (`smax-invalid`) | Pesan tampak terkirim di DB padahal server menolak | Reconcile via `messages.update`/receipt; tandai gagal dan retry bila ada NACK | **Open** |

---

## 3. Penjelasan temuan prioritas

### A-01 — Bhabin tanpa wilayah (kritis, fixed)

Kode lama:

```ts
if (userRole === "bhabin" && userRegionId && ticketRegionId && userRegionId !== ticketRegionId)
```

Jika `userRegionId` null, kondisi false dan akses lolos. Hal yang sama terjadi di media (`!user.regionId` → return). Dampak: akun bhabin yang salah konfigurasi bisa melihat tiket/media seluruh wilkum.

Perbaikan:

- Bhabin tanpa wilayah → **403**.
- List tiket → filter region; tanpa region → 403.
- Media staging/tiket wilayah lain → 403.
- Test baru: akun bhabin tanpa wilayah tidak bisa list tiket atau mengakses media staging.

### A-02 — TOTP plaintext (kritis, fixed)

TOTP secret setara password kedua. Sebelumnya tersimpan apa adanya. Sekarang:

- `encryptTotpSecret()` / `decryptTotpSecret()` memakai AES-256-GCM, AAD `sigap:totp:v1`.
- Setup/enable menyimpan ciphertext.
- Login mendekripsi; data lama plaintext tetap dibaca (fallback) dan otomatis dienkripsi ulang saat login sukses.
- Test enkripsi ditambahkan.

Catatan: kunci TOTP memakai `SIGAP_PHONE_KEY`. Rotasi kunci harus mendekripsi lalu mengenkripsi ulang phone + TOTP; dokumentasikan di runbook.

### A-03/A-04 — Pairing dari dashboard (tinggi, fixed)

Alur baru:

```text
Admin Settings → POST /api/system/gateway/connect
     → wa_gateway.pending_command = connect
Bot poll /internal/wa/control (2,5 dtk)
     → ack command → socket Baileys → QR
     → POST /internal/wa/qr { qrDataUrl, expiresAt }
API simpan QR di wa_gateway (TTL 90 dtk)
Dashboard poll GET /api/system/gateway → <img src=qr>
```

- QR hanya dikembalikan ke admin.
- `logout` menghapus sesi dan memungkinkan ganti nomor.
- `disconnect` menyimpan sesi (reconnect tanpa scan).
- Bot tidak lagi menulis QR ke terminal/file.
- Bot heartbeat membuat status **BOT ONLINE/OFFLINE** nyata.

### A-10/A-11 — Backup (tinggi, open)

Backup saat ini:

- DB: `.backup` + integrity check + gzip + opsional age/gpg.
- Media: `rsync -a --delete` ke folder backup.
- Retensi DB 30 hari; media tidak punya versi.

Risiko:

- Tanpa age/gpg, backup berisi PII plaintext.
- `--delete` membuat kesalahan hapus di live ikut ke backup.
- Belum ada uji restore media.

Rekomendasi:

1. Wajibkan `SIGAP_BACKUP_AGE_RECIPIENT` atau GPG di produksi.
2. Ganti media mirror dengan snapshot (restic/Borg/rclone crypt).
3. Simpan kunci enkripsi di password manager institusi, bukan server.
4. Uji restore DB + media setiap bulan; catat waktu.
5. Simpan salinan offsite.

### A-18 — CSP (sedang, open)

Belum ada `Content-Security-Policy`. React meng-escape output, dan tidak ada `dangerouslySetInnerHTML`, tetapi CSP tetap penting.

Rekomendasi:

1. Mulai `Content-Security-Policy-Report-Only`.
2. `default-src 'self'`; `img-src 'self' data: https://tile.openstreetmap.org https://*.basemaps.cartocdn.com`; `connect-src 'self'`; `style-src 'self' 'unsafe-inline'` (React inline style); `script-src 'self'` + hash untuk inline theme script.
3. Setelah bersih, enforce.
4. Jangan lupa tile Esri fallback jika dipakai.

### A-19 — trustProxy (sedang, open)

`trustProxy: true` menerima `X-Forwarded-For` dari siapa pun. Selama API hanya listen `127.0.0.1` (default), ini aman. Jika `SIGAP_API_HOST=0.0.0.0` tanpa firewall, attacker bisa memalsukan IP untuk bypass rate limit dan mengotori audit.

Rekomendasi:

- Pertahankan `SIGAP_API_HOST=127.0.0.1`.
- Set `trustProxy` ke daftar proxy Caddy (`127.0.0.1`, `::1`).
- Jangan buka port 4000 ke publik.

### A-21 — Recovery codes (sedang, open)

TOTP aktif tanpa recovery codes berisiko lockout. Rekomendasi:

- 8 kode sekali pakai, hash Argon2id/SHA-256 + pepper.
- Tampilkan sekali saat enable.
- Audit pemakaian.
- Reset oleh admin dengan verifikasi identitas.

### A-31 — Pesan 1:1 ditolak karena `senderJid` kosong (tinggi, fixed)

Gejala: bot connected, `/id` di grup berhasil, tetapi pesan 1:1 `Halo`/`LAPOR` tidak dibalas. Log bot menunjukkan API 400:

```text
path: ["senderJid"], code: "too_small", minimum: 3
```

Penyebab: pada chat 1:1 berbasis LID, Baileys 7 mengirim `message.key.participant` sebagai **string kosong `""`**, bukan `undefined`. Kode lama memakai `message.key.participant ?? chatJid`; operator `??` tidak menangkap `""`, sehingga `senderJid` kosong dan schema `min(3)` menolak. Payload command grup punya participant terisi, sehingga `/id` tetap lolos.

Perbaikan:

- Bot: fallback `participant || chatJid`, dan utamakan JID nomor telepon (`remoteJidAlt`/`participantAlt`) dibanding LID.
- API: fallback `senderJid` ke `chatJid` bila kosong/terlalu pendek.
- Test regresi bot + API ditambahkan.
- Log API tetap mencatat `issues` dan `bodyShape` untuk kasus serupa.

Status: **fixed + test + live**; balasan 1:1 ke nomor B sudah berhasil.

### A-32 — Media laporan tidak ikut ke grup (tinggi, fixed)

Gejala: laporan dengan foto/video/voice note hanya mengirim teks tiket ke grup URC. Penyebab: outbox worker hanya mendukung payload teks; media tersimpan di API tetapi tidak pernah diunduh bot untuk diteruskan. Perbaikan: `groupMediaDrafts()` membuat outbox `kind=media`, endpoint internal `GET /internal/media/:id` mengirim byte asli dengan token, dan bot mengirim `image`/`video`/`audio` + caption. Media darurat yang masuk menyusul diteruskan per item; media laporan normal dikirim saat tiket dibuat. Diuji dengan upload/download live dan outbox media live.

### A-33 — Nomor pelapor selalu masked (sedang, fixed)

Gejala: grup dan eskalasi menampilkan `0831•••••975` meskipun operator butuh nomor lengkap. Penyebab: kode memanggil `maskPhone()` tanpa membaca setting. Perbaikan: `pii_masking` sekarang mengatur tampilan di grup/eskalasi; `false` = nomor penuh, `true` = masked. Dashboard tetap masked dan reveal 30 detik tetap ber-audit.

### A-34 — Feedback command grup menyesatkan (rendah, fixed)

Gejala: `/otw` dari role bhabin dibalas "tidak bisa otw dari status diterima", padahal status mengizinkan; nomor tak terdaftar tidak mendapat balasan sama sekali. Perbaikan: pesan membedakan status vs role, menyebut role pengirim dan daftar role yang diizinkan; nomor tak terdaftar dibalas dengan instruksi pendaftaran di menu Petugas.

---

## 4. Audit script & infrastruktur

### 4.1 `infra/scripts/backup-db.sh`

**Kritik:** enkripsi opsional; media mirror; tidak ada offsite; retensi media tidak jelas.
**Alasan:** backup adalah target utama pencurian data; mirror bukan backup historis.
**Rekomendasi:** age/GPG wajib, restic/Borg untuk media, offsite, uji restore.

### 4.2 `infra/scripts/healthcheck.sh`

**Kritik:** deteksi outbox membandingkan string ISO dengan `datetime()` (fixed). Belum cek heartbeat bot.
**Alasan:** bot mati = laporan warga tidak masuk, tetapi API tetap `ok`.
**Rekomendasi:** tambah query `wa_gateway.bot_seen_at` > 60 detik → alert; cek disk media, bukan hanya DB.

### 4.3 `infra/scripts/restore-drill.sh`

**Kritik:** hanya integrity DB; tidak cek media/foreign key; `mktemp` sudah `umask 077`.
**Alasan:** DB valid tetapi media hilang tetap bencana.
**Rekomendasi:** cek jumlah media, sample file, `PRAGMA foreign_key_check`, dan restore media ke direktori uji.

### 4.4 `apps/api/scripts/load-test.mjs`

**Kritik:** sekuensial, bukan beban paralel; menulis tiket nyata; default 20 laporan.
**Alasan:** hasil p95 terlihat bagus tetapi tidak menguji contention.
**Rekomendasi:** k6/autocannon, DB disposable, 50–200 laporan paralel, ukur error rate.

### 4.5 `infra/caddy/Caddyfile`

**Kritik:** urutan `try_files` bisa menelan API (fixed); belum CSP; cache asset sudah ditambahkan.
**Alasan:** route SPA fallback harus menjadi handler terakhir.
**Rekomendasi:** jalankan `caddy validate` dan uji `/api/health`, `/api/tickets`, `/assets/*`, `/index.html`, `/sw.js` di staging.

### 4.6 systemd

**Kritik:** belum ada `MemoryMax`, `StartLimitBurst`, dan `StateDirectory`; UMask sudah ditambahkan.
**Alasan:** crash loop/oom bisa mengganggu API.
**Rekomendasi:** `MemoryMax=1G`, `StartLimitIntervalSec=60`, `StartLimitBurst=5`, `StateDirectory=sigap`.

### 4.7 Build

**Kritik:** sourcemap produksi (fixed); belum ada lint/format/CI.
**Alasan:** sourcemap membocorkan kode; CI mencegah regresi.
**Rekomendasi:** pipeline `typecheck → test → audit → build`, artefak checksum, SBOM.

---

## 5. Audit keamanan aplikasi

### Sudah baik

- Cookie HttpOnly/SameSite/Secure (production).
- Session token acak 32 byte; hanya hash yang disimpan.
- Argon2id password.
- CSRF Origin allowlist + SameSite.
- Rate limit login 5/15 menit; reveal 30/menit; gateway 10/menit.
- SQL parameterized; tidak ada identifier dari input user.
- Media MIME allowlist + sharp decode + batas ukuran + path generated.
- Nomor telepon AES-GCM + HMAC lookup.
- Audit append-only dari aplikasi.
- Export CSV formula-injection guard.
- Tooltip peta di-escape.
- Web Push endpoint privat ditolak.

### Risiko residual

| Risiko | Level | Mitigasi |
|---|---|---|
| Baileys unofficial → ban | Tinggi | Nomor khusus, 2FA, nomor cadangan, SOP reconnect |
| Backup plaintext | Tinggi | age/GPG wajib |
| Media backup mirror | Tinggi | restic/Borg snapshot |
| CSP belum ada | Sedang | Report-only lalu enforce |
| trustProxy | Sedang | Loopback + trusted proxy list |
| Retensi manual | Sedang | Worker retensi + legal hold |
| Recovery codes | Sedang | Generate + hash |
| Inline media tidak diaudit | Rendah | Audit per view/session |
| EXIF asli | Rendah | Strip atau kebijakan |
| SQLite single writer | Rendah | 1 instance / Postgres jika scale |

---

## 6. Rekomendasi prioritas

### Sebelum pilot (P0)

1. Nomor WA resmi + 2FA + nomor cadangan; uji pairing dari Settings di staging.
2. Polygon resmi; hapus/disable polygon demo.
3. Backup age/GPG wajib + offsite + restore media.
4. `caddy validate` + staging deploy; uji route API/asset/SW.
5. systemd limits + monitoring bot heartbeat.
6. Job retensi + legal hold.
7. TOTP recovery codes.

### 30 hari (P1)

8. CSP report-only → enforce.
9. Playwright smoke: login → terima → OTW → selesai; peta; Settings QR.
10. ESLint/Prettier + CI gate + coverage threshold.
11. Audit hash chain/offsite.
12. Kebijakan EXIF/audit view media.
13. Load test paralel di DB disposable.

### 90 hari (P2)

14. Postgres/PostGIS jika multi-Polsek atau volume besar.
15. Object storage + lifecycle policy untuk media.
16. Multi-instance lock/queue.
17. Cache SW per build hash.
18. FTS5 pencarian tiket.

---

## 7. Bukti verifikasi

| Item | Hasil |
|---|---|
| `pnpm typecheck` | Lulus |
| `pnpm test` | **81 test** (23 core + 48 API + 9 bot) |
| `pnpm build` | API ±702 KB; bot ±768 KB; web initial ±88 KB gzip; Leaflet ±45 KB |
| `pnpm audit --prod` | 0 vulnerability (dicek ulang setelah perubahan dependensi) |
| Load test | 20 laporan / 140 request → 2,1 dtk, p95 16 ms |
| Restore drill | integrity ok, 8 tiket, 4 migrasi, 653 ms |
| Pairing UI | Bot start → Settings connect → QR tampil → logout → sesi terhapus |
| Peta | OSM terang, 5 polygon+label, tanpa API key |
| Tema | Default terang; toggle gelap; tersimpan per perangkat |
| Lighthouse login | 100 Accessibility / 100 Best Practices / 100 SEO |
| Gateway 1:1 | **Terverifikasi**: balasan 1:1 nomor B; fallback LID → JID telepon |
| Media ke grup | **Terverifikasi**: upload/download internal byte identik; outbox media live `sent` |

---

## 8. Kesimpulan

Kode layak untuk **pilot terbatas** setelah P0 selesai. Jangan full launch sebelum:

- backup terenkripsi + restore media terbukti,
- polygon resmi,
- nomor WA stabil ≥ 7 hari,
- TOTP/recovery dan monitoring bot aktif,
- CSP dan retensi dieksekusi.

Audit ini tidak menemukan backdoor atau remote code execution. Risiko terbesar bukan bug tunggal, tetapi **operasional WhatsApp tidak resmi** dan **backup/media yang belum hardened**.



