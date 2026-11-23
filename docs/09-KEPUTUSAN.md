# 09 — Architecture Decision Records (ADR)

**Format:** ringkas. Setiap keputusan punya konteks, keputusan, konsekuensi, dan alternatif yang ditolak.

---

## ADR-001 — Full Baileys untuk v1

**Status:** Accepted (dengan risiko diterima)
**Tanggal:** 14 November 2026

**Konteks:** Kebutuhan utama adalah bot 1:1 untuk warga dan **posting otomatis ke grup URC**. WhatsApp Business Cloud API resmi tidak mendukung posting ke grup. WAHA membutuhkan Docker, yang tidak diizinkan.

**Keputusan:** Gunakan **Baileys 7.x** untuk semua kebutuhan WhatsApp, dengan:
- nomor khusus (bukan pribadi),
- sesi disimpan di luar webroot,
- auto-reconnect & healthcheck,
- abstraksi `WaGateway` agar bisa pindah ke Cloud API/hybrid,
- nomor cadangan & SOP migrasi.

**Konsekuensi:**
- ✅ Bisa grup, media, lokasi, voice note, tanpa biaya per percakapan.
- ❌ Melanggar ToS WhatsApp; risiko ban.
- ❌ Rentan breaking change saat WhatsApp Web update.
- ❌ Perlu operasi sesi (QR, HP pairing, 2FA).

**Alternatif ditolak:**
- Cloud API: tidak bisa grup; biaya per conversation; butuh verifikasi bisnis.
- WAHA: Docker.
- Vendor BSP: biaya bulanan, kontrol terbatas, tetap tidak bisa grup.

**Exit plan:** hybrid (Cloud API untuk 1:1, Baileys untuk grup internal) atau full Cloud API + notifikasi grup via kanal lain.

---

## ADR-002 — Tanpa Docker

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Instruksi pimpinan. Server single-VPS, satu aplikasi, tim kecil.

**Keputusan:** Deploy dengan **systemd + Caddy + Node.js** di Ubuntu 24.04. Tidak ada container.

**Konsekuensi:**
- ✅ Lebih mudah di-debug, lebih sedikit layer, overhead rendah.
- ✅ systemd sudah ada, journald, restart, OnFailure.
- ❌ Tidak ada isolasi container; andalkan systemd hardening + user non-root.
- ❌ Reproducibility lebih rendah; butuh runbook dan pin versi.
- ❌ Native module (`better-sqlite3`, `sharp`) harus cocok dengan OS.

**Alternatif ditolak:** Docker/Podman (instruksi), PM2 (layer tambahan).

---

## ADR-003 — SQLite + Drizzle, bukan Postgres/PostGIS

**Status:** Accepted (revisit jika volume naik)
**Tanggal:** 14 November 2026

**Konteks:** Satu Polsek, estimasi < 1.000 tiket/bulan, < 20 user dashboard. PostGIS dibutuhkan hanya untuk query geospasial kompleks; kebutuhan kita point-in-polygon sederhana.

**Keputusan:** **SQLite WAL + Drizzle ORM**; polygon disimpan sebagai GeoJSON dan dihitung dengan **Turf.js**. Satu proses API menjadi satu-satunya penulis.

**Konsekuensi:**
- ✅ Nol operasional DB, backup file, cepat untuk read.
- ✅ Tidak perlu PostGIS/ekstensi.
- ❌ Writer tunggal; tidak cocok untuk multi-instance.
- ❌ Query geospasial terbatas; cukup untuk kebutuhan.
- ⚠️ Harus disiplin: `busy_timeout`, WAL, transaksi pendek.

**Migrasi:** skema memakai `unit_id`; Drizzle bisa pindah ke Postgres. Migrasi jika > 2.000 tiket/hari atau butuh HA.

**Alternatif ditolak:** Postgres + PostGIS (overkill, operasional lebih berat), MySQL (tidak ada keunggulan).

---

## ADR-004 — SSE, bukan WebSocket/polling

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Dashboard butuh update tiket real-time; aksi tetap HTTP. Tidak perlu bidirectional.

