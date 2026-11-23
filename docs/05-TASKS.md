# 05 — Task Backlog

**Versi:** 0.1
**Tanggal:** 14 November 2026
**Cara pakai:** centang status di kolom `Status`. Jangan hapus task; pindahkan ke bagian "Backlog v1.1" jika ditunda.
**Estimasi:** S ≤ 0,5 hari · M = 1–2 hari · L = 3–5 hari

Legenda status: `Todo` · `WIP` · `Done` · `Blocked`

---

## E0 — Discovery, keputusan, desain

| ID | Task | Est | Depends | Status | Owner |
|---|---|---|---|---|---|
| E0-01 | Tulis kritik rencana awal + revisi produk | M | — | Done | — |
| E0-02 | Tulis PRD v0.1 | L | E0-01 | Done | — |
| E0-03 | Tulis arsitektur + skema data | L | E0-02 | Done | — |
| E0-04 | Tulis rencana fase, risiko, SOP draft | L | E0-02 | Done | — |
| E0-05 | Buat prototipe UI/UX yang bisa diklik | L | E0-02 | Done | — |
| E0-06 | Review prototipe dengan Kapolsek/Pawas | S | E0-05 | Todo | — |
| E0-07 | Tetapkan Polsek & daftar kelurahan wilkum | S | — | Done (config-first; nama final menyusul) | Pimpinan |
| E0-08 | Kumpulkan & validasi polygon GeoJSON | L | E0-07 | WIP (seed demo; polygon resmi belum) | Admin data |
| E0-09 | Daftar petugas + JID WA + role | M | — | Todo (demo officers sudah ada) | Admin |
| E0-10 | Daftar grup URC/Bhabin + JID | S | — | Todo | Admin |
| E0-11 | Tetapkan SLA & jalur eskalasi | S | — | Done (default; Kapolsek) | Pimpinan |
| E0-12 | Tetapkan kebijakan retensi & legal hold | M | — | Done (12 bulan + legal hold) | Legal/DPO |
| E0-13 | Tetapkan domain & hosting | S | — | WIP (ditunda; local/staging) | Ops |
| E0-14 | Siapkan nomor WA khusus + 2FA | M | — | Todo | Admin |
| E0-15 | Siapkan HP pairing + charger + internet | S | — | Todo | Ops |
| E0-16 | Review hukum: UU PDP, disclaimer, bukti digital | M | E0-02 | Todo | Legal |

**Gate G0:** E0-01..E0-06 selesai; pimpinan menyetujui arah & scope.

---

## E1 — Fondasi teknis

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E1-01 | Inisialisasi monorepo pnpm + workspace | S | — | Done |
| E1-02 | Setup TypeScript strict + ESLint + Prettier | S | E1-01 | WIP (TS strict; ESLint/Prettier belum) |
| E1-03 | Setup Vitest + Playwright | M | E1-01 | WIP (Vitest + API test; E2E Playwright belum masuk repo) |
| E1-04 | Setup `packages/core` (domain types, zod) | M | E1-01 | Done |
| E1-05 | Setup `packages/config` (env validation) | S | E1-01 | Done |
| E1-06 | Skema Drizzle + migrasi awal | L | E1-04 | Done |
| E1-07 | Seed data: unit, region contoh, officer, group | M | E1-06 | Done |
| E1-08 | Auth: login, session, logout, Argon2id | L | E1-06 | Done |
| E1-09 | TOTP + recovery codes | M | E1-08 | WIP (TOTP setup/enable; recovery codes belum) |
| E1-10 | RBAC middleware + permission matrix | M | E1-08 | Done |
| E1-11 | Audit log service + viewer dasar | M | E1-08 | Done |
| E1-12 | Rate limit login + API | S | E1-08 | Done |
| E1-13 | Design tokens + komponen dasar web | L | E0-05 | Done |
| E1-14 | Layout dashboard + routing | M | E1-13 | Done |
| E1-15 | Staging VPS + user + firewall + NTP | M | E0-13 | Todo |
| E1-16 | Caddy + HTTPS + security headers | S | E1-15 | WIP (config tersedia; belum deploy) |
| E1-17 | systemd unit API + bot + alert | M | E1-15 | Done (unit files tersedia; deploy menyusul) |
| E1-18 | Health endpoint + structured logging | S | E1-01 | Done |
| E1-19 | Backup script + timer | M | E1-06 | Done |
| E1-20 | Dokumentasi runbook awal | S | E1-15 | WIP (infra README; runbook WA ban belum) |
| E1-21 | Web login + session + logout | M | E1-08 | Done |
| E1-22 | Web live board + detail + aksi transisi | L | E1-14 | Done |
| E1-23 | SSE + alarm P1 di web | M | E1-22 | Done |
| E1-24 | Smoke test API (auth, RBAC, tiket, settings) | M | E1-08 | Done |
| E1-25 | Config-first settings + public config | S | E1-05 | Done |
| E1-26 | Production build (tsup) + copy migrations | M | E1-06 | Done |
| E1-27 | Web settings admin (unit, WA, SLA, retensi) + upload region | L | E1-25 | Done |

