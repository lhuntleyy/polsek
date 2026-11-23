# 01 — Kritik Rencana Gemini & Revisi Produk

**Tanggal:** 14 November 2026
**Status:** Final untuk Phase 0
**Konteks:** Rencana awal "WA Bot + Web Dashboard Sederhana" untuk Polsek, dengan perubahan: semua warga boleh lapor (bukan hanya RT/RW/Camat), full Baileys, nama pelapor wajib, tanpa Docker, prototipe dulu.

---

## 1. Verdict

Rencana Gemini **bagus sebagai konsep**, tapi belum aman sebagai sistem operasional kepolisian. Masalah utamanya bukan teknologi, melainkan:

1. **Batas wilayah** disederhanakan jadi "whitelist nomor", padahal yang sebenarnya perlu dibatasi adalah **lokasi kejadian**.
2. **Anti-hoax** tidak dibahas, padahal kanal terbuka untuk semua warga adalah magnet laporan iseng dan serangan koordinasi.
3. **Keselamatan respons** terancam oleh alur bot yang terlalu panjang untuk situasi darurat.
4. **Kewajiban hukum & etika data** (UU PDP, bukti digital, retensi, akses) tidak ada sama sekali.
5. **Sisi manusia** (piket lupa lihat layar, alarm browser tidak bunyi, serah terima shift, nomor WA kena ban) dianggap otomatis jalan.
6. **Estimasi 2–3 minggu** tidak realistis untuk sistem yang menyentuh kepolisian, data pribadi, dan bukti digital.

Di bawah ini 18 lubang utama + solusinya. Yang sudah bagus dari Gemini tetap dipakai: zero-install, WA sebagai kanal, tiket otomatis, dashboard peta, forward ke grup URC, SLA, export laporan, dan admin data wilayah.

---

## 2. Yang sudah benar dan dipertahankan

- **WA sebagai kanal utama.** Adopsi tinggi, tidak perlu instal aplikasi, warga sudah terbiasa kirim foto/lokasi.
- **Tiket otomatis + nomor tiket.** Memaksa proses menjadi terukur dan bisa diaudit.
- **Dashboard piket + peta.** Satu layar kerja lebih baik daripada chat yang tenggelam.
- **Forward ke grup URC.** Petugas lapangan memang hidup di grup WA.
- **Status OTW/Selesai + SLA.** Dasar KPI yang objektif.
- **Rekap bulanan.** Kebutuhan nyata pimpinan.
- **Admin data wilayah.** Penting saat ada pergantian pejabat/RT/RW.

---

## 3. Delapan belas lubang yang harus ditutup

### 3.1 "Polsek Bekasi" belum jelas, dan wilkum bukan radius

**Masalah:** Tidak ada satuan yang namanya "Polsek Bekasi" di jajaran Polres Metro Bekasi Kota; yang ada Polsek Bekasi Selatan, Bekasi Timur, Bekasi Utara, dan lain-lain. Wilkum juga bukan radius 5 km — batasnya adalah **kelurahan/desa** dengan polygon yang bisa saling menempel dan tidak beraturan.

**Solusi:**
- Tetapkan **satu Polsek** dan daftar kelurahan/desa yang menjadi wilkum.
- Simpan **polygon GeoJSON** per kelurahan (sumber: batas administrasi resmi/BAPENDA/OSM yang diverifikasi).
- Validasi dengan **point-in-polygon** (`@turf/boolean-point-in-polygon`), bukan jarak.
- Tampilkan batas kelurahan di peta dashboard agar piket bisa melihat konteks.
- Sediakan **override manual** oleh piket dengan alasan wajib + audit log, untuk kasus batas ambigu.

### 3.2 Yang dibatasi adalah TKP, bukan domisili pelapor

**Masalah:** Kalau aturannya "hanya warga Bekasi", warga Bekasi yang melapor kejadian di luar Bekasi tetap lolos, dan orang luar yang melihat kejadian di Bekasi justru ditolak. Yang relevan secara operasional adalah **lokasi kejadian**.

**Solusi:**
- Geofence berlaku pada **koordinat TKP**.
- Pelapor boleh dari mana saja, selama TKP berada di wilkum.
- Jika TKP di luar wilkum → balasan jelas: "Lokasi kejadian di luar wilayah Polsek X. Silakan hubungi 110 atau Polsek Y (link/kontak)." Jangan otomatis meneruskan data ke Polsek lain tanpa prosedur.
- Jika koordinat tidak ada: minta pin, atau pilih kelurahan, atau ketik alamat. Alamat teks diverifikasi piket, bukan dipercaya mentah.