**Keputusan:** **Server-Sent Events** (`text/event-stream`) + HTTP untuk aksi. Heartbeat 15 detik, `Last-Event-ID`, fallback polling 15 detik.

**Konsekuensi:**
- ✅ Lebih sederhana dari WebSocket, auto-reconnect bawaan browser.
- ✅ Cocok dengan Caddy/Fastify.
- ❌ Satu arah; tidak untuk chat.
- ❌ Butuh perhatian proxy buffering (Caddy: flush).
- ❌ Multi-instance butuh pub/sub (tidak sekarang).

**Alternatif ditolak:** WebSocket (kompleksitas), polling (boros, lambat).

---

## ADR-005 — Semua warga, geofence TKP, nama wajib dengan bypass darurat

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Pimpinan ingin semua warga bisa lapor, bukan hanya RT/RW/Camat. Harus tetap dibatasi wilkum dan tetap ada nama pelapor.

**Keputusan:**
1. Semua nomor WA boleh melapor.
2. Yang divalidasi adalah **lokasi kejadian**, bukan domisili pelapor.
3. Nama wajib untuk tiket normal.
4. Darurat: tiket dibuat lebih dulu, nama dilengkapi menyusul.
5. Di luar wilkum: redirect ke 110/Polsek terdekat, tanpa tiket.

**Konsekuensi:**
- ✅ Cakupan luas, tidak bergantung pada data RT/RW yang sering berubah.
- ✅ Respons darurat tidak tertunda.
- ❌ Perlu anti-hoax berlapis (rate limit, reputasi, cluster, verifikasi).
- ❌ Perlu data polygon yang akurat.
- ❌ Perlu kebijakan penanganan nama tidak lengkap.

**Alternatif ditolak:** whitelist RT/RW (terlalu sempit, data cepat berubah), radius (tidak akurat).

---

## ADR-006 — Tidak mengumpulkan NIK di v1

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Nama + nomor WA cukup untuk operasional awal. NIK menambah risiko data pribadi dan beban verifikasi.

**Keputusan:** v1 hanya nama, nomor WA, consent. NIK/KK tidak diminta. Jika perlu verifikasi identitas, dilakukan lisan/telepon oleh piket.

**Konsekuensi:**
- ✅ Minimisasi data, risiko lebih rendah.
- ✅ Onboarding cepat.
- ❌ Tidak ada verifikasi identitas kuat.
- ❌ Laporan palsu lebih sulit dilacak secara formal.

**Alternatif ditolak:** NIK wajib (risiko, friksi), OTP SMS (biaya, kompleksitas).

---

## ADR-007 — Vite + React SPA, bukan Next.js

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Dashboard internal, butuh cepat, statis, dan real-time. Tidak butuh SEO/SSR.

**Keputusan:** **Vite + React 19 + Tailwind 4**, SPA, served by Caddy. Auth via cookie ke API Fastify. Code splitting per route.

**Konsekuensi:**
- ✅ Build cepat, bundle kecil, deployment statis.
- ✅ Tidak ada server Node untuk render web.
- ❌ Tidak ada SSR; tidak masalah untuk dashboard.
- ❌ Harus disiplin code splitting.

**Alternatif ditolak:** Next.js (SSR tidak perlu, deploy lebih berat), HTMX (kurang cocok untuk state kompleks).

---

## ADR-008 — Media di disk + hash, bukan S3

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Volume media Polsek kecil; biaya S3 dan kompleksitas tidak sepadan. Bukti harus utuh dan bisa diaudit.

**Keputusan:** Simpan media di `/var/lib/sigap/media`, di luar webroot, dengan path terstruktur, SHA-256, thumbnail terpisah, akses via endpoint berautentikasi.

**Konsekuensi:**
- ✅ Sederhana, murah, cepat.
- ✅ File asli utuh; backup mudah.
- ❌ Tidak ada redundansi cloud otomatis; andalkan backup.
- ❌ Kapasitas disk harus dipantau.
- ❌ Tidak cocok untuk multi-instance tanpa shared storage.

**Alternatif ditolak:** S3/MinIO (biaya/operasional), database BLOB (buruk untuk file besar).