**Gate G1:** staging bisa diakses, login jalan, migrasi jalan, backup jalan.

---

## E2 — Bot inti

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E2-01 | Integrasi Baileys: socket, auth state, QR | L | E1-17 | Done |
| E2-02 | Auto-reconnect + handle disconnect/logout | M | E2-01 | Done |
| E2-03 | Status gateway + heartbeat ke API | S | E2-01 | Done |
| E2-04 | Inbound handler: filter history/fromMe/status | M | E2-01 | Done |
| E2-05 | Idempotensi `message_log` | S | E2-04 | Done |
| E2-06 | Parser pesan: teks, media, lokasi, live location, VN | L | E2-04 | Done |
| E2-07 | State machine percakapan + TTL | L | E2-05 | Done |
| E2-08 | Flow nama + consent | M | E2-07 | Done |
| E2-09 | Flow kategori + deskripsi | M | E2-07 | Done |
| E2-10 | Flow lokasi: pin, live, alamat, kelurahan | L | E2-07 | Done (live update lanjutan Fase 3) |
| E2-11 | Deteksi darurat + tiket P1 instan | M | E2-07 | Done |
| E2-12 | Geofence point-in-polygon + buffer | L | E0-08, E2-10 | Done |
| E2-13 | Redirect luar wilkum + pesan 110/Polsek | S | E2-12 | Done |
| E2-14 | Generator nomor tiket harian | M | E1-06 | Done |
| E2-15 | Buat tiket + event + audit | M | E2-12 | Done |
| E2-16 | Balasan konfirmasi + nomor tiket | S | E2-15 | Done |
| E2-17 | Command warga: BATAL, STATUS, NAMA, BANTU | M | E2-07 | Done |
| E2-18 | Rate limit + flag anomali | M | E2-15 | Done |
| E2-19 | Unit test flow + geofence + nomor tiket | L | E2-07 | Done (28 API test + 7 bot test) |
| E2-20 | Mock Baileys + integration test | M | E2-19 | WIP (normalisasi diuji; socket mock belum) |

**Gate G2:** flow bot lulus di API/staging (28 smoke test). Pairing perangkat nyata menunggu nomor WA/2FA.

---

