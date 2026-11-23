# 11 — UI Kit & Design System

**Versi:** 0.1
**Tanggal:** 14 November 2026
**Implementasi referensi:** `prototype/assets/styles.css`

---

## 1. Arah

**Quiet command center.** Gelap, tenang, padat, cepat. Bukan landing page; tidak ada animasi dekoratif yang mengganggu. Fokus pada keterbacaan di monitor piket dan kecepatan pengambilan keputusan.

Referensi rasa (bukan tiruan):
- **Anduril Industries** — disiplin data, presisi, gelap.
- **Linear** — kecepatan, keyboard-first, kepadatan yang nyaman.
- **Flightradar24** — live map sebagai pusat perhatian.
- **Awwwards nominees** — kualitas tipografi, spacing, dan detail mikro, tanpa mengorbankan fungsi.

---

## 2. Token

### 2.1 Warna

| Token | Nilai | Pemakaian |
|---|---|---|
| `--bg` | `#070b10` | Latar aplikasi |
| `--panel` | `#0e151d` | Panel |
| `--panel-2` | `#111a23` | Panel sekunder, input |
| `--panel-3` | `#15202b` | Hover, selected |
| `--line` | `#1c2732` | Border utama |
| `--line-2` | `#273644` | Border hover |
| `--text` | `#e8eef4` | Teks utama |
| `--text-2` | `#b8c6d3` | Teks sekunder |
| `--muted` | `#8496a6` | Metadata |
| `--dim` | `#5d7080` | Label, hint |
| `--amber` | `#ffb020` | Aksi utama, perhatian |
| `--red` | `#ff5a5f` | P1, darurat, destruct |
| `--blue` | `#4d9fff` | Diterima, informasi |
| `--indigo` | `#8b8cff` | OTW |
| `--teal` | `#2dd4bf` | Di TKP |
| `--green` | `#36d399` | Selesai, online |
| `--violet` | `#b18cff` | Laka/kategori |

Aturan:
- Merah **hanya** untuk P1/darurat/destruct. Jangan dipakai untuk dekorasi.
- Amber untuk aksi utama dan perhatian; jangan lebih dari satu tombol primary per layar.
- Status selalu **warna + label + ikon**, bukan warna saja.

### 2.2 Tipografi

| Peran | Font | Ukuran | Berat |
|---|---|---|---|
| Judul halaman | Instrument Sans | 20–24 px | 650 |
| Judul panel | Instrument Sans | 13–16 px | 600 |
| Body | Instrument Sans | 12–14 px | 400 |
| Metadata | Instrument Sans | 9–10 px | 400 |
| ID/waktu/angka | JetBrains Mono | 8–22 px | 400–600 |
| Eyebrow/label | JetBrains Mono | 8–9 px, uppercase, tracking 0.1em | 600 |

Aturan:
- Angka penting (SLA, waktu, count) memakai mono agar sejajar.
- Jangan memakai lebih dari 2 keluarga font.
- Line-height body 1.45–1.6; judul 1.15–1.3.

### 2.3 Spacing & radius

- Skala: 4, 6, 8, 10, 12, 14, 16, 20, 24 px.
- Panel padding: 12–14 px.
- Gap antar-panel: 10–12 px.
- Radius panel: 14 px; komponen: 8–10 px; chip: 5–7 px.
- Border: 1 px. Shadow hanya untuk elemen mengambang (alarm, palette, detail overlay).

### 2.4 Motion

- Durasi 150–220 ms.
- Easing: `cubic-bezier(.2,.8,.2,1)`.
- Hanya untuk: hover, selected, alarm masuk, palette, toast.
- Hormati `prefers-reduced-motion`.
- **Jangan** menggantungkan visibilitas pada animasi opacity. Alarm harus terlihat meskipun animasi gagal.

---

## 3. Layout

| Area | Ukuran |
|---|---|
| Rail | 78 px (desktop), bottom nav 56 px (≤820 px) |
| Topbar | 70 px |
| Board | 372 px queue / map fleksibel / 410 px detail (1600 px) |
| Panel gap | 12 px |
| Main padding | 14 px |

Breakpoint:
- `≥1680`: queue 400, detail 432.
- `1480–1679`: queue 348, detail 390.
- `1320–1479`: queue 340, detail 372.
- `1200–1319`: detail menjadi overlay.
- `≤820`: satu kolom, bottom nav, detail sheet.
- `≤560`: tipografi dan padding mengecil.

---

## 4. Komponen

### 4.1 Tombol

