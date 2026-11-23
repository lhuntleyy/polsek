# 00 — Ringkasan Eksekutif (1 halaman)

**Untuk:** Kapolsek / Pawas
**Tanggal:** 14 November 2026
**Status:** Fase 0–5 inti selesai (dokumen, API/web, bot, media, dashboard, analitik/admin/PWA). Menunggu nomor WA/2FA untuk pairing nyata.

---

## Masalah

Laporan warga hari ini tersebar di WhatsApp pribadi, telepon, dan datang langsung. Tidak ada nomor tiket, tidak ada waktu respons yang tercatat, dan laporan mudah tenggelam. Piket tidak punya satu layar kerja; URC tidak punya antrean yang jelas; pimpinan tidak punya rekap yang bisa dipercaya.

## Usulan

**SIGAP** — kanal lapor warga lewat WhatsApp yang otomatis menjadi tiket di dashboard piket.

1. Warga chat nomor Polsek, kirim nama, kejadian, lokasi, foto/voice note.
2. Sistem membuat nomor tiket, menampilkan di layar piket, dan meneruskan ke grup URC.
3. Piket menerima, mendisposisi, URC OTW/tiba/selesai, pelapor dapat update.
4. Semua waktu dan bukti tercatat; pimpinan dapat rekap.

**Tanpa instal aplikasi.** Warga cukup WhatsApp.

## Bedanya dengan rencana awal

| Rencana awal | Revisi |
|---|---|
| Hanya RT/RW/Lurah/Camat | **Semua warga** boleh lapor |
| Dibatasi radius | Dibatasi **polygon kelurahan** (lokasi kejadian, bukan domisili pelapor) |
| Nama tidak wajib | **Nama wajib**, tetapi darurat tetap dibuatkan tiket lebih dulu |
| Alarm suara saja | Alarm berjenjang + ack + eskalasi WA + mode dinding |
| PostgreSQL + PostGIS | SQLite + Turf untuk v1 (lebih sederhana, tanpa Docker) |
| 2–3 minggu | **6–8 minggu** untuk produksi + UAT |

## Alur 30 detik

```
Warga: "TAWURAN" + share location
  → tiket P1 + alarm dashboard + forward grup URC
  → piket terima → URC OTW → tiba → selesai + foto
  → pelapor dapat notifikasi
```

## Yang dibangun di v1

- WA bot: teks, foto, video, voice note, lokasi, live location.
- Nama wajib + consent + anti-hoax berlapis.
- Geofence TKP + redirect ke 110/Polsek terdekat.
- Tiket + nomor + status + SLA + audit.
- Dashboard live: antrean, peta, detail, aksi, alarm.
- Forward grup + command `/otw`, `/tiba`, `/selesai`.
- Tiket manual (telepon/walk-in).
- Serah terima shift.
- Analitik + export + daily digest.
- Admin wilayah/petugas/grup, RBAC, backup, monitoring.
- SOP, pelatihan, poster QR, video 90 detik.

## Yang belum di v1

Web form publik, transkripsi voice note, klasifikasi otomatis, broadcast, multi-Polsek, AVL patroli, dashboard publik.

## Timeline & biaya

| Item | Estimasi |
|---|---|
| Prototipe UI | ✅ selesai |
| Fase 1 inti (API + web shell) | ✅ selesai |
| Fase 2 inti (Baileys + flow) | ✅ selesai (pairing aktual pending) |
| Fase 3 inti (media) | ✅ selesai (uji perangkat nyata pending) |
| Fase 4 inti (dashboard) | ✅ selesai (E2E Playwright pending) |
| Fase 5 inti (analitik/admin/PWA) | ✅ selesai (Web Push & template pending) |
| MVP produksi | 6–8 minggu |
| Effort | ± 45–60 person-days |
| Operasional | ± Rp300–500 ribu/bulan (VPS, domain, backup, nomor) |
| Pengembangan | tergantung in-house/vendor |

## Risiko utama

| Risiko | Mitigasi |
|---|---|
| Nomor WA diblokir | Nomor khusus, hygiene, nomor cadangan, SOP migrasi |
| Laporan palsu | Nama wajib, rate limit, reputasi, cluster, verifikasi |
| Dashboard tidak dipantau | Alarm, ack, eskalasi, handover, champion shift |
| Data pribadi bocor | RBAC, masking, enkripsi, audit, retensi |
| Polygon salah | Validasi lapangan, buffer, override manual |

## Ukuran keberhasilan (6 bulan)

- ≥ 90% laporan warga menjadi tiket.
- P1 di-ack ≤ 2 menit (p90).
- P1 OTW ≤ 5 menit (p90).
- ≥ 95% tiket ditutup dengan catatan penanganan.
- 100% kelurahan pernah mengirim laporan.
- Dashboard TTI ≤ 2 detik.

## Keputusan yang sudah diambil

- Polsek, daftar kelurahan, nomor WA, dan SLA: **config-first** via `.env` + Pengaturan.
- SLA default P1 ack 2 menit/OTW 5 menit; eskalasi **Kapolsek**.
- DPO sementara: project owner, atensi langsung Kapolsek.
- Retensi: **12 bulan + legal hold**.
- Domain/hosting: ditunda; Fase 1 memakai localhost/staging.

## Yang masih diminta sebelum Fase 2 / produksi

1. **Nomor WA aktual + 2FA** untuk pairing Baileys.
2. **Polygon kelurahan resmi** (GeoJSON) untuk produksi.
3. **Domain & hosting** untuk launch.
4. Review prototipe/aplikasi dengan Kapolsek/Pawas.

## Artefak

- Kritik & solusi: `01-KRITIK-GEMINI.md`
- PRD: `02-PRD.md`
- Arsitektur: `03-ARSITEKTUR.md`
- Rencana: `04-RENCANA.md`
- Task: `05-TASKS.md`
- Progress: `06-PROGRESS.md`
- Risiko: `07-RISIKO.md`
- SOP: `08-SOP.md`
- Keputusan: `09-KEPUTUSAN.md`
- Pertanyaan terbuka: `10-PERTANYAAN-TERBUKA.md`
- UI kit: `11-UI-KIT.md`
- Prototipe: `prototype/index.html`
