# 08 — SOP Operasional Final

**Status:** Final v1.0 — berlaku setelah ditandatangani Kapolsek
**Versi:** 1.0
**Tanggal:** 14 November 2026

> SOP ini mengatur penggunaan SIGAP. SIGAP adalah **kanal tambahan**, bukan pengganti hotline 110, SPKT, atau prosedur kepolisian yang berlaku.

---

## 1. Ruang lingkup

Berlaku untuk:
- Personel piket SPKT.
- Tim URC/patroli.
- Bhabinkamtibmas.
- Admin data.
- Pawas dan Kapolsek.
- Warga di wilayah hukum Polsek (pengguna).

---

## 2. Peran & tanggung jawab

| Peran | Tanggung jawab |
|---|---|
| **Kapolsek** | Menetapkan kebijakan, SLA, retensi; menerima rekap; menandatangani SOP |
| **Pawas** | Supervisi shift, eskalasi, audit sampel, memastikan tiket tidak menggantung |
| **Piket SPKT** | Menerima, memverifikasi, menelepon balik, mendisposisi, menutup tiket |
| **URC** | OTW, tiba, menangani, mengirim bukti, menutup tiket lapangan |
| **Bhabinkamtibmas** | Memantau tiket kelurahan, koordinasi RT/RW, verifikasi sosial |
| **Admin** | Data wilayah, petugas, grup, akun, konfigurasi, backup |
| **DPO/penanggung jawab data** | Retensi, permintaan subjek data, audit akses, insiden data |
| **Champion shift** | Memastikan alarm aktif, layar dipantau, rekan paham |

---

## 3. SOP warga (teks poster/WA)

### 3.1 Cara lapor

1. Simpan nomor WA Polsek: **08xx-xxxx-xxxx**.
2. Kirim pesan: **LAPOR**.
3. Isi nama lengkap.
4. Pilih jenis laporan (1–5) atau ketik langsung.
5. Ceritakan kejadian singkat.
6. Kirim **lokasi kejadian** (share location), bukan lokasi rumah jika berbeda.
7. Kirim foto/video/voice note jika ada.
8. Konfirmasi, lalu simpan **nomor tiket**.

### 3.2 Darurat

- Jika ada nyawa terancam, **telepon 110** atau piket.
- Bisa juga kirim **lokasi saja** ke WA; sistem akan membuat tiket darurat.
- Nama tetap diminta menyusul.

### 3.3 Di luar wilayah

- Jika lokasi kejadian di luar wilkum, bot akan mengarahkan ke **110** atau Polsek terdekat.
- Jangan memaksa; bukan kewenangan Polsek ini.

### 3.4 Yang tidak boleh

- Laporan palsu, provokatif, atau SARA.
- Mengirim data pribadi orang lain tanpa alasan.
- Menyalahgunakan kanal untuk spam.

---

## 4. SOP piket SPKT

### 4.1 Awal shift (15 menit)

- [ ] Login dashboard; pastikan nama & shift benar.
- [ ] Klik **Aktifkan suara**; uji alarm.
- [ ] Cek status gateway WA (online/offline).
- [ ] Cek antrean tiket terbuka dari shift sebelumnya.
- [ ] Baca catatan serah terima.
- [ ] Pastikan monitor tidak sleep, volume 80%, UPS menyala.
- [ ] Cek nomor cadangan & kontak eskalasi.

### 4.2 Menerima tiket

1. Alarm berbunyi → buka tiket.
2. Cek:
   - Nama & nomor pelapor.
   - Kategori & prioritas.
   - Lokasi: di dalam wilkum? akurasi wajar?
   - Media: foto/video/VN.
   - Duplikat/cluster.
3. Jika data kurang → telepon balik.
4. Klik **Terima** (ack) maksimal:
   - P1: 2 menit.
   - P2: 10 menit.
   - P3: 30 menit.
5. Tentukan disposisi: URC / Bhabin / Reskrim / instansi lain.
6. Tambah catatan internal.
7. Kirim ke grup URC.

### 4.3 Verifikasi

- Lokasi di luar wilkum → tolak dengan alasan `luar_wilkum`, arahkan 110/Polsek.
- Lokasi meragukan → minta pin ulang atau verifikasi alamat.
- Nama tidak jelas → telepon; jangan langsung tolak.
- Laporan dugaan palsu → tandai `perlu_verifikasi`, jangan langsung `DITOLAK`.
- Media tidak bisa dibuka → minta kirim ulang; tiket tetap jalan.

### 4.4 Menutup tiket

- Hanya setelah ada catatan penanganan.
- P1/P2 wajib bukti foto/screenshot/berita acara.
- Isi hasil: apa yang dilakukan, siapa yang hadir, kondisi akhir.
- Jika pelaku tidak ditemukan, tetap tutup dengan catatan (bukan `SELESAI` palsu).
- Jika perlu tindak lanjut Reskrim, buat tiket turunan atau catatan rujukan.

### 4.5 Larangan

- Menutup tiket tanpa penanganan.
- Mengubah status hanya untuk memenuhi SLA.
- Membuka data pelapor tanpa terkait tiket.
- Menghapus riwayat.
- Menyebarkan foto korban/kejadian ke luar kanal resmi.

---

## 5. SOP URC / patroli

### 5.1 Menerima disposisi

- Bot mengirim tiket ke grup URC.
- Cek nomor tiket, kategori, lokasi, dan catatan piket.
- Konfirmasi di grup: `/otw <nomor>`.

### 5.2 Di lapangan

