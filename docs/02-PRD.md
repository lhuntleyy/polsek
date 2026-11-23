# 02 — PRD: SIGAP

**Nama kerja:** SIGAP — Sistem Informasi Gangguan & Aduan Publik
**Versi:** 0.1 (draft untuk review pimpinan)
**Tanggal:** 14 November 2026
**Pemilik produk:** Kapolsek (contoh: Polsek Bekasi Selatan)
**Product lead / developer:** _diisi_
**Reviewer:** Pawas, Kanit SPKT, Kanit Reskrim, Bhabinkamtibmas, operator data, kajian hukum

---

## 1. Ringkasan

SIGAP adalah kanal pelaporan warga berbasis WhatsApp yang otomatis mengubah pesan menjadi tiket di dashboard piket. Warga cukup chat, kirim lokasi/foto/voice note; sistem membuat nomor tiket, menampilkan di layar piket, meneruskan ke grup URC, dan mencatat seluruh perjalanan tiket sampai selesai.

Berbeda dari rencana awal, **semua warga boleh melapor**, bukan hanya perangkat wilayah. Batas wilayah diterapkan pada **lokasi kejadian**, bukan pada identitas pelapor. Nama pelapor wajib, dengan pengecualian respons darurat agar nyawa tidak menunggu formulir.

## 2. Latar belakang & masalah

| Masalah hari ini | Dampak |
|---|---|
| Laporan warga tersebar di WA pribadi, telepon, dan mulut ke mulut | Tidak ada satu sumber kebenaran; laporan bisa hilang |
| Tidak ada nomor tiket | Sulit dilacak, sulit dilaporkan ke pimpinan |
| Piket tidak tahu laporan mana yang paling mendesak | Respons tidak konsisten |
| Tidak ada catatan waktu | Kinerja tidak terukur, sulit evaluasi |
| Laporan duplikat membanjiri grup | Petugas bingung, patroli boros |
| Data pelapor dan bukti tidak terkelola | Risiko hukum dan kebocoran data |
| Warga tidak tahu laporan ditangani atau tidak | Kepercayaan turun, warga berhenti lapor |

## 3. Tujuan & indikator keberhasilan

### 3.1 Tujuan produk

1. Menjadikan WhatsApp sebagai pintu masuk laporan warga yang **cepat, sederhana, dan tanpa instal aplikasi**.
2. Menjadikan dashboard piket sebagai **satu layar kerja** untuk menerima, memverifikasi, mendisposisi, dan menutup tiket.
3. Menghubungkan piket, URC, dan Bhabinkamtibmas dalam satu alur yang **tercatat waktunya**.
4. Menyediakan data yang bisa dipertanggungjawabkan untuk **laporan pimpinan** dan **kebutuhan penyidikan**.
5. Menjaga data pribadi warga sesuai prinsip perlindungan data.

### 3.2 Indikator (6 bulan pertama)

| Indikator | Target |
|---|---|
| Laporan warga yang menjadi tiket | ≥ 90% dari laporan yang masuk |
| Waktu dari pesan dikirim sampai tiket muncul | ≤ 60 detik (p90) |
| Tiket P1 di-ack piket | ≤ 2 menit (p90, jam operasional) |
| Tiket P1 di-OTW | ≤ 5 menit (p90) |
| Tiket ditutup dengan catatan penanganan | ≥ 95% |
| Laporan tanpa nama lengkap saat ditutup | ≤ 2% |
| Laporan palsu/duplikat yang teridentifikasi | Terukur, bukan target nol (pelaporan palsu tidak boleh dihalangi secara kaku) |
| Dashboard time-to-interactive | ≤ 2 detik pada 4G |
| Kelurahan yang pernah mengirim laporan | 100% dalam 3 bulan |
| Kepuasan piket (survei internal) | ≥ 4/5 |

> Metrik internal, bukan janji layanan publik. Jangan mencantumkan SLA ke poster warga kecuali sudah disetujui pimpinan.

## 4. Non-tujuan (v1)

- Aplikasi mobile native.
- Integrasi langsung/otomatis ke sistem Polri (tidak ada asumsi API publik).
- Penentuan pasal/delik otomatis. Kategori bot hanya triase.
- Live tracking patroli/AVL.
- Transkripsi voice note otomatis (v2).
- Broadcast massal ke warga.
- Multi-Polsek dalam satu UI (skema siap, UI belum).
- Face recognition/CCTV analytics.
- Pembayaran/denda.
- Web form publik untuk non-WA (bisa v1.1).
- Pengganti hotline 110 atau SPKT. SIGAP adalah kanal tambahan.

