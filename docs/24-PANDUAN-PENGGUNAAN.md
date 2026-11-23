# 24 — Panduan Penggunaan SIGAP

**Versi:** 1.0 · 15 November 2026
**Untuk:** Admin unit, piket SPKT, URC, Bhabinkamtibmas, Pawas, Kapolsek.
**Sifat:** panduan operasional harian + cara menyiapkan WhatsApp bot.

> SIGAP adalah **kanal tambahan**. Untuk ancaman nyawa, tetap telepon **110/112**.
> Jangan pernah mengirim QR pairing, password, atau nomor pelapor ke luar kanal resmi.

---

## 1. Gambaran besar

```
Warga WhatsApp
      │  LAPOR / DARURAT / share location / foto
      ▼
Bot Baileys  ──►  API SIGAP  ──►  Dashboard piket
      ▲              │                 │
      │              ├─ tiket, audit, media, SLA
      └── outbox ◄───┘                 │
                                       ▼
                              Piket / URC menangani
```

- **Bot WhatsApp** hanya transport: menerima pesan, mengunduh media, mengirim balasan.
- **API** adalah sumber kebenaran: tiket, status, audit, media, SLA, eskalasi.
- **Dashboard** dipakai petugas. Warga tidak perlu install aplikasi.
- **Grup URC** menerima forward tiket dan bisa mengubah status lewat command.

---

## 2. Mulai cepat (development)

```bash
cp .env.example .env
# isi secret dan nomor WA
pnpm install
pnpm --filter @sigap/api db:migrate
pnpm --filter @sigap/api db:seed

# terminal 1 — API
pnpm dev:api

# terminal 2 — web
pnpm dev:web

# terminal 3 — bot WhatsApp (opsional saat belum pairing)
pnpm dev:bot
```

Buka `http://127.0.0.1:5173`.

Akun demo:

| Username | Password | Role |
|---|---|---|
| `piket` | `Demo#12345` | piket |
| `piket2` | `Demo#12345` | piket |
| `urc` | `Demo#12345` | urc |
| `kapolsek` | `Demo#12345` | kapolsek |
| `pawas` | `Demo#12345` | pawas |
| `admin` | `Admin#12345` | admin |
| `bhabin_pekyon` | `Demo#12345` | bhabin |

Ganti semua password demo sebelum produksi.

---

## 3. Cara menambahkan WhatsApp bot

### 3.1 Yang perlu disiapkan

1. Nomor WhatsApp khusus Polsek (bukan nomor pribadi).
2. HP dengan WhatsApp aktif + 2FA.
3. Nomor cadangan untuk rotasi jika nomor utama diblokir.
4. Grup URC yang sudah dibuat dan bot sudah menjadi anggotanya.
5. Service bot berjalan dan `.env` minimal:

```env
SIGAP_BOT_AUTH_DIR=./data/baileys
SIGAP_API_URL=http://127.0.0.1:4000
SIGAP_INTERNAL_TOKEN=token-internal-panjang
# SIGAP_WA_NUMBER boleh dikosongkan; diisi otomatis setelah pairing.
```

Catatan: dashboard **mengontrol** bot, tetapi tidak menyalakan proses bot. Di production, bot harus menjadi service systemd `sigap-bot`.

### 3.2 Pairing QR dari dashboard

1. Pastikan **service bot** berjalan (production: `systemctl status sigap-bot`; development: `pnpm dev:bot`).
2. Login sebagai admin → **Sistem → WhatsApp Gateway**.
3. Klik **Hubungkan WhatsApp**. Kartu akan menampilkan QR.
4. Di HP: **WhatsApp → Perangkat tertaut → Tautkan perangkat**.
5. Scan QR. Status berubah dari **MENUNGGU SCAN** → **TERHUBUNG**.
6. Cek topbar: **WA AKTIF**. Nomor yang terhubung otomatis tampil di kartu.
7. Sesi disimpan di server (`SIGAP_BOT_AUTH_DIR`). Tidak perlu membuka terminal atau file QR.

QR berlaku ±90 detik. Kalau kedaluwarsa, bot mengirim QR baru otomatis; tombol **Muat ulang QR** memaksa QR baru.

Untuk mengganti nomor: klik **Logout / ganti nomor**. Sesi lama dihapus, lalu klik **Hubungkan WhatsApp** dan scan QR nomor baru.

Jangan pernah mengirim gambar QR ke grup atau publik.

### 3.3 Setelah pairing

