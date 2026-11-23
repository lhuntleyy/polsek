# 03 — Arsitektur Teknis

**Versi:** 0.1
**Tanggal:** 14 November 2026
**Prinsip:** sesederhana mungkin untuk satu Polsek, tetapi tidak naif terhadap kegagalan.

---

## 1. Prinsip arsitektur

1. **Satu penulis database.** Hanya API yang menulis ke SQLite. Bot berkomunikasi lewat HTTP internal, bukan menulis DB langsung.
2. **Bot dan API adalah dua proses terpisah.** Bot bisa restart tanpa mematikan dashboard; API bisa restart tanpa kehilangan sesi WhatsApp.
3. **Outbox untuk semua pesan keluar.** Tidak ada `sendMessage` langsung dari request handler tanpa retry.
4. **Idempotensi di semua ingress.** Pesan WA bisa terkirim ulang; jangan pernah membuat tiket ganda.
5. **Media di disk, metadata di DB.** File asli tidak pernah publik.
6. **SSE untuk real-time.** Lebih sederhana dari WebSocket, cukup untuk broadcast satu arah.
7. **Tanpa Docker.** systemd + Caddy + Node.js. Sedikit komponen, mudah di-debug.
8. **Siap multi-Polsek, tapi tidak dibangun multi-Polsek.** `unit_id` ada sejak awal.

---

## 2. Diagram konteks

```
┌─────────────┐        WA protocol        ┌──────────────────┐
│   Warga     │◄─────────────────────────►│  WhatsApp        │
│  (HP)       │                           │  (server WA)     │
└─────────────┘                           └────────┬─────────┘
                                                   │ WebSocket (Baileys)
                                                   ▼
┌─────────────┐        HTTPS          ┌──────────────────────────┐
│ Piket/URC/  │◄─────────────────────►│  Caddy (TLS, reverse     │
│ Pawas       │   dashboard + SSE     │  proxy, static web)      │
└─────────────┘                       └───────┬──────────┬───────┘
                                              │          │
                                     /api     │          │ /internal (localhost)
                                              ▼          ▼
                                    ┌──────────────┐  ┌──────────────┐
                                    │  API         │  │  Bot         │
                                    │  Fastify     │◄─┤  Baileys     │
                                    │  SQLite      │  │  worker      │
                                    │  SSE         │  │  outbox poll │
                                    └──────┬───────┘  └──────┬───────┘
                                           │                 │
                                           ▼                 ▼
                                    ┌──────────────┐  ┌──────────────┐
                                    │  SQLite DB   │  │  Media disk  │
                                    │  WAL         │  │  /var/lib/.. │
                                    └──────────────┘  └──────────────┘
```

---

## 3. Stack

