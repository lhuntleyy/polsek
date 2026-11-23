# 12 — API Reference (Fase 1)

**Base URL dev:** `http://127.0.0.1:4000`
**Base URL web dev:** `http://127.0.0.1:5173` (proxy `/api`)
**Auth:** cookie sesi `sigap_session` (HttpOnly, SameSite=Lax).
**Format error:**

```json
{
  "error": {
    "code": "forbidden",
    "message": "Transisi baru -> diterima tidak diizinkan untuk role urc",
    "details": null
  }
}
```

---

## 1. Auth

### POST `/api/auth/login`

```json
{
  "username": "piket",
  "password": "Demo#12345",
  "totp": "123456"
}
```

Response:

```json
{
  "user": {
    "id": "...",
    "username": "piket",
    "name": "Bripka Andi Saputra",
    "role": "piket",
    "unitId": "unit_main",
    "regionId": null,
    "totpEnabled": false
  },
  "unit": { "name": "Polsek Contoh", "code": "BKS", "timezone": "Asia/Jakarta" },
  "expiresAt": "2026-11-14T17:33:00.759Z"
}
```

- Rate limit: 5 percobaan / 15 menit per IP.
- Jika TOTP aktif, `totp` wajib.

### POST `/api/auth/logout`

Mencabut sesi dan menghapus cookie.

### GET `/api/me`

Mengembalikan `{ user }`.

### POST `/api/auth/totp/setup`

Mengembalikan `{ secret, uri }` dan menyimpan secret sementara (belum aktif).

### POST `/api/auth/totp/enable`

```json
{ "code": "123456" }
```

Mengaktifkan TOTP untuk akun yang sedang login.

---

## 2. Tiket

### GET `/api/tickets`

Query:

| Param | Nilai |
|---|---|
| `status` | `baru`, `diterima`, `otw`, `ditkp`, `selesai`, `ditunda`, `ditolak`, `dibatalkan` |
| `priority` | `P1`..`P4` |
| `regionId` | ID wilayah |
| `q` | cari judul/nomor/nama pelapor |
| `limit` | 1–100, default 50 |
| `cursor` | cursor dari response sebelumnya |

Response:

```json
{
  "items": [
    {
      "id": "...",
      "ticketNo": "BKS-261114-001",
      "title": "Tawuran antar kelompok...",
      "category": "tawuran",
      "categoryLabel": "Gangguan Kamtibmas",
      "priority": "P1",
      "status": "baru",
      "reporter": {
        "name": "Rizky Maulana",
        "phoneMasked": "0812•••••134",
        "reportCount": 2,
        "validCount": 2,
        "verified": true
      }
    }
  ],
  "nextCursor": "..."
}
```

Bhabinkamtibmas hanya melihat tiket di wilayahnya.

### GET `/api/tickets/:id`

Mengembalikan `{ ticket, events }`.

### POST `/api/tickets/:id/transition`

```json
{
  "to": "otw",
  "note": "Menuju lokasi",
  "assigneeId": "...",
  "reason": "palsu"
}
```

Aturan:
- `baru -> diterima|ditolak|dibatalkan`
- `diterima -> otw|ditunda|ditolak`
- `otw -> ditkp|ditunda`
- `ditkp -> selesai|ditunda`
- `ditunda -> diterima|otw|ditolak`
- `selesai|ditolak -> diterima` hanya `pawas`/`admin`
- `selesai` wajib `note` (catatan penanganan).
- `ditolak` wajib `reason`.
- `ditunda` wajib `note`.
- Semua transisi masuk `ticket_events` + `audit_logs` dan broadcast SSE.

### POST `/api/tickets/:id/notes`

```json
{ "text": "Sudah ditelepon, pelapor mengonfirmasi lokasi." }
```

Catatan internal, tidak dikirim ke pelapor.

### POST `/api/tickets/manual`

Akses: `piket`, `pawas`, `admin`.