---

## ADR-009 — UI "quiet command center", gelap, padat, cepat

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Ruang piket, monitor besar, shift malam, informasi padat. Referensi Awwwards cenderung eksperimental; kita ambil disiplin command center, bukan animasi berat.

**Keputusan:** Dark UI, aksen amber, tipografi Instrument Sans + JetBrains Mono, peta gelap, animasi minimal, mode dinding. Fokus pada keterbacaan 2 meter dan kecepatan.

**Konsekuensi:**
- ✅ Nyaman untuk shift malam, fokus pada data.
- ✅ Cepat, sedikit efek.
- ❌ Tidak cocok untuk ruangan sangat terang tanpa mode terang.
- ❌ Perlu uji kontras & aksesibilitas.

**Alternatif ditolak:** light-first (kurang nyaman malam), WebGL/animasi berat (mengganggu, lambat).

---

## ADR-010 — Monorepo pnpm, bot & API proses terpisah

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Bot dan API punya siklus hidup berbeda; bot sering reconnect, API harus stabil.

**Keputusan:** Monorepo pnpm dengan `apps/api`, `apps/bot`, `apps/web`, `packages/core`, `packages/config`. Dua systemd service terpisah.

**Konsekuensi:**
- ✅ Kode domain dipakai bersama; satu repo, satu versi.
- ✅ Restart bot tidak mematikan dashboard.
- ❌ Build/deploy sedikit lebih kompleks.
- ❌ Perlu disiplin dependency antar-package.

**Alternatif ditolak:** satu proses monolitik (restart bot = dashboard down), repo terpisah (sinkronisasi sulit).

---

## ADR-011 — Nomor tiket harian per unit

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Petugas perlu nomor pendek yang mudah disebut di grup/telepon. Nomor harus unik dan tidak race.

**Keputusan:** Format `{UNIT}-{YYMMDD}-{NNN}`, contoh `BKS-261114-014`. Sequence harian di transaksi DB dengan unique constraint; reset 00:00 WIB.

**Konsekuensi:**
- ✅ Mudah dibaca & diucapkan.
- ✅ Tidak bergantung pada UUID.
- ❌ Tidak boleh dipakai sebagai ID internal (tetap pakai UUID).
- ❌ Perlu penanganan timezone.

**Alternatif ditolak:** UUID saja (sulit diucapkan), nomor global (panjang).

---

## ADR-012 — Outbox pattern, tanpa Redis

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Pesan WA harus terkirim meskipun bot/API restart. Tidak ingin menambah Redis (Docker/operasional).

**Keputusan:** Tabel `outbound_messages` sebagai outbox; bot poll API setiap 500 ms–2 detik; retry backoff; dead-letter setelah 8 percobaan.

**Konsekuensi:**
- ✅ Andal, sederhana, terlihat di DB.
- ✅ Tidak ada dependency tambahan.
- ❌ Latensi pengiriman minimal (poll interval).
- ❌ Perlu indeks & pembersihan.

**Alternatif ditolak:** Redis/BullMQ (dependency), kirim langsung (rawan hilang).

---

## ADR-013 — Alarm browser + eskalasi WA

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Browser memblokir audio sebelum interaksi; piket bisa tidak melihat layar.

**Keputusan:** Tombol "Aktifkan suara" per shift; alarm berjenjang; ack; eskalasi WA ke Pawas/Kapolsek; mode dinding; web push untuk pimpinan.

**Konsekuensi:**
- ✅ Lebih tahan terhadap human error.
- ❌ Perlu disiplin klik suara setiap shift.
- ❌ Eskalasi WA bergantung gateway yang sama; sediakan telepon manual.

**Alternatif ditolak:** hanya suara (tidak cukup), hanya WA (tidak real-time).

---

## ADR-014 — Retensi 12 bulan + legal hold

**Status:** Accepted (disetujui 14 November 2026)
**Tanggal:** 14 November 2026

**Konteks:** Data pribadi tidak boleh disimpan selamanya; perkara perlu disimpan lebih lama.