| Layer | Pilihan | Alasan | Alternatif yang ditolak |
|---|---|---|---|
| Runtime | **Node.js 24 LTS** | Ekosistem Baileys, TypeScript, satu bahasa | Bun (Baileys belum stabil), Go (Baileys tidak ada) |
| Bahasa | **TypeScript strict** | Domain kepolisian butuh tipe yang jelas | JavaScript biasa |
| Package manager | **pnpm** (corepack) | Cepat, hemat disk, workspace | npm (lebih lambat), yarn |
| Bot WA | **Baileys 7.x** (pin versi) | Full kontrol, grup, media, sesuai permintaan | Cloud API (tidak bisa grup), WAHA (butuh Docker) |
| API | **Fastify 5** | Cepat, schema validation, plugin matang | Express (lebih lambat), Hono (ekosistem lebih kecil) |
| DB | **SQLite + Drizzle ORM** | Nol operasional, cukup untuk volume Polsek, backup mudah | Postgres/PostGIS (overkill v1) |
| Validasi | **Zod** | Schema + tipe + pesan error | Joi, Yup |
| Geofence | **Turf.js** | Point-in-polygon, buffer, distance | PostGIS (tidak perlu) |
| Media | **sharp** + **ffmpeg** (opsional) | Thumbnail, konversi HEIC, video poster | ImageMagick (lebih berat) |
| Auth | **cookie session + Argon2id + TOTP** | Sederhana, aman, tanpa vendor | JWT (revocation lebih rumit) |
| Real-time | **SSE** | Auto-reconnect, cukup satu arah | WebSocket (lebih kompleks), polling (boros) |
| Web | **Vite + React 19 + CSS tokens** | Cepat, statis, code splitting; desain custom tanpa runtime CSS | Next.js (SSR tidak dibutuhkan dashboard), Tailwind (opsional, belum perlu) |
| Peta | **Leaflet + OpenStreetMap (terang)** | Ringan, tanpa API key, mudah dibaca | Google Maps (biaya, kuota), Mapbox (vendor) |
| Grafik | **SVG custom** | Ringan, sesuai desain | Chart.js/Recharts (bundle besar) |
| Reverse proxy | **Caddy 2** | HTTPS otomatis, config ringkas | Nginx (manual TLS) |
| Process manager | **systemd** | Sudah ada di OS, restart, journald | PM2 (layer tambahan) |
| Monitoring | **healthcheck + cron + Uptime Kuma (native)** | Tanpa Docker | Grafana/Prometheus (overkill) |
| Backup | **SQLite backup API + rsync + restic/rclone** | Teruji, terenkripsi | Volume snapshot saja |

> Versi minor di-pin saat implementasi. Jangan pakai `latest` di produksi.

---

## 4. Struktur repo

```
sigap/
├─ apps/
│  ├─ api/                 # Fastify: auth, tickets, SSE, media, admin
│  │  ├─ src/
│  │  │  ├─ routes/
│  │  │  ├─ services/
│  │  │  ├─ db/
│  │  │  └─ server.ts
│  │  └─ package.json
│  ├─ bot/                 # Baileys: koneksi, state machine, outbox worker
│  │  ├─ src/
│  │  │  ├─ wa/
│  │  │  ├─ flow/
│  │  │  ├─ outbox/
│  │  │  └─ main.ts
│  │  └─ package.json
│  └─ web/                 # Vite + React: dashboard
│     ├─ src/
│     │  ├─ routes/
│     │  ├─ components/
│     │  ├─ features/
│     │  ├─ lib/
│     │  └─ main.tsx
│     └─ package.json
├─ packages/
│  ├─ core/                # domain: ticket state machine, geofence, format,
│  │                       # zod schemas, nomor tiket, kategori
│  └─ config/              # env parsing, konstanta
├─ infra/
│  ├─ systemd/             # sigap-api.service, sigap-bot.service, backup.timer
│  ├─ caddy/               # Caddyfile
│  └─ scripts/             # deploy, backup, restore, healthcheck
├─ docs/
└─ prototype/
```

---

## 5. Alur data

### 5.1 Pesan masuk (warga)

```
1. Baileys menerima messages.upsert (type=notify)
2. Bot abaikan:
   - fromMe
   - pesan lama / history sync
   - status broadcast
   - pesan grup yang bukan command
3. Bot cek idempotensi: msg.key.id sudah ada di message_log?
4. Bot tentukan jenis: teks, media, lokasi, live location, voice note
5. Bot download media (jika ada) → hitung SHA-256 → upload ke API
6. Bot kirim JSON ke API /internal/wa/inbound (HMAC + timestamp)
7. API:
   - verifikasi signature & timestamp (±5 menit)
   - upsert reporter (phone hash)
   - jalankan state machine percakapan
   - jika cukup data → buat tiket + ticket_events
   - jika darurat → priority P1 + event ticket.created
   - tulis outbox untuk balasan
8. SSE mem-publish ticket.created ke dashboard
9. Bot poll outbox → kirim balasan WA + forward grup
```

### 5.2 Aksi dashboard

```
Piket klik "Terima"
  → POST /api/tickets/:id/transition {to:"DITERIMA"}
  → API validasi transisi + role
  → UPDATE ticket + INSERT ticket_event + INSERT audit_log
  → INSERT outbox (notifikasi pelapor + grup)
  → SSE ticket.updated
  → UI optimistic update, rollback jika gagal
```