## 5. Pengguna & peran

| Persona | Kebutuhan utama | Yang tidak boleh dilakukan |
|---|---|---|
| **Warga** (Bu Siti, 38, Android mid-range) | Lapor cepat, tidak perlu install, tahu status | Melihat data pelapor lain |
| **Ketua RT/RW/Lurah** | Melaporkan atas nama warga, memantau tindak lanjut | Menutup tiket |
| **Piket SPKT** (Bripka Andi, shift 12 jam) | Melihat antrean, ack, telepon, disposisi, tutup tiket | Mengubah konfigurasi sistem |
| **URC** (Aiptu Rina) | Terima disposisi, OTW, tiba, selesai + bukti | Menutup tiket tanpa bukti |
| **Bhabinkamtibmas** | Mendapat tiket kelurahannya, update komunitas | Melihat wilayah lain (kecuali diizinkan) |
| **Pawas** | Supervisi, eskalasi, audit sampel | Menghapus audit |
| **Kapolsek** | Rekap, tren, kualitas respons, keputusan | Operasi harian (kecuali darurat) |
| **Admin** | Kelola wilayah, petugas, grup, konfigurasi | Melihat isi percakapan tanpa alasan |
| **DPO/penanggung jawab data** | Audit akses, retensi, permintaan subjek data | Mengubah tiket |

## 6. Prinsip produk

1. **Darurat tidak menunggu formulir.**
2. **Satu laporan = satu tiket yang bisa dilacak.**
3. **Wilkum mengikat TKP, bukan orang.**
4. **Nama wajib, respons darurat tetap jalan.**
5. **Piket adalah pengguna utama.**
6. **Bot menriase, manusia memutuskan.**
7. **Bukti dijaga, data dihormati.**
8. **Rencanakan kegagalan.**
9. **Adopsi adalah fitur.**
10. **Ukur yang benar.**

## 7. Alur utama

### 7.1 Warga — laporan darurat

```
Warga kirim lokasi / "TAWURAN"
        ↓ < 5 detik
Bot: "Laporan DARURAT diterima. Tim sedang dihubungi.
     Sebutkan nama Anda untuk konfirmasi."
        ↓
Tiket P1 dibuat + alarm dashboard + forward grup URC
        ↓
Bot menanyakan nama, detail singkat, foto (opsional)
        ↓
Piket menelepon balik jika diperlukan
```

**Aturan:** lokasi saja sudah cukup untuk membuat tiket. Nama menyusul. Jangan menanyakan menu.

### 7.2 Warga — laporan normal

```
"Lapor" / "1"
  → Nama (jika nomor baru) + consent
  → Kategori (1-5 atau teks)
  → Deskripsi (teks / voice note)
  → Lokasi kejadian (pin / kelurahan / alamat)
  → Foto/video (opsional, maks 10)
  → Konfirmasi ringkasan
  → Tiket dibuat + nomor tiket + estimasi respons
```

Maksimal 6 langkah. Bisa `BATAL` kapan saja. Jika pengguna sudah pernah lapor, nama dan consent tidak ditanya lagi (bisa diubah dengan `NAMA`).

### 7.3 Warga — di luar wilkum

```
Lokasi terdeteksi di luar polygon wilkum
  → "Lokasi kejadian berada di luar wilayah Polsek X.
      Untuk respons cepat, hubungi 110 atau Polsek Y:
      [nama, alamat, nomor].
      Jika ini sebenarnya di dalam wilayah kami, balas 'BANTU'."
  → Tidak ada tiket dibuat
  → Percobaan dicatat minimal (hash nomor, waktu, kelurahan terdekat) untuk analisis
```

### 7.4 Piket — menerima & mendisposisi

```
Dashboard berbunyi + banner
  → Piket buka tiket
  → Cek nama, nomor, lokasi, media
  → "Terima" (ack) → status DITERIMA
  → Pilih unit: URC / Bhabin / Reskrim / Damkar (koordinasi)
  → Tambah catatan → "Disposisi"
  → Bot kirim ke grup URC + tag Bhabin
```

### 7.5 URC — dari grup WA

