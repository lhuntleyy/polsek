# 06 — Progress Log

**Terakhir diperbarui:** 16 November 2026
**Fase saat ini:** Fase 9 — hardening uji WhatsApp nyata
**Status keseluruhan:** Seluruh fitur inti v1 selesai dan teruji. Pairing WhatsApp dari Pengaturan, media laporan diteruskan ke grup, dan nomor pelapor bisa tampil penuh. Sisa pekerjaan hanya yang membutuhkan lapangan: nomor WA resmi, polygon resmi, UAT perangkat, pilot/launch.

---

## 1. Snapshot

| Item | Status |
|---|---|
| Dokumen produk | ✅ Selesai (26 dokumen + poster) |
| Kritik & revisi rencana | ✅ Selesai |
| Arsitektur | ✅ Selesai |
| Rencana & backlog | ✅ Selesai (157 task; 134 Done, 11 WIP, 7 Todo, 5 Blocked) |
| Prototipe UI | ✅ Selesai (6 layar + mobile + screenshot) |
| Data wilkum (polygon) | 🟡 Config + seed demo; polygon resmi belum |
| Nomor WA khusus | 🟡 Config tersedia; nomor aktual belum |
| Keputusan pimpinan | ✅ Q-01..Q-07 dijawab (config-first) |
| Backend / API | ✅ Fase 1–9: tiket, media, eskalasi, handover, duplikat, audit, export, digest, push, gateway control |
| Web dashboard | ✅ Fase 5: live board, peta terang, analitik, registry, handover, PWA, push |
| Bot WhatsApp | ✅ Fase 2 inti + Fase 9: Baileys, QR via dashboard, flow, outbox, group command |
| Media WhatsApp | ✅ Fase 3 inti + forward media asli ke grup URC |
| PWA & Web Push | ✅ Manifest + service worker + VAPID subscription + tes push |
| Test | ✅ 23 unit domain + 49 smoke API + 9 normalisasi bot (81 test) |
| Build produksi | ✅ API ±702 KB; bot ±768 KB; web initial ±88 KB gzip + Leaflet lazy ±45 KB |
| UAT | ✅ 15 lulus, 4 sebagian, 1 menunggu perangkat (docs/14) |
| Pilot / launch | ⛔ Blocked — butuh lapangan, nomor WA nyata, polygon resmi |

---

## 2. Log

### 2026-11-14 — Kickoff

**Dilakukan:**
- Menerima ide awal: WA bot + dashboard tiket + forward grup URC.
- Merevisi cakupan: semua warga boleh lapor, bukan hanya RT/RW/Camat.
- Menetapkan batasan: full Baileys, tanpa Docker, nama pelapor wajib, prototipe dulu.
- Menyusun kritik 18 lubang + solusi.
- Menyusun PRD, arsitektur, rencana, backlog, risiko, SOP draft, ADR.
- Mulai membangun prototipe dashboard.

**Keputusan:**
- Wilkum mengikat **lokasi kejadian**, bukan domisili pelapor.
- Nama wajib, tetapi darurat dapat membuat tiket lebih dulu.
- Semua warga boleh lapor dengan kontrol anti-hoax.
- SQLite + Turf untuk v1, bukan Postgres/PostGIS.
- SSE untuk real-time.
- Tanpa Docker.

### 2026-11-14 — Prototipe UI selesai

**Dilakukan:**
- 6 layar: Live Board, Peta, Analitik, Data, Serah Terima, Sistem.
- Mode dinding, command palette, alarm darurat, panel detail, media, timeline.
- Responsive: bottom navigation di mobile.
- Peta memakai snapshot lokal OSM (offline) + Leaflet yang dibundel.
- Screenshot final di `prototype/screenshots/`.
- Uji fungsional: alur terima → OTW → tiba → selesai, simulasi alarm, filter peta, pencarian, handover, toggle sistem, mobile nav.

### 2026-11-14 — Fase 1 dimulai (config-first)