1. Masuk **Sistem → Unit Polsek**: isi nomor WA dan pemilik.
2. Isi **Sistem → ID grup URC** dengan angka ID grup. Kirim **`/id`** di grup untuk melihat angkanya.
3. Simpan. Sistem otomatis mendaftarkan grup itu sebagai grup aktif untuk command.
4. Tambahkan petugas di **Sistem → Petugas** dan isi nomor WA mereka.
5. Uji: kirim `LAPOR` dari HP warga, lalu cek tiket masuk.
6. Uji command grup: `/status 001` dari nomor petugas terdaftar.

Panduan produksi (systemd, QR aman, rotasi nomor) ada di `docs/17-RUNBOOK.md`.

---

## 4. Kenapa ada `@s.whatsapp.net` dan `@g.us`?

Itu adalah **JID** (Jabber ID), alamat internal WhatsApp:

| Jenis | Contoh | Arti |
|---|---|---|
| Nomor pribadi | `6281234567890@s.whatsapp.net` | chat pribadi petugas |
| Grup | `120363012345678901@g.us` | grup WhatsApp |

Bot memakai JID untuk mencocokkan pengirim dan grup. **Petugas tidak perlu mengetik JID.**

Di dashboard sekarang cukup masukkan:

- Nomor petugas: `0812-3456-7890`, `6281234567890`, atau `+62 812...`
- ID grup: `120363012345678901`

Sistem otomatis mengubah:

```
0812-3456-7890   → 6281234567890@s.whatsapp.net
6281234567890    → 6281234567890@s.whatsapp.net
120363012345678901 → 120363012345678901@g.us
```

JID lengkap tetap diterima jika sudah punya.

**Link invite grup tidak bisa dipakai langsung.** Ambil **ID grup** (deretan angka `120363...`) dari informasi grup, bukan link `chat.whatsapp.com/...`.

---

## 5. Fungsi petugas (role)

| Role | Fungsi utama | Yang boleh |
|---|---|---|
| **piket** | Petugas jaga SPKT | Lihat semua tiket, terima/tolak, OTW, tiba, selesai, catatan, tiket manual, reveal nomor, export, blokir pelapor |
| **urc** | Unit respons cepat / patroli | Lihat tiket, OTW/tiba/selesai, catatan, reveal nomor, command grup |
| **bhabin** | Bhabinkamtibmas wilayah | Lihat tiket **wilayahnya saja**, catatan internal, tidak bisa mengubah status tiket wilayah lain |
| **pawas** | Perwira pengawas | Lihat semua, audit, export, digest, reveal, blokir, eskalasi P1 |
| **kapolsek** | Pimpinan unit | Lihat semua, export, digest, keputusan dan pengawasan |
| **admin** | Pengelola sistem | Semua di atas + pengaturan unit, wilayah, petugas, grup, backup, TOTP, push |

Catatan:

- Satu orang boleh punya satu akun. Jangan memakai akun bersama.
- JID/nomor WA petugas hanya diperlukan jika petugas akan memakai command grup.
- Bhabin wajib diisi wilayahnya agar pembatasan tiket bekerja.

---

## 6. Fungsi grup WhatsApp

| Purpose | Fungsi | Contoh |
|---|---|---|
| **urc** | Grup utama respons cepat | Forward tiket baru/P1, command `/otw`, `/tiba`, `/selesai` |
| **bhabin** | Koordinasi Bhabinkamtibmas | Informasi wilayah, tindak lanjut |
| **lain** | Grup koordinasi lain | Pimpinan, instansi terkait |

Yang penting:

- `ID grup URC` di **Sistem** adalah tujuan forward tiket dan digest.
- Tabel **Grup WhatsApp** adalah daftar grup yang boleh mengirim command ke bot.
- Menyimpan ID grup URC di Pengaturan otomatis menambahkan grup itu ke tabel.
- Grup harus aktif dan bot harus menjadi anggota.
- Hanya nomor petugas yang terdaftar + aktif yang command-nya diterima.

---

## 7. Alur warga melapor

### 7.1 Laporan normal

1. Warga scan QR poster / simpan nomor Polsek.
2. Kirim **`LAPOR`**.
3. Bot meminta **nama lengkap** (wajib).
4. Warga memilih kategori (1–6).
5. Warga menulis kronologi.
6. Warga mengirim **share location** lokasi kejadian (TKP), bukan lokasi rumah jika berbeda.
7. Warga boleh mengirim foto/video/voice note. Media asli ikut diteruskan ke grup URC, bukan hanya teks.
8. Warga mengirim **`SELESAI`**.
9. Bot mengirim ringkasan + nomor tiket, misalnya `BKS-261114-014`.
10. Warga bisa kirim **`STATUS`** kapan saja.

### 7.2 Darurat