### 5.3 Command grup

```
Pesan grup "/otw 014"
  → Bot cek pengirim ada di officers.wa_jid?
  → Cek grup ada di wa_groups?
  → POST /internal/wa/group-command {ticket_no, command, jid, msg_id}
  → API validasi transisi (DITERIMA → OTW)
  → assign ke officer
  → outbox balasan grup
```

### 5.4 Media

```
Foto masuk
  → bot: downloadMediaMessage (retry 3x)
  → bot: upload multipart ke API /internal/media
  → API: validasi MIME & ukuran (gambar 16 MB; video/audio 64 MB)
  → tulis ke SIGAP_MEDIA_DIR/YYYY/MM/<uuid>.<ext>
  → hitung SHA-256
  → sharp: thumbnail 520px JPEG (metadata thumb dibuang)
  → exifr: baca GPS asli, simpan terpisah di kolom exif_gps
  → INSERT ticket_media (ticket_id NULL, status 'staged')
  → saat tiket dibuat atau /selesai grup: UPDATE ticket_id, status 'ready'
  → file asli tetap utuh
```

Catatan implementasi (Fase 3): video memakai `jpegThumbnail` dari WhatsApp sebagai poster; audio memakai durasi dari metadata WA; media staging tanpa tiket dihapus setelah 24 jam.

### 5.5 Peta

- Web memakai Leaflet, SVG renderer.
- Polygon wilayah diambil dari `regions.geojson` lewat `GET /api/regions`.
- Pin tiket memakai koordinat TKP dan warna status; P1 diberi penanda.
- Tile OpenStreetMap (terang) opsional; fallback Esri; polygon/pin tetap tampil tanpa tile.
- Mini-map Live Board dan halaman Peta memakai komponen yang sama.

### 5.6 Eskalasi P1

```
setiap 60 detik:
  ambil P1 aktif non-demo
  jika status baru dan umur > escalation_pawas_seconds dan belum escalated_pawas_at:
    → event + audit + outbox WA Pawas/URC + SSE ticket.escalated
  jika (baru atau diterima tanpa otw_at) dan umur > escalation_kapolsek_seconds
     dan belum escalated_kapolsek_at:
    → event + audit + outbox WA Kapolsek/URC + SSE ticket.escalated
```

### 5.7 Serah terima

- `GET /api/handover` merangkum tiket aktif, P1, tunda, tanpa nama, media gagal, dan 12 riwayat.
- `POST /api/handover` menyimpan `shifts` (checklist JSON, petugas masuk, nama penanda tangan) + audit.
- Tanda tangan berupa nama yang diketik; bukan e-signature tersertifikasi.

### 5.8 WhatsApp gateway & pairing

- API menyimpan state gateway di tabel `wa_gateway` (status, QR PNG data URL, TTL, phone, command queue, heartbeat bot).
- Admin memicu `connect/disconnect/logout/restart` dari **Sistem → WhatsApp Gateway**.
- Bot poll `GET /internal/wa/control` setiap 2,5 detik, ack command, lalu connect/logout.
- Saat Baileys mengeluarkan QR, bot mengirim PNG data URL ke `POST /internal/wa/qr`; API menyimpan dengan TTL ±90 detik.
- Dashboard admin poll `GET /api/system/gateway`; role lain hanya melihat status (QR tidak dikirim).
- Bot boleh start idle tanpa sesi; pairing baru terjadi setelah admin klik connect.
- Sesi Baileys tetap disimpan di `SIGAP_BOT_AUTH_DIR` dengan permission `0700`; operator tidak perlu menyentuh folder/QR file.

### 5.9 Analitik, export, digest, PWA