**Keputusan pimpinan:**
- Polsek, kode unit, dan wilkum: **config-first** via `.env` + Pengaturan; nama final menyusul.
- Polygon: upload GeoJSON di Pengaturan; seed demo ditandai `is_demo`.
- Nomor WA + 2FA: disimpan di Pengaturan; nomor aktual menyusul.
- SLA: default P1 ack 2 menit/OTW 5 menit; eskalasi **Kapolsek** (Pawas 3 menit, Kapolsek 10 menit).
- Domain/hosting: ditunda.
- DPO sementara: project owner, atensi langsung Kapolsek.
- Retensi: 12 bulan + legal hold.

### 2026-11-14 — Fase 1 inti selesai

**API (`apps/api`):**
- Fastify 5 + SQLite/Drizzle, migrasi idempoten.
- Auth sesi cookie HttpOnly, Argon2id, TOTP setup/enable.
- RBAC: admin, kapolsek, pawas, piket, urc, bhabin.
- Tiket: list cursor, detail, transisi state machine, catatan, tiket manual.
- Geofence point-in-polygon + buffer 250 m.
- SSE `/api/stream`.
- Settings config-first, regions GeoJSON, officers, audit, analytics.
- Rate limit, CSRF origin, security headers, health, structured log.
- Build produksi tsup + copy migrasi (diuji `node dist/server.js`).

**Web (`apps/web`):**
- Login + session + logout.
- Live Board: queue, filter, search, peta snapshot + pin, detail, timeline, aksi status, catatan.
- SSE real-time + alarm P1 + suara opsional.
- Analitik ringkas dari API.
- Pengaturan admin: identitas unit, WA, DPO, retensi, SLA, region GeoJSON, status sistem.
- Placeholder Peta/Data/Handover dengan status fase.

**Test:**
- 21 unit test domain (`packages/core`).
- 7 smoke test API awal.
- Uji web end-to-end manual dengan Playwright.

### 2026-11-14 — Fase 2 inti selesai (WhatsApp Bot)

**Bot (`apps/bot`):**
- Baileys 7.0.0-rc14, auth multi-file, QR pairing.
- QR ditampilkan di terminal + disimpan sebagai `data/baileys-qr.png`.
- Auto-reconnect dengan backoff; logout terdeteksi.
- Status gateway dikirim ke API (`connecting`, `qr`, `connected`, `disconnected`).
- Normalisasi pesan: teks, lokasi, gambar/video/audio (metadata), grup.
- Abaikan `fromMe`, status broadcast, newsletter, history sync.
- Outbox worker: poll API, kirim teks, lapor sukses/gagal.
- Command grup `/otw`, `/tiba`, `/selesai`, `/tunda`, `/status`.
- Logger Baileys diturunkan ke `warn` agar kredensial tidak tercetak di log.

**API internal (`apps/api`):**
- `POST /internal/wa/inbound` dengan idempotensi `message_log`.
- `POST /internal/wa/group-command` dengan validasi JID petugas + grup.
- `POST /internal/wa/status`, `GET /internal/outbox`, `POST /internal/outbox/:id/result`.
- Auth token internal (`SIGAP_INTERNAL_TOKEN`), bukan cookie.
- Conversation engine: nama + consent, kategori, deskripsi, lokasi, konfirmasi.
- Emergency: kata kunci atau lokasi saja → tiket P1 + forward grup.
- Di luar wilkum → redirect 110/Polsek terdekat, tanpa tiket.
- Rate limit: maks 3 tiket aktif / 10 laporan per 24 jam; darurat bypass.
- Forward grup: format tiket + link Maps + command aksi.
- Status pelapor via WhatsApp + command `STATUS`.
- Seed demo WA JID petugas + grup URC (jika `SIGAP_WA_GROUP_URC_JID` diisi).

**Test:**
- 24 smoke test API, termasuk normal flow, emergency P1, luar wilkum, dedup, group command, gateway status, update JID petugas, dan pipeline media.
- 7 unit test normalisasi pesan bot.
- Build bot bundle ±763 KB; API ±620 KB; web ±88 KB gzip.