- Kata kunci darurat: **`DARURAT`**, `TAWURAN`, `KEBAKARAN`, `BEGAL`, `LAKA`, dsb.
- Atau warga langsung mengirim **share location** tanpa teks.
- Bot membuat tiket **P1 lebih dulu**, lalu menanyakan nama menyusul.
- Dashboard berbunyi, tiket masuk antrean P1, grup URC menerima forward teks + media yang sudah dikirim.
- Piket harus ack ≤ 2 menit dan OTW ≤ 5 menit.

### 7.3 Di luar wilayah hukum

- Lokasi dicek terhadap polygon wilkum.
- Jika di luar: **tidak ada tiket**, warga diarahkan ke 110/Polsek terdekat.
- Jika di perbatasan: tiket dibuat dengan status **perlu verifikasi**.

### 7.4 Nomor diblokir

- Nomor yang diblokir tidak bisa membuat tiket baru.
- `STATUS` dan `BANTU` tetap dijawab.
- Blokir hanya untuk spam/laporan palsu, dengan alasan yang dicatat.

---

## 8. Alur piket harian

### Mulai shift

1. Login + TOTP (jika aktif).
2. Aktifkan suara alarm.
3. Cek antrean: Baru, P1, ditunda.
4. Baca catatan serah terima shift sebelumnya.

### Menangani tiket

1. Klik tiket di antrean atau pin peta.
2. Baca nama, nomor (masked), lokasi, deskripsi, media.
3. Klik **Terima Laporan**.
4. Klik **OTW ke TKP** saat berangkat.
5. Klik **Tiba di TKP** saat tiba.
6. Isi catatan penanganan.
7. Klik **Selesaikan**.

Status: `baru → diterima → otw → ditkp → selesai`.

### P1

- Alarm berbunyi; buka tiket.
- Ack ≤ 2 menit; OTW ≤ 5 menit.
- Jika tidak direspons: eskalasi **Pawas** (3 menit) dan **Kapolsek** (10 menit).
- Notifikasi masuk lewat WA, SSE, dan Web Push (jika diaktifkan).

### Nomor pelapor

- Di dashboard, nomor tetap masked: `0812•••••677`.
- Klik **Tampilkan** untuk melihat 30 detik. Setiap reveal tercatat di audit.
- Di notifikasi WhatsApp (grup URC/eskalasi), nomor tampil **penuh** jika **Masking PII** dimatikan di **Sistem**. Jika masking aktif, nomor tetap disamarkan.

### Duplikat

- Detail tiket menampilkan kemungkinan duplikat (radius 500 m / 60 menit).
- Cek lokasi dan waktu; klik **Gabung** jika sama.
- Tiket sumber dibatalkan, media dipindahkan, audit tercatat.

### Tiket manual (laporan telepon)

1. Klik **+** di antrean.
2. Isi nama, nomor, kategori, deskripsi, lokasi.
3. Simpan. Tiket masuk antrean dan audit.

### Serah terima

1. Buka **Serah**.
2. Cek P1, tiket ditunda, tiket tanpa nama/media.
3. Isi catatan shift.
4. Isi nama petugas masuk.
5. Klik **Serahkan Shift**.
6. Tanda tangan = nama + audit (bukan e-signature tersertifikasi).

---

## 9. Alur URC lewat grup

Bot mengirim tiket ke grup URC dengan format ringkas dan command.

| Command | Fungsi | Contoh |
|---|---|---|
| `/otw <tiket>` | Berangkat ke TKP | `/otw 014` |
| `/tiba <tiket>` | Tiba di TKP | `/tiba 014` |
| `/selesai <tiket> <catatan>` | Selesai + catatan | `/selesai 014 pelaku sudah diamankan` |
| `/tunda <tiket> <alasan>` | Tunda | `/tunda 014 menunggu saksi` |
| `/status <tiket>` | Cek status | `/status 014` |
| `/id` | Tampilkan ID grup ini (bisa sebelum grup terdaftar) | `/id` |

- Bisa memakai nomor pendek `014` atau nomor lengkap `BKS-261114-014`.
- Foto bukti: kirim foto dengan caption `/selesai 014 catatan`.
- Untuk mengetahui ID grup, kirim **`/id`** di grup. Bot membalas angka `120363...` yang bisa disalin ke Pengaturan.
- Hanya nomor petugas terdaftar yang diterima. Nomor tak dikenal akan dibalas agar admin mendaftarkannya di menu **Petugas**.
- `/otw`, `/tiba`, `/selesai`, dan `/tunda` hanya untuk role **piket, urc, pawas, admin**. **Bhabin** dan **kapolsek** tidak mengubah status lewat grup; bhabin cukup menambah catatan kunjungan di dashboard.
- Pesan ke pelapor memakai bahasa operasional, bukan singkatan: “Status pelaporan dengan nomor tiket … sedang jalan ke TKP”, “… sudah tiba di TKP”, “… sudah selesai ditangani”, “… ditunda/ditolak” + alasan.
- Jika ditolak, bot menyebut role pengirim dan role yang diizinkan. Cek juga: grup aktif? nomor petugas benar? status tiket memungkinkan?