```
Bot: "#BKS-261114-014 | TAWURAN | Pekayon Jaya
     Pelapor: Rizky M. (0812•••••134)
     Lokasi: maps.google.com/...
     Dashboard: https://.../t/BKS-261114-014
     Aksi: /otw 014 | /tiba 014 | /selesai 014 [foto]"
        ↓
/otw 014  → status OTW, bot balas ETA & nama petugas
/tiba 014 → status DI TKP
/selesai 014 + foto → status SELESAI, foto masuk bukti
        ↓
Warga dapat notifikasi: "Laporan #014 sedang ditangani..."
```

### 7.6 Warga — cek status

```
"STATUS BKS-261114-014" atau "STATUS" (untuk tiket terakhir dari nomor itu)
  → status terkini + waktu + catatan publik (bukan catatan internal)
```

### 7.7 Piket — laporan telepon/walk-in

```
Dashboard → "Tiket Manual"
  → Nama, nomor, kategori, lokasi (pin/kelurahan), deskripsi
  → Simpan → tiket masuk antrean yang sama
  → Sumber ditandai "telepon" / "walk-in"
```

### 7.8 Serah terima shift

```
Dashboard → "Serah Terima"
  → Daftar tiket terbuka + tiket tanpa nama + tiket menunggu verifikasi
  → Catatan shift
  → Petugas keluar & masuk menandatangani (klik + PIN/TOTP)
  → Rekap dikirim ke grup piket
```

## 8. Kebutuhan fungsional

Prioritas: **M** = must (v1), **S** = should (v1 if possible), **C** = could (v2).

### 8.1 Bot WhatsApp

| ID | Requirement | Prioritas |
|---|---|---|
| FR-BOT-01 | Bot menerima pesan 1:1 dan grup; mengabaikan history sync dan pesan lama | M |
| FR-BOT-02 | Bot menyapa pengguna baru, menampilkan ringkasan layanan, consent, dan hotline 110 | M |
| FR-BOT-03 | Bot mendeteksi kata kunci darurat dan/atau pesan lokasi tanpa teks → buat tiket P1 segera | M |
| FR-BOT-04 | Bot menanyakan nama untuk pengguna baru; nama wajib untuk tiket normal | M |
| FR-BOT-05 | Bot menerima kategori via angka atau teks, lalu mengonfirmasi | M |
| FR-BOT-06 | Bot menerima deskripsi teks dan voice note | M |
| FR-BOT-07 | Bot menerima locationMessage, liveLocationMessage, dan alamat teks | M |
| FR-BOT-08 | Bot mengekstrak GPS dari EXIF foto dan menawarkan penggunaan lokasi | M |
| FR-BOT-09 | Bot menerima foto/video sampai batas ukuran, menyimpan metadata | M |
| FR-BOT-10 | Bot memvalidasi TKP terhadap polygon wilkum | M |
| FR-BOT-11 | Bot mengarahkan TKP di luar wilkum ke 110/Polsek terdekat | M |
| FR-BOT-12 | Bot membuat nomor tiket unik dan mengirim ringkasan ke pelapor | M |
| FR-BOT-13 | Bot mengirim update status ke pelapor (diterima/OTW/selesai) | M |
| FR-BOT-14 | Bot mendukung `BATAL`, `STATUS`, `NAMA`, `BANTU` | M |
| FR-BOT-15 | Bot meneruskan tiket ke grup URC dengan format ringkas + deep link | M |
| FR-BOT-16 | Bot memproses command grup `/otw`, `/tiba`, `/selesai`, `/tunda`, `/status` hanya dari JID petugas terdaftar | M |
| FR-BOT-17 | Bot mendeteksi dan menandai duplikat/cluster | S |
| FR-BOT-18 | Bot membatasi laju laporan per nomor dan menandai anomali | M |
| FR-BOT-19 | Bot menyimpan status percakapan dengan TTL; follow-up masuk ke tiket terbuka | M |
| FR-BOT-20 | Bot memiliki fallback jika media gagal diunduh: tiket tetap dibuat, media ditandai gagal | M |
| FR-BOT-21 | Bot mengirim pesan penutup + tautan survei kepuasan (opsional) | C |
| FR-BOT-22 | Bot mendukung bahasa Indonesia sederhana; istilah hukum dihindari | M |

### 8.2 Dashboard piket