```json
{
  "reporterName": "Warga Uji",
  "reporterPhone": "081200000009",
  "category": "tawuran",
  "priority": "P1",
  "title": "Uji tiket manual",
  "description": "Tes pembuatan tiket manual.",
  "address": "Pekayon Jaya",
  "lat": -6.26,
  "lng": 106.982,
  "accuracyM": 12,
  "source": "telepon",
  "reporterConsent": true
}
```

- Nama dan nomor wajib.
- `reporterConsent` harus `true`.
- Lokasi divalidasi dengan polygon wilkum jika `lat/lng` diisi.
- Nomor tiket dibuat harian per unit.

### POST `/api/tickets/:id/reveal-phone`

Akses: `piket`, `pawas`, `kapolsek`, `admin`, `urc` (bukan bhabin). Mengembalikan `{ "phone": "0812..." }` dan menulis audit `reporter.phone.reveal`. Rate limit 30/menit.

### GET `/api/tickets/:id/duplicates`

Mencari tiket aktif dengan kategori sama, dibuat dalam 60 menit, dan berjarak ≤ 500 m (atau wilayah sama jika koordinat tidak lengkap).

```json
{
  "items": [
    {
      "id": "...",
      "ticketNo": "BKS-261114-011",
      "title": "Begal di depan minimarket",
      "status": "baru",
      "priority": "P2",
      "distanceM": 40,
      "minutesAgo": 6,
      "reporterName": "Warga"
    }
  ]
}
```

### POST `/api/tickets/:id/merge`

Akses: `piket`, `pawas`, `kapolsek`, `admin`.

```json
{ "sourceIds": ["..."], "note": "Lokasi dan waktu sama" }
```

- Sumber harus aktif dan kategorinya sama.
- Sumber diubah menjadi `dibatalkan`, `duplicate_of` diisi, media dipindahkan ke tiket utama.
- Event tiket + audit `ticket.merge` + SSE broadcast.

### GET `/api/handover`

Akses: `piket`, `pawas`, `kapolsek`, `admin`, `urc`. Mengembalikan `tickets`, `counts`, `checks`, `lastHandover`, dan `history` (12 terakhir).

### POST `/api/handover`

Akses: `piket`, `pawas`, `kapolsek`, `admin`.

```json
{
  "shift": "siang",
  "incomingName": "Bripka Pengganti",
  "notes": "P1 sudah dikoordinasikan. Tunda dicek.",
  "signedByName": "Bripka Andi Saputra",
  "checklist": {
    "p1Acknowledged": true,
    "delayedReasons": true,
    "namesComplete": true,
    "mediaChecked": true,
    "queueReviewed": true
  }
}
```

Menyimpan baris `shifts` + audit `handover.submit`.

### Eskalasi P1 (worker, bukan endpoint)

API menjalankan worker setiap 60 detik:
- P1 `baru` melewati `escalation_pawas_seconds` → eskalasi Pawas.
- P1 `baru`/`diterima` tanpa OTW melewati `escalation_kapolsek_seconds` → eskalasi Kapolsek.
- Aksi: update kolom `escalated_*_at`, event tiket, audit `ticket.escalate`, outbox WA ke petugas role terkait + grup URC, SSE `ticket.escalated`.
- Tiket demo dan tiket duplikat tidak dieskalasi.

---

## 3. Wilayah

### GET `/api/regions`

Mengembalikan daftar wilayah + `geojson` + jumlah tiket.

### POST `/api/regions`

Akses: `admin`.

```json
{
  "name": "Pekayon Jaya",
  "geojson": {
    "type": "Polygon",
    "coordinates": [[[106.97, -6.25], [107.0, -6.25], [107.0, -6.27], [106.97, -6.27], [106.97, -6.25]]]
  },
  "active": true,
  "isDemo": false
}
```

Validasi: Polygon/MultiPolygon, ring tertutup, koordinat valid.

### PATCH `/api/regions/:id`

Ubah nama/geojson/active. Setiap perubahan menaikkan `version` dan masuk audit.

