# Wilkum Polsek Teluknaga — polygon desa/kelurahan

| File | Isi |
|---|---|
| `teluknaga.geojson` | **Siap impor.** 22 polygon desa/kelurahan (FeatureCollection) |
| `teluknaga-osm-source.json` | Data mentah dari OpenStreetMap: batas 2 kecamatan, titik 22 desa, batas bandara |

Sumber data: © OpenStreetMap contributors, lisensi ODbL 1.0 (https://www.openstreetmap.org/copyright). Daftar desa mengikuti dokumen *Pemetaan Wilkum Polsek Teluknaga 2026* (13 desa Kec. Teluknaga, 7 desa + 3 kelurahan Kec. Kosambi).

## Seberapa akurat?

| Bagian | Sumber | Akurasi |
|---|---|---|
| **Batas luar wilkum** (gabungan Kec. Teluknaga + Kosambi) | Polygon batas kecamatan OSM (relation 16192948 & 16192949) | Mengikuti OSM, cukup untuk menentukan **di dalam / di luar wilkum** |
| **Batas antar-desa** | **Perkiraan**: OSM hanya punya *titik* desa, jadi tiap kecamatan dibagi Voronoi (setiap lokasi masuk desa dengan titik pusat terdekat) | Kasar; hanya untuk menebak desa/Bhabin |

Hasil uji (`apps/api/src/region-import.test.ts`): 22/22 titik desa jatuh di polygon desanya sendiri; titik di Jakarta, Kota Tangerang, dan laut lepas terklasifikasi "di luar wilkum". Luas menurut OSM: Kec. Teluknaga ±51,6 km², Kec. Kosambi ±38,3 km².

## Yang wajib diperiksa sebelum operasional

1. **Salembaran Jaya (kelurahan, Kosambi) tidak ada di OSM.** Wilayahnya untuk sementara ikut desa tetangga. Perbaikan: isi `"point": [bujur, lintang]` untuk Salembaran Jaya di `teluknaga-osm-source.json` (ambil dari Google Maps), lalu jalankan ulang generator (lihat di bawah).
2. **Bandara Soekarno-Hatta:** ±30% area bandara (versi OSM) berada di dalam polygon Kosambi, yaitu bagian selatan Rawa Rengas dan Rawa Burung. Bila area bandara adalah wilkum polres bandara, bagian itu harus dipotong dari polygon. Konfirmasi ke Polres Metro Tangerang Kota.
3. **Batas antar-desa** harus diganti batas resmi (BIG/Bappeda Kab. Tangerang/Polres) begitu tersedia. Cukup impor ulang file baru dengan nama desa yang sama; polygon diperbarui tanpa mengganggu tiket lama.

## Impor

Laptop / development:

```powershell
pnpm --filter @sigap/api regions:import -- ../../docs/wilkum/teluknaga.geojson --deactivate-demo --dry-run
```

```powershell
pnpm --filter @sigap/api regions:import -- ../../docs/wilkum/teluknaga.geojson --deactivate-demo
```

Server produksi (setelah `deploy/install.sh`):

```bash
sudo bash /opt/sigap/deploy/import-wilkum.sh --dry-run    # lihat rencana
sudo bash /opt/sigap/deploy/import-wilkum.sh              # impor Teluknaga
sudo bash /opt/sigap/deploy/import-wilkum.sh /path/resmi.geojson --deactivate-others
```

Tanpa argumen file, script memakai `docs/wilkum/teluknaga.geojson`. `--deactivate-demo` selalu ikut kecuali `--deactivate-others` dipilih.

Opsi:
- `--deactivate-demo`: nonaktifkan wilayah demo (Bekasi) bawaan seed.
- `--deactivate-others`: nonaktifkan semua wilayah yang tidak ada di file.
- `--dry-run`: tampilkan rencana tanpa mengubah database.

Wilayah tidak pernah dihapus. Akun Bhabin yang masih terikat ke wilayah yang dinonaktifkan akan dilaporkan; pindahkan di **Sistem → Petugas**.

## Membuat ulang polygon

```powershell
node scripts/wilkum/build-wilkum.mjs docs/wilkum/teluknaga-osm-source.json docs/wilkum/teluknaga.geojson
```

Generator ini tidak butuh internet. Setelah edit titik desa di file sumber, cukup jalankan ulang lalu impor ulang.

## Mengganti dengan data resmi

Bila mendapat file SHP/KML batas desa resmi:
1. Konversi ke GeoJSON (mapshaper.org atau QGIS), proyeksi WGS84 (EPSG:4326).
2. Pastikan setiap feature punya `properties.name` sama persis dengan nama di file ini (mis. `Kampung Melayu Timur`).
3. Impor dengan `--deactivate-others` agar polygon perkiraan yang tidak ada di file resmi ikut nonaktif.