| ID | Requirement | Prioritas |
|---|---|---|
| FR-DASH-01 | Login dengan password + TOTP untuk admin/Pawas; session aman | M |
| FR-DASH-02 | Live queue dengan status, prioritas, kategori, kelurahan, umur tiket | M |
| FR-DASH-03 | Peta wilkum dengan pin tiket, warna status, dan polygon kelurahan | M |
| FR-DASH-04 | Detail tiket: pelapor, lokasi, media, deskripsi, timeline, audit | M |
| FR-DASH-05 | Aksi: Terima, Disposisi, OTW, Tiba, Selesai, Tunda, Tolak, Gabung cluster | M |
| FR-DASH-06 | Alarm berjenjang + ack + eskalasi jika tidak di-ack | M |
| FR-DASH-07 | Pencarian tiket (ID, nama, nomor, kelurahan) + filter | M |
| FR-DASH-08 | Tiket manual (telepon/walk-in) | M |
| FR-DASH-09 | Mode Dinding: tipografi besar, auto-select tiket baru, status koneksi | S |
| FR-DASH-10 | Serah terima shift dengan checklist dan tanda tangan | M |
| FR-DASH-11 | Catatan internal (tidak dikirim ke pelapor) | M |
| FR-DASH-12 | Riwayat perubahan status + siapa yang mengubah | M |
| FR-DASH-13 | Deep link per tiket, bisa dibuka dari grup WA | M |
| FR-DASH-14 | Indikator SLA per tiket (ack, OTW, tiba, tutup) | M |
| FR-DASH-15 | Duplicate cluster view + merge/unmerge | S |
| FR-DASH-16 | Peta panas (heatmap) per jam/kelurahan | S |
| FR-DASH-17 | Export tiket/daftar ke CSV/Excel | S |
| FR-DASH-18 | PWA + Web Push untuk Pawas/Kapolsek | S |
| FR-DASH-19 | Keyboard shortcut (`j/k`, `a`, `o`, `s`, `/`) | S |
| FR-DASH-20 | Read-only cache saat offline; aksi antre saat online | C |
| FR-DASH-21 | Tampilan mobile responsif untuk Pawas | M |
| FR-DASH-22 | Masking nomor telepon; reveal dengan audit | M |
| FR-DASH-23 | Indikator status gateway WA, outbox, dan backup | M |
| FR-DASH-24 | Audit log viewer (admin) | M |
| FR-DASH-25 | Aksesibilitas: kontras, fokus, label, ukuran font | M |

### 8.3 Analitik & laporan

| ID | Requirement | Prioritas |
|---|---|---|
| FR-AN-01 | Volume laporan per hari/minggu/bulan | M |
| FR-AN-02 | Volume per kelurahan, kategori, jam | M |
| FR-AN-03 | SLA median/p90: ack, OTW, tiba, tutup | M |
| FR-AN-04 | Laporan palsu/duplikat per periode | M |
| FR-AN-05 | Titik rawan (repeat location) | S |
| FR-AN-06 | Rekap harian otomatis ke Kapolsek (WA/PDF) | S |
| FR-AN-07 | Export laporan bulanan PDF/Excel siap cetak | M |
| FR-AN-08 | Filter periode dan kelurahan | M |

### 8.4 Administrasi

| ID | Requirement | Prioritas |
|---|---|---|
| FR-ADM-01 | CRUD wilayah + upload/validasi polygon GeoJSON | M |
| FR-ADM-02 | CRUD petugas + role + JID WhatsApp | M |
| FR-ADM-03 | CRUD grup URC/Bhabin + konfigurasi command | M |
| FR-ADM-04 | CRUD kategori, prioritas, template pesan | M |
| FR-ADM-05 | Konfigurasi SLA dan jalur eskalasi | S |
| FR-ADM-06 | Blokir/unblokir nomor + alasan | M |
| FR-ADM-07 | Konfigurasi retensi + legal hold | S |
| FR-ADM-08 | Import data awal (CSV) | S |
| FR-ADM-09 | Manajemen sesi perangkat + revoke | M |
| FR-ADM-10 | Audit semua perubahan konfigurasi | M |

### 8.5 Integrasi & ekspor

| ID | Requirement | Prioritas |
|---|---|---|
| FR-INT-01 | Export CSV/Excel/PDF | M |
| FR-INT-02 | Deep link tiket | M |
| FR-INT-03 | Webhook keluar (opsional, untuk Polres) | C |
| FR-INT-04 | Template laporan bulanan | M |
| FR-INT-05 | Tidak ada integrasi otomatis ke sistem Polri di v1 | M |

## 9. Aturan bisnis

### 9.1 Wilkum & geofence