- Analitik dihitung di API dari query SQLite: volume 14 hari, heatmap 7×24 WIB, hotspot ±100 m, p90, dan kepatuhan SLA P1.
- Export CSV/XLSX/PDF dibuat di server; nomor pelapor dimasker; setiap unduhan masuk audit.
- Digest harian dikirim ke Kapolsek + grup URC setelah pukul 07:00 WIB, dengan dedup tanggal di tabel `settings`.
- PWA: service worker menyimpan shell + asset statis; request `/api/*` selalu bypass cache.
- Halaman besar di-lazy-load; Leaflet menjadi chunk terpisah agar initial bundle tetap kecil.

---

## 6. Skema database (detail)

```sql
-- units
CREATE TABLE units (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,          -- BKS, contoh
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TEXT NOT NULL
);

-- regions (kelurahan + polygon)
CREATE TABLE regions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  name TEXT NOT NULL,
  level TEXT NOT NULL,                -- kelurahan | desa | rw | rt
  parent_id TEXT REFERENCES regions(id),
  geojson TEXT,                       -- Polygon/MultiPolygon
  centroid_lat REAL,
  centroid_lng REAL,
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- reporters
CREATE TABLE reporters (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  phone_hash TEXT NOT NULL UNIQUE,    -- HMAC-SHA256(phone, pepper)
  phone_enc TEXT NOT NULL,            -- AES-256-GCM
  name TEXT NOT NULL,
  consent_version TEXT,
  consent_at TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  false_count INTEGER NOT NULL DEFAULT 0,
  blocked_at TEXT,
  blocked_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- tickets
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  ticket_no TEXT NOT NULL,            -- BKS-261114-014
  reporter_id TEXT NOT NULL REFERENCES reporters(id),
  category TEXT NOT NULL,
  priority TEXT NOT NULL,             -- P1..P4
  status TEXT NOT NULL,               -- BARU..DIBATALKAN
  title TEXT NOT NULL,
  description TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  accuracy_m REAL,
  region_id TEXT REFERENCES regions(id),
  location_status TEXT,               -- verified | perlu_verifikasi | teks | luar_wilkum
  source TEXT NOT NULL,               -- wa | telepon | walk-in | patroli
  cluster_id TEXT REFERENCES clusters(id),
  assigned_to TEXT REFERENCES officers(id),
  ack_at TEXT,
  otw_at TEXT,
  arrive_at TEXT,
  closed_at TEXT,
  close_note TEXT,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (unit_id, ticket_no)
);

-- ticket_events (append-only)
CREATE TABLE ticket_events (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id),
  actor_type TEXT NOT NULL,           -- reporter | officer | system | bot
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

-- ticket_media
CREATE TABLE ticket_media (
  id TEXT PRIMARY KEY,
  ticket_id TEXT REFERENCES tickets(id),   -- NULL saat staging
  reporter_id TEXT REFERENCES reporters(id),
  wa_chat_jid TEXT,
  kind TEXT NOT NULL,                       -- image | video | audio
  original_path TEXT NOT NULL,
  thumb_path TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_s REAL,
  exif_gps TEXT,
  wa_message_id TEXT,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'ready',     -- staged | ready
  created_at TEXT NOT NULL
);
CREATE INDEX idx_media_ticket ON ticket_media(ticket_id);
CREATE INDEX idx_media_staging ON ticket_media(reporter_id, wa_chat_jid, created_at);
CREATE UNIQUE INDEX uq_media_wa_message ON ticket_media(wa_message_id)
  WHERE wa_message_id IS NOT NULL;

-- clusters
CREATE TABLE clusters (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  region_id TEXT REFERENCES regions(id),
  category TEXT NOT NULL,
  center_lat REAL,
  center_lng REAL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  ticket_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- officers
CREATE TABLE officers (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  name TEXT NOT NULL,
  rank TEXT,
  role TEXT NOT NULL,                 -- admin | kapolsek | pawas | piket | urc | bhabin
  phone TEXT,
  wa_jid TEXT UNIQUE,
  region_id TEXT REFERENCES regions(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- wa_groups
CREATE TABLE wa_groups (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  name TEXT NOT NULL,
  jid TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL,              -- urc | piket | bhabin | admin
  active INTEGER NOT NULL DEFAULT 1
);

-- conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  wa_jid TEXT NOT NULL UNIQUE,
  reporter_id TEXT REFERENCES reporters(id),
  state TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

-- message_log (idempotensi)
CREATE TABLE message_log (
  wa_message_id TEXT PRIMARY KEY,
  direction TEXT NOT NULL,            -- inbound | outbound
  wa_jid TEXT,
  received_at TEXT NOT NULL
);

-- outbox
CREATE TABLE outbound_messages (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id),
  target_jid TEXT NOT NULL,
  kind TEXT NOT NULL,                 -- text | media | group_forward
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

-- audit_logs (append-only)
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  meta_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);

-- sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  officer_id TEXT NOT NULL REFERENCES officers(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

-- settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
```