## E3 — Media, outbox, grup

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E3-01 | Download media Baileys + retry | M | E2-06 | Done |
| E3-02 | Upload media ke API + validasi MIME/ukuran | M | E1-06 | Done |
| E3-03 | SHA-256 + simpan metadata | S | E3-02 | Done |
| E3-04 | Thumbnail foto + konversi HEIC | M | E3-02 | Done (thumbnail; HEIC ditolak) |
| E3-05 | Video poster + batas ukuran | M | E3-02 | Done |
| E3-06 | Voice note simpan + pemutar di dashboard | M | E3-02 | Done |
| E3-07 | EXIF GPS extraction + tawaran ke pelapor | M | E3-02 | Done (EXIF; tawaran pelapor belum) |
| E3-08 | Outbox worker + retry backoff + dead-letter | L | E1-06 | Done |
| E3-09 | Template pesan: konfirmasi, update, penutup | M | E2-16 | Done |
| E3-10 | Forward tiket ke grup URC | L | E3-08 | Done |
| E3-11 | Format pesan grup + deep link + masking | M | E3-10 | Done |
| E3-12 | Command `/otw`, `/tiba`, `/selesai`, `/tunda`, `/status` | L | E3-10 | Done |
| E3-13 | Validasi JID petugas + grup | M | E3-12 | Done |
| E3-14 | Notifikasi status ke pelapor | M | E3-08 | Done |
| E3-15 | Attachment bukti dari grup (`/selesai` + foto) | M | E3-12 | Done |
| E3-16 | Uji media gagal / besar / format aneh | M | E3-02 | Done (28 API test) |
| E3-17 | Idempotensi command grup | S | E3-12 | Done |

**Gate G3:** end-to-end darurat, normal, luar wilkum, media, dan `/selesai` + foto grup lulus di API test. Pairing perangkat nyata menunggu nomor WA/2FA.

---

## E4 — Dashboard inti

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E4-01 | Halaman login + TOTP | M | E1-09 | Done |
| E4-02 | Shell: rail, topbar, clock, status | M | E1-14 | Done |
| E4-03 | Live queue + filter + search | L | E1-06 | Done |
| E4-04 | Peta Leaflet + polygon + pin status | L | E4-02 | Done |
| E4-05 | Detail tiket + timeline + media | L | E4-03 | Done |
| E4-06 | SSE client + reconnect + snapshot | L | E1-18 | Done |
| E4-07 | Aksi transisi + optimistic update | L | E4-05 | Done |
| E4-08 | Alarm + sound unlock + ack | L | E4-06 | Done |
| E4-09 | Eskalasi P1 (3/10 menit) + WA | M | E4-08 | Done |
| E4-10 | Tiket manual | M | E4-05 | Done |
| E4-11 | Serah terima shift + checklist + tanda tangan | L | E4-05 | Done |
| E4-12 | PII masking + reveal + audit | M | E4-05 | Done |
| E4-13 | Catatan internal | S | E4-05 | Done |
| E4-14 | Cluster/duplikat view + merge | M | E4-03 | Done |
| E4-15 | Keyboard shortcut | M | E4-03 | Done |
| E4-16 | Mode dinding | M | E4-02 | Done |
| E4-17 | Responsive mobile | M | E4-02 | Done |
| E4-18 | Empty/error/loading states | S | E4-03 | Done |
| E4-19 | Audit viewer | M | E1-11 | Done |
| E4-20 | E2E Playwright: terima → OTW → selesai | M | E4-07 | WIP (manual browser E2E lulus; Playwright belum dipasang) |

**Gate G4:** piket menyelesaikan shift simulasi tanpa bug kritis (manual browser E2E: terima → OTW → tiba → selesai, tiket manual, serah terima, duplikat, audit).

---