---

## 10. Membaca peta

- **Polygon berwarna** = batas wilayah hukum (wilkum).
- **Label di polygon** = nama wilayah.
- **Pin** = lokasi kejadian (TKP), bukan domisili pelapor.
- Warna pin = status tiket.
- Cincin merah = P1.
- Filter: status, kategori, wilayah.
- Klik wilayah di panel kiri untuk memfilter peta.
- Tile memakai **OpenStreetMap terang**, tanpa API key.
- Jika tile gagal, sistem mencoba basemap Esri; polygon dan pin tetap tampil.

Catatan: polygon demo ditandai `DEMO`. Produksi wajib memakai batas resmi kelurahan.

---

## 11. Tema terang / gelap

- Default: **terang (putih)**.
- Ganti lewat ikon **bulan/matahari** di topbar.
- Atau **Sistem → Tampilan → Terang / Gelap**.
- Pilihan disimpan per perangkat di `localStorage`.
- Peta tetap terang di kedua tema agar batas wilayah mudah dibaca.

---

## 12. Pengaturan admin

### Identitas & SLA

| Field | Isi |
|---|---|
| Nama/kode unit | Identitas Polsek |
| Alamat | Alamat kantor |
| Zona waktu | Default `Asia/Jakarta` |
| Nomor WA | Nomor bot |
| Pemilik WA | Penanggung jawab nomor |
| ID grup URC | Angka grup, otomatis `@g.us` |
| DPO | Nama/kanal DPO |
| Retensi | Default 365 hari + legal hold |
| SLA P1 ack/OTW | Default 120/300 detik |
| Eskalasi Pawas/Kapolsek | Default 180/600 detik |
| Alarm wajib | Suara alarm saat P1 |
| Masking PII | Default aktif; jika dimatikan, nomor pelapor tampil penuh di grup/eskalasi WhatsApp (dashboard tetap masked + reveal ber-audit) |

### Wilayah

- Nama kelurahan + GeoJSON Polygon/MultiPolygon.
- Validasi otomatis saat simpan.
- Polygon demo ditandai `DEMO`.
- Tombol **Hapus**: jika wilayah sudah dipakai tiket/petugas, wilayah **dinonaktifkan** agar riwayat aman; tombol **Aktifkan** mengembalikannya. Wilayah tanpa riwayat dihapus permanen.
- Jangan launch tanpa polygon resmi.

### Petugas

**Petugas** = akun personel Polsek (piket, URC, bhabin, pawas, kapolsek, admin) yang bisa login dashboard dan/atau memakai command WhatsApp. Pelapor/warga bukan petugas.

- Tambah: username, nama, role, password awal, nomor WA, wilayah (bhabin).
- **Edit**: ubah nama, pangkat, role, wilayah, status aktif, dan nomor WhatsApp.
- **Hapus**: akun tanpa riwayat dihapus permanen; akun yang sudah punya tiket/shift **dinonaktifkan**, nomor WA dilepas, dan sesi login dicabut.
- Nonaktifkan akun yang mutasi/keluar.

### Grup WhatsApp

- Nama grup.
- ID grup (angka; otomatis `@g.us`).
- Purpose: `urc`, `bhabin`, `lain`.
- Aktif/nonaktif.

### Pelapor

- Nomor masked.
- Blokir/buka blokir + alasan.
- Blokir mencegah tiket baru; `STATUS`/`BANTU` tetap.

### Audit & export

- **Data → Audit Log**: filter aksi/aktor/IP.
- **Analitik**: export CSV/Excel/PDF per bulan.
- Semua export dan reveal nomor tercatat.

### Web Push

- **Sistem → Web Push → Aktifkan push**.
- Butuh HTTPS atau localhost.
- Dipakai untuk P1 baru dan eskalasi.
- Alarm SSE tetap menjadi kanal utama.

### Backup

```bash
sudo /opt/sigap/infra/scripts/backup-db.sh
sudo /opt/sigap/infra/scripts/restore-drill.sh <file>
```

Backup DB + media, cek integritas, simpan offsite.

---

## 13. Contoh skenario lengkap

### Skenario A — tawuran malam

