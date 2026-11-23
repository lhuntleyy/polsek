# 18 — Panduan Admin Unit

## 1. Login & keamanan
- Login `admin` + password; aktifkan TOTP di **Sistem → Autentikasi dua faktor**.
- Jangan bagikan password; buat akun terpisah untuk tiap petugas.
- Aktifkan Web Push untuk perangkat pribadi jika diizinkan.

## 2. Identitas & SLA
**Sistem → Unit Polsek / SLA & Eskalasi**
- Nama, kode, alamat, zona waktu.
- Nomor WA dan pemilik.
- ID grup URC (angka; otomatis menjadi `@g.us`).
- DPO dan retensi.
- Target P1 ack/OTW, eskalasi Pawas/Kapolsek.

## 2a. WhatsApp Gateway
**Sistem → WhatsApp Gateway**
- Pastikan service `sigap-bot` berjalan.
- Klik **Hubungkan WhatsApp**, scan QR dari HP nomor Polsek.
- Status: BOT ONLINE/OFFLINE, MENUNGGU SCAN, TERHUBUNG.
- **Putuskan sementara**: sesi disimpan, bisa connect tanpa scan.
- **Logout / ganti nomor**: hapus sesi, lalu pairing nomor baru.
- QR hanya terlihat oleh admin dan berlaku ±90 detik.
- Jangan pernah mengirim QR ke grup/publik.

## 3. Wilayah
- Tambah nama + GeoJSON Polygon/MultiPolygon.
- Validasi otomatis; polygon demo ditandai `DEMO`.
- Produksi wajib memakai batas resmi.
- Nonaktifkan polygon lama jika diganti (via DB/endpoint PATCH).

## 4. Petugas
- Tambah username, nama, role, password awal, nomor WA, wilayah.
- Ganti nomor WA bila nomor petugas berubah; sistem otomatis membuat JID.
- Nonaktifkan akun yang mutasi/keluar (PATCH `active=false`).
- Role: `piket`, `urc`, `bhabin`, `pawas`, `kapolsek`, `admin`.

## 5. Grup WhatsApp
- Tambah nama + ID grup (angka; otomatis `@g.us`) + fungsi.
- Kirim `/id` di grup untuk melihat ID grup jika belum tahu.
- Aktif/nonaktifkan.
- Pastikan bot menjadi anggota grup.
- ID grup berupa angka, bukan link invite.

## 6. Pelapor
**Data → Pelapor**
- Nomor dimasker.
- Blokir hanya dengan alasan jelas (spam/palsu).
- Blokir mencegah tiket baru; `STATUS`/`BANTU` tetap.
- Buka blokir jika klarifikasi selesai.

## 7. Export & digest
**Analitik**
- Pilih bulan → CSV/Excel/PDF.
- Semua unduhan tercatat di audit.
- Tombol Digest mengirim ringkasan ke Kapolsek + grup URC.

## 8. Backup
```bash
sudo /opt/sigap/infra/scripts/backup-db.sh
sudo /opt/sigap/infra/scripts/restore-drill.sh <file>
```
Pastikan DB **dan** media dibackup.

## 9. Audit
**Data → Audit Log**
- Cari aksi/aktor/IP.
- Tidak bisa dihapus dari aplikasi.
- Review minimal bulanan.
