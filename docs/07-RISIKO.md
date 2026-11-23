# 07 — Register Risiko

**Versi:** 0.1
**Tanggal:** 14 November 2026
**Metode:** likelihood (1–5) × impact (1–5). Skor ≥ 15 = merah, 8–14 = kuning, ≤ 7 = hijau.
**Review:** bulanan, atau setiap ada insiden.

---

## 1. Top 5 risiko

| ID | Risiko | Skor | Mengapa kritis | Mitigasi utama |
|---|---|---:|---|---|
| R-01 | Nomor WA diblokir | 20 | Kanal utama mati; warga kehilangan tujuan | Nomor khusus, warm-up, hygiene, nomor cadangan, SOP migrasi |
| R-02 | Laporan palsu terkoordinasi | 16 | Menguras patroli, risiko swatting | Rate limit, reputasi, cluster, verifikasi, audit |
| R-03 | Dashboard tidak dipantau | 15 | Tiket menumpuk, respons gagal | Alarm berjenjang, ack, eskalasi, handover, champion |
| R-04 | Kebocoran data pribadi | 15 | Risiko hukum & kepercayaan | RBAC, masking, enkripsi, audit, retensi |
| R-05 | Polygon wilkum salah/terlambat | 12 | Tiket salah wilayah | Validasi lapangan, buffer, override manual |

---

## 2. Register lengkap

| ID | Risiko | Kategori | L | I | Skor | Mitigasi | Trigger | Contingency | Owner |
|---|---|---|---:|---:|---:|---|---|---|---|
| R-01 | Nomor WA diblokir | Operasional | 4 | 5 | 20 | Nomor khusus berumur, profil bisnis, 2FA, warm-up 2 minggu, batasi pesan massal, JID allowlist | Logout 401/403 berulang; pesan gagal massal | Aktifkan nomor cadangan, update poster, broadcast via grup RT/RW, migrasi sesi | Admin |
| R-02 | Laporan palsu terkoordinasi | Keamanan | 4 | 4 | 16 | Nama wajib, rate limit, reputasi, cluster, verifikasi telepon, peringatan hukum | Lonjakan laporan sama dalam 10 menit | Blokir sementara, audit, koordinasi Reskrim, eskalasi Pawas | Piket |
| R-03 | Dashboard tidak dipantau | Operasional | 3 | 5 | 15 | Alarm, ack, eskalasi WA, mode dinding, handover, champion shift | Tiket P1 > 3 menit tanpa ack | Telepon Pawas, aktifkan alarm cadangan, catat insiden | Pawas |
| R-04 | Kebocoran data pribadi | Hukum | 3 | 5 | 15 | RBAC, masking, enkripsi phone, audit reveal, backup terenkripsi, least privilege | Akses anomali; file backup terbuka | Revoke sesi, rotasi key, notifikasi 3×24 jam, forensik | Admin/DPO |
| R-05 | Polygon salah/terlambat | Data | 3 | 4 | 12 | Validasi 20 titik lapangan, buffer 250 m, override manual, versi polygon | Banyak tiket `luar_wilkum` padahal di dalam | Fallback centroid + verifikasi manual; perbaiki polygon | Admin data |
| R-06 | Baileys breaking change | Teknis | 4 | 3 | 12 | Pin versi, staging number, changelog review, abstraction layer | Error setelah update WA | Rollback versi, patch, atau hybrid Cloud API | Dev |
| R-07 | Media gagal diunduh | Teknis | 3 | 3 | 9 | Retry 3x, reupload request, tiket tetap dibuat, flag `media_failed` | Banyak media `failed` | Minta pelapor kirim ulang; catat | Dev |
| R-08 | Outbox stuck / pesan tidak terkirim | Teknis | 3 | 4 | 12 | Retry backoff, dead-letter, queue depth alert, idempotensi | Queue > 50 atau failed > 5 | Replay manual, restart worker, cek WA | Dev |
| R-09 | Server/VPS down | Infrastruktur | 3 | 4 | 12 | systemd restart, healthcheck, alert, backup, provider cadangan | Healthcheck gagal > 5 menit | Restore ke VPS cadangan, DNS switch | Ops |
| R-10 | Internet/power piket mati | Infrastruktur | 3 | 4 | 12 | UPS 30 menit, router 4G failover, read-only cache | SSE disconnect > 2 menit | Gunakan HP/PWA, telepon piket, catat manual | Ops |
| R-11 | Bukti digital dipertanyakan | Hukum | 2 | 4 | 8 | SHA-256, audit unduh, file asli utuh, manifest export, SOP | Kasus naik ke penyidikan | Serahkan manifest + file asli; audit trail | Legal/Dev |
| R-12 | Data retention tidak jalan | Hukum | 3 | 3 | 9 | Job purge harian, legal hold, laporan retensi | DB membesar; audit menemukan data lama | Purge manual, perbaiki job, catat | Admin/DPO |
| R-13 | Insider abuse | Keamanan | 2 | 4 | 8 | Audit reveal, review sampel, least privilege, 2FA | Reveal PII tanpa tiket terkait | Revoke akses, audit, tindakan disiplin | Pawas |
| R-14 | Adopsi rendah | Produk | 3 | 3 | 9 | Poster QR, video, briefing RT/RW, pilot, umpan balik | Laporan < 5/hari setelah 2 minggu | Kunjungan lapangan, perbaiki UX, libatkan Bhabin | Product lead |
| R-15 | Scope creep | Proyek | 4 | 3 | 12 | Backlog v1.1, gate, keputusan tertulis | Permintaan fitur baru saat hardening | Tunda ke v1.1, evaluasi dampak | Product owner |
| R-16 | Key person dependency | Organisasi | 3 | 4 | 12 | Dokumentasi, 2 admin, handover, akses kredensial dibagi | Developer utama tidak tersedia | Runbook + admin cadangan | Pimpinan |
| R-17 | Nomor WA atas nama pribadi | Organisasi | 2 | 5 | 10 | Daftarkan atas unit, 2FA di safes, serah terima | Mutasi pejabat | Migrasi nomor, update semua poster | Admin |
| R-18 | HP pairing mati/offline | Operasional | 3 | 3 | 9 | HP khusus, charger, internet cadangan, cek harian | Pairing hilang | Pairing ulang via QR admin | Ops |
| R-19 | Grup URC admin-only | Operasional | 2 | 3 | 6 | Bot jadi anggota/admin, uji kirim | Forward gagal | Minta admin grup ubah setting | Admin |
| R-20 | Peta/tile tidak tersedia | Teknis | 2 | 2 | 4 | Polygon lokal + pin tetap; fallback SVG | Tile error | Mode peta skematik | Dev |
| R-21 | Waktu server drift | Teknis | 2 | 3 | 6 | NTP, alert drift | Selisih > 5 detik | Sinkronisasi ulang, catat | Ops |
| R-22 | Regulasi/izin belum lengkap | Hukum | 2 | 5 | 10 | Review legal Fase 0, izin pimpinan, disclaimer | Launch tanpa izin | Tunda launch | Pimpinan |
| R-23 | Beban laporan tinggi | Teknis | 2 | 3 | 6 | Load test, queue, index, SQLite WAL | > 100 laporan/jam | Scale VPS, optimasi, pertimbangkan Postgres | Dev |
| R-24 | Kehilangan data saat migrasi | Teknis | 2 | 5 | 10 | Backup sebelum migrasi, uji di staging, verifikasi jumlah | Migrasi gagal | Rollback + restore | Dev |
| R-25 | Media bukti hilang/bocor | Teknis/Privasi | 2 | 5 | 10 | Simpan di luar webroot, serve ber-sesi, backup `SIGAP_MEDIA_DIR` + DB, uji restore | Bukti tidak bisa dibuka / akses tanpa sesi | Restore backup, audit akses, rotasi sesi | Dev/Admin |

