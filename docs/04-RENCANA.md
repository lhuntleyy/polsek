# 04 — Rencana Eksekusi

**Versi:** 0.1
**Tanggal:** 14 November 2026
**Asumsi:** 1 developer full-stack, dibantu desainer paruh waktu, ops paruh waktu, dan UAT dari piket/URC/Bhabin. Tidak ada proses procurement yang panjang.

> **Update 14 Nov 2026:** Fase 0–5 inti selesai: dokumen/prototipe, API/web, Baileys, media, dashboard (peta/eskalasi/handover), analitik/export/digest/admin/PWA. Pairing aktual menunggu nomor WA/2FA; uji media dari perangkat nyata menyusul.

---

## 1. Ringkasan

| Item | Nilai |
|---|---|
| Durasi MVP produksi | **6–8 minggu** |
| Effort pengembangan | ± 45–60 person-days |
| Fase | 0–7 |
| Gate | 8 (G0–G7) |
| Biaya operasional | ± Rp300–500 ribu/bulan (VPS, domain, backup, nomor) |
| Go-live | Setelah UAT + SOP ditandatangani |
| Pilot | 1 kelurahan, 2 minggu |

> 2–3 minggu cukup untuk demo, bukan untuk sistem 24/7 yang menyentuh data pribadi dan bukti digital.

---

## 2. Tim & peran

| Peran | Orang | Tanggung jawab |
|---|---|---|
| Product owner | Kapolsek / Pawas | Prioritas, keputusan operasional, tanda tangan SOP |
| Product lead | _diisi_ | Scope, koordinasi, UAT, dokumentasi |
| Developer | _diisi_ | API, bot, web, deployment |
| Designer | paruh waktu | Prototipe, design system, poster |
| Ops/infra | paruh waktu | VPS, domain, backup, monitoring |
| Legal/data advisor | _diisi_ | UU PDP, retensi, bukti digital |
| UAT piket | 2–3 orang | Skenario harian, feedback |
| UAT URC | 2 orang | Command grup, OTW/selesai |
| UAT Bhabin | 1–2 orang | Tiket kelurahan |
| Admin data | 1 orang | Wilayah, petugas, grup |
| Champion per shift | 1 orang/shift | Memastikan alarm dicek, membantu rekan |

---

## 3. Fase & gate

### Fase 0 — Discovery & prototipe (3–5 hari)

**Output:**
- Dokumen ini + PRD + arsitektur + risiko + SOP draft.
- Prototipe UI/UX yang bisa diklik.
- Daftar pertanyaan terbuka.
- Daftar kelurahan & sumber polygon.
- Daftar petugas/grup WA.

**Gate G0:** pimpinan menyetujui arah produk, scope v1, dan prototipe.

### Fase 1 — Fondasi (Minggu 1)

**Output:**
- Repo monorepo, lint, TypeScript strict, test setup.
- Skema DB + migrasi.
- Auth + RBAC + audit dasar.
- Design system (warna, tipografi, komponen).
- Staging server + Caddy + systemd + HTTPS.
- Health endpoint + logging.

**Gate G1:** arsitektur & keamanan direview; staging bisa diakses.

### Fase 2 — Bot inti (Minggu 2)

**Output:**
- Koneksi Baileys + QR pairing + reconnect + status.
- Inbound idempotent.
- State machine percakapan.
- Deteksi darurat.
- Geofence polygon.
- Pembuatan tiket + nomor tiket.
- Balasan konfirmasi + status.

**Gate G2:** 20 skenario bot lulus di staging dengan nomor uji.

### Fase 3 — Media, outbox, grup (Minggu 3)

**Output:**
- Download/upload media + hash + thumbnail.
- EXIF GPS.
- Voice note.
- Outbox + retry + dead-letter.
- Forward ke grup URC.
- Command grup `/otw`, `/tiba`, `/selesai`, `/tunda`.
- Notifikasi status ke pelapor.

**Gate G3:** simulasi 3 skenario end-to-end (darurat, normal, luar wilkum) berhasil.

