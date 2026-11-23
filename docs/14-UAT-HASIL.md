# 14 — Hasil UAT v1.0

**Tanggal:** 14 November 2026
**Lingkungan:** dev/staging lokal (API + web + bot), data demo, tanpa nomor WhatsApp nyata.
**Metode:** API injection test, browser automation manual, load test, restore drill.

---

## 1. Data UAT

| Item | Nilai |
|---|---|
| Unit | Polsek Contoh (BKS) |
| Tiket demo | 8 (baru, diterima, OTW, di TKP, ditunda, selesai, P1) |
| Wilayah | 5 polygon demo (Pekayon, Jakasetia, Marga Jaya, Kayuringin, Jakamulya) |
| Akun | `piket`, `piket2`, `urc`, `kapolsek`, `pawas`, `bhabin_pekyon`, `admin` |
| Media | gambar uji 1600×1000 + thumbnail, audio/video sintetis |
| Bot | Baileys belum pairing; flow diuji lewat endpoint internal |

---

## 2. Hasil UAT-01..20

| ID | Skenario | Hasil | Bukti/catatan |
|---|---|---|---|
| UAT-01 | “TAWURAN” + lokasi → P1 | ✅ Lulus (simulasi) | Test API emergency P1; alarm SSE; outbox grup |
| UAT-02 | Laporan normal lengkap | ✅ Lulus | Test flow normal; nomor tiket; konfirmasi |
| UAT-03 | Lokasi luar wilkum | ✅ Lulus | Test redirect; tidak ada tiket |
| UAT-04 | Lokasi perbatasan | ✅ Lulus (unit) | Geofence buffer 250 m; status perlu verifikasi |
| UAT-05 | Foto + EXIF GPS | ✅ Lulus | GPS foto dipakai saat lokasi belum diisi |
| UAT-06 | Voice note | 🟡 Sebagian | API simpan/putar lulus; voice note WA nyata belum |
| UAT-07 | Dua laporan berdekatan | ✅ Lulus | Deteksi duplikat radius 500 m / 60 menit |
| UAT-08 | Piket ack & disposisi | ✅ Lulus | Transisi + notifikasi pelapor |
| UAT-09 | `/otw` JID tidak terdaftar | ✅ Lulus (review) | API menolak `unknown_officer` |
| UAT-10 | P1 tidak di-ack 3 menit | ✅ Lulus | Backdate + worker; eskalasi Pawas/Kapolsek |
| UAT-11 | WA disconnect | 🟡 Sebagian | Reconnect/backoff + status UI; perangkat nyata belum |
| UAT-12 | Restart saat tiket baru | ✅ Lulus (API) | Idempotensi `message_log`; outbox persisten |
| UAT-13 | Restore backup | ✅ Lulus (DB) | Integrity ok, 8 tiket, 4 migrasi, 653 ms; media belum diuji offsite |
| UAT-14 | Nomor pelapor di grup | ✅ Lulus | Masked; reveal + audit |
| UAT-15 | Serah terima shift | ✅ Lulus | Checklist, catatan, nama, audit |
| UAT-16 | Tiket manual telepon | ✅ Lulus | Form + API + audit |
| UAT-17 | Export bulanan | ✅ Lulus | CSV/Excel/PDF, masking, audit |
| UAT-18 | Dashboard dari HP | 🟡 Sebagian | Layout responsif CSS; belum uji HP fisik |
| UAT-19 | Audit log | ✅ Lulus | Transisi/reveal/export/blokir tercatat |
| UAT-20 | Beban 50 laporan/jam | ✅ Lulus | 20 laporan/2,1 dtk (p95 16 ms) |

**Ringkasan:** 15 lulus, 4 sebagian (butuh perangkat/lapangan), 1 belum penuh (voice note WA nyata).
Tidak ada bug P1/P2 terbuka pada lingkungan simulasi.

---

## 3. Perbaikan dari UAT

- Status SSE menampilkan `LIVE` setelah koneksi terbuka.
- Peta diganti basemap terang agar mudah dibaca.
- GPS foto dipakai otomatis jika pelapor melewati lokasi.
- Export CSV diberi proteksi formula injection.
- Blokir pelapor ditegakkan di WhatsApp dan tiket manual.
- Preview PWA diverifikasi di build produksi.
- Pairing WhatsApp dipindah ke **Sistem → WhatsApp Gateway** (QR di dashboard, connect/logout/restart); pairing nomor nyata belum diuji.

---

## 4. Yang masih harus diuji di lapangan

1. Pairing nomor WhatsApp nyata + 2FA.
2. Pesan media (foto/video/VN) dari perangkat Android/iPhone.
3. Grup URC nyata: `/otw`, `/tiba`, `/selesai` + foto.
4. WA disconnect/scan ulang di jaringan Polsek.
5. Dashboard di HP/tablet piket.
6. Restore backup + media di VPS staging.

---

## 5. Rekomendasi

- Jalankan pilot 1 kelurahan minimal 2 minggu sebelum soft launch.
- Aktifkan TOTP untuk semua petugas.
- Simpan nomor cadangan dan prosedur ban.
- Review retensi dan legal hold bersama pimpinan.