**Blocker Fase 2:**
- Nomor WA aktual + 2FA belum tersedia untuk pairing nyata.
- JID grup URC aktual belum diisi.
- Live location update lanjutan belum diuji dengan perangkat nyata.

### 2026-11-14 — Fase 3 inti selesai (media WhatsApp)

**API (`apps/api`):**
- Migrasi `0002_media.sql`: `ticket_id` nullable, staging per pelapor/chat, unique `wa_message_id`, kolom `caption`.
- `POST /internal/media` (multipart, token internal) dengan batas gambar 16 MB, video/audio 64 MB.
- Simpan file di `SIGAP_MEDIA_DIR/YYYY/MM/<uuid>.<ext>` di luar webroot.
- SHA-256, MIME validation, thumbnail JPEG 520 px via sharp, EXIF GPS via exifr.
- Video memakai `jpegThumbnail` dari WhatsApp; audio memakai durasi dari metadata WA.
- Media staging otomatis dibersihkan setelah 24 jam (sweep 6 jam).
- `GET /api/media/:id` dan `/thumb` dengan sesi petugas, range request untuk video/audio, dan `?download=1`.
- Bhabin hanya bisa mengakses media tiket di wilayahnya; media staging ditolak untuk bhabin.
- Media otomatis terhubung ke tiket saat tiket dibuat atau saat `/selesai` dari grup.
- `GET /api/tickets/:id` sekarang mengembalikan `media[]` (URL, thumb, hash, dimensi, durasi, EXIF GPS, caption).

**Bot (`apps/bot`):**
- `downloadMediaMessage` + retry 3x, lalu upload multipart ke API.
- Foto, video, voice note 1:1 diunduh dan dilampirkan ke laporan.
- Foto grup dengan caption `/selesai <tiket>` diunduh dan dilampirkan sebagai bukti.
- Kegagalan unduh/upload dikirim sebagai `mediaError` agar warga mendapat panduan.

**Web (`apps/web`):**
- Galeri media di detail tiket: thumbnail foto, poster video, pemutar voice note.
- Lightbox foto/video, pemutar audio, unduh, metadata ukuran/dimensi/durasi/SHA-256/EXIF GPS.
- Placeholder Fase 3 dihapus.

**Test:**
- 24 smoke test API (termasuk upload, thumbnail, range, dedup, batas 16 MB, video poster, audio, lampiran tiket, `/selesai` + foto).
- 7 test normalisasi bot (termasuk foto grup).
- Uji manual: upload PNG 1600×1000, thumbnail 520×325, serving 200/206, tampil di dashboard.

**Blocker Fase 3:**
- HEIC belum didukung; WhatsApp umumnya mengirim JPEG.
- Video/audio asli belum diuji dari perangkat WhatsApp nyata.
- Tawaran “pakai GPS foto?” ke pelapor belum dibuat; GPS EXIF hanya ditampilkan ke petugas.

### 2026-11-14 — Fase 4 inti selesai (dashboard inti)

**Peta:**
- Leaflet + tile OpenStreetMap (terang) setelah revisi; polygon wilayah dari database, label batas wilkum, pin status/kategori.
- Peta interaktif penuh di halaman Peta dengan filter status/kategori/wilayah.
- Mini-map Live Board juga memakai Leaflet dan ikut SSE.
- Fallback tetap menampilkan polygon/pin jika tile gagal.

**Eskalasi P1:**
- Worker API setiap 60 detik.
- Pawas dieskalasi jika P1 belum di-ack melewati ambang (default 3 menit).
- Kapolsek dieskalasi jika P1 belum OTW melewati ambang (default 10 menit).
- Event tiket, audit `ticket.escalate`, outbox WA ke Pawas/Kapolsek/grup URC, dan SSE `ticket.escalated`.
- Kolom `escalated_pawas_at`/`escalated_kapolsek_at` mencegah duplikasi; tiket demo dikecualikan.