### 3.3 Semua warga boleh lapor = pintu masuk hoax, swatting, dan laporan massal

**Masalah:** Gemini membayangkan whitelist RT/RW. Begitu dibuka untuk semua warga, tidak ada lagi filter sosial. Satu orang bisa mengirim 50 laporan palsu; sekelompok orang bisa membanjiri satu lokasi untuk menguras patroli.

**Solusi berlapis:**
- **Nama wajib** + nomor WA sebagai identitas akun (tidak perlu NIK di v1).
- **Rate limit:** maksimal 3 tiket terbuka per nomor, 10 laporan/hari, jeda 60 detik antar pengiriman. Darurat tetap dibuat, tapi ditandai untuk verifikasi.
- **Reputasi pelapor:** jumlah laporan, rasio laporan valid, riwayat "palsu". Bukan untuk menolak otomatis, tapi untuk memberi konteks ke piket.
- **Deteksi duplikat & cluster:** laporan sejenis dalam radius ±300 m dan 30 menit digabung sebagai satu cluster, bukan 20 tiket terpisah.
- **Verifikasi telepon balik** untuk laporan bernilai tinggi atau yang polanya mencurigakan.
- **Peringatan konsekuensi hukum** di pesan pertama dan sebelum kirim.
- **Blokir nomor** oleh admin, dengan audit.
- **Jangan pernah** menampilkan nomor pelapor penuh di grup; cukup masked.

### 3.4 "Nama wajib" vs laporan darurat yang tidak boleh tertunda

**Masalah:** Kalau bot menolak membuat tiket sebelum nama diisi, orang yang melaporkan tawuran bisa berhenti di tengah flow dan tidak pernah menyelesaikan laporan. Ini bertentangan dengan tujuan keselamatan.

**Solusi — dua jalur:**
- **Laporan normal:** nama wajib sebelum tiket dibuat.
- **Laporan darurat** (kata kunci darurat, atau kirim lokasi saja): tiket **langsung dibuat** dengan nama sementara `"Belum diisi — DARURAT"`, alarm langsung berbunyi, lalu bot mengejar nama dan detail sebagai follow-up. Piket tetap bisa menelepon nomor pelapor.
- Nama final tetap wajib untuk menutup tiket; jika tidak lengkap, tiket ditandai `data_tidak_lengkap` dan masuk daftar tindak lanjut piket.
- Ini memenuhi prinsip "nama wajib" tanpa mengorbankan respons.

### 3.5 Alur bot terlalu panjang untuk situasi genting

**Masalah:** Menu 1-2-3, kategori, deskripsi, lokasi, foto, konfirmasi — di kondisi tawuran, orang tidak akan menyelesaikannya. Gemini sendiri menyinggung "kata kunci darurat", tapi tidak mendesain konsekuensinya.

**Solusi:**
- **Darurat = satu gerakan.** Kirim lokasi saja, atau ketik `DARURAT`/`TAWURAN`/`KEBAKARAN`/`BEGAL`, langsung membuat tiket prioritas 1 dan alarm dashboard.
- **Menu adaptif:** pengguna baru dapat menu; pengguna lama langsung ke "Apa yang terjadi?".
- **Hybrid, bukan NLP bebas:** teks bebas diterima, tapi bot selalu mengonfirmasi kategori dan lokasi. Jangan mengandalkan klasifikasi otomatis untuk keputusan operasional.
- **Tombol angka, bukan tombol interaktif WA.** Dukungan tombol Baileys tidak konsisten di semua klien; teks bernomor paling aman.
- **Batal di mana saja** dengan `BATAL`, dan **human handoff** ke piket.

### 3.6 Voice note, foto tanpa lokasi, dan live location tidak ditangani

**Masalah:** Warga Indonesia banyak kirim **voice note**. Banyak juga kirim foto tanpa share location. Gemini hanya menyebut "foto/video + share location" seolah semua orang melakukannya dengan benar.

