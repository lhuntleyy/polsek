# 13 — Security Review v1.0

**Tanggal:** 14 November 2026
**Ruang lingkup:** API Fastify, bot Baileys, web React, SQLite, media, deployment systemd/Caddy.
**Metode:** review kode, uji otomatis, uji manual browser, dependency audit, restore drill, load test.

---

## 1. Ringkasan

| Area | Status | Catatan |
|---|---|---|
| Auth & session | ✅ | Cookie HttpOnly, SameSite=Lax, Argon2id, revoke saat logout |
| TOTP | ✅ | Setup/enable; secret dienkripsi AES-256-GCM; opsional per petugas |
| CSRF | ✅ | Origin allowlist untuk request mutating |
| RBAC | ✅ | Role per endpoint + UI |
| IDOR tiket/media | ✅ | Bhabin dibatasi wilayah; bhabin tanpa wilayah ditolak; media staging ditolak |
| SQL injection | ✅ | Drizzle parameterized; tidak ada identifier dari input user |
| XSS | ✅ | React escaping; tooltip Leaflet di-escape; CSV formula injection dicegah |
| Upload media | ✅ | MIME allowlist, ukuran, sharp decode, path generated, di luar webroot, `no-store` |
| Path traversal | ✅ | Path media dibuat server + validasi root |
| Rate limit | ✅ | Global 300/menit; login 5/15 menit; reveal 30/menit |
| Secret | ✅ | `.env`, tidak ada default produksi; internal token timing-safe |
| Log PII | ✅ | Tidak ada body request/phone di log; Baileys logger `warn` |
| Backup | ✅ | SQLite integrity check, opsional age/gpg, media rsync |
| Dependency | ✅ | `pnpm audit --prod` bersih setelah upgrade Drizzle & uuid |
| Headers | ✅ | `nosniff`, `DENY`, referrer policy |
| Gateway WA | ✅ | Pairing dari dashboard admin; QR TTL 90 detik; connect/logout teraudit + rate limit |
| Retensi | 🟡 | Kebijakan ada; job retensi otomatis belum |

---

## 2. Kontrol utama

### 2.1 Auth & session
- Password Argon2id (`@node-rs/argon2`).
- Session token acak 32 byte; hanya hash yang disimpan.
- Cookie `HttpOnly`, `SameSite=Lax`, `Secure` di produksi.
- Logout merevokasi session; sesi kedaluwarsa 12 jam default.
- Login rate limit 5 percobaan/15 menit; pesan error tidak membedakan username/password.
- TOTP dapat diaktifkan; login meminta kode jika aktif.

### 2.2 CSRF
- Semua `POST/PATCH/PUT/DELETE` dengan `Origin` harus cocok `SIGAP_PUBLIC_ORIGIN`.
- Bot internal tidak memakai cookie; memakai `x-sigap-internal-token` + perbandingan timing-safe.

### 2.3 RBAC & IDOR
- `requireRole` di endpoint sensitif.
- Bhabin hanya tiket di wilayahnya; media mengikuti region tiket.
- Media staging tidak dapat diakses bhabin.
- Export dan audit hanya role tertentu.
- PII reveal hanya piket/pawas/kapolsek/admin/urc dan tercatat.

### 2.4 Media
- MIME allowlist: JPEG/PNG/WebP/GIF, MP4/3GP/MOV/WebM, OGG/MP3/M4A/AAC/AMR/WAV.
- SVG dan konten HTML ditolak.
- Gambar harus bisa didecode sharp; MIME spoof gagal.
- Zip bomb / decompression bomb dimitigasi dengan batas ukuran file dan batas piksel decode sharp (bukan uji eksplisit).
- Ukuran: gambar 16 MB, video/audio 64 MB, thumbnail 2 MB.
- Nama file = UUID server; tidak memakai nama dari klien.
- Serve dengan sesi, `Content-Disposition`, `nosniff`, range request.
- Unduh eksplisit dicatat `media.download`.
- Forward media ke grup memakai outbox `kind=media` dan endpoint internal ber-token; bot mengunduh byte asli lalu mengirim image/video/audio, bukan hanya teks.

### 2.5 Data & log
- Nomor telepon dienkripsi AES-256-GCM; lookup memakai HMAC-SHA256 + pepper.
- Dashboard hanya menampilkan nomor masked; reveal 30 detik.
- Notifikasi WhatsApp (grup/eskalasi) menampilkan nomor penuh hanya jika **Masking PII** dimatikan oleh admin; dashboard tetap masked + reveal ber-audit.
- Log tidak memuat body request, token, QR, nomor lengkap, atau query string pencarian.
- Audit append-only; tidak ada endpoint delete.

