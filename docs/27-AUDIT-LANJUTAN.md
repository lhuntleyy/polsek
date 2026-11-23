# 27 — Audit Lanjutan & Perbaikan (Nov 2026)

**Tanggal:** 23 November 2026
**Melanjutkan:** [`25-AUDIT-KODE.md`](25-AUDIT-KODE.md)
**Hasil verifikasi:** typecheck seluruh workspace bersih · **120 test lulus** (core 28, bot 15, API 77, termasuk 15 test regresi baru di `apps/api/src/audit-fixes.test.ts` dan 5 test antrean di `apps/bot/src/inbound-queue.test.ts`) · build API/bot/web sukses · migrasi `0007` diuji pada salinan DB lokal.

Audit ini fokus pada hal yang **belum** tertangkap audit 25: logika alur darurat, keandalan pengiriman pesan, dan celah auth. Semua test lama lulus sebelum audit; bug di bawah ada di skenario yang belum punya test.

---

## Ringkasan status

| ID | Severity | Temuan | Status |
|---|---|---|---|
| B-01 | Kritis | Pesan warga hilang bila API restart/timeout | **Fixed + test** |
| B-02 | Kritis | Kata kunci (BANJIR, LAKA, …) / share location langsung membuat P1 | **Fixed + test** |
| B-03 | Kritis | P1 ditolak otomatis bila lokasi di luar wilkum | **Fixed + test** |
| B-04 | Kritis | Rate limit login jatuh ke IP saja → satu kantor bisa terkunci | **Fixed + test** |
| B-05 | Kritis | Secret dev (nilai publik) dipakai dengan data warga asli | **Tools + peringatan** (rotasi perlu dijalankan operator) |
| B-06 | Tinggi | `/selesai 003` bisa menutup tiket 003 kemarin | **Fixed + test** |
| B-07 | Tinggi | Tiket P1 dibuka ulang langsung dieskalasi ke Kapolsek | **Fixed + test** |
| B-08 | Tinggi | `validCount`/`falseCount` dihitung ganda saat buka ulang | **Fixed + test** |
| B-09 | Tinggi | Nomor telepon tiket manual tak divalidasi → pelapor tergabung | **Fixed + test** |
| B-10 | Tinggi | Urutan pesan per chat bisa tertukar (foto vs SELESAI) | **Fixed + test** |
| B-11 | Sedang | Outbox bisa kirim ganda (lease 60 dtk vs batch media) | **Fixed + test** |
| B-12 | Sedang | Pelapor LID menyimpan angka LID sebagai "nomor telepon" | **Fixed + test** |
| B-13 | Sedang | `waJid` petugas tidak unik | **Fixed + test** |
| B-14 | Sedang | Bhabin bisa dibuat tanpa wilayah | **Fixed + test** |
| B-15 | Sedang | Ganti wilayah bhabin tidak memutus SSE lama | **Fixed** |
| B-16 | Sedang | Hapus permanen petugas menghilangkan nama di audit | **Fixed + test** (selalu soft delete) |
| B-17 | Rendah | Label "WIB" tetap meski zona waktu unit lain | **Fixed** |
| B-18 | Rendah | Export terpotong diam-diam di 10.000 baris | **Fixed** (ditolak dengan pesan jelas) |
| B-19 | Tinggi | Tidak ada ganti/reset password; admin tahu password semua petugas | **Fixed + test** |
| B-20 | Sedang | CSP di Caddy memakai hash palsu | **Fixed + script cek** |
| B-21 | Sedang | Bot memegang semua secret API dan user Unix yang sama | **Fixed** (user & env terpisah) |
| B-22 | Sedang | TOTP bisa di-replay; tak ada lockout per akun | **Fixed + test** |
| B-23 | Sedang | Consent PDP implisit di pesan pertama | **Open** — keputusan DPO/hukum |
| B-24 | Rendah | `/api/public/config` mengekspos env; media staged terbuka untuk semua role | **Fixed** |
| B-25 | Rendah | Warga diblokir/troll bisa memancing ratusan balasan bot | **Fixed + test** |

---