1. Warga mengirim `TAWURAN` + lokasi.
2. Bot membuat `BKS-261114-021` P1 dan forward ke grup URC.
3. Dashboard alarm; piket klik tiket.
4. Piket **Terima** (ack 40 detik), lalu **OTW** (2 menit).
5. URC mengirim `/tiba 021`.
6. Setelah kondusif, URC kirim foto + `/selesai 021 dua pelaku diamankan`.
7. Piket memastikan catatan dan status selesai; pelapor menerima update.

### Skenario B — laporan biasa

1. Warga `LAPOR` → nama → kategori → cerita → lokasi → foto → `SELESAI`.
2. Tiket `BKS-261114-022` P3 masuk.
3. Piket menerima, meneruskan ke Bhabin wilayah.
4. Bhabin menambahkan catatan kunjungan.
5. Piket menutup dengan catatan.

### Skenario C — telepon

1. Warga menelepon SPKT.
2. Piket klik **+**, isi data, simpan.
3. Tiket manual masuk antrean dan audit.

### Skenario D — di luar wilkum

1. Warga share lokasi di luar polygon.
2. Bot menolak membuat tiket dan mengarahkan ke 110/Polsek terdekat.
3. Tidak ada tiket baru.

---

## 14. Troubleshooting

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| QR tidak muncul | Bot belum jalan / log | Cek terminal, `data/baileys-qr.png`, restart bot |
| WA OFFLINE | HP mati, logout, jaringan | Cek HP, scan ulang, cek `journalctl` |
| Command grup ditolak | Grup belum terdaftar/nonaktif | Tambah/aktifkan grup di Pengaturan |
| Command ditolak | Nomor petugas belum terdaftar | Isi nomor WA petugas, pastikan aktif |
| Command ditolak | Status tiket tidak sesuai | Cek `/status` |
| Peta kosong | Internet/firewall tile | Cek koneksi; polygon/pin tetap tampil |
| Peta gelap/API key | Build lama | Rebuild web, hard refresh, hapus cache SW |
| Push tidak muncul | Izin browser / bukan HTTPS | Aktifkan izin, pakai HTTPS/localhost |
| Export gagal | Role tidak berhak | Gunakan piket/pawas/kapolsek/admin |
| Nomor pelapor tidak muncul | Masking aktif | Klik Tampilkan (audit) |

---

## 15. Checklist produksi

- [ ] Password demo diganti.
- [ ] TOTP aktif untuk piket/pawas/kapolsek/admin.
- [ ] Nomor WA resmi + 2FA + nomor cadangan.
- [ ] Grup URC resmi + bot anggota.
- [ ] Nomor petugas diisi dan diuji.
- [ ] Polygon resmi (bukan demo).
- [ ] Domain HTTPS + `SIGAP_COOKIE_SECURE=true`.
- [ ] Backup + restore drill lulus.
- [ ] Web Push diuji di HP petugas.
- [ ] Poster QR resmi dicetak.
- [ ] SOP ditandatangani.
- [ ] Pilot 1 kelurahan minimal 2 minggu.

---

## 16. Istilah

| Istilah | Arti |
|---|---|
| **Wilkum** | Wilayah hukum Polsek |
| **TKP** | Tempat kejadian perkara (lokasi laporan) |
| **P1** | Prioritas darurat |
| **Ack** | Petugas menerima/mengakui tiket |
| **OTW** | Dalam perjalanan ke TKP |
| **JID** | Alamat internal WhatsApp (`@s.whatsapp.net` / `@g.us`) |
| **Outbox** | Antrean pesan keluar dari bot |
| **SSE** | Stream real-time dashboard |
| **DPO** | Data Protection Officer |
| **Legal hold** | Penangguhan hapus data untuk kepentingan hukum |

---

## 17. Dokumen terkait

- `docs/08-SOP.md` — SOP operasional final.
- `docs/13-SECURITY-REVIEW.md` — keamanan & kontrol.
- `docs/14-UAT-HASIL.md` — hasil UAT.
- `docs/15-PELATIHAN.md` — materi pelatihan.
- `docs/16-LAUNCH-PLAN.md` — pilot & launch.
- `docs/17-RUNBOOK.md` — deploy, backup, WA ban.
- `docs/18-PANDUAN-ADMIN.md` — admin unit.
- `docs/19-PANDUAN-PIKET.md` — piket 1 halaman.
- `docs/20-PANDUAN-WARGA.md` — panduan warga/poster.
- `docs/24-PANDUAN-PENGGUNAAN.md` — panduan ini.
- `docs/25-AUDIT-KODE.md` — audit kode/script, temuan, rekomendasi.