**Serah terima:**
- Halaman shift dengan ringkasan tiket aktif, P1, tanpa petugas, ditunda.
- Checklist P1/tunda/nama/media + catatan shift + nama petugas masuk + tanda tangan nama.
- API `GET/POST /api/handover`, tabel `shifts` diperluas (`checklist_json`, `signed_by_name`, `incoming_name`), audit `handover.submit`.

**Keamanan & audit:**
- Tombol tampilkan nomor pelapor (30 detik) dengan audit `reporter.phone.reveal`; bhabin ditolak.
- Audit viewer di halaman Data untuk admin/pawas, filter aksi dan pencarian.
- TOTP setup/enable di Pengaturan untuk semua petugas.
- Tiket manual dari Live Board (form lengkap + consent).
- Deteksi duplikat radius 500 m / 60 menit, merge membatalkan sumber, memindahkan media, dan menulis audit `ticket.merge`.
- Keyboard `J/K`, `/`, `W` (wall), `Esc`; mode dinding menyembunyikan rail dan search.
- Unduh media eksplisit tetap tercatat di audit.

**Test & verifikasi:**
- 28 smoke test API, termasuk eskalasi, handover, reveal PII, duplikat, merge.
- Manual browser E2E: login → peta → tiket manual → terima → OTW → tiba → selesai, reveal nomor, merge duplikat, serah terima, audit viewer, wall mode, keyboard J/K.
- Web build ±140 KB gzip (Leaflet + CSS).

**Blocker Fase 4:**
- Playwright belum dipasang; E2E baru manual via browser.
- Tile peta membutuhkan internet; fallback skematik belum menyediakan jalan.
- Threshold eskalasi belum diuji dengan waktu tunggu nyata 3/10 menit (diuji dengan backdate + pemanggilan worker).
- Tanda tangan serah terima masih nama + audit, bukan tanda tangan digital tersertifikasi.

### 2026-11-14 — Fase 5 inti selesai (analitik, admin, PWA)

**Analitik (`apps/api` + web):**
- API `GET /api/analytics/summary` diperluas: volume 14 hari, heatmap 7×24 WIB, hotspot ±100 m, p90 ack/OTW/tutup, persentase P1 ack/OTW terhadap target.
- Dashboard analitik: bar volume, heatmap, titik rawan, SLA, kategori, wilayah, status.
- Filter bulan untuk laporan; data tetap dibatasi wilayah untuk bhabin.

**Export:**
- CSV (`/api/export/tickets.csv`) dengan BOM + proteksi formula injection.
- Excel (`/api/export/tickets.xlsx`) dengan sheet Tiket + Ringkasan.
- PDF bulanan (`/api/export/monthly.pdf`) dengan ringkasan, kategori, wilayah, daftar tiket, dan nomor halaman.
- Semua export menulis audit `export.csv/xlsx/pdf`.

**Digest:**
- Worker digest setiap 15 menit setelah pukul 07:00 WIB; dedup harian via settings `daily_digest_last`.
- Endpoint manual `POST /api/system/digest` (admin/pawas/kapolsek).
- Penerima: Kapolsek + grup URC; isi: laporan baru, P1, selesai, aktif, median ack, kategori, antrean.

**Admin & registry:**
- CRUD grup WA (`/api/wa-groups`) + toggle aktif di Pengaturan.
- Form tambah petugas (username, nama, role, password, JID, wilayah).
- Registry pelapor (`/api/reporters`) dengan masking nomor, blokir/buka blokir + alasan.
- Blokir ditegakkan di flow WhatsApp dan tiket manual.
- Data page punya tab Audit dan Pelapor.

**PWA & performa:**
- `manifest.webmanifest`, ikon 192/512/SVG, service worker cache shell + runtime asset.
- Service worker hanya registrasi di production; dev melakukan unregister.
- Push handler ada di service worker; subscription/VAPID diselesaikan di Fase 6.
- Halaman besar di-lazy-load; Leaflet dipisah ke chunk sendiri.
- Initial JS turun dari ±141 KB menjadi ±88 KB gzip; Leaflet ±45 KB dimuat saat peta dibutuhkan.
- Fokus keyboard, `aria-current`, `aria-pressed`, dan live region toast.