### DELETE `/api/regions/:id`

Akses: `admin`. Wilayah tanpa tiket/petugas/anak wilayah dihapus permanen. Jika masih dipakai, wilayah dinonaktifkan (`active=false`) agar riwayat tiket tetap valid; respons `{ ok, mode: "deleted"|"deactivated", tickets, officers }`.

---

## 4. Settings

### GET `/api/public/config`

Publik, untuk login page: nama unit, kode, timezone, versi.

### GET `/api/settings`

Akses: `admin`. Mengembalikan unit, WA, DPO, retensi, SLA, toggles.

`wa_group_urc_jid` menerima angka ID grup (`120363...`) atau JID lengkap. API menormalkan ke `@g.us` dan otomatis mendaftarkan grup itu sebagai grup aktif agar command bot langsung bekerja.

### PATCH `/api/settings`

Akses: `admin`.

```json
{
  "wa_number": "0812...",
  "wa_owner": "Admin Unit",
  "dpo_name": "Project Owner",
  "retention_days": 365,
  "sla_p1_ack_seconds": 120,
  "sla_p1_otw_seconds": 300,
  "escalation_pawas_seconds": 180,
  "escalation_kapolsek_seconds": 600
}
```

---

## 5. Analitik & sistem

### GET `/api/analytics/summary`

Query opsional: `from`, `to` (ISO datetime). Bhabin otomatis dibatasi ke wilayahnya.

Mengembalikan:
- total, aktif, P1, selesai, ditolak;
- distribusi status/kategori/prioritas/wilayah;
- `daily` 14 hari (total, P1, selesai);
- `heatmap` 7 hari × 24 jam WIB;
- `hotspots` cluster koordinat ±100 m;
- `targets` SLA P1 dan `sla` (jumlah dalam target);
- `response` rata-rata, median, dan p90 ack/OTW/tutup.

### GET `/api/export/tickets.csv?month=YYYY-MM`

Akses: `piket`, `pawas`, `kapolsek`, `admin`. CSV dengan BOM, masking nomor, dan proteksi formula injection. Bisa juga memakai `from`/`to`/`status`/`category`.

### GET `/api/export/tickets.xlsx?month=YYYY-MM`

XLSX berisi sheet **Tiket** + **Ringkasan**.

### GET `/api/export/monthly.pdf?month=YYYY-MM`

PDF bulanan: ringkasan, kategori, wilayah, daftar tiket (maks 32 baris di PDF), nomor halaman.

Semua export menulis audit `export.csv/xlsx/pdf`.

### POST `/api/system/digest`

Akses: `admin`, `pawas`, `kapolsek`. Memaksa kirim digest harian ke Kapolsek + grup URC dan menulis audit `digest.trigger`/`digest.send`. Worker juga mengirim otomatis sekali sehari setelah pukul 07:00 WIB.

### WhatsApp Gateway

- `GET /api/system/gateway` — semua sesi. Status gateway, phone, `botOnline`, `pendingCommand`. QR hanya dikembalikan untuk `admin`.
- `POST /api/system/gateway/connect` — `admin`. Meminta bot menampilkan QR / connect ulang.
- `POST /api/system/gateway/disconnect` — `admin`. Putuskan sementara, sesi tetap disimpan.
- `POST /api/system/gateway/logout` — `admin`. Logout + hapus sesi; nomor harus di-pairing ulang.
- `POST /api/system/gateway/restart` — `admin`. Restart socket WhatsApp.

Aksi admin dibatasi 10 request/menit dan tercatat di audit. QR disimpan sebagai PNG data URL di `wa_gateway`, hanya untuk admin, dan kedaluwarsa ±90 detik.

Kanal internal bot (token internal, bukan cookie):

- `GET /internal/wa/control` — bot mengambil command + heartbeat.
- `POST /internal/wa/control/ack` — ack command `{ id }`.
- `POST /internal/wa/qr` — bot mengirim `{ qrDataUrl, expiresAt }` (PNG, maks 200 KB).
- `POST /internal/wa/status` — status `connecting|qr|connected|disconnected`, phone, error.

