# 15 — Materi Pelatihan

**Versi:** 1.0 · 14 November 2026
**Durasi total:** ± 3 jam (bisa dipecah per role).

---

## 1. Piket SPKT (60–75 menit)

### Tujuan
- Menerima, memverifikasi, dan mendisposisikan tiket dengan benar.
- Mengenali P1 dan menjalankan alarm/eskalasi.
- Menutup tiket dengan catatan yang bisa dipertanggungjawabkan.

### Materi
1. Login + TOTP + logout.
2. Live Board: antrean, filter, pencarian, peta terang.
3. Detail tiket: pelapor, lokasi, media, timeline.
4. Aksi: Terima → OTW → Tiba → Selesai; tunda; tolak.
5. P1: alarm, bunyi, buka tiket, koordinasi.
6. PII: nomor masked, reveal 30 detik, audit.
7. Duplikat: cek dan gabung.
8. Serah terima: checklist + catatan + nama.

### Latihan
- Terima 1 tiket P2 dan selesaikan.
- Tangani 1 P1 simulasi.
- Cek nomor pelapor dan pastikan audit muncul.
- Serahkan shift ke rekan.

### Aturan penting
- Jangan menutup tiket tanpa catatan.
- Jangan menyebarkan foto/nomor ke luar kanal resmi.
- P1: ack ≤ 2 menit, OTW ≤ 5 menit.

---

## 2. URC (45 menit)

### Tujuan
- Merespons tiket dari grup URC dan melampirkan bukti.
- Menggunakan command dengan format benar.

### Materi
- Format: `/otw 014`, `/tiba 014`, `/selesai 014 catatan`, `/tunda 014 alasan`, `/status 014`.
- Foto bukti: kirim foto dengan caption `/selesai 014 catatan`.
- JID petugas harus terdaftar di Pengaturan.
- Jangan mengubah status tanpa benar-benar di TKP/selesai.

### Latihan
- `/otw`, `/tiba`, `/selesai` + foto pada tiket uji.
- Coba command dari nomor tidak terdaftar → harus ditolak.

---

## 3. Bhabinkamtibmas (30–45 menit)

### Materi
- Hanya melihat tiket di wilayahnya.
- Tidak bisa menerima/menutup tiket.
- Bisa menambah catatan internal.
- Media tiket di wilayah lain tidak bisa diakses.
- Eskalasi ke piket/URC lewat grup atau telepon.

### Latihan
- Login bhabin, buka tiket wilayahnya.
- Coba buka tiket wilayah lain → harus 403.
- Tambah catatan kunjungan.

---

## 4. Admin (45 menit)

### Materi
1. Pengaturan unit, WA, DPO, retensi, SLA.
2. Upload/ubah polygon wilayah.
3. Tambah petugas, role, nomor WA (otomatis JID), wilayah.
4. Kelola grup WhatsApp + `/id`.
5. Pairing WhatsApp dari **Sistem → WhatsApp Gateway** (scan QR, logout/ganti nomor).
6. Registry pelapor: blokir/buka blokir + alasan.
7. Audit viewer.
7. Backup/restore dan healthcheck.
8. TOTP dan Web Push.

### Latihan
- Tambah petugas baru dan login.
- Tambah grup uji.
- Blokir satu pelapor uji, coba lapor, lalu buka blokir.
- Jalankan backup + restore drill.

---

## 5. Warga (poster + 90 detik)

1. Scan QR / simpan nomor.
2. Ketik `LAPOR`.
3. Isi nama, kategori, cerita, lokasi.
4. Kirim foto/video/VN bila ada.
5. Simpan nomor tiket.
6. Darurat nyawa: telepon 110/112.

---

## 6. Evaluasi pelatihan

- Pre-test 10 pertanyaan.
- Praktik role masing-masing.
- Post-test + observasi.
- Sertifikat internal dan daftar hadir.
- Ulang pelatihan jika ada perubahan SOP/command.