**Test & verifikasi:**
- 33 smoke test API saat Fase 5 (total akhir 47 setelah revisi JID, /id, gateway), termasuk analytics lengkap, CSV/XLSX/PDF, digest + dedup, grup, pelapor, blokir.
- Manual browser: analitik + heatmap + hotspot, export CSV/Excel/PDF, digest, tab pelapor, form petugas/grup, peta lazy.
- Production preview: manifest + service worker aktif, cache `sigap-shell-v2`, peta tetap termuat.
- Build API ±671 KB; bot ±763 KB; web initial ±88 KB + Leaflet lazy ±45 KB.

**Blocker Fase 5 (diselesaikan/dicatat di Fase 6):**
- Kategori/template pesan masih fixed di kode; belum bisa diedit admin.
- Web Push subscription/VAPID diselesaikan di Fase 6.
- Export PDF memakai Helvetica bawaan, belum ada logo/ttd pimpinan.
- Digest terjadwal belum diuji melewati pukul 07:00 WIB nyata (diuji manual paksa + dedup).

### 2026-11-14 — Fase 6 selesai (hardening)

**Keamanan:**
- Review auth/session/CSRF/IDOR di `docs/13-SECURITY-REVIEW.md`.
- CSRF origin allowlist untuk semua request mutating; logout merevokasi sesi.
- Blokir lintas wilayah bhabin diuji (403).
- Nomor telepon disimpan AES-256-GCM + hash HMAC untuk lookup; tidak ada plaintext.
- MIME spoof ditolak (decode sharp), path traversal media ditolak, SVG/HTML tidak diterima.
- Rate limit login 5/15 menit (429), API global 300/menit, reveal 30/menit.
- `pnpm audit --prod` bersih setelah Drizzle 0.45.2 + override uuid 11.1.1.
- Log tidak memuat body/phone/QR; internal token dibandingkan timing-safe.

**Operasional:**
- Backup harian: integrity check, gzip, retensi 30 hari, opsional age/gpg, media rsync.
- Restore drill: `integrity_check=ok`, 8 tiket, 4 migrasi, **653 ms**.
- Healthcheck: API, disk ≥85%, WAL >512 MB, outbox pending >15 menit.
- systemd unit + timer + alert webhook; runbook failure drill.
- Load test 20 laporan (140 request): **2,1 detik**, p50 7 ms, p95 16 ms, max 443 ms.

**Test:**
- 49 smoke test API (termasuk CSRF, revoke, IDOR, rate limit, MIME spoof, traversal, outbox reclaim, phone encryption, push, normalisasi JID, /id, gateway control).
- 23 unit domain + 9 bot = **81 test**.
- Lighthouse login (production preview): **Accessibility 100, Best Practices 100, SEO 100**.

### 2026-11-14 — Fase 7 inti selesai (UAT, pelatihan, launch)

**UAT (`docs/14-UAT-HASIL.md`):**
- UAT-01..20: **15 lulus**, 4 sebagian (perangkat/lapangan), 1 menunggu voice note WA nyata.
- Tidak ada bug P1/P2 terbuka di lingkungan simulasi.
- Perbaikan dari UAT: status SSE LIVE, peta terang, GPS EXIF otomatis, proteksi formula CSV, blokir pelapor, PWA preview.

**Deliverable:**
- Materi pelatihan piket, URC/Bhabin, admin (`docs/15-PELATIHAN.md`).
- Poster warga PNG/SVG (`docs/assets/poster-warga.png`), QR `wa.me` + template nomor.
- Storyboard video 90 detik (`docs/23-VIDEO-WARGA.md`); MP4 belum direkam.
- Rencana pilot/soft launch/full launch + rollback (`docs/16-LAUNCH-PLAN.md`).

**Blocked lapangan:**
- E7-08..E7-12: pilot 1 kelurahan, evaluasi, soft launch, full launch, hypercare.
- Butuh nomor WA nyata + 2FA, grup URC/JID petugas, polygon resmi, domain/VPS, dan waktu berjalan.

### 2026-11-14 — Fase 8 selesai (dokumen operasional)