### 2.6 Backup
- `backup-db.sh` memakai `sqlite3 .backup`, `PRAGMA integrity_check`, gzip.
- Opsional enkripsi `age`/`gpg`.
- Media disalin dengan rsync.
- Retensi backup default 30 hari.
- `restore-drill.sh` memverifikasi backup ke DB sementara.

---

## 3. Temuan yang diperbaiki

| Temuan | Dampak | Perbaikan |
|---|---|---|
| Drizzle < 0.45.2 (CVE-2026-39356) | SQL injection jika identifier dari user | Upgrade ke 0.45.2+ |
| uuid < 11.1.1 via ExcelJS | Bounds check v3/v5/v6 | Override uuid ke 11.1.1+ |
| CSV formula injection | Excel mengeksekusi formula | Prefix `'` untuk sel berawalan `= + - @` |
| Tooltip Leaflet memakai HTML | XSS dari judul tiket | Escape HTML sebelum tooltip |
| Token internal dibandingkan biasa | Timing attack | `timingSafeEqual` |
| Media staging bisa diakses bhabin | Kebocoran bukti | Tolak bhabin untuk media tanpa tiket |
| Upload MIME spoof | Konten berbahaya | Decode sharp + allowlist |
| SSE status selalu OFFLINE | Operator salah paham | Cek `readyState` + event `hello` |

---

## 4. Bukti uji

- **49 smoke test API** (auth, CSRF, session revoke, IDOR bhabin tanpa wilayah, rate limit, MIME spoof, traversal, outbox reclaim, media + forward grup, ekspor, push, normalisasi JID, /id, gateway control, blokir, role command grup, edit/hapus petugas/wilayah).
- **23 unit test domain** (state machine, geofence, nomor tiket, phone, JID).
- **9 test normalisasi bot** (total 81).
- `pnpm audit --prod`: **0 vulnerability** (info/low/moderate/high/critical).
- Restore drill lokal: `integrity_check=ok`, 8 tiket, 4 migrasi, **653 ms**.
- Load test: 20 laporan (140 request) dalam **2,1 detik**, p95 **16 ms**, max **443 ms**.
- Uji manual browser: CSRF, reveal, blokir, export, PWA, peta, serah terima.

---

## 5. Risiko residual

| Risiko | Level | Mitigasi |
|---|---|---|
| Baileys tidak resmi, nomor bisa dibanned | Tinggi | Nomor khusus, 2FA, backup nomor, SOP reconnect |
| Backup belum wajib terenkripsi | Tinggi | Aktifkan age/GPG; simpan kunci terpisah |
| Media backup hanya mirror | Tinggi | restic/Borg snapshot + offsite |
| CSP belum ada | Sedang | Report-only lalu enforce |
| `trustProxy: true` | Sedang | API loopback + trusted proxy eksplisit |
| TOTP belum wajib untuk semua petugas | Sedang | Aktifkan di produksi via Pengaturan |
| Tidak ada WAF/reverse proxy hardening tambahan | Sedang | Caddy, rate limit, firewall VPS |
| Tile peta melihat viewport | Rendah | Tile server sendiri jika diperlukan |
| Job retensi otomatis belum ada | Sedang | Backup + hapus manual terjadwal; fase berikutnya |
| PDF belum tanda tangan digital | Rendah | Tanda tangan basah/scan saat diserahkan |
| Nomor pelapor penuh di grup WhatsApp saat masking dimatikan | Sedang | Hanya admin dapat mematikan; batasi anggota grup; audit perubahan setting |
| Web Push bergantung izin browser | Rendah | Alarm SSE tetap berjalan |

---

## 6. Checklist go-live

- [x] Secret produksi diisi (session, phone, internal token, admin password).
- [x] `SIGAP_COOKIE_SECURE=true` dan HTTPS.
- [x] Rate limit aktif.
- [x] Audit dan backup berjalan.
- [x] Restore drill lulus.
- [ ] Nomor WA aktual + 2FA + grup URC nyata.
- [ ] UAT lapangan dengan perangkat nyata.
- [ ] TOTP diaktifkan untuk semua akun piket/pawas/kapolsek/admin.