**Solusi:**
- **Voice note diterima** dan disimpan sebagai lampiran; piket mendengarkan di dashboard. Transkripsi otomatis masuk backlog v2, bukan syarat v1.
- **EXIF GPS** diekstrak dari foto. Jika ada, bot menawarkan: "Gunakan lokasi dari foto? 1 Ya / 2 Tidak".
- **Live location** ditangani sampai update terakhir; tampilkan akurasi (meter) dan waktu update.
- **Alamat teks** sebagai fallback, dengan pilihan kelurahan bernomor.
- **Foto/video tanpa lokasi dan tanpa alamat** tidak langsung ditolak; masuk sebagai tiket `lokasi_perlu_verifikasi` agar piket bisa menelepon.

### 3.7 Laporan via telepon dan walk-in tidak ada di rencana

**Masalah:** Tidak semua warga pakai WA, dan banyak laporan masuk lewat telepon piket atau datang langsung. Kalau sistem hanya menerima WA, dashboard bukan sumber kebenaran — ada tiket "di luar sistem" yang tidak terpantau.

**Solusi:**
- Fitur **Tiket Manual** di dashboard: piket memasukkan laporan telepon/walk-in dengan nama pelapor, nomor, lokasi, kategori, dan deskripsi.
- Tiket manual memakai nomor seri yang sama dan masuk antrean yang sama.
- Ini juga menjadi jalur fallback saat WA bot down.
- Tandai sumber: `wa`, `telepon`, `walk-in`, `patroli`, `lainnya`.

### 3.8 Duplikasi laporan tidak ditangani

**Masalah:** Satu tawuran bisa dilaporkan 15 orang. Tanpa penggabungan, dashboard penuh tiket duplikat, SLA kacau, dan petugas tidak tahu mana yang utama.

**Solusi:**
- **Cluster otomatis** berdasarkan kategori + radius + jendela waktu.
- Dashboard menampilkan satu "tiket induk" dengan badge "3 laporan terkait"; detail cluster bisa dibuka.
- Jangan hapus laporan warga; simpan sebagai bukti dan untuk statistik.
- Piket bisa **merge manual** atau **unmerge** dengan audit.

### 3.9 Alarm dashboard tidak cukup — manusia dan browser punya batas

**Masalah:** Gemini menulis "notifikasi suara (alarm/ping)". Faktanya:
- Browser memblokir audio sampai ada interaksi pengguna.
- Monitor bisa mati, kiosk bisa sleep, volume bisa mute.
- Jika piket sedang di TKP, tidak ada yang melihat layar.
- Tidak ada eskalasi kalau tiket tidak di-ack.

**Solusi:**
- Tombol **"Aktifkan suara"** sekali per shift (user gesture), statusnya terlihat di topbar.
- **Alarm berjenjang:** DARURAT = banner persisten + suara + pin berkedip; HIGH = satu kali; NORMAL = toast.
- **Ack wajib.** Jika DARURAT tidak di-ack dalam 3 menit → kirim WA ke Pawas; 10 menit → Kapolsek.
- **Mode Dinding** dengan tipografi besar, auto-select tiket terbaru, dan instruksi kiosk.
- **Web Push** untuk Pawas/Kapolsek di HP (PWA), bukan hanya layar piket.
- **Serah terima piket** menjadi fitur produk, bukan sekadar SOP kertas.
- UPS + failover 4G untuk ruang piket; dashboard read-only cache saat internet putus.

### 3.10 Peran, izin, dan audit tidak dirancang

**Masalah:** Siapa boleh melihat nomor pelapor? Siapa boleh menutup tiket? Siapa boleh mengubah status jadi "palsu"? Siapa boleh mengekspor data? Tanpa RBAC dan audit, sistem ini mudah disalahgunakan atau bocor.

**Solusi:**
- Role: `admin`, `kapolsek`, `pawas`, `piket`, `urc`, `bhabin`. Read-only vs write dipisah.
- **PII masking** default: nomor `0812•••••1234`, nama lengkap hanya untuk role tertentu.
- **Audit log append-only** untuk semua perubahan status, edit data, reveal PII, export, login, dan command grup.
- **2FA (TOTP)** wajib untuk admin dan Kapolsek/Pawas; disarankan untuk semua petugas.
- Session bisa dicabut; password Argon2id; rate limit login.
- Command grup (`/otw`, `/selesai`) hanya valid dari JID petugas yang terdaftar.

### 3.11 UU PDP dan etika data belum disentuh

**Masalah:** Sistem menyimpan nama, nomor telepon, foto, video, voice note, lokasi, dan narasi kejadian. Itu data pribadi, sebagian sensitif. Gemini tidak membahas consent, retensi, akses, breach notification, atau data residency.