- SOP final + halaman pengesahan (`docs/08-SOP.md`).
- Runbook deploy/rollback/pairing/WA ban/backup/restore/failure drill/insiden (`docs/17-RUNBOOK.md`).
- Panduan admin (`docs/18`), piket 1 halaman (`docs/19`), warga (`docs/20`).
- Template serah terima kredensial (`docs/21`), jadwal review bulanan (`docs/22`).
- README indeks dokumen diperbarui sampai `docs/23`.

### 2026-11-14 — Polish akhir

- Basemap peta diganti ke **OpenStreetMap terang** (tanpa API key, fallback Esri); label polygon, legenda, dan kontras diperjelas.
- Filter invert tile lama dihapus; peta tidak lagi gelap/tertutup watermark.
- Web Push lengkap: VAPID, `push_subscriptions`, subscribe/unsubscribe/test, push P1 baru + eskalasi Pawas/Kapolsek.
- Metadata + `robots.txt` ditambahkan; Lighthouse SEO naik ke 100.
- Login footer diperbarui ke Fase 5.
- DB dev direset ke 8 tiket demo, 0 media, 0 sesi, 0 audit, 0 outbox.

### 2026-11-15 — Fase 9: pairing WhatsApp dari dashboard + audit

**Gateway WhatsApp:**
- Migrasi `0005_wa_gateway.sql`: tabel `wa_gateway` menyimpan status, QR PNG data URL, TTL, phone, error, command queue, heartbeat bot.
- API admin: `GET /api/system/gateway`, `POST connect/disconnect/logout/restart` (rate limit 10/menit + audit).
- Kanal internal bot: `GET /internal/wa/control`, `POST /internal/wa/control/ack`, `POST /internal/wa/qr`.
- Bot poll command tiap 2,5 detik; QR langsung dikirim ke API, tidak lagi ditulis ke terminal/file.
- Bot tanpa sesi start idle; connect dari dashboard memunculkan QR. Logout menghapus sesi dan memungkinkan ganti nomor.
- Settings: kartu **WhatsApp Gateway** dengan QR, status, BOT ONLINE/OFFLINE, tombol connect/disconnect/restart/logout.
- Topbar WA status sekarang nyata (AKTIF/PAIRING/OFFLINE), bukan hardcoded.
- Command grup `/id` untuk menemukan ID grup sebelum didaftarkan.

**Audit & hardening:**
- Fixed IDOR bhabin tanpa wilayah (tiket + media).
- TOTP secret dienkripsi AES-256-GCM; test baru.
- Media `Cache-Control: private, no-store`; log request tanpa query string.
- Web Push endpoint privat/loopback ditolak (SSRF).
- Caddy: API/health/internal dipisah dari fallback SPA; cache asset immutable; shell/SW no-cache.
- systemd `UMask=0077`; bot auth dir `0700`; backup gagal jika media tidak bisa dibackup; healthcheck datetime fix; load-test guard production; sourcemap produksi opt-in.
- Audit lengkap: `docs/25-AUDIT-KODE.md` (35 temuan, alasan, rekomendasi).

**Test & build:**
- 49 smoke API + 23 unit domain + 9 bot = **81 test**.
- Build API ±702 KB; bot ±768 KB; web initial ±88 KB gzip; Leaflet ±45 KB.

### 2026-11-16 — Uji WhatsApp nyata: media, nomor penuh, `/otw`