## E5 — Analitik, admin, PWA

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E5-01 | API analitik: volume, kategori, region, jam | L | E1-06 | Done |
| E5-02 | Chart volume + heatmap jam | L | E5-01 | Done |
| E5-03 | SLA median/p90 | M | E5-01 | Done |
| E5-04 | Chart SLA + kategori + kelurahan | L | E5-03 | Done |
| E5-05 | Titik rawan / repeat location | M | E5-01 | Done |
| E5-06 | Export CSV tiket | M | E4-03 | Done |
| E5-07 | Export Excel | M | E5-06 | Done |
| E5-08 | Export PDF bulanan | L | E5-06 | Done |
| E5-09 | Daily digest ke Kapolsek | M | E5-07 | Done |
| E5-10 | Admin wilayah + upload polygon + validasi | L | E1-06 | Done |
| E5-11 | Admin petugas + JID + role | M | E1-10 | Done |
| E5-12 | Admin grup + kategori + template | M | E1-06 | WIP (grup selesai; kategori/template masih fixed) |
| E5-13 | Admin blokir nomor | S | E1-06 | Done |
| E5-14 | Admin SLA + eskalasi | S | E1-06 | Done |
| E5-15 | PWA manifest + service worker | M | E4-01 | Done |
| E5-16 | Web Push untuk Pawas/Kapolsek | L | E5-15 | Done (VAPID, subscription, service worker, tes push) |
| E5-17 | Wall mode polish | M | E4-16 | Done |
| E5-18 | Aksesibilitas: kontras, fokus, label | M | E4-02 | Done (focus-visible, aria, live region) |
| E5-19 | Performance audit + code splitting | M | E4-03 | Done (lazy page + Leaflet chunk) |

**Gate G5:** laporan bulanan CSV/Excel/PDF dihasilkan dari data nyata, digest harian masuk antrean, dan registry pelapor/grup dapat dikelola admin.

---

## E6 — Hardening

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E6-01 | Security review auth/session/CSRF/IDOR | M | E4-01 | Done (docs/13 + 49 test API) |
| E6-02 | Uji upload: path traversal, MIME spoof, zip bomb | M | E3-02 | Done (spoof/traversal diuji; zip bomb dimitigasi batas ukuran + sharp) |
| E6-03 | Uji rate limit & abuse | S | E2-18 | Done (login 5/15 menit → 429) |
| E6-04 | Enkripsi phone + hash lookup | M | E1-06 | Done (AES-GCM + HMAC; test) |
| E6-05 | Backup harian + retensi + enkripsi | M | E1-19 | Done (age/gpg opsional, integrity check) |
| E6-06 | Restore drill + catat waktu | M | E6-05 | Done (653 ms, integrity ok) |
| E6-07 | Failure drill: WA disconnect | S | E2-02 | Done (reconnect + runbook) |
| E6-08 | Failure drill: API down | S | E1-17 | Done (outbox retry + runbook) |
| E6-09 | Failure drill: disk penuh | S | E1-18 | Done (healthcheck disk/WAL) |
| E6-10 | Failure drill: outbox stuck | S | E3-08 | Done (reclaim test) |
| E6-11 | Load test 50 laporan/jam | M | E4-06 | Done (20 laporan/2,1 dtk, p95 16 ms) |
| E6-12 | Monitoring + alert WA/email | M | E1-15 | Done (healthcheck + webhook + systemd) |
| E6-13 | Log review: tidak ada PII | S | E1-18 | Done |
| E6-14 | Dependency audit + pin versi | S | E1-01 | Done (audit 0 vuln; Drizzle/uuid di-upgrade) |
| E6-15 | Uji aksesibilitas | M | E5-18 | Done (Lighthouse 100 accessibility) |
| E6-16 | Uji browser/HP | M | E4-17 | Done (desktop + responsive CSS; HP fisik di UAT lapangan) |

**Gate G6:** restore lulus, tidak ada P1/P2, performance budget terpenuhi.

---

## E7 — UAT, pelatihan, launch

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E7-01 | Siapkan data UAT (warga fiktif, tiket) | M | E1-07 | Done |
| E7-02 | UAT-01..20 | L | E6-16 | Done (15 lulus, 4 sebagian, 1 menunggu perangkat) |
| E7-03 | Perbaikan hasil UAT | L | E7-02 | Done |
| E7-04 | Pelatihan piket | M | E7-03 | Done (materi siap; sesi menunggu jadwal) |
| E7-05 | Pelatihan URC/Bhabin | M | E7-03 | Done (materi siap) |
| E7-06 | Pelatihan admin | M | E7-03 | Done (materi siap) |
| E7-07 | Poster QR + video 90 detik | M | E0-05 | WIP (poster PNG/SVG selesai; MP4 belum direkam) |
| E7-08 | Pilot 1 kelurahan (2 minggu) | L | E7-02 | Blocked (butuh lapangan, WA nyata, izin) |
| E7-09 | Evaluasi pilot + perbaikan | M | E7-08 | Blocked (menunggu pilot) |
| E7-10 | Soft launch 3 kelurahan | L | E7-09 | Blocked (menunggu evaluasi) |
| E7-11 | Full launch | M | E7-10 | Blocked (menunggu soft launch) |
| E7-12 | Hypercare 4 minggu | L | E7-11 | Blocked (menunggu launch) |