- `/tiba <nomor>` saat tiba.
- Jangan menutup tiket sebelum benar-benar selesai.
- Kirim foto penanganan dengan caption `/selesai <nomor> <catatan>` pada foto yang sama (caption bisa diedit sebelum kirim).
- Jika butuh tambahan: `/tunda <nomor> <alasan>`.
- Jika bukan kewenangan URC: balas `/tunda` + alasan, minta piket redisposisi.

### 5.3 Keselamatan

- Jangan mendekati TKP yang belum aman tanpa dukungan.
- Koordinasi dengan piket untuk situasi bersenjata/tawuran besar.
- Jangan membagikan lokasi/pelapor ke pihak luar.

---

## 6. SOP Bhabinkamtibmas

- Pantau tiket di kelurahan sendiri.
- Verifikasi sosial untuk laporan yang meragukan.
- Koordinasi RT/RW untuk pencegahan.
- Update status komunitas jika diminta piket.
- Jangan mengubah status tiket tanpa koordinasi piket.

---

## 7. Serah terima shift

### 7.1 Checklist

- [ ] Semua tiket P1 sudah di-ack.
- [ ] Tidak ada tiket `BARU` > 30 menit.
- [ ] Tiket `DITUNDA` punya alasan & tindak lanjut.
- [ ] Tiket tanpa nama lengkap terdaftar.
- [ ] Media yang gagal diunduh dicatat.
- [ ] Catatan shift diisi.
- [ ] Petugas keluar & masuk menandatangani.
- [ ] Rekap dikirim ke grup piket.

### 7.2 Format catatan

```
SERAH TERIMA — 14/11/2026 20:00 → 15/11/2026 08:00
Petugas keluar: ...
Petugas masuk: ...
Tiket terbuka: 7 (P1: 1, P2: 3, P3: 3)
Tiket tanpa nama: 1 (#...)
Tiket menunggu verifikasi: 2 (#..., #...)
Catatan: ...
```

---

## 8. Eskalasi

| Kondisi | Aksi | Waktu |
|---|---|---|
| P1 belum di-ack | Telepon piket; dashboard eskalasi ke Pawas | 3 menit |
| P1 belum OTW | Pawas hubungi URC | 5 menit |
| P2 belum di-ack | Ingatkan piket | 15 menit |
| Tiket menggantung > 24 jam | Pawas review | 24 jam |
| Insiden data | Admin + DPO; revoke akses; catat | Segera |
| WA ban | Admin aktifkan SOP nomor cadangan | 15 menit |

---

## 9. Penanganan laporan palsu

1. Jangan langsung menuduh.
2. Verifikasi via telepon/kelurahan.
3. Jika terbukti palsu → tandai `DITOLAK` alasan `palsu`.
4. Catat di reputasi pelapor.
5. Jika berulang/terkoordinasi → blokir sementara, koordinasi Reskrim.
6. Simpan bukti percakapan sesuai retensi.
7. Jangan membalas dengan emosi atau ancaman pribadi.

---

## 10. Downtime & WA ban

### 10.1 Bot tidak merespons

1. Cek dashboard status gateway.
2. Cek HP pairing (online? baterai? internet?).
3. Restart `sigap-bot` via admin.
4. Jika QR/logout → pairing ulang.
5. Jika nomor banned → aktifkan nomor cadangan.
6. Umumkan ke grup piket & RT/RW: sementara lapor via telepon/110.

### 10.2 Nomor cadangan

- Nomor cadangan sudah terdaftar di konfigurasi.
- Poster digital diperbarui.
- Grup RT/RW diinformasikan.
- Tiket manual tetap dipakai.
- Jangan menghapus riwayat nomor lama.

---

## 11. Data & privasi

- Akses hanya untuk yang berkepentingan.
- Nomor pelapor dimasked; reveal dengan audit.
- Jangan mengunduh foto korban ke HP pribadi.
- Jangan meneruskan ke grup luar.
- Retensi sesuai kebijakan; legal hold untuk perkara.
- Permintaan subjek data melalui admin/DPO.
- Insiden data: catat, revoke, notifikasi sesuai UU PDP.

---

## 12. Pelatihan & audit

### 12.1 Pelatihan

- Piket: 60 menit (dashboard, alarm, transisi, telepon).
- URC: 30 menit (command grup, bukti, keselamatan).
- Bhabin: 30 menit (tiket kelurahan, verifikasi).
- Admin: 90 menit (wilayah, user, grup, backup).
- Warga: poster + video 90 detik.

### 12.2 Audit

- Harian: tiket P1 & tiket `BARU` > 30 menit.
- Mingguan: SLA, tiket tanpa bukti, tiket tanpa nama.
- Bulanan: sampel 10 tiket, audit akses PII, restore test, review risiko.
- Triwulan: review SOP, retensi, dan kepuasan pengguna.

---

## 13. Kontak (diisi saat launch)

| Kebutuhan | Nama | Nomor |
|---|---|---|
| Piket SPKT | | |
| Pawas | | |
| Kapolsek | | |
| URC | | |
| Admin sistem | | |
| DPO | | |
| Hotline 110 | — | 110 |
| Polsek terdekat | | |

---

## 14. Lampiran

- Format pesan bot (template).
- Daftar kategori.
- Daftar kelurahan.
- Daftar petugas & JID.
- Checklist harian piket.
- Form serah terima.
- SOP nomor cadangan.
- Kebijakan retensi.

---

## 11. Pengesahan

| Peran | Nama | Tanda tangan | Tanggal |
|---|---|---|---|
| Kapolsek | | | |
| Pawas | | | |
| Admin unit | | | |
| DPO | | | |

Dokumen ini ditinjau minimal setiap 6 bulan atau saat ada perubahan nomor, polygon, SLA, atau alur command grup.