1. Wilkum = kumpulan polygon kelurahan/desa yang ditetapkan Kapolsek.
2. Validasi dilakukan terhadap **titik TKP**, bukan lokasi HP pelapor.
3. Akurasi > 100 m atau titik di luar polygon tetapi < 250 m dari batas → status `perlu_verifikasi`, tiket tetap dibuat.
4. Titik jauh di luar wilkum → redirect, tidak ada tiket.
5. Alamat teks/kelurahan → tiket `lokasi_teks`, piket verifikasi.
6. Override manual wajib alasan + audit.
7. Perubahan polygon harus melalui admin + backup versi sebelumnya.

### 9.2 Identitas pelapor

1. Nama wajib untuk tiket normal; minimal 3 karakter.
2. Nomor WA menjadi identitas akun; tidak ada NIK di v1.
3. Consent disimpan (versi + waktu).
4. Nama bisa diperbaiki dengan `NAMA`.
5. Darurat: nama placeholder, wajib dilengkapi sebelum tiket ditutup.
6. Nomor yang sama bisa melaporkan untuk orang lain; isi `atas_nama` opsional.
7. Nomor pelapor ditampilkan masked di grup dan UI default.

### 9.3 Kategori & prioritas

| Kategori bot | Contoh | Prioritas default |
|---|---|---|
| 1. Gangguan Kamtibmas | Tawuran, keributan, orang mencurigakan, premanisme | P2 (P1 jika tawuran aktif/senjata) |
| 2. Tindak Pidana | Curanmor, begal, pencurian, penipuan | P2 (P1 jika berlangsung/korban) |
| 3. Bencana & Lingkungan | Banjir, pohon tumbang, kebakaran semak, bangunan roboh | P2 (P1 jika ada korban/jiwa) |
| 4. Laka & Kemacetan | Laka lantas, macet parah, kendaraan mogok | P2 (P1 jika ada korban) |
| 5. Kebakaran | Rumah/kendaraan/hutan | P1 |
| 6. Lainnya | Tidak terkategori | P3 |

Prioritas final ditentukan piket. Bot hanya memberi default.

### 9.4 Status tiket

```
BARU ──→ DITERIMA ──→ OTW ──→ DI_TKP ──→ SELESAI
  │         │            │
  │         ├──→ DITUNDA ─┘
  ├──→ DITOLAK (palsu / di luar wilkum / duplikat)
  └──→ DIBATALKAN (oleh pelapor sebelum OTW)
```

Aturan:
- `SELESAI` wajib catatan penanganan; foto bukti wajib untuk P1/P2.
- `DITOLAK` wajib alasan + kategori alasan.
- Reopen hanya admin/Pawas dengan alasan.
- Semua transisi tercatat di `ticket_events` (actor, waktu, dari, ke, catatan).

### 9.5 Duplikasi & cluster

- Cluster jika: kategori sama/berdekatan, radius ≤ 300 m, jendela ≤ 30 menit.
- Laporan pertama menjadi `ticket_induk`; sisanya `ticket_anggota`.
- Dashboard menampilkan jumlah laporan terkait.
- Piket bisa merge/unmerge dengan audit.
- Jangan hapus laporan anggota.

### 9.6 Rate limit & anti-hoax

- Maks 3 tiket terbuka per nomor.
- Maks 10 laporan/hari per nomor.
- Jeda 60 detik antar pengiriman (kecuali follow-up ke tiket yang sama).
- Darurat tetap diproses meskipun limit tercapai; tandai `perlu_verifikasi`.
- Nomor dengan ≥ 3 laporan palsu dalam 30 hari → flag; ≥ 5 → blokir manual admin.
- Peringatan konsekuensi hukum ditampilkan sebelum kirim pertama dan saat submit.
- Piket bisa menandai `palsu` atau `tidak dapat diverifikasi`; jangan otomatis memblokir.

### 9.7 SLA & eskalasi

| Prioritas | Ack | OTW | Tiba | Tutup | Eskalasi jika tidak di-ack |
|---|---|---|---|---|---|
| P1 Darurat | 2 menit | 5 menit | 15 menit | Situasi kondusif | 3 menit → Pawas; 10 menit → Kapolsek |
| P2 Tinggi | 10 menit | 30 menit | 60 menit | 8 jam | 15 menit → Pawas |
| P3 Normal | 30 menit | 2 jam | 4 jam | 24 jam | 2 jam → Pawas |
| P4 Informasi | 4 jam | — | — | 3 hari | — |

Angka ini internal dan dapat diubah di admin. Jangan dipublikasikan sebagai janji.

### 9.8 Media & bukti