## Detail perbaikan

### B-01 — Antrean pesan masuk yang persisten

**Masalah:** `wa-client.ts` memanggil `postInbound` sekali; bila gagal hanya di-log.
**Perbaikan:** `apps/bot/src/inbound-queue.ts`
- Setiap pesan ditulis ke `<folder sesi>/../bot-queue/*.json` sebelum dikirim.
- Retry dengan backoff (1 dtk → maks 30 dtk) sampai API menjawab 2xx. API sudah idempoten per `waMessageId`.
- 4xx permanen (validasi) dipindah ke `bot-queue/dead/` untuk diperiksa, bukan diulang selamanya.
- Saat bot start, file yang tertinggal dikirim ulang (`recover()`).
- Upload media dicoba 5× dengan backoff (±30 dtk).
- Healthcheck memberi alert bila antrean menumpuk > 2 menit atau ada file di `dead/`.

### B-02 — Konfirmasi darurat

| Pesan warga (state IDLE/DONE) | Dulu | Sekarang |
|---|---|---|
| Mengandung `DARURAT` | P1 | P1 langsung (eksplisit) |
| Kata kunci lain (BANJIR, LAKA, BEGAL, …) | P1 | Bot bertanya: `1 = YA darurat`, `2 = TIDAK, laporan biasa` |
| Share location tanpa konteks | P1 | Memulai laporan biasa dengan lokasi terisi; warga bisa mengetik `DARURAT` |
| `DARURAT` di tengah alur LAPOR | diabaikan | Dinaikkan ke P1 memakai data yang sudah diisi |

Jawaban `TIDAK` mempertahankan teks awal sebagai deskripsi dan kategori yang ditebak.

### B-03 — Tidak ada lagi auto-tolak P1

Lokasi di luar wilkum pada tiket darurat sekarang: lokasi disimpan dengan `location_status = outside`, event tiket dicatat, grup URC diberi peringatan "TETAP AKTIF, piket mohon verifikasi", dan warga diberi tahu laporannya tetap diteruskan + disarankan 110. Keputusan menolak/meneruskan tetap di tangan piket.

### B-04, B-22 — Login

- Rate limit route login & password pakai `hook: "preHandler"` sehingga kunci = `IP:username`.
- Lockout per akun: 10 gagal berturut-turut → terkunci 15 menit (`429 account_locked`), tercatat `auth.lockout`. Reset password oleh admin membuka kunci.
- TOTP menyimpan `totp_last_step`; kode yang sama (atau lebih lama) ditolak.

### B-05 — Secret default

- API mencetak peringatan saat start bila secret masih nilai default dari repo.
- `pnpm --filter @sigap/api secrets:rotate [-- --write-env <file>]` membackup DB, mengenkripsi ulang nomor pelapor & TOTP, menghitung ulang hash, dan mencabut semua sesi.
- **Tindakan operator:** laptop pengembang saat ini memakai secret default bersama sesi WhatsApp & data pelapor asli. Jalankan rotasi (lihat `26-DEPLOY.md §12`) atau hapus data asli dari environment dev.

### B-06 — Referensi tiket di grup

`resolveGroupTicketRef()`: nomor lengkap → cocok persis; nomor pendek → tiket **hari ini** (zona waktu unit); bila tidak ada → tiket **aktif** dengan nomor itu hanya jika tepat satu; lebih dari satu → bot meminta nomor lengkap.

### B-07, B-08 — Buka ulang tiket

- Kolom baru `tickets.reopened_at`; eskalasi menghitung umur dari `reopened_at ?? created_at`.
- Buka ulang dari `selesai` mengurangi `valid_count`; dari `ditolak (palsu)` mengurangi `false_count` (tidak di bawah 0).

### B-10 — Urutan per chat

Antrean (B-01) menjalankan unduh+unggah media dan pengiriman ke API secara berurutan per `chatJid`.

### B-11 — Outbox

Lease 300 dtk untuk media, 90 dtk untuk teks; bot mengambil 5 item per batch; hasil yang datang terlambat tidak menurunkan status `sent`.

### B-12 — Pelapor LID