Index penting:
- `tickets(unit_id, status, priority, created_at)`
- `tickets(unit_id, ticket_no)`
- `tickets(region_id, created_at)`
- `ticket_events(ticket_id, created_at)`
- `outbound_messages(status, next_attempt_at)`
- `reporters(phone_hash)`
- `audit_logs(created_at)`

---

## 7. State machine

### 7.1 Tiket

```
BARU
 ├─ DITERIMA (piket)
 ├─ DITOLAK (piket, alasan wajib)
 └─ DIBATALKAN (pelapor, hanya sebelum DITERIMA)
DITERIMA
 ├─ OTW (urc/piket)
 ├─ DITUNDA (piket, alasan)
 └─ DITOLAK (piket, alasan)
OTW
 ├─ DI_TKP (urc)
 └─ DITUNDA (urc/piket, alasan)
DI_TKP
 ├─ SELESAI (urc/piket; catatan wajib; bukti wajib P1/P2)
 └─ DITUNDA
DITUNDA
 ├─ DITERIMA
 └─ OTW
SELESAI
 └─ DIBUKA_KEMBALI (admin/pawas, alasan)
```

### 7.2 Percakapan bot

```
IDLE
 ├─ pesan darurat / lokasi → EMERGENCY_CREATED
 ├─ "lapor"/menu → AWAIT_NAME (baru) / AWAIT_CATEGORY (lama)
AWAIT_NAME
 └─ nama valid → AWAIT_CATEGORY
AWAIT_CATEGORY
 └─ kategori valid → AWAIT_DESC
AWAIT_DESC
 └─ teks/VN → AWAIT_LOCATION
AWAIT_LOCATION
 ├─ location/live location → validasi → AWAIT_MEDIA
 ├─ foto dengan EXIF → tawarkan → AWAIT_MEDIA
 ├─ alamat teks → AWAIT_REGION_CONFIRM
 └─ kelurahan dipilih → AWAIT_MEDIA
AWAIT_REGION_CONFIRM
 └─ konfirmasi → AWAIT_MEDIA
AWAIT_MEDIA
 ├─ media → simpan, tetap AWAIT_MEDIA
 ├─ "SELESAI"/"KIRIM" → CONFIRM
 └─ timeout 10 menit → CONFIRM (tanpa media)
CONFIRM
 ├─ "1" → buat tiket → DONE
 ├─ "2" → batal → IDLE
 └─ "3" → ulangi dari kategori
DONE
 └─ follow-up → append ke tiket terbuka (TTL 24 jam)
```

Semua state punya `expires_at`. Jika expired, kembali ke IDLE dengan pesan "Sesi laporan Kedaluwarsa, ketik LAPOR untuk memulai lagi."

---

## 8. Geofence

### 8.1 Algoritma

```
input: lat, lng, accuracy_m
1. Cek di dalam polygon unit (Turf booleanPointInPolygon)
   - ya → location_status = verified
   - tidak → cek buffer 250 m
       - ya → location_status = perlu_verifikasi
       - tidak → cek jarak ke polygon terdekat
           - < 1 km → perlu_verifikasi + region terdekat
           - ≥ 1 km → luar_wilkum
2. Cari region (kelurahan) yang mengandung titik.
3. Jika accuracy > 100 m → flag perlu_verifikasi.
4. Simpan region_id, lat, lng, accuracy.
```