Bot harus berjalan sebagai service (`sigap-bot`). Dashboard mengontrol bot, bukan menyalakan prosesnya.

### Web Push

- `GET /api/push/public-key` — sesi. Mengembalikan `{ publicKey, configured }`; `configured=false` jika VAPID belum diisi.
- `POST /api/push/subscribe` — sesi. Body `{ endpoint, keys: { p256dh, auth } }`; subscription disimpan per petugas.
- `POST /api/push/unsubscribe` — sesi. Body `{ endpoint }`; hanya menghapus subscription milik sendiri.
- `POST /api/push/test` — sesi. Mengirim notifikasi uji ke perangkat petugas.

VAPID diisi berpasangan: `SIGAP_VAPID_PUBLIC_KEY`, `SIGAP_VAPID_PRIVATE_KEY`, `SIGAP_VAPID_SUBJECT`. Push dipakai untuk P1 baru dan eskalasi Pawas/Kapolsek; alarm SSE tetap berjalan.

### GET `/api/officers`

Akses: `admin`, `pawas`, `kapolsek`. Status versi, DB size, gateway config, outbox, demo counts, retensi, DPO.

### GET `/api/audit?limit=50`

Akses: `admin`, `pawas`. Audit log terbaru.

### GET `/api/officers`

Akses: `admin`, `pawas`, `piket`. Daftar petugas untuk assignee.

### POST `/api/officers`

Akses: `admin`. Membuat akun petugas baru. `waJid` menerima nomor biasa (`0812...`, `628...`, `+62...`) atau JID lengkap; API menormalkan ke `...@s.whatsapp.net`.

### PATCH `/api/officers/:id`

Akses: `admin`. Ubah nama, rank, role, wilayah, telepon, JID WA, atau status aktif.

### DELETE `/api/officers/:id`

Akses: `admin`. Akun tanpa riwayat tiket/shift dihapus permanen. Akun yang sudah punya riwayat **dinonaktifkan**, `wa_jid`/`phone` dilepas, dan sesi login dicabut. Respons `{ ok, mode: "deleted"|"deactivated" }`. Akun sendiri dan admin aktif terakhir tidak bisa dihapus.

### GET `/api/wa-groups`

Akses: `admin`, `pawas`, `piket`. Daftar grup WhatsApp.

### POST `/api/wa-groups` / PATCH `/api/wa-groups/:id`

Akses: `admin`. Tambah grup (`name`, `jid`, `purpose`, `active`) atau ubah nama/status aktif. `jid` menerima angka ID grup atau JID lengkap; API menormalkan ke `@g.us`.

### GET `/api/reporters?q=&limit=`

Akses: `admin`, `pawas`. Daftar pelapor dengan nomor dimasker dan statistik laporan.

### POST `/api/reporters/:id/block`

Akses: `admin`, `pawas`.

```json
{ "reason": "Laporan palsu berulang" }
```

Nomor yang diblokir tidak bisa membuat tiket baru dari WhatsApp maupun tiket manual. `STATUS` dan `BANTU` tetap dilayani.

### POST `/api/reporters/:id/unblock`

Membuka blokir dan menulis audit.

---

## 6. SSE

### GET `/api/stream`

Headers: `text/event-stream`. Event:

```
event: hello
data: {"officerId":"...","at":"..."}

event: ticket.updated
data: {"id":"...","ticketNo":"BKS-...","status":"baru","priority":"P1","title":"...","regionId":"..."}
```

- Heartbeat `: ping` setiap 15 detik.
- Cookie sesi wajib; EventSource mengirim cookie same-origin.
- Reconnect otomatis oleh browser.

---

## 7. Matriks role