**Keputusan:** Tiket non-perkara 12 bulan; perkara sampai selesai + 5 tahun; percakapan 90 hari; audit 12 bulan. Legal hold mengalahkan purge.

**Konsekuensi:**
- ✅ Risiko & biaya penyimpanan turun.
- ❌ Perlu job purge & audit.
- ❌ Perlu kebijakan permintaan subjek data.

**Alternatif ditolak:** simpan selamanya (risiko), 30 hari (terlalu pendek untuk analisis).

---

## ADR-015 — Config-first untuk identitas Polsek, wilkum, nomor WA, dan SLA

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Pimpinan belum menetapkan Polsek final, sumber polygon, pemilik nomor WA, dan domain. Menunda coding sampai semua final akan memblokir pengembangan; hardcode akan menyulitkan perubahan.

**Keputusan:**
- Identitas unit (kode, nama, alamat, timezone) disimpan di **settings/env**.
- Daftar kelurahan + polygon diunggah lewat **menu Pengaturan** (GeoJSON), dengan seed demo yang ditandai `is_demo`.
- Nomor WA, pemilik, dan status 2FA disimpan di **Pengaturan**, bukan di kode.
- SLA dan jalur eskalasi disimpan di **Pengaturan**; default P1 ack 2 menit/OTW 5 menit, eskalasi Pawas 3 menit, Kapolsek 10 menit.
- Domain/hosting ditunda; fase 1 memakai localhost/staging.

**Konsekuensi:**
- ✅ Fase 1 bisa jalan tanpa menunggu data final.
- ✅ Ganti Polsek/wilkum/nomor tidak perlu deploy ulang.
- ❌ Perlu validasi input admin dan audit perubahan.
- ❌ Seed demo harus bisa dibersihkan sebelum produksi.

---

## ADR-016 — DPO sementara: project owner di bawah Kapolsek

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Belum ada pejabat formal yang ditunjuk sebagai penanggung jawab data.

**Keputusan:** Project owner (pengguna) menjadi **DPO sementara** dengan atensi langsung dari Kapolsek. Nama dicatat di Pengaturan. Keputusan retensi 12 bulan + legal hold disetujui.

**Konsekuensi:**
- ✅ Ada penanggung jawab operasional untuk akses, retensi, dan insiden.
- ❌ Bukan pengganti penunjukan formal jika kebijakan Polri mensyaratkan pejabat tertentu.
- ❌ Perlu review formal sebelum produksi.

---

## ADR-017 — Session cookie + Argon2id, bukan JWT

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Dashboard internal, satu origin, butuh revoke sesi dan cookie aman. JWT menambah kompleksitas revocation.

**Keputusan:** Sesi opaque 256-bit di cookie HttpOnly/SameSite=Lax, hash token di tabel `sessions`, password Argon2id (`@node-rs/argon2`), TOTP opsional per akun. CSRF dicek lewat Origin.

**Konsekuensi:**
- ✅ Revoke sesi mudah; tidak ada token di localStorage.
- ✅ Tidak perlu refresh-token flow.
- ❌ Perlu store sesi di DB (sudah ada).
- ❌ Cookie Secure wajib di produksi (divalidasi config).

---

## ADR-018 — Build API dengan tsup + migrasi lokal

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Workspace TypeScript (`@sigap/core`, `@sigap/config`) tidak bisa langsung dijalankan Node tanpa build; deployment tanpa Docker butuh artefak sederhana.

**Keputusan:** `tsup` membundel `src/server.ts` menjadi `dist/server.js`, workspace package di-`noExternal`, `better-sqlite3` tetap external. Migrasi SQL disalin ke `dist/migrations` dan `dist/db/migrations` oleh script build. Produksi menjalankan `node dist/server.js`; dev memakai `tsx`.

**Konsekuensi:**
- ✅ Satu file API + migrasi, mudah di-deploy.
- ✅ Tidak perlu compile workspace package terpisah.
- ❌ Perlu ingat copy migrasi saat menambah file SQL.
- ❌ `better-sqlite3` harus cocok dengan Node/OS server.

---