**Solusi:**
- **Consent notice** singkat saat pertama chat; simpan versi + waktu consent.
- **Data minimization:** v1 tidak mengumpulkan NIK/KK. Nama + nomor + media sudah cukup untuk operasional.
- **Retensi default 12 bulan** untuk tiket non-perkara; **legal hold** untuk yang terkait penyidikan.
- **Akses berbasis peran + audit**; enkripsi backup; server di Indonesia bila memungkinkan.
- **Breach response:** prosedur 3×24 jam sesuai UU PDP No. 27/2022 (notifikasi ke subjek data dan otoritas).
- **Hak subjek data:** kanal permintaan akses/koreksi/penghapusan, dengan pengecualian kepentingan penyidikan.
- **Jangan pernah** menjadikan dashboard sebagai arsip abadi tanpa kebijakan retensi.

### 3.12 Bukti digital tidak dijaga integritasnya

**Masalah:** Foto TKP bisa menjadi bukti di kemudian hari. Kalau file bisa diubah, timestamp bisa diedit, dan tidak ada chain of custody, nilai pembuktiannya lemah.

**Solusi:**
- Hitung **SHA-256** setiap file saat ingest; simpan hash + ukuran + MIME + waktu + pengunggah.
- Simpan file asli **di luar webroot**, akses via endpoint berautentikasi, bukan URL publik.
- **Audit log immutable** untuk setiap akses/unduh.
- **Export manifest** (tiket + hash + timeline) untuk keperluan penyidikan.
- Strip EXIF pada **derivatif** (thumbnail), bukan pada file asli; file asli tetap utuh untuk bukti.
- Sinkronkan waktu server dengan NTP.

### 3.13 Arsitektur real-time dan pengiriman belum jelas

**Masalah:** "Dashboard real-time" tanpa mekanisme = polling. "Bot auto-forward" tanpa retry = pesan hilang saat WA disconnect. "Baileys" tanpa idempotensi = tiket ganda.

**Solusi:**
- **SSE** (Server-Sent Events) untuk dashboard: satu arah, auto-reconnect, lebih sederhana dari WebSocket. Aksi tetap via HTTP.
- **Outbox pattern** untuk pesan keluar: simpan di DB, worker kirim, retry dengan backoff, dead-letter queue.
- **Idempotensi** berdasarkan `msg.key.id`; abaikan history sync dan pesan `append`.
- **Satu penulis DB:** API memiliki database; bot memanggil API internal, bukan menulis DB langsung.
- **Ack lintas monitor:** satu piket klik "Terima", layar lain langsung sinkron.
- **Fallback polling** 15 detik jika SSE gagal.

### 3.14 Deployment "tanpa Docker" butuh detail operasional

**Masalah:** "Tanpa Docker" bukan berarti "tanpa operasi". Gemini tidak menjelaskan systemd, reverse proxy, TLS, backup, monitoring, log rotation, atau rollback.

**Solusi:**
- **Ubuntu 24.04 LTS**, Node.js 22/24 LTS, pnpm.
- **systemd** unit terpisah: `sigap-api.service`, `sigap-bot.service`; `Restart=always`, `OnFailure=` alert.
- **Caddy** sebagai reverse proxy + HTTPS otomatis; web statis di-serve Caddy.
- **SQLite WAL** + backup harian `VACUUM INTO`/backup API, media di-rsync, backup terenkripsi ke lokasi terpisah.
- **Monitoring**: health endpoint, cron ping, Uptime Kuma (native Node, tanpa Docker), alert ke WA admin.
- **Log**: journald + rotasi; request ID; jangan log isi pesan/PII.
- **Rollback**: rilis berbasis direktori + symlink, simpan 3 versi terakhir.
- **UPS + 4G failover** di ruang piket, bukan di server.
- **NTP** aktif.

### 3.15 SQLite/Postgres/PostGIS: jangan over-engineering

**Masalah:** Gemini menyarankan PostgreSQL + PostGIS. Untuk satu Polsek dengan puluhan laporan/hari, itu beban operasional yang tidak perlu, apalagi tanpa Docker. Tapi SQLite juga tidak boleh dipakai sembarangan (multi-writer, backup).

**Solusi:**
- **SQLite + Drizzle ORM** untuk v1, WAL mode, satu proses API sebagai penulis.
- **Polygon** disimpan sebagai GeoJSON dan dihitung dengan **Turf** di aplikasi; tidak perlu PostGIS.
- **`unit_id`** ada di skema sejak hari pertama, supaya bisa naik ke multi-Polsek/Polres tanpa migrasi besar.
- Jika volume >±2.000 tiket/hari atau butuh multi-instance, migrasi ke **Postgres + PostGIS**; siapkan jalur migrasinya, jangan dibangun sekarang.