### 8.2 Data polygon

- Sumber: batas administrasi resmi yang diverifikasi, atau OSM yang dicek manual.
- Format: GeoJSON `Polygon`/`MultiPolygon`, WGS84.
- Validasi: `@turf/kinks` (tidak boleh self-intersect), `@turf/area` > 0.
- Simpan versi; perubahan harus lewat admin + audit.
- Cache di memori saat boot; reload saat ada perubahan.

### 8.3 Kasus khusus

| Kasus | Perilaku |
|---|---|
| Titik di perbatasan dua kelurahan | Pilih region dengan irisan terdekat; flag `perlu_verifikasi` |
| Titik di jalan tol/batas | Buffer 250 m; piket verifikasi |
| Lokasi live berubah | Update terakhir disimpan; tampilkan riwayat |
| Tidak ada lokasi | Minta pin/kelurahan/alamat; tiket `lokasi_teks` |
| Alamat di luar wilkum | Redirect |
| Pelapor di luar, TKP di dalam | Diterima; yang divalidasi TKP |
| Titik di laut/tidak ada region | `luar_wilkum` |

---

## 9. Keamanan

### 9.1 Autentikasi & otorisasi

- Password: Argon2id (memory 64 MB, iterations 3, parallelism 1).
- Session: opaque 256-bit token, HttpOnly + Secure + SameSite=Lax, hash di DB, expiry 12 jam (piket) / 8 jam (admin).
- TOTP wajib admin, Kapolsek, Pawas; disarankan semua.
- CSRF: SameSite + cek `Origin` + header `X-Requested-With` untuk mutasi.
- Rate limit login: 5 percobaan/15 menit per IP + per akun.
- Revoke session per perangkat.
- Role matrix:

| Aksi | piket | urc | bhabin | pawas | kapolsek | admin |
|---|---|---|---|---|---|---|
| Lihat tiket | ✅ | ✅ (wilayah) | ✅ (wilayah) | ✅ | ✅ | ✅ |
| Terima/disposisi | ✅ | — | — | ✅ | — | ✅ |
| OTW/tiba/selesai | ✅ | ✅ | — | ✅ | — | ✅ |
| Tutup/tolak | ✅ | — | — | ✅ | — | ✅ |
| Reveal PII | ✅ (audit) | — | — | ✅ | ✅ | ✅ |
| Export | ✅ | — | — | ✅ | ✅ | ✅ |
| Kelola user/wilayah | — | — | — | — | — | ✅ |
| Audit log | — | — | — | ✅ | ✅ | ✅ |

### 9.2 Perlindungan data

- `phone_enc` AES-256-GCM; key dari env, bukan DB.
- `phone_hash` HMAC-SHA256 dengan pepper; untuk lookup tanpa dekripsi.
- NIK tidak dikumpulkan v1.
- Log tidak boleh memuat isi pesan, nomor penuh, atau nama lengkap.
- Backup terenkripsi (age/restic).
- Media di luar webroot; akses via endpoint dengan session + audit.
- Retention job harian; legal hold menang.
- Audit log append-only; tidak ada endpoint delete.

### 9.3 Threat model (ringkas)

| Ancaman | Dampak | Kontrol |
|---|---|---|
| Spoofing command grup | Status tiket berubah palsu | JID allowlist + audit + role |
| Tampering media | Bukti tidak sah | SHA-256 + akses terbatas + audit unduh |
| Repudiation | Petugas menyangkal aksi | Audit log + session + timestamp |
| Info disclosure | PII bocor | Masking, RBAC, enkripsi, no public URL |
| DoS laporan | Dashboard banjir | Rate limit, cluster, queue |
| Elevation of privilege | Warga jadi admin | TOTP, session aman, no default password |
| Session hijack | Aksi atas nama petugas | HttpOnly, Secure, expiry, revoke |
| Insider abuse | Buka data tanpa alasan | Audit reveal + review Pawas |
| Supply chain | Paket berbahaya | Lockfile, audit, pin versi, review update |
| WA ban | Layanan mati | Nomor cadangan + SOP |