### Fase 4 — Dashboard inti (Minggu 4)

**Output:**
- Live board: queue, map, detail.
- SSE + optimistic update.
- Aksi status + audit.
- Alarm + ack + eskalasi.
- Tiket manual.
- Serah terima shift.
- Pencarian & filter.

**Gate G4:** piket bisa menyelesaikan satu shift simulasi tanpa bug kritis.

### Fase 5 — Analitik & administrasi (Minggu 5)

**Output:**
- Analitik volume, SLA, kategori, kelurahan.
- Heatmap/titik rawan.
- Export CSV/Excel/PDF.
- Admin wilayah/petugas/grup/kategori.
- PWA + wall mode.
- Daily digest.

**Gate G5:** laporan bulanan contoh dihasilkan dan disetujui pimpinan.

### Fase 6 — Hardening (Minggu 6)

**Output:**
- Security review (auth, CSRF, IDOR, upload, rate limit).
- Backup + restore drill.
- Failure drills: WA disconnect, API down, disk penuh, outbox stuck.
- Load test 50 laporan/jam.
- Accessibility & performance audit.
- SOP final + runbook + poster + video.

**Gate G6:** restore berhasil, tidak ada P1/P2 terbuka, performance budget terpenuhi.

### Fase 7 — UAT, pelatihan, launch (Minggu 7–8)

**Output:**
- UAT 20 skenario.
- Pelatihan piket/URC/Bhabin/admin.
- Pilot 1 kelurahan (2 minggu).
- Perbaikan.
- Soft launch 3 kelurahan.
- Full launch.
- Hypercare 4 minggu.

**Gate G7:** UAT lulus, SOP ditandatangani, pilot stabil, tidak ada insiden data.

---

## 4. Jadwal per minggu

| Minggu | Fokus | Deliverable | Paralel |
|---|---|---|---|
| 0 | Discovery | Docs, prototipe, keputusan | Kumpulkan polygon, daftar petugas, grup |
| 1 | Fondasi | Repo, DB, auth, staging | Design system, poster draft, legal review |
| 2 | Bot inti | Koneksi, flow, geofence, tiket | Data wilayah, template pesan |
| 3 | Media & grup | Media, outbox, command grup | Uji nomor WA, latihan grup |
| 4 | Dashboard | Live board, aksi, alarm, handover | UAT awal dengan piket |
| 5 | Analitik & admin | Charts, export, admin, PWA | Template laporan, daily digest |
| 6 | Hardening | Security, backup, load, drill | SOP final, pelatihan material |
| 7 | UAT & pilot | UAT, training, pilot | Komunikasi warga, poster |
| 8 | Hypercare | Perbaikan, soft launch, full launch | Rekap mingguan, evaluasi |

**Critical path:** polygon → geofence → tiket → dashboard → UAT. Jika polygon terlambat, geofence memakai centroid + override manual sementara, tetapi jangan launch tanpa polygon.

---

## 5. Definition of Done

Sebuah task dianggap selesai jika:

- [ ] Kode di-merge, TypeScript strict, lint bersih.
- [ ] Unit/integration test relevan lulus.
- [ ] Tidak ada bug P1/P2.
- [ ] Audit log untuk aksi sensitif.
- [ ] Aksesibilitas dasar (label, fokus, kontras).
- [ ] Performance budget tidak dilanggar.
- [ ] Dokumentasi/runbook diperbarui.
- [ ] Tidak ada secret/PII di log.
- [ ] Diuji di staging dengan data mirip produksi.
- [ ] Product owner/QA menyetujui.

---

## 6. Biaya operasional (estimasi)

| Item | Estimasi | Catatan |
|---|---|---|
| VPS 2 vCPU / 4 GB / 80 GB | Rp150–300 rb/bulan | Pilih provider Indonesia bila memungkinkan |
| Domain | Rp200–300 rb/tahun | `.go.id` butuh proses administratif |
| Backup object storage | Rp50–100 rb/bulan | Terenkripsi, lokasi terpisah |
| Nomor WA + data | Rp50–100 rb/bulan | Nomor khusus, bukan pribadi |
| Monitoring | Rp0 | Self-host |
| **Total** | **± Rp300–500 rb/bulan** | Di luar biaya pengembangan & SDM |