### 3.16 Timeline 2–3 minggu tidak realistis

**Masalah:** 2–3 minggu cukup untuk demo, bukan untuk sistem yang:
- menyentuh data pribadi,
- dipakai 24/7,
- punya bukti digital,
- perlu UAT piket/URC,
- perlu SOP dan pelatihan,
- dan harus tahan saat nomor WA kena ban.

**Solusi:** **6–8 minggu** untuk MVP produksi dengan 1 developer + dukungan operasional paruh waktu. Rincian di `04-RENCANA.md`. Yang bisa dipercepat: prototipe (sudah), dashboard read-only, dan bot happy-path. Yang tidak boleh dipercepat: UAT, uji geofence, uji ban/downtime, dan kajian data.

### 3.17 Adopsi dan perubahan organisasi tidak dihitung

**Masalah:** Sistem sebagus apa pun mati kalau RT/RW tidak tahu, piket tidak mengecek, dan URC tidak memakai command. Gemini hanya menyebut "sosialisasi" sekilas.

**Solusi:**
- **Poster QR** di kantor kelurahan, pos RW, balai warga, dan grup WA RT/RW.
- **Video 90 detik** cara lapor.
- **Hari simulasi** bersama piket, URC, dan Bhabin sebelum launch.
- **Champion per shift** (satu orang yang paham sistem).
- **Umpan balik** ke pelapor: tiket diterima, OTW, selesai — ini yang membuat warga percaya dan lapor lagi.
- **Laporan mingguan ke Kapolsek** otomatis, bukan menunggu diminta.
- **Fallback** yang dipublikasikan: jika bot tidak merespons dalam 2 menit, hubungi 110/piket.

### 3.18 Metrik bisa digaming dan tidak lengkap

**Masalah:** "Response time" dari laporan masuk sampai klik OTW bisa dicurangi dengan klik OTW lebih awal. "Selesai" bisa dicurangi dengan menutup tiket tanpa penanganan.

**Solusi:**
- Ukur **median dan p90**, bukan rata-rata.
- Metrik: waktu ack, waktu OTW, waktu tiba (jika ada bukti lokasi), waktu tutup, **% tiket dengan bukti penanganan**, **% laporan palsu**, **% tiket tanpa nama lengkap**, **coverage kelurahan** (berapa kelurahan yang pernah lapor), **repeat location**.
- Audit sampel: 10 tiket acak/bulan dicek Pawas.
- Jangan jadikan angka sebagai satu-satunya penilaian kinerja; gunakan untuk perbaikan rute dan pelatihan.

---

## 4. Hal-hal kecil yang juga sering terlewat

| Hal | Kenapa penting | Solusi |
|---|---|---|
| Nomor WA adalah aset institusi | Kalau atas nama pribadi, saat pejabat mutasi sistem bisa hilang | Daftarkan atas nama unit, SIM aktif, 2FA PIN di safes, serah terima terdokumentasi |
| HP pairing harus online | Baileys adalah linked device; jika HP mati total, pairing bisa hilang | HP Android khusus di ruang piket, charger permanen, internet cadangan |
| Bot harus anggota grup URC | Tidak bisa baca/kirim jika bukan anggota | Undang bot; jika grup "admin only", jadikan bot admin |
| Kuota media | Video 50 MB bisa gagal kirim ke grup | Kirim thumbnail + deep link dashboard; batasi ukuran |
| Nama file & folder | Path traversal / file hilang | Nama acak, metadata di DB, storage di luar webroot |
| Zona waktu | Tiket malam bisa salah tanggal | Simpan UTC, tampilkan WIB, nomor tiket pakai tanggal WIB |
| Nomor tiket | Race condition saat dua laporan bersamaan | Sequence harian di transaksi DB, unique constraint |
| Deep link dashboard | Petugas malas mencari tiket di grup | URL `https://.../tiket/BKS-...` dengan auth |
| Pencarian | Piket butuh cepat | Cari nomor tiket, nama, nomor HP, kelurahan; keyboard shortcut |
| Aksen & bahasa | Warga tidak paham istilah polisi | Bahasa Indonesia sederhana, hindari istilah hukum di bot |
| Kategori ≠ delik | Bot tidak boleh menentukan pasal | Kategori hanya triase; klasifikasi hukum oleh piket/Reskrim |
| Laporan di luar jam | Warga tetap lapor 02:00 | Bot tetap buat tiket; alarm tetap; SLA dibedakan |
| Serah terima | Tiket menggantung saat ganti shift | Fitur handover + checklist + tanda tangan |
| Backup belum pernah di-restore | Backup rusak baru ketahuan saat emergency | Drill restore bulanan, catat hasilnya |
| Domain `.go.id` | Prosesnya administratif, tidak instan | Siapkan domain sementara; jangan janjikan `.go.id` di awal |
| Kiosk browser | Browser bisa sleep/update | Panduan kiosk, disable sleep, auto-login terkontrol, UPS |
| Listrik & internet | Dua hal yang paling sering mati | UPS minimal 30 menit + router 4G failover |
| Data lama | Retensi tanpa purge = risiko | Job purge otomatis + legal hold |
| Akses admin | Satu orang resign = sistem terkunci | Minimal 2 admin, dokumentasi handover |