- Foto: JPG/PNG/WEBP/HEIC, maks 16 MB/file, maks 10 file.
- Video: MP4/3GP, maks 64 MB, maks 3 video.
- Voice note: OGG/Opus/MP4, maks 5 menit.
- File asli disimpan; hash SHA-256; thumbnail dibuat terpisah.
- File asli tidak pernah disajikan lewat URL publik.
- EXIF dipertahankan di file asli; derivatif untuk tampilan boleh tanpa EXIF.
- Unduhan oleh petugas dicatat di audit.
- Retensi media mengikuti tiket; legal hold mengalahkan purge.

### 9.9 Retensi & privasi

- Tiket non-perkara: 12 bulan setelah ditutup, lalu dianonimkan/dihapus.
- Tiket terkait perkara: sampai perkara selesai + 5 tahun, atau sesuai kebijakan hukum.
- Percakapan bot: 90 hari, kecuali terhubung tiket.
- Log akses: 12 bulan.
- Permintaan subjek data: diverifikasi, diproses maks 14 hari kerja, dengan pengecualian kepentingan penyidikan.
- Backup terenkripsi; akses minimal.
- Tidak ada transfer data ke luar Indonesia tanpa persetujuan.

## 10. Kebutuhan non-fungsional

| Aspek | Target |
|---|---|
| **Performance** | Dashboard TTI ≤ 2 detik (4G); interaksi ≤ 100 ms; API p95 ≤ 300 ms; SSE update ≤ 1 detik |
| **Availability** | 99,5%/bulan; maintenance window diumumkan; RTO 2 jam; RPO 1 jam |
| **Scalability** | 1.000 tiket/bulan, 200 media/hari, 20 dashboard user bersamaan; siap naik ke 10× |
| **Security** | TLS 1.2+, HSTS, Argon2id, TOTP, RBAC, rate limit, audit, least privilege |
| **Privacy** | UU PDP No. 27/2022; minimisasi data; masking; retensi; breach response 3×24 jam |
| **Accessibility** | WCAG 2.1 AA untuk layar inti; kontras ≥ 4.5:1; navigasi keyboard |
| **Compatibility** | Chrome/Edge 2 versi terakhir, Firefox, Safari 16+, Android Chrome |
| **Localization** | Bahasa Indonesia, zona waktu Asia/Jakarta, format tanggal Indonesia |
| **Observability** | Health endpoint, structured log, queue depth, WA connection state, backup status |
| **Maintainability** | TypeScript strict, unit test domain, dokumentasi runbook, 2 admin |
| **Portability** | Tanpa Docker; deploy ke Ubuntu 24.04; data bisa diekspor |

## 11. Data model (ringkas)

```
units (id, code, name, address, timezone)
regions (id, unit_id, name, level, parent_id, geojson, active)
reporters (id, phone_hash, phone_enc, name, consent_version, consent_at, flags, created_at)
tickets (id, unit_id, ticket_no, reporter_id, category, priority, status,
         title, description, address, lat, lng, accuracy_m, region_id,
         source, cluster_id, assigned_to, sla_ack_at, sla_otw_at,
         sla_arrive_at, closed_at, created_at, updated_at)
ticket_events (id, ticket_id, actor_type, actor_id, from_status, to_status,
               note, created_at)
ticket_media (id, ticket_id, kind, original_path, thumb_path, mime, size,
              sha256, width, height, duration_s, exif_gps, status, created_at)
clusters (id, unit_id, region_id, category, center_lat, center_lng,
          window_start, window_end, ticket_count)
officers (id, unit_id, name, rank, role, phone, wa_jid, active)
wa_groups (id, unit_id, name, jid, purpose, active)
conversations (id, wa_jid, reporter_id, state, context_json, expires_at)
outbound_messages (id, unit_id, target_jid, payload, status, attempts,
                   next_attempt_at, last_error, created_at, sent_at)
audit_logs (id, unit_id, actor_id, action, entity, entity_id, meta,
            ip, user_agent, created_at)
shifts (id, unit_id, shift, officer_id, started_at, ended_at, notes, signed_at)
settings (key, value, updated_by, updated_at)
sessions (id, officer_id, token_hash, expires_at, ip, user_agent, revoked_at)
```

Catatan:
- `phone_enc` dienkripsi aplikasi; `phone_hash` untuk pencarian.
- Semua tabel operasional punya `unit_id` untuk masa depan multi-Polsek.
- `tickets.ticket_no` unik per unit.
- `ticket_events` append-only.
- `outbound_messages` adalah outbox untuk retry.