Biaya pengembangan tergantung skema (in-house/vendor) dan tidak dianggarkan di sini. Sertakan contingency 20%.

---

## 7. Yang bisa dipercepat vs tidak

**Bisa dipercepat:**
- Prototipe UI (sudah).
- Dashboard read-only.
- Happy path bot.
- Export CSV.

**Tidak boleh dipercepat:**
- UAT dengan piket/URC.
- Uji geofence di lapangan (minimal 20 titik, termasuk perbatasan).
- Uji downtime & ban.
- Review data protection.
- Pelatihan & SOP.
- Restore drill.

---

## 8. Scope v1 vs v1.1

### v1 (wajib)

- WA bot: teks, foto, video, voice note, lokasi, live location.
- Nama wajib + darurat bypass.
- Geofence polygon.
- Tiket + nomor + status + SLA.
- Dashboard live, peta, detail, aksi.
- Alarm + ack + eskalasi.
- Forward grup + command.
- Tiket manual.
- Handover.
- Analitik dasar + export.
- Admin wilayah/petugas/grup.
- Audit + RBAC + 2FA admin.
- Backup + monitoring + SOP.

### v1.1 (setelah stabil)

- Web form publik untuk non-WA.
- Transkripsi voice note.
- Push notification lebih kaya.
- Heatmap lanjutan.
- Template laporan yang bisa dikustomisasi.
- Integrasi webhook ke Polres.
- Mode terang.
- Multi-bahasa (Indonesia/daerah).

### v2 (jika diminta)

- Multi-Polsek.
- AVL patroli.
- Klasifikasi otomatis.
- Broadcast opt-in.
- Dashboard publik (agregat, tanpa PII).

---

## 9. Launch checklist

- [ ] Polygon semua kelurahan tervalidasi.
- [ ] Nomor WA aktif, profil lengkap, 2FA aktif.
- [ ] HP pairing online, charger, internet cadangan.
- [ ] Bot anggota grup URC (dan admin jika perlu).
- [ ] JID petugas terdaftar.
- [ ] Admin & piket punya akun + TOTP.
- [ ] SLA & eskalasi dikonfigurasi.
- [ ] SOP ditandatangani.
- [ ] Poster & QR dicetak di kelurahan/RW.
- [ ] Video 90 detik dibagikan.
- [ ] Pelatihan selesai.
- [ ] Backup + restore drill lulus.
- [ ] Monitoring + alert aktif.
- [ ] Nomor cadangan disiapkan.
- [ ] Kontak eskalasi ditempel di ruang piket.
- [ ] Simulasi 20 laporan lulus.
- [ ] Pimpinan memberi izin launch.

---

## 10. Setelah launch

| Waktu | Aktivitas |
|---|---|
| Hari 1–7 | Hypercare: monitoring ketat, respons < 1 jam, daily standup |
| Minggu 2–4 | Rekap mingguan, perbaikan UX, tambah data |
| Bulan 2 | Audit sampel 10 tiket, evaluasi SLA, wawancara warga |
| Bulan 3 | Keputusan scale-up, review biaya, update SOP |
| Bulan 6 | Review retensi, security, dan roadmap v1.1 |

---

## 11. Risiko jadwal

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Polygon terlambat | Geofence tidak akurat | Mulai pengumpulan di Fase 0; fallback centroid + manual |
| Nomor WA belum siap | Bot tidak bisa diuji | Siapkan nomor uji terpisah; jangan pakai nomor produksi |
| UAT terkonsentrasi di satu shift | Feedback kurang | Jadwalkan 3 shift |
| Perubahan scope | Mundur | Backlog v1.1; keputusan tertulis |
| Server/provider lambat | Staging tertunda | Siapkan VPS cadangan |
| Admin data tidak siap | Data wilayah kosong | Tunjuk admin sejak Fase 0 |
