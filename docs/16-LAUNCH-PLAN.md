# 16 — Rencana Launch & Pilot

**Versi:** 1.0 · 14 November 2026

---

## 1. Prasyarat

| Item | Status |
|---|---|
| Polygon resmi kelurahan | ⏳ menunggu data |
| Nomor WA khusus + 2FA | ⏳ menunggu pimpinan |
| Grup URC + JID petugas | ⏳ menunggu data |
| Domain + HTTPS | ⏳ hosting belum |
| UAT perangkat nyata | ⏳ setelah pairing |
| TOTP semua petugas | ⏳ saat pelatihan |
| Backup + restore drill | ✅ lokal; ⏳ staging |
| SOP final | ✅ draft final |

---

## 2. Tahapan

### 2.1 Pilot 1 kelurahan (2 minggu)
- Pilih kelurahan dengan volume laporan sedang.
- 50 warga + 1 piket + 1 URC + 1 bhabin.
- Poster QR di kantor kelurahan, pos kamling, dan grup RW.
- Target: ≥ 30 laporan, ≥ 90% ack < 10 menit, 0 insiden data.
- Review harian 15 menit; rekap mingguan.

### 2.2 Evaluasi pilot (3 hari)
- Wawancara piket/URC/warga.
- Analisis tiket: kategori, SLA, duplikat, media gagal.
- Perbaiki bug P1/P2 dan SOP.
- Keputusan lanjut/tunda.

### 2.3 Soft launch 3 kelurahan (2 minggu)
- Tambah 2 kelurahan.
- Monitoring harian; hypercare terbatas.
- Target: ≥ 100 laporan, uptime ≥ 99%, tidak ada kehilangan tiket.

### 2.4 Full launch
- Semua kelurahan dalam wilkum.
- Pengumuman resmi + poster + video.
- Hypercare 4 minggu.

---

## 3. Kriteria go/no-go

**Go jika:**
- UAT lapangan lulus.
- Semua P1/P2 tertutup.
- Backup/restore teruji di staging.
- Nomor WA stabil ≥ 7 hari.
- Piket sudah dilatih dan TOTP aktif.
- SOP ditandatangani.

**No-go jika:**
- Polygon belum resmi.
- Nomor WA sering disconnect/ban.
- Ada kebocoran data/PII.
- Dashboard tidak dipantau 24/7.
- Belum ada nomor cadangan.

---

## 4. Rollback

- Hentikan bot: `systemctl stop sigap-bot`.
- Arahkan warga ke nomor lama/telepon 110 sementara.
- Restore DB + media dari backup terakhir jika perlu.
- Umumkan kanal sementara.
- Investigasi akar masalah sebelum aktif kembali.

---

## 5. Metrik keberhasilan

| Metrik | Target |
|---|---|
| Laporan masuk per minggu | ≥ 30 (pilot) |
| P1 ack ≤ 2 menit | ≥ 90% |
| P1 OTW ≤ 5 menit | ≥ 85% |
| Tiket tanpa nama | < 5% |
| Duplikat | < 10% |
| Media gagal | < 3% |
| Uptime API | ≥ 99% |
| Insiden PII | 0 |

---

## 6. Hypercare 4 minggu

- War room harian pukul 08.00 dan 20.00.
- SLA respons bug: P1 ≤ 2 jam, P2 ≤ 1 hari.
- Rekap mingguan ke Kapolsek.
- Review retensi/legal hold.
- Setelah 4 minggu: serah terima operasional ke admin unit.