---

## 10. Deployment tanpa Docker

### 10.1 Server

- VPS Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 80 GB SSD (Indonesia bila memungkinkan).
- Domain + TLS via Caddy.
- User non-root `sigap`.
- SSH key only; password login off; fail2ban.
- UFW: 22 (allowlist IP admin), 80, 443.
- NTP aktif.
- `unattended-upgrades` untuk security patch.

### 10.2 systemd

`/etc/systemd/system/sigap-api.service`:

```ini
[Unit]
Description=SIGAP API
After=network-online.target
Wants=network-online.target
OnFailure=sigap-alert@%n.service

[Service]
Type=simple
User=sigap
Group=sigap
WorkingDirectory=/opt/sigap/apps/api
EnvironmentFile=/etc/sigap/api.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/sigap /var/log/sigap
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

`sigap-bot.service` serupa, `WorkingDirectory=/opt/sigap/apps/bot`, `ExecStart=/usr/bin/node dist/main.js`.

`OnFailure` memanggil script yang mengirim alert ke admin (WA/SMS/email).

### 10.3 Caddy

```caddy
sigap.example.go.id {
  encode zstd gzip
  root * /opt/sigap/apps/web/dist
  try_files {path} /index.html

  handle /api/* {
    reverse_proxy 127.0.0.1:4000
  }

  handle /internal/* {
    respond 404
  }

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    Permissions-Policy "geolocation=(self)"
    -Server
  }
}
```

### 10.4 Rilis & rollback

```
/opt/sigap/releases/2026-11-14-1/
/opt/sigap/current -> releases/2026-11-14-1
```

1. Build di server/CI.
2. `pnpm install --prod` untuk API/bot; web statis.
3. Jalankan migrasi DB (backup dulu).
4. Symlink `current`.
5. `systemctl restart sigap-api sigap-bot`.
6. Health check.
7. Simpan 3 rilis terakhir; rollback = ganti symlink + restart.

### 10.5 Backup & restore

- **DB**: setiap jam `sqlite3 .backup` atau backup API → `/var/backups/sigap/db/`.
- **Media**: rsync harian ke storage terpisah.
- **Enkripsi**: restic/age.
- **Retensi**: 7 harian, 4 mingguan, 6 bulanan.
- **Restore drill**: bulanan, catat waktu & hasil.
- **RPO** 1 jam; **RTO** 2 jam.

### 10.6 Monitoring

- `/health` → status API, DB, disk, outbox, gateway.
- Cron setiap 5 menit → alert jika gagal.
- Uptime Kuma (native Node, systemd) untuk uptime & TLS expiry.
- Alert ke WA admin + email.
- Dashboard menampilkan status gateway/outbox/backup.
- Log: journald, request ID, level, jangan PII.

---

## 11. Failure modes

| Kegagalan | Deteksi | Dampak | Mitigasi |
|---|---|---|---|
| WA disconnect | `connection.update` | Tidak terima/kirim | Auto-reconnect; alert; dashboard status |
| WA banned | Logout 401/403 | Kanal mati | Nomor cadangan; SOP migrasi; poster update |
| QR expired | Pairing gagal | Tidak bisa pairing | Generate ulang; admin lokal |
| API down | Healthcheck | Dashboard mati | systemd restart; alert; bot retry |
| DB locked | `SQLITE_BUSY` | Tulis gagal | WAL, busy_timeout, single writer, retry |
| Disk penuh | Healthcheck | Media gagal | Alert 80%; purge; arsip |
| Media download gagal | Error Baileys | Bukti hilang | Retry 3x; tiket tetap; flag `media_failed` |
| Outbox stuck | Queue depth | Pesan tidak terkirim | Retry backoff; dead-letter; alert |
| Grup admin-only | Send error | Forward gagal | Bot jadi admin; dokumentasi |
| Internet piket putus | SSE disconnect | Tidak lihat update | Reconnect; read-only cache; 4G failover |
| Listrik mati | UPS | Dashboard mati | UPS 30 menit; genset opsional |
| Map tile gagal | Error tile | Peta kosong | Polygon lokal + pin tetap; fallback SVG |
| Clock drift | NTP | Waktu bukti salah | NTP; alert jika drift > 5 detik |
| Backup gagal | Exit code | Risiko kehilangan data | Alert; retry; restore drill |

---

## 12. Performance budget

| Item | Budget |
|---|---|
| HTML awal | ≤ 30 KB gzip |
| CSS | ≤ 40 KB gzip |
| JS awal | ≤ 180 KB gzip |
| Font | 2 file WOFF2, ≤ 80 KB total |
| Map | Lazy load saat layar peta dibuka |
| API p95 | ≤ 300 ms |
| SSE latency | ≤ 1 detik |
| Media thumbnail | ≤ 300 KB |
| First contentful paint | ≤ 1.2 detik (4G) |
| Time to interactive | ≤ 2 detik (4G) |

Cara mencapainya:
- Vite code splitting per route.
- Tidak ada chart/icon library berat.
- Font self-host + `font-display: swap`.
- Preload font utama + critical CSS.
- SSE patch store, bukan reload.
- Virtualisasi daftar > 100.
- Gambar `loading="lazy"` + `srcset`.

---

## 13. Testing

| Level | Tools | Cakupan |
|---|---|---|
| Unit | Vitest | State machine tiket, geofence, nomor tiket, rate limit, format |
| API | Fastify inject + Vitest | Auth, RBAC, transisi, idempotensi, validasi |
| Bot | Mock socket Baileys | Flow percakapan, media, command grup |
| E2E | Playwright | Login, terima tiket, OTW, selesai, handover, export |
| Load | k6 (binary) | 50 laporan/jam, 20 user dashboard |
| Security | Manual + `npm audit` | Auth, CSRF, IDOR, upload, rate limit |
| Restore | Script | Backup → restore ke DB kosong → verifikasi |

Definition of Done ada di `04-RENCANA.md`.

---

## 14. Migrasi & exit plan

### 14.1 SQLite → Postgres

- Drizzle schema mendukung kedua dialek; jangan pakai fitur SQLite-only di query.
- `unit_id` sudah ada.
- Migrasi: export CSV/JSON → import → verifikasi jumlah → switch.
- Tidak dibangun sekarang.

### 14.2 Baileys → Cloud API / hybrid

- Jika nomor kena ban berulang atau Baileys tidak stabil:
  - **Hybrid:** Cloud API untuk 1:1 warga; Baileys hanya untuk grup internal.
  - **Full Cloud API:** kehilangan auto-post grup; ganti dengan dashboard + notifikasi terpisah.
- Abstraksi `WaGateway` interface di bot; jangan biarkan logika domain bergantung pada Baileys.
- Simpan `wa_message_id` netral.

### 14.3 Multi-Polsek

- `unit_id` di semua tabel.
- Konfigurasi per unit: polygon, grup, nomor, SLA.
- UI v1 hanya satu unit; routing `/[unit]/...` disiapkan.
- Jangan aktifkan multi-tenant sebelum ada kebutuhan & uji isolasi data.

---

## 15. Keputusan yang belum final

Lihat `09-KEPUTUSAN.md` dan `10-PERTANYAAN-TERBUKA.md`. Yang paling mempengaruhi arsitektur:
1. Domain & hosting (Indonesia? `.go.id`?).
2. Siapa pemilik nomor WA & bagaimana pairing dijaga.
3. Apakah voice note perlu transkripsi di v1 (disarankan tidak).
4. Apakah perlu web form publik (v1.1).
5. Apakah perlu integrasi ekspor ke format Polres (Excel/PDF sudah cukup).