- **Primary**: amber, teks gelap, hanya satu per area aksi.
- **Secondary/ghost**: border, transparan.
- **Danger**: merah, untuk tolak/hapus.
- **Icon-only**: 30×30, untuk telepon, salin, tutup.
- Height 34 px; di detail action 36 px.
- Fokus keyboard: outline 2 px amber, offset 2 px (produksi).

### 4.2 Chip & filter

- Height 27–29 px.
- Aktif: background amber 7–11%, border amber 28%, teks amber.
- Status chip memakai CSS variable `--c` untuk warna.
- Jangan memakai chip untuk aksi destruktif.

### 4.3 Tiket row

- Height ±72 px.
- Bar kiri 2 px: amber untuk selected, merah untuk P1.
- 3 baris: ID/status/waktu → judul → kategori/wilayah + pelapor/media.
- Selected: background gradient amber 7%, border `--line-2`.
- Unread: dot amber berdenyut (3 siklus, lalu berhenti di produksi).
- Hover: background 3%.

### 4.4 Peta

- Basemap gelap; polygon kelurahan garis putus-putus.
- Pin 32×32, rounded 9 px, ikon kategori, border warna status.
- P1: border merah + dot berdenyut.
- Selesai: opacity 50%.
- Selected: scale 1.16 + ring.
- Legend bottom-left; zoom bottom-right; attribution bottom-right.
- Prototipe memakai snapshot lokal; produksi memakai tile berlisensi.

### 4.5 Detail tiket

- Header: ID mono + status + judul + meta.
- Urutan section: prioritas → pelapor → lokasi → deskripsi → media/cluster → riwayat → catatan internal.
- Deskripsi sebelum media agar terbaca tanpa scroll.
- Action footer selalu terlihat; semua aksi tercatat.
- PII masked; reveal butuh role + audit.

### 4.6 Alarm

- Banner fixed top center, lebar maks 760 px.
- Merah gelap, border merah, ikon sirene.
- Tombol "Buka Tiket" + close.
- Tidak boleh bergantung pada opacity animation.
- Suara butuh gesture; sediakan tombol "Aktifkan suara".
- Eskalasi: P1 tidak di-ack 3 menit → Pawas; 10 menit → Kapolsek.

### 4.7 Palette

- `Ctrl/Cmd + K` atau `/`.
- Input besar, hasil tiket + aksi.
- Panah atas/bawah, Enter, Esc.
- Maks 7 tiket + 6 aksi; scroll jika perlu.

### 4.8 Tabel

- Header sticky, uppercase mono 7.5 px.
- Row hover 2%.
- Angka mono.
- PII masked.
- Empty state jelas.

---

## 5. Aksesibilitas

- Kontras teks utama ≥ 4.5:1; metadata ≥ 3:1 untuk teks besar.
- Status tidak hanya warna.
- Fokus keyboard terlihat.
- Target sentuh ≥ 36 px di mobile.
- `prefers-reduced-motion` dihormati.
- Label ARIA pada tombol ikon.
- Jangan mengandalkan hover untuk informasi penting.
- Alarm dapat dibaca screen reader (`role="alert"`).

---

## 6. Performa

- Tidak ada framework CSS runtime.
- Grafik SVG manual; tanpa chart library.
- Peta hanya di layar peta; jangan render ulang seluruh halaman saat SSE masuk.
- Optimistic update + rollback.
- Virtualisasi daftar > 100 tiket.
- Font self-host di produksi; prototipe boleh CDN.
- Target bundle awal < 180 KB gzip.
- Target TTI < 2 detik pada 4G.

---

## 7. Copy tone

| Konteks | Contoh |
|---|---|
| Warga | "Laporan Anda sudah kami terima. Nomor tiket: #..." |
| Piket | "Tiket #014 diterima. Disposisi ke URC." |
| URC | "OTW. ETA 4 menit." |
| Pimpinan | "P90 ack P1 turun 1,4 menit vs pekan lalu." |
| Error | "Koneksi gateway terputus. Coba lagi atau hubungi admin." |

Hindari:
- Janji hasil: "pelaku pasti ditangkap".
- Jargon hukum di bot warga.
- Kata "sistem" berlebihan; fokus pada aksi.

---

## 8. Do / Don't

**Do**
- Gunakan satu aksi primary yang jelas.
- Tampilkan waktu relatif + absolut (mono).
- Tampilkan status koneksi gateway.
- Beri feedback setelah setiap aksi.
- Jaga agar alarm terlihat tanpa animasi.

**Don't**
- Menaruh PII penuh di grup.
- Menggunakan warna merah untuk hal non-darurat.
- Menyembunyikan aksi penting di menu.
- Membuat dashboard penuh grafik yang tidak bisa ditindaklanjuti.
- Mengandalkan mouse saja.