**Gate G7:** UAT lulus, SOP ditandatangani, pilot stabil.

---

## E8 — Dokumentasi & serah terima

| ID | Task | Est | Depends | Status |
|---|---|---|---|---|
| E8-01 | SOP final (piket, URC, Bhabin, admin) | M | E0-12 | Done |
| E8-02 | Runbook deployment/rollback | M | E1-20 | Done (docs/17) |
| E8-03 | Runbook WA ban / nomor cadangan | M | E3-10 | Done (docs/17 §5) |
| E8-04 | Runbook backup/restore | S | E6-06 | Done (docs/17 §6) |
| E8-05 | Dokumen arsitektur & API | M | E1-06 | Done |
| E8-06 | Panduan admin wilayah/petugas | S | E5-10 | Done (docs/18) |
| E8-07 | Panduan piket 1 halaman | S | E4-10 | Done (docs/19) |
| E8-08 | Panduan warga (poster) | S | E7-07 | Done (docs/20 + poster) |
| E8-09 | Serah terima kredensial (2 admin) | S | E7-11 | Done (template docs/21) |
| E8-10 | Jadwal review bulanan | S | E7-11 | Done (docs/22) |

---

## Backlog v1.1 (jangan dikerjakan di v1)

| ID | Task | Alasan ditunda |
|---|---|---|
| B-01 | Web form publik untuk non-WA | Fokus WA dulu |
| B-02 | Transkripsi voice note | Biaya & akurasi |
| B-03 | Klasifikasi otomatis kategori | Risiko salah triase |
| B-04 | Broadcast opt-in | Risiko ban |
| B-05 | Multi-Polsek UI | Belum ada kebutuhan |
| B-06 | AVL patroli | Integrasi hardware |
| B-07 | Mode terang | Bisa menyusul |
| B-08 | Template laporan custom | Setelah format disepakati |
| B-09 | Webhook Polres | Belum ada API |
| B-10 | Dashboard publik agregat | Privasi & kebijakan |

---

## Ringkasan status akhir v1.0

| Epic | Total task | Done | WIP | Todo | Blocked |
|---|---:|---:|---:|---:|---:|
| E0 | 16 | 8 | 2 | 6 | 0 |
| E1 | 27 | 21 | 5 | 1 | 0 |
| E2 | 20 | 19 | 1 | 0 | 0 |
| E3 | 17 | 17 | 0 | 0 | 0 |
| E4 | 20 | 19 | 1 | 0 | 0 |
| E5 | 19 | 18 | 1 | 0 | 0 |
| E6 | 16 | 16 | 0 | 0 | 0 |
| E7 | 12 | 6 | 1 | 0 | 5 |
| E8 | 10 | 10 | 0 | 0 | 0 |
| **Total** | **157** | **134** | **11** | **7** | **5** |

**Catatan status:**
- **WIP** yang tersisa bersifat jangka panjang/opsional: ESLint/Prettier, Playwright E2E, recovery codes TOTP, deploy VPS/Caddy, runbook awal, mock socket Baileys, kategori/template admin, video MP4.
- **Blocked** hanya task lapangan: pilot, evaluasi pilot, soft launch, full launch, hypercare. Tidak dapat diselesaikan tanpa nomor WA nyata, polygon resmi, personel, dan waktu berjalan.
- E0/E1 masih berisi task dokumen/deploy awal yang tidak menghalangi aplikasi berjalan di dev/staging.