## ADR-019 — Web memakai CSS tokens, bukan Tailwind

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Prototipe sudah punya design system CSS yang detail. Menambahkan Tailwind akan menduplikasi token dan menambah build/runtime.

**Keputusan:** Web React memakai CSS tokens + komponen dari prototipe. Tailwind tidak dipakai di Fase 1; bisa ditambahkan jika tim membutuhkan.

**Konsekuensi:**
- ✅ Fidelity desain tinggi, bundle CSS kecil (13 KB gzip).
- ✅ Tidak ada utility-class drift.
- ❌ Perlu disiplin naming dan komponen.
- ❌ Tidak ada ekosistem utility Tailwind.

---

## ADR-020 — Bot sebagai transport, state machine di API

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Baileys harus menangani koneksi, QR, reconnect, dan pengiriman pesan. Logika percakapan menyentuh tiket, audit, geofence, dan nomor tiket — semuanya ada di API/database.

**Keputusan:**
- Bot hanya menormalkan pesan dan memanggil endpoint internal API.
- API menjalankan state machine, membuat tiket, menulis audit, dan mengisi outbox.
- Bot mengambil outbox dan mengirim pesan; hasilnya dilaporkan kembali.
- Command grup divalidasi API terhadap JID petugas dan grup.

**Konsekuensi:**
- ✅ Satu sumber kebenaran; dashboard dan bot melihat data yang sama.
- ✅ Bot bisa restart tanpa kehilangan state percakapan.
- ✅ Mudah diuji tanpa socket WhatsApp.
- ❌ Bot dan API harus selalu terhubung; jika API mati, bot tidak bisa memproses pesan.
- ❌ Outbox polling menambah latensi ~1,5 detik.
- ❌ Perlu token internal dan endpoint lokal yang aman.

---

## ADR-021 — Media di disk luar webroot, disajikan lewat API ber-sesi

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Bukti foto/video/voice note adalah data pribadi dan alat bukti. Media tidak boleh dapat diakses tanpa login, tidak boleh dieksekusi sebagai konten web, dan harus tetap ada meskipun server web di-restart.

**Keputusan:**
- File asli disimpan di `SIGAP_MEDIA_DIR` (default `./data/media`), di luar webroot, dengan struktur `YYYY/MM/<uuid>.<ext>`.
- Bot mengunggah media ke `POST /internal/media` memakai token internal; API memvalidasi MIME, ukuran, dan menulis SHA-256.
- Thumbnail JPEG dibuat dengan sharp; EXIF GPS diekstrak dengan exifr dan disimpan terpisah dari file asli.
- Media dapat diunggah sebelum tiket ada (`ticket_id` nullable, `status = staged`) dan ditautkan saat tiket dibuat atau saat `/selesai` grup.
- Dashboard mengakses media lewat `GET /api/media/:id` dan `/thumb` dengan sesi petugas; range request didukung untuk video/audio.
- Media staging tanpa tiket dihapus otomatis setelah 24 jam.
- Backup database dan folder media harus konsisten (lihat `infra/`).

**Konsekuensi:**
- ✅ Media tidak dapat diakses publik atau di-hotlink tanpa sesi.
- ✅ Konten berbahaya tidak dieksekusi karena MIME dibatasi dan `X-Content-Type-Options: nosniff`.
- ✅ Bukti tetap tersedia meskipun tiket belum dibuat (darurat).
- ❌ Harus ada backup folder media, bukan hanya SQLite.
- ❌ Serving video/audio menambah beban I/O; range request menjaga memori tetap kecil.
- ❌ HEIC belum dikonversi karena build sharp tanpa libheif.

---

## ADR-022 - Leaflet + polygon dari database + tile OpenStreetMap

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Peta harus menunjukkan wilayah hukum dan pin tiket secara operasional, bukan snapshot statis. Polygon sudah tersimpan sebagai GeoJSON di SQLite; tidak ingin menambah tile server sendiri.