Kolom `reporters.phone_verified`. Pelapor yang hanya punya JID `@lid` ditampilkan sebagai "nomor tidak diketahui (LID WA)" di dashboard, grup, eskalasi, dan export; tombol "Tampilkan nomor" mengembalikan 409 dengan penjelasan.

### B-19 — Siklus password

- `POST /api/auth/password` (ganti sendiri; cabut sesi lain, terbitkan sesi baru).
- `POST /api/officers/:id/reset-password` dan `/reset-totp` (admin, ber-audit, cabut sesi).
- Akun baru dan password hasil reset ditandai `must_change_password`; server menjawab `403 password_change_required` untuk semua endpoint kecuali `/api/me`, `/api/auth/password`, `/api/auth/logout`. Web menampilkan layar wajib ganti password.
- Admin awal di produksi juga wajib ganti password saat login pertama.
- Kebijakan: min. 10 karakter, ada huruf dan angka.

### B-21 — Pemisahan bot

`sigap-bot.service` memakai user `sigap-bot`, `EnvironmentFile=/etc/sigap/bot.env`, dan `ReadWritePaths=/var/lib/sigap-bot`. `loadConfig({}, { component: "bot" })` hanya memvalidasi token internal, jadi bot tidak perlu (dan tidak boleh) memegang secret API. Token internal kini wajib ≥ 32 karakter di produksi.

### B-25 — Throttle balasan

- Warga diblokir: pemberitahuan blokir maksimal sekali per 6 jam (`reporters.last_notice_at`).
- Lebih dari 12 pesan/menit dari satu chat: pesan **tetap diproses** (laporan tidak hilang) tetapi balasan ke chat itu ditahan, dengan satu pemberitahuan jeda.

---

## Yang masih terbuka

| Item | Kenapa belum | Saran |
|---|---|---|
| B-23 Consent PDP | Butuh keputusan dasar hukum (persetujuan vs tugas publik) | Rapat dengan DPO; update teks bot + `CONSENT_VERSION` |
| Rotasi secret laptop dev | Mengubah data operator; harus dijalankan pemilik | `pnpm --filter @sigap/api secrets:rotate -- --write-env ../../.env` dengan API & bot mati |
| CSP enforce | Perlu observasi report-only 1–2 minggu | Ganti header ke `Content-Security-Policy` |
| Font Google | Dashboard memuat font dari Google (IP workstation bocor ke pihak ketiga) | Self-host font di `apps/web/public/fonts` |
| Refactor `transitionTicket()` | Logika transisi masih di dua tempat (dashboard & grup) | Satukan dalam satu service saat ada waktu |
| Item terbuka audit 25 | A-10/A-11 backup snapshot, A-20 retensi otomatis, A-22 hash-chain audit, A-27 Playwright | Lihat `25-AUDIT-KODE.md` |

## Migrasi

`apps/api/src/db/migrations/0007_audit_fixes.sql` (aditif, otomatis saat API start):

- `officers`: `totp_last_step`, `must_change_password`, `failed_logins`, `locked_until`, index `wa_jid`
- `tickets`: `reopened_at`
- `reporters`: `phone_verified` (default 1), `last_notice_at`

## Perubahan perilaku yang perlu disosialisasikan

1. **Warga:** pesan berisi kata seperti "banjir"/"kecelakaan" sekarang ditanya dulu "Apakah ini DARURAT?". Poster/video warga: tekankan ketik **DARURAT** untuk keadaan darurat.
2. **URC:** `/otw 3` hanya berlaku untuk tiket hari ini atau satu-satunya tiket aktif bernomor itu; jika diminta, pakai nomor lengkap.
3. **Piket:** tiket P1 dengan lokasi "di luar wilkum" tidak lagi tertutup otomatis — wajib diputuskan (teruskan ke Polsek terdekat/tolak).
4. **Semua petugas:** wajib ganti password awal; akun terkunci 15 menit setelah 10 kali salah.
5. **Admin:** "Hapus petugas" sekarang selalu menonaktifkan; reset password/TOTP tersedia di baris petugas.