---

## 3. Matriks

```
Impact
5 │ R-01        R-03 R-04
4 │ R-17 R-22   R-02 R-05 R-06 R-08 R-09 R-10 R-16 R-24
3 │ R-20 R-21 R-23  R-07 R-12 R-14 R-15 R-18
2 │             
1 │
  └─────────────────────────────── Likelihood
    1     2     3     4     5
```

---

## 4. Risiko yang diterima (accepted)

| Risiko | Alasan diterima | Kompensasi |
|---|---|---|
| Baileys melanggar ToS & risiko ban | Kebutuhan grup + instruksi pimpinan | Nomor khusus, hygiene, nomor cadangan, exit plan |
| Tidak ada Docker | Instruksi + kesederhanaan server | systemd hardening, runbook, backup |
| SQLite bukan Postgres | Volume Polsek, operasional | Single writer, WAL, backup, jalur migrasi |
| Dashboard bergantung internet | Kebutuhan live | UPS, 4G, read-only cache, tiket manual |
| Tidak ada NIK | Minimisasi data | Nama + nomor + verifikasi telepon |

---

## 5. Proses review

1. Setiap bulan: review skor, trigger, dan status mitigasi.
2. Setiap insiden: catat di `06-PROGRESS.md`, update register.
3. Sebelum launch: pastikan tidak ada risiko skor ≥ 15 tanpa contingency.
4. Setelah 3 bulan: evaluasi apakah risiko yang diterima masih dapat ditoleransi.