**Perbaikan:**
- Chat 1:1 berbasis LID: `participant=""` tidak lagi membuat `senderJid` kosong; bot memilih JID nomor telepon (`remoteJidAlt`/`participantAlt`) dan API fallback ke `chatJid`.
- Media laporan (foto/video/voice note) sekarang **benar-benar diteruskan** ke grup URC, bukan hanya teks. Outbox `kind=media` + endpoint internal `GET /internal/media/:id`; bot mengirim image/video/audio dengan caption.
- Media darurat yang dikirim menyusul ikut diteruskan per media; media laporan normal diteruskan saat tiket dibuat.
- Nomor pelapor di grup/eskalasi mengikuti setting **Masking PII**: `false` = nomor penuh; dashboard tetap masked + reveal ber-audit.
- `/otw` dan command lain: bot menyebut role pengirim + role yang diizinkan. Nomor tak terdaftar kini dibalas, bukan didiamkan.
- Label Settings diperjelas: masking berlaku untuk notifikasi WhatsApp.
- Pesan status ke pelapor memakai bahasa operasional: “Status pelaporan dengan nomor tiket … sedang jalan ke TKP”, “… sudah tiba di TKP”, “… sudah selesai ditangani”, dst. Transisi dari dashboard juga mengirim update ke pelapor.
- Settings → Petugas: **Edit** (nama, pangkat, role, wilayah, aktif) dan **Hapus**. Akun dengan riwayat tiket/shift dinonaktifkan + sesi dicabut; akun tanpa riwayat dihapus permanen.
- Settings → Wilayah: **Hapus** polygon. Wilayah yang masih dipakai tiket/petugas dinonaktifkan dan bisa **Aktifkan** lagi; tanpa riwayat dihapus permanen.

**Verifikasi live:**
- Upload + download internal media: `200 image/jpeg`, byte identik.
- Outbox media live ke nomor bot: status `sent`, tanpa penolakan server.
- Status pelapor baru diuji lewat `/otw`, `/tiba`, `/selesai` di API test.
- Build API 702,19 KB; bot 768,10 KB; web initial 283,69 KB (88,47 KB gzip).

---

## 3. Keputusan yang sudah diambil

| Tanggal | Keputusan | Alasan | Dokumen |
|---|---|---|---|
| 2026-11-14 | Semua warga boleh lapor | Cakupan & adopsi | ADR-005 |
| 2026-11-14 | Geofence TKP, bukan pelapor | Logika operasional | ADR-005 |
| 2026-11-14 | Nama wajib + darurat bypass | Keselamatan + anti-hoax | ADR-005 |
| 2026-11-14 | Baileys only (v1) | Kebutuhan grup + instruksi | ADR-001 |
| 2026-11-14 | Tanpa Docker | Instruksi + kesederhanaan | ADR-002 |
| 2026-11-14 | SQLite + Drizzle | Volume & operasional | ADR-003 |
| 2026-11-14 | SSE | Sederhana, cukup | ADR-004 |
| 2026-11-14 | Vite React SPA | Cepat, statis | ADR-007 |
| 2026-11-14 | Tidak kumpulkan NIK v1 | Minimisasi data | ADR-006 |
| 2026-11-14 | Session cookie + Argon2id | Revocation mudah | ADR-017 |
| 2026-11-14 | tsup + migrasi lokal | Deploy tanpa Docker | ADR-018 |
| 2026-11-14 | CSS tokens, bukan Tailwind | Fidelity desain | ADR-019 |
| 2026-11-14 | Config-first unit/wilkum/WA/SLA | Data final belum ada | ADR-015 |
| 2026-11-14 | DPO sementara project owner | Atensi Kapolsek | ADR-016 |
| 2026-11-14 | Bot sebagai transport, state machine di API | Satu sumber kebenaran + audit | ADR-020 |
| 2026-11-14 | Media di disk di luar webroot + serve ber-sesi | Bukti tidak publik; kontrol akses | ADR-021 |
| 2026-11-14 | Leaflet + polygon DB + tile OpenStreetMap | Peta operasional ringan, tanpa API key, fallback Esri | ADR-022 |
| 2026-11-14 | Serah terima = nama + audit, bukan ttd digital | Cepat dipakai, jejak tetap ada | ADR-023 |
| 2026-11-14 | Export dibuat di API (CSV/XLSX/PDF), bukan client | Konsisten, bisa diaudit, tidak membebani browser | ADR-024 |
| 2026-11-14 | PWA cache shell saja, API tidak pernah dicache | Data sensitif tidak tersimpan di cache publik | ADR-025 |
| 2026-11-14 | Basemap peta terang (OpenStreetMap) | Keterbacaan operasional, tanpa API key | ADR-022 |
| 2026-11-14 | Web Push VAPID untuk P1/eskalasi | Notifikasi cepat saat dashboard tidak dibuka | ADR-025 |
| 2026-11-14 | Export dibuat di API + formula injection guard | Konsisten, aman, audit | ADR-024 |