## 12. API & event (ringkas)

### Internal bot → API

- `POST /internal/wa/inbound` — pesan masuk, idempotent by `wa_message_id`.
- `POST /internal/wa/status` — status koneksi, QR, disconnect reason.
- `GET /internal/outbox?limit=20` — worker bot mengambil pesan keluar.
- `POST /internal/outbox/:id/result` — sukses/gagal.

### Dashboard → API

- `POST /api/auth/login`, `POST /api/auth/totp`, `POST /api/auth/logout`, `GET /api/me`
- `GET /api/tickets?status=&priority=&region=&q=&cursor=`
- `GET /api/tickets/:id`
- `POST /api/tickets/:id/transition` `{to, note, assignee_id, reason}`
- `POST /api/tickets/:id/notes`
- `POST /api/tickets/manual`
- `POST /api/tickets/:id/media` (upload)
- `POST /api/tickets/:id/merge` / `unmerge`
- `POST /api/reporters/:id/reveal` (audit)
- `GET /api/regions`, `GET /api/officers`, `GET /api/analytics?from=&to=`
- `GET /api/stream` (SSE)
- `GET /api/export/tickets.csv`, `GET /api/export/monthly.pdf`

### Event SSE

`ticket.created`, `ticket.updated`, `ticket.assigned`, `ticket.escalated`, `gateway.status`, `outbox.failed`, `shift.handover`.

## 13. UI/UX

### 13.1 Arah desain

**"Quiet command center."** Bukan website marketing, bukan dashboard penuh grafik. Referensi rasa: Anduril Industries (disiplin, gelap, presisi), Linear (cepat, padat, keyboard), Flightradar24 (live map). Tidak meniru; mengambil prinsipnya.

- Latar gelap `#070B10`, panel `#0E151D`, aksen amber `#FFB020`.
- Tipografi: Instrument Sans untuk UI, JetBrains Mono untuk ID/timestamps.
- Data padat tetapi lapang; border 1px; radius 12–14px; tanpa gradien berlebihan.
- Warna status tidak sendiri-sendiri: selalu ada label + ikon.
- Animasi 150–220 ms; hormati `prefers-reduced-motion`.
- Peta gelap, pin berbentuk kategori, polygon kelurahan garis putus-putus.
- Mode Dinding: font 1,25×, rail disembunyikan, tiket baru auto-select.

### 13.2 Layar

1. **Live Board** — antrean + peta + detail.
2. **Peta** — peta besar + filter + heatmap.
3. **Analitik** — volume, SLA, kategori, titik rawan.
4. **Data** — pelapor, petugas, wilkum, grup.
5. **Serah Terima** — checklist shift + tanda tangan.
6. **Sistem** — status gateway, outbox, backup, audit, konfigurasi.

### 13.3 Prinsip performa UI

- Tidak ada framework CSS runtime; CSS custom + komponen kecil.
- Font di-self-host di produksi; prototipe boleh CDN.
- Grafik SVG buatan sendiri; tidak ada chart library berat.
- Peta hanya di layar peta; jangan render ulang seluruh halaman saat SSE masuk.
- Optimistic update untuk aksi status; rollback jika API gagal.
- Virtualisasi daftar jika > 100 tiket.
- Prefetch detail saat hover.
- Target bundle awal < 180 KB gzip.

### 13.4 Copy tone

- Warga: hangat, singkat, tanpa jargon. "Laporan Anda sudah kami terima."
- Petugas: netral, operasional. "Tiket #014 diterima. Disposisi ke URC."
- Jangan pernah menjanjikan hasil: "Tim akan menindaklanjuti" bukan "pelaku pasti ditangkap".

## 14. Acceptance criteria & UAT

### 14.1 Skenario wajib lulus