---

## 5. Revisi terhadap rencana Gemini

| Rencana Gemini | Revisi SIGAP | Alasan |
|---|---|---|
| Whitelist RT/RW/Lurah/Camat | **Semua warga**, dengan nama wajib + rate limit + reputasi | Cakupan lebih luas, tetapi perlu kontrol anti-hoax |
| Validasi wilayah via radius | **Polygon kelurahan**, validasi TKP | Batas administratif tidak berbentuk radius |
| Format bebas + menu angka | **Hybrid**: menu untuk awam, teks bebas dengan konfirmasi | Teks bebas rawan salah kategori |
| PostgreSQL + PostGIS | **SQLite + Turf** (v1) | Volume Polsek, tanpa Docker, operasional sederhana |
| Next.js/React | **Vite + React SPA** untuk dashboard | Cepat, statis, tanpa SSR; peta & SSE lebih sederhana |
| Alarm suara di dashboard | **Alarm berjenjang + ack + eskalasi WA + mode dinding** | Browser & manusia punya batas |
| Forward foto/video ke grup | **Thumbnail + deep link** untuk media besar | Batas WhatsApp & risiko spam |
| 2–3 minggu | **6–8 minggu** | UAT, hukum, hardening, adopsi |
| Export PDF/Excel | **Export + daily digest + manifest bukti** | Kebutuhan pimpinan & penyidikan |
| Cloud API anti-banned | **Baileys sesuai permintaan**, dengan exit plan ke Cloud API/hybrid | Cloud API tidak mendukung grup; keputusan sadar risiko |

---

## 6. Prinsip produk hasil revisi

1. **Keselamatan dulu, struktur kemudian.** Darurat tidak boleh menunggu formulir lengkap.
2. **Satu laporan = satu tiket yang bisa dilacak.** Tidak ada laporan yang "hilang di chat".
3. **Wilkum mengikat TKP, bukan orang.** Semua warga boleh melapor.
4. **Nama wajib, tetapi darurat tidak ditahan.** Nama menyusul, respons jalan.
5. **Piket adalah pengguna utama.** Dashboard harus bisa dipakai sambil berdiri, di monitor besar, dalam 5 detik.
6. **Bukti dijaga, data dihormati.** Hash, audit, retensi, masking.
7. **Bot boleh pintar, tetapi keputusan tetap di manusia.** Kategori bot = triase, bukan vonis.
8. **Rencanakan kegagalan.** WA bisa ban, internet bisa putus, piket bisa lupa. Sistem harus tetap punya jalur.
9. **Adopsi adalah fitur.** Poster, pelatihan, umpan balik, champion.
10. **Ukur yang benar, bukan yang mudah.** Median/p90, bukti penanganan, bukan sekadar klik.

---

## 7. Yang harus diputuskan pimpinan sebelum coding

Lihat `10-PERTANYAAN-TERBUKA.md`. Yang paling memblokir:

1. Polsek mana, dan daftar kelurahan wilayah hukumnya.
2. Siapa pemilik nomor WA dan siapa yang memegang 2FA.
3. Target SLA dan jalur eskalasi (Pawas/Kapolsek).
4. Kebijakan retensi data dan siapa yang menjadi penanggung jawab data.
5. Batas kewenangan piket dalam menutup/menolak tiket.
6. Anggaran VPS/domain/nomor dan siapa yang merawat setelah serah terima.
