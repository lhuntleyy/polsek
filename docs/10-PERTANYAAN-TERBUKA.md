# 10 — Pertanyaan Terbuka

**Status:** Perlu keputusan sebelum fase berikutnya
**Tanggal:** 14 November 2026

Cara pakai: isi kolom **Keputusan** dan **Tanggal**. Jangan mulai coding untuk item yang memblokir.

---

## A. Memblokir Fase 1 (wajib sebelum coding)

| ID | Pertanyaan | Kenapa penting | Default jika tidak dijawab | Pemilik | Blokir | Keputusan |
|---|---|---|---|---|---|---|
| Q-01 | **Polsek mana** yang menjadi pilot, dan apa daftar kelurahan/desa wilkumnya? | Menentukan polygon, nomor tiket, branding, grup | **Config-first**: nama Polsek, kode unit, dan daftar kelurahan di `.env` / menu Pengaturan. Default pengembangan: "Polsek Contoh" + 5 kelurahan demo. Nama final diisi setelah ditetapkan. | Kapolsek | Tidak (config) | Dijawab: fleksibel via `.env` + Pengaturan |
| Q-02 | Sumber **polygon batas kelurahan** mana yang sah? | Geofence harus akurat; salah batas = tiket salah wilayah | **Upload polygon di Pengaturan** (GeoJSON). Seed demo memakai polygon ilustrasi yang ditandai `demo`; produksi wajib upload polygon resmi yang divalidasi. | Admin data | Tidak (config) | Dijawab: disimpan di Pengaturan |
| Q-03 | Siapa **pemilik nomor WA** dan siapa memegang 2FA? | Nomor adalah aset institusi; jangan bergantung pada pribadi | **Nomor + pemilik + 2FA disimpan di Pengaturan/env**, bukan hardcode. Bot Baileys sudah siap; pairing aktual menunggu nomor. | Kapolsek/Admin | Tidak (config) | Dijawab: disimpan di Pengaturan; nomor aktual pending |
| Q-04 | **SLA & jalur eskalasi** final? | Menentukan alarm, target, dan penilaian | P1: ack 2 mnt, OTW 5 mnt; eskalasi **Kapolsek** (Pawas 3 mnt, Kapolsek 10 mnt), semua dapat diubah di Pengaturan. | Kapolsek | Tidak (config) | Dijawab: eskalasi ke Kapolsek |
| Q-05 | **Domain & hosting** di mana? Apakah `.go.id` tersedia? | TLS, data residency, biaya | **Ditunda**: fase 1 memakai `localhost`/staging; domain final menyusul. | Ops | Tidak | Dijawab: nanti |
| Q-06 | Siapa **penanggung jawab data/DPO**? | UU PDP, retensi, breach response | **Project owner (user)**, di bawah atensi langsung Kapolsek. Nama dicatat di Pengaturan. | Kapolsek | Tidak | Dijawab: user |
| Q-07 | **Retensi data** final? | Menyangkut hukum & biaya | **12 bulan** untuk tiket non-perkara + **legal hold** untuk perkara; audit 12 bulan; percakapan 90 hari. Disetujui. | Legal/DPO | Tidak | Dijawab: ya |

---

## B. Penting, bisa diputuskan paralel

| ID | Pertanyaan | Kenapa penting | Default | Pemilik | Blokir | Keputusan |
|---|---|---|---|---|---|---|
| Q-08 | Apakah **nama wajib** juga untuk laporan darurat? | Bertentangan dengan kecepatan respons | Darurat bypass, nama menyusul | Kapolsek | Tidak | |
| Q-09 | Apakah pelapor **di luar wilkum** boleh melapor jika TKP di dalam? | Logika geofence | Boleh; yang divalidasi TKP | Kapolsek | Tidak | |
| Q-10 | Apakah **voice note** perlu transkripsi di v1? | Biaya, akurasi, privasi | Tidak; piket dengarkan | Product | Tidak | |
| Q-11 | Apakah perlu **web form publik** untuk non-WA? | Inklusi warga tanpa WA | v1.1 | Product | Tidak | |
| Q-12 | Apakah **nomor pelapor** boleh dilihat URC? | Privasi vs kebutuhan lapangan | Masked; reveal oleh piket/Pawas | Kapolsek | Tidak | |
| Q-13 | Apakah **foto korban/kejadian** boleh diteruskan ke grup URC? | Etika & privasi | Thumbnail + deep link; media penuh hanya dashboard | Kapolsek | Tidak | |
| Q-14 | Format **laporan bulanan** yang diinginkan Polres? | Export harus berguna | PDF + Excel; template disepakati | Kapolsek | Tidak | |
| Q-15 | Siapa **admin kedua** dan bagaimana serah terima kredensial? | Menghindari key person dependency | 2 admin, kredensial di safes | Kapolsek | Tidak | |
| Q-16 | Apakah **out-of-wilkum attempt** dicatat? | Deteksi abuse vs privasi | Catat hash nomor + waktu, retensi 30 hari | DPO | Tidak | |
| Q-17 | Apakah **broadcast** ke RT/RW diizinkan? | Risiko ban | Tidak di v1 | Admin | Tidak | |
| Q-18 | Apakah dashboard perlu **mode terang**? | Ruangan terang | v1.1 | Product | Tidak | |
| Q-19 | Apakah **nomor cadangan** sudah tersedia? | Kontinuitas | Siapkan sebelum launch | Admin | Tidak | |
| Q-20 | Apakah **Kasi Humas** perlu akses? | Publikasi & koordinasi | Read-only agregat | Kapolsek | Tidak | |

---

## C. Keputusan yang sudah diambil (jangan ditanya lagi)

| Keputusan | Nilai |
|---|---|
| Cakupan pelapor | Semua warga |
| Validasi wilayah | Polygon TKP |
| WhatsApp | Full Baileys v1 |
| Docker | Tidak |
| Database | SQLite + Drizzle (v1) |
| Frontend | Vite + React SPA |
| Real-time | SSE |
| Nama pelapor | Wajib, darurat bypass |
| NIK | Tidak dikumpulkan v1 |
| Nama kerja | SIGAP |
| Desain | Dark command center + mode dinding |

---

## D. Cara menjawab

Cukup isi tabel di atas atau balas dengan format:

```
Q-01: Polsek ...
Q-02: Sumber polygon ...
Q-03: Pemilik nomor ... / 2FA di ...
Q-04: SLA ...
```

Q-01..Q-07 sudah dijawab dengan pendekatan **config-first**: nilai final dapat diubah di `.env` dan menu Pengaturan. Fase 1 dimulai; Fase 2 (Baileys) menunggu nomor WA dan 2FA aktual diisi.