| Aksi | piket | urc | bhabin | pawas | kapolsek | admin |
|---|---|---|---|---|---|---|
| Lihat tiket | ✅ | ✅ | ✅ (wilayah) | ✅ | ✅ | ✅ |
| Terima/tolak | ✅ | — | — | ✅ | — | ✅ |
| OTW/tiba/selesai | ✅ | ✅ | — | ✅ | — | ✅ |
| Catatan internal | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Tiket manual | ✅ | — | — | ✅ | — | ✅ |
| Export laporan | ✅ | — | — | ✅ | ✅ | ✅ |
| Trigger digest | — | — | — | ✅ | ✅ | ✅ |
| Kelola wilayah | — | — | — | — | — | ✅ |
| Kelola petugas/grup | — | — | — | — | — | ✅ |
| Kelola settings | — | — | — | — | — | ✅ |
| Blokir pelapor | — | — | — | ✅ | — | ✅ |
| Audit | — | — | — | ✅ | — | ✅ |
| Web Push perangkat sendiri | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 8. Internal bot API (Fase 2–3)

Semua endpoint `/internal/*` memakai header:

```
x-sigap-internal-token: <SIGAP_INTERNAL_TOKEN>
```

Tidak memakai cookie dan tidak boleh diekspos lewat Caddy publik.

| Method | Path | Fungsi |
|---|---|---|
| `POST` | `/internal/wa/inbound` | Pesan 1:1 masuk (teks/lokasi/media metadata) |
| `POST` | `/internal/wa/group-command` | Command grup URC |
| `POST` | `/internal/wa/status` | Status gateway (`connecting/qr/connected/disconnected`) |
| `GET` | `/internal/outbox?limit=20` | Bot mengambil pesan keluar |
| `POST` | `/internal/outbox/:id/result` | Bot melaporkan sukses/gagal |
| `POST` | `/internal/media` | Upload media (multipart) sebelum/saat tiket dibuat |
| `GET` | `/internal/media/:id` | Bot mengunduh byte media asli untuk diteruskan ke grup |
| `GET` | `/internal/health` | Cek koneksi bot + status gateway |

Contoh inbound:

```json
{
  "waMessageId": "3EB0...",
  "chatJid": "6281234567890@s.whatsapp.net",
  "senderJid": "6281234567890@s.whatsapp.net",
  "senderName": "Rizky",
  "isGroup": false,
  "type": "image",
  "text": "Ini foto kejadiannya",
  "mediaIds": ["444dff49-9049-4a22-baea-b7ca60e5a38d"],
  "timestamp": "2026-11-14T07:50:00.000Z"
}
```

Upload media (`multipart/form-data`, `file` wajib; `thumb` opsional untuk video):

| Field | Wajib | Keterangan |
|---|---|---|
| `file` | ya | Buffer media asli |
| `thumb` | tidak | JPEG thumbnail video (maks 2 MB) |
| `mime` | ya | Contoh `image/jpeg`, `video/mp4`, `audio/ogg` |
| `kind` | tidak | `image`/`video`/`audio`; harus cocok dengan MIME |
| `waChatJid` | disarankan | JID pengirim; dipakai untuk menautkan pelapor |
| `waMessageId` | disarankan | Idempoten; upload ulang mengembalikan media yang sama |
| `durationS` | tidak | Durasi audio dari metadata WhatsApp |
| `caption` | tidak | Caption media |
| `exifLat` / `exifLng` | tidak | GPS eksplisit; jika kosong API membaca EXIF |

Response:

```json
{
  "ok": true,
  "media": {
    "id": "444dff49-9049-4a22-baea-b7ca60e5a38d",
    "kind": "image",
    "mime": "image/jpeg",
    "size": 1146221,
    "sha256": "b8bf7b10...",
    "width": 1600,
    "height": 1000,
    "durationS": null,
    "exifGps": null,
    "caption": "Uji media dashboard",
    "url": "/api/media/444dff49-9049-4a22-baea-b7ca60e5a38d",
    "thumbUrl": "/api/media/444dff49-9049-4a22-baea-b7ca60e5a38d/thumb"
  }
}
```