**Keputusan:**
- Web memakai Leaflet (SVG renderer) dan menarik polygon dari `GET /api/regions`.
- Tile memakai OpenStreetMap (terang, tanpa API key) dengan atribusi; fallback Esri; jika tile gagal, polygon/pin tetap tampil di latar terang.
- Pin dibuat sebagai `divIcon` (status/kategori/P1), bukan marker gambar.
- Mini-map Live Board dan halaman Peta memakai komponen Leaflet yang sama.
- Judul/tooltip di-escape sebelum dimasukkan ke HTML Leaflet.

**Konsekuensi:**
- ✅ Tidak perlu PostGIS/tile server; data wilayah tetap satu sumber.
- ✅ Peta tetap berguna saat offline (polygon + pin).
- ✅ Performa cukup untuk puluhan tiket.
- ❌ Bergantung pada koneksi untuk tile basemap.
- ❌ Penyedia tile melihat viewport peta (bukan data tiket); untuk produksi sensitif, pertimbangkan tile server sendiri.
- ❌ Leaflet menambah ±40 KB gzip.

---

## ADR-023 — Serah terima memakai nama + audit, bukan tanda tangan digital

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Piket butuh serah terima cepat di browser. Tanda tangan digital tersertifikasi menambah vendor, biaya, dan proses hukum yang belum siap.

**Keputusan:**
- Form serah terima mencatat petugas keluar, petugas masuk, checklist, catatan, dan nama penanda tangan.
- Aksi disimpan di tabel `shifts` dan audit `handover.submit`.
- Tanda tangan hanya nama yang diketik; bukan e-signature tersertifikasi.

**Konsekuensi:**
- ✅ Cepat dipakai dan tetap menciptakan jejak audit.
- ✅ Tidak ada dependency pihak ketiga.
- ❌ Tidak memiliki kekuatan pembuktian seperti tanda tangan digital tersertifikasi.
- ❌ Bisa ditingkatkan ke e-signature di fase berikutnya.

---

## ADR-024 — Export laporan dibuat di API

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** Laporan bulanan harus bisa diunduh petugas dan diserahkan ke pimpinan. Data berada di SQLite; browser tidak boleh menerima seluruh dataset untuk diolah sendiri.

**Keputusan:**
- Export CSV, XLSX, dan PDF dibuat di API dari query terfilter.
- CSV memakai BOM dan proteksi formula injection.
- XLSX memakai ExcelJS (sheet Tiket + Ringkasan); PDF memakai PDFKit.
- Semua export menulis audit `export.*` dengan periode dan jumlah tiket.
- Nomor pelapor tetap dimasker di semua export.

**Konsekuensi:**
- ✅ Format konsisten dan bisa direproduksi.
- ✅ Data sensitif tidak dikirim mentah ke browser.
- ✅ Audit unduhan tercatat.
- ❌ Menambah dependency server (ExcelJS, PDFKit).
- ❌ PDF belum memuat logo/ttd pimpinan.
- ❌ Export besar perlu streaming di masa depan; saat ini dibangun di memori.

---

## ADR-025 — PWA hanya cache shell, API tidak pernah dicache

**Status:** Accepted
**Tanggal:** 14 November 2026

**Konteks:** PWA berguna untuk dashboard di HP/tablet, tetapi data tiket dan media bersifat sensitif. Cache API di perangkat bisa meninggalkan data setelah logout.

**Keputusan:**
- Service worker menyimpan app shell, ikon, dan asset statis.
- Request ke `/api/*` dan `/internal/*` selalu bypass cache.
- Navigasi memakai network-first dengan fallback shell; asset memakai cache-first setelah diunduh.
- Service worker hanya didaftarkan di production; dev melakukan unregister agar tidak stale.
- Push handler + subscription/VAPID aktif; P1 baru dan eskalasi Pawas/Kapolsek dikirim ke perangkat yang berlangganan.

**Konsekuensi:**
- ✅ Dashboard bisa membuka shell saat koneksi buruk.
- ✅ Data tiket tidak tersimpan di cache service worker.
- ✅ Asset statis lebih cepat setelah kunjungan pertama.
- ❌ Tanpa jaringan, data tiket tidak tersedia (by design).
- ❌ Web Push bergantung izin browser dan dukungan HTTPS/localhost; alarm SSE tetap menjadi kanal utama.