| ID | Skenario | Kriteria lulus |
|---|---|---|
| UAT-01 | Warga baru kirim "TAWURAN" + lokasi | Tiket P1 muncul ≤ 10 detik; alarm; grup URC menerima; nama ditanyakan menyusul |
| UAT-02 | Warga kirim laporan normal lengkap | Tiket dibuat; nomor tiket; ringkasan benar; pelapor menerima konfirmasi |
| UAT-03 | Lokasi di luar wilkum | Tidak ada tiket; pesan redirect 110/Polsek terdekat |
| UAT-04 | Lokasi di perbatasan | Tiket dibuat dengan flag `perlu_verifikasi` |
| UAT-05 | Foto tanpa lokasi, ada EXIF GPS | Bot menawarkan lokasi foto; tiket benar |
| UAT-06 | Voice note | Tersimpan; bisa diputar di dashboard; tiket tetap bisa dibuat |
| UAT-07 | Dua laporan tawuran berdekatan | Terbentuk cluster; dashboard menampilkan 2 laporan terkait |
| UAT-08 | Piket ack & disposisi | Status berubah; URC menerima; pelapor dapat update |
| UAT-09 | `/otw` dari JID tidak terdaftar | Ditolak; tidak ada perubahan status |
| UAT-10 | P1 tidak di-ack 3 menit | Eskalasi ke Pawas; tercatat |
| UAT-11 | WA disconnect | Dashboard menampilkan status; outbox retry; alert admin |
| UAT-12 | Server restart saat ada tiket baru | Tidak ada tiket ganda/hilang; outbox melanjutkan |
| UAT-13 | Restore backup | Data 24 jam terakhir kembali; media utuh |
| UAT-14 | Nomor pelapor di grup | Masked; reveal hanya role tertentu + audit |
| UAT-15 | Serah terima shift | Checklist tersimpan; tiket terbuka terlihat; tanda tangan tercatat |
| UAT-16 | Tiket manual telepon | Masuk antrean; sumber `telepon`; bisa didisposisi |
| UAT-17 | Export bulanan | PDF/Excel berisi data benar; tidak ada PII berlebih |
| UAT-18 | Akses dashboard dari HP | Layout responsif; aksi utama bisa dilakukan |
| UAT-19 | Audit log | Semua transisi & reveal tercatat, tidak bisa diedit |
| UAT-20 | Beban 50 laporan/jam | Dashboard tetap responsif; tidak ada tiket hilang |

### 14.2 Uji lapangan

- Simulasi 2 jam bersama 20 warga + 1 piket + 1 URC + 1 Bhabin.
- 3 skenario: darurat, normal, di luar wilkum.
- Ukur waktu tiket muncul, waktu ack, waktu OTW.
- Kumpulkan feedback kualitatif: apa yang membingungkan, apa yang lambat.
- Ulangi setelah perbaikan.

## 15. Metrik

**North Star:** persentase laporan warga yang menjadi tiket dan ditutup dengan bukti penanganan.

| Metrik | Definisi | Frekuensi |
|---|---|---|
| Ticket conversion | tiket dibuat / percakapan laporan | Mingguan |
| Ack P1 p90 | waktu BARU → DITERIMA | Harian |
| OTW P1 p90 | waktu DITERIMA → OTW | Harian |
| Close rate | tiket SELESAI / tiket dibuat | Mingguan |
| Evidence rate | tiket SELESAI dengan foto/catatan / total selesai | Mingguan |
| False report rate | tiket DITOLAK palsu / total | Bulanan |
| Duplicate rate | anggota cluster / total | Bulanan |
| Coverage | kelurahan dengan ≥ 1 laporan / total kelurahan | Bulanan |
| Reporter return rate | nomor yang lapor ≥ 2 kali / total | Bulanan |
| Dashboard latency | SSE/API p95 | Harian |
| Gateway uptime | koneksi WA aktif | Harian |

## 16. Rollout

| Tahap | Cakupan | Durasi | Gate |
|---|---|---|---|
| 0. Prototipe | Internal | 3–5 hari | Disetujui pimpinan |
| 1. Internal dogfood | Piket + admin | 1 minggu | Tidak ada blocker kritis |
| 2. Pilot | 1 kelurahan, 50 warga | 2 minggu | UAT-01..20 lulus |
| 3. Soft launch | 3 kelurahan | 2 minggu | SLA stabil, tidak ada insiden data |
| 4. Full launch | Semua wilkum | — | SOP ditandatangani, pelatihan selesai |
| 5. Hypercare | Semua | 4 minggu | Rekap mingguan, bug < 5 |

## 17. Risiko utama

Lihat `07-RISIKO.md`. Tiga teratas:
1. Nomor WA diblokir.
2. Laporan palsu terkoordinasi.
3. Dashboard tidak dipantau saat shift.

## 18. Pertanyaan terbuka

Lihat `10-PERTANYAAN-TERBUKA.md`. Yang memblokir development:
1. Polsek & daftar kelurahan.
2. Pemilik nomor WA & 2FA.
3. SLA & jalur eskalasi.
4. Retensi & penanggung jawab data.
5. Domain & hosting.