Contoh command grup:

```json
{
  "waMessageId": "3EB0...",
  "groupJid": "120363000000000000@g.us",
  "senderJid": "628000000005@s.whatsapp.net",
  "text": "/otw 014",
  "timestamp": "2026-11-14T07:55:00.000Z"
}
```

Outbox response:

```json
{
  "items": [
    {
      "id": "...",
      "targetJid": "6281234567890@s.whatsapp.net",
      "kind": "text",
      "payload": { "text": "Laporan diterima..." },
      "attempts": 1
    },
    {
      "id": "...",
      "targetJid": "120363000000000000@g.us",
      "kind": "media",
      "payload": {
        "mediaId": "uuid",
        "mime": "image/jpeg",
        "kind": "image",
        "caption": "Lampiran #014 (1/1)"
      },
      "attempts": 1
    }
  ]
}
```

Aturan:
- `waMessageId` idempoten; pesan ganda diabaikan.
- `GET /internal/outbox` menandai pesan `sending`; reclaim setelah 60 detik.
- Gagal kirim: backoff eksponensial; setelah 8 percobaan menjadi `dead`.
- `kind=media`: bot memanggil `GET /internal/media/:id`, lalu mengirim image/video/audio + caption ke target.
- Update status ke pelapor memakai bahasa operasional: “Status pelaporan dengan nomor tiket … sedang jalan ke TKP”, “… sudah tiba di TKP”, “… sudah selesai ditangani”, “… ditunda/ditolak” + alasan.
- `POST /internal/wa/status` menyimpan status/QR di tabel `wa_gateway` (TTL QR 90 detik), bukan hanya memori.
- `GET /api/system/gateway` (admin/pawas/kapolsek) menampilkan status; QR penuh hanya admin.
- Command grup memakai `senderJid` petugas terdaftar; nomor tak dikenal dibalas, bukan didiamkan.
- `/otw`, `/tiba`, `/selesai`, `/tunda` hanya role piket/urc/pawas/admin; pesan penolakan menyebut role pengirim + role yang diizinkan.
- Media staging disimpan dengan `ticket_id = NULL`; saat tiket dibuat atau `/selesai` grup menerima `mediaIds`, baris di-update menjadi `ticket_id = ...`, `status = ready`.
- Media staging tanpa tiket dihapus setelah 24 jam.

## 9. Media

| Method | Path | Fungsi |
|---|---|---|
| `GET` | `/api/media/:id` | File asli; butuh sesi petugas |
| `GET` | `/api/media/:id/thumb` | Thumbnail JPEG; butuh sesi petugas |
| `GET` | `/api/media/:id?download=1` | Paksa unduh (`Content-Disposition: attachment`) |

- Mendukung `Range: bytes=...` (206) untuk video/audio.
- `Cache-Control: private, no-store`.
- Unduh eksplisit (`?download=1`) dicatat di `audit_logs` sebagai `media.download`.
- Bhabin hanya boleh mengakses media yang terhubung ke tiket di wilayahnya; media staging ditolak.
- Batas: gambar 16 MB; video/audio 64 MB; thumbnail 2 MB.
- `GET /api/tickets/:id` mengembalikan `media[]` berisi metadata + `url` + `thumbUrl` + `sha256` + `exifGps`.

## 10. Catatan implementasi

- Semua timestamp ISO-8601 UTC; tampilan WIB di web.
- Nomor telepon dienkripsi AES-256-GCM; lookup memakai HMAC-SHA256.
- `audit_logs` append-only; tidak ada endpoint delete.
- Rate limit global 300/menit; login 5/15 menit.
- CSRF: origin request harus cocok dengan `SIGAP_PUBLIC_ORIGIN` (plus localhost dev).
- Body limit JSON 2 MB; multipart media memakai limit terpisah (64 MB per file).
- API dan web berjalan di proses terpisah; SSE satu instance (single VPS).