---

## 4. Metrik

| Metrik | Target | Aktual |
|---|---|---|
| Dokumen selesai | 8 | 26 + poster |
| Prototipe layar | 6 | 6 |
| Screenshot | 5 | 14 (10 prototipe + 4 aplikasi) |
| Skenario UAT terdefinisi | 20 | 20 |
| Task backlog | 150 | 157 |
| Keputusan terbuka | ≤ 5 | 0 (Q-01..Q-07 dijawab) |
| Test domain | - | 23 lulus |
| Test API | - | 48 lulus |
| Test bot | - | 7 lulus |
| Total test | - | **81 lulus** |
| Load test | 50 laporan/jam | 20 laporan/2,1 dtk (p95 16 ms) |
| Restore drill | < 5 menit | 653 ms, integrity ok |
| Lighthouse login | ≥ 90 | 100/100/100 |
| Dependency audit | 0 high/critical | 0 vulnerability |
| Build API | - | ±702 KB |
| Build bot | - | ±768 KB |
| Web initial | ≤ 150 KB gzip | ±88 KB gzip |
| Web Leaflet lazy | — | ±45 KB gzip |

---

## 5. Risiko yang sedang dipantau

Lihat `07-RISIKO.md`. Yang paling relevan sekarang:
- R-01 Nomor WA diblokir.
- R-02 Laporan palsu terkoordinasi.
- R-03 Dashboard tidak dipantau.
- R-04 Data pribadi bocor.
- R-06 Baileys breaking change.
- R-18 HP pairing mati/offline.
- R-19 Media bukti hilang/rusak atau bocor (lihat ADR-021 dan backup `SIGAP_MEDIA_DIR`).

---

## 6. Catatan perubahan

| Versi | Tanggal | Perubahan |
|---|---|---|
| 0.1 | 2026-11-14 | Dokumen awal, prototipe dimulai |
| 0.2 | 2026-11-14 | Fase 1 inti: API, web shell, auth, tiket, SSE, test, build |
| 0.3 | 2026-11-14 | Fase 2 inti: Baileys, QR PNG, conversation engine, outbox, group command |
| 0.4 | 2026-11-14 | Fase 3 inti: download/upload media, thumbnail, SHA-256, EXIF GPS, serving ber-sesi, galeri dashboard |
| 0.5 | 2026-11-14 | Fase 4 inti: peta Leaflet, eskalasi P1, serah terima, reveal PII, duplikat/merge, audit viewer, dinding, keyboard |
| 0.6 | 2026-11-14 | Fase 5 inti: analitik lanjutan, export CSV/XLSX/PDF, digest, admin grup/petugas, blokir pelapor, PWA, code splitting |
| 0.7 | 2026-11-14 | Fase 6: security review, CSRF/rate limit/IDOR, enkripsi phone, backup+restore, load test, Lighthouse 100, audit dependensi |
| 0.8 | 2026-11-14 | Fase 7–8: UAT 15/20 lulus, pelatihan, poster, launch plan, SOP final, runbook, panduan admin/piket/warga, review bulanan |
| 0.9 | 2026-11-14 | Polish: peta terang, Web Push VAPID, EXIF GPS otomatis, metadata/robots, reset DB demo |
| 1.0 | 2026-11-15 | Revisi UI: default tema terang + toggle gelap, peta OSM tanpa API key + label wilkum, input nomor/ID grup otomatis JID, panduan penggunaan |
| 1.1 | 2026-11-15 | Fase 9: pairing WhatsApp dari dashboard, gateway state DB, /id, audit 35 temuan + hardening |
| 1.2 | 2026-11-16 | Uji WA nyata: fallback LID 1:1, forward media ke grup, nomor penuh via setting, pesan role command |









