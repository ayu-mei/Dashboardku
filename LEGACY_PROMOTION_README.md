# M MART Promotion Dashboard

Dashboard React untuk program flush out Bali, 1–31 Oktober 2026.

## Menjalankan

```sh
npm install
npm run legacy:promotion:import
npm run legacy:promotion:dev
```

Build produksi: `npm run legacy:promotion:build`. Pratinjau: `npx vite preview --outDir legacy-dist`.

## Struktur

- `src/app`: halaman dan komposisi aplikasi.
- `src/components`: komponen UI bersama.
- `src/features/promotion/components`: tabel produk.
- `src/features/promotion/hooks`: pencarian dan filter.
- `src/data`: data asli hasil ekstraksi Excel.
- `src/utils`: format angka dan mata uang.
- `src/styles`: tema dan tata letak responsif.
- `scripts`: proses impor workbook.

## Definisi data

Sheet FORMAT adalah sumber utama, header baris 4, produk mulai baris 6. Baris tanpa SKU numerik dan deskripsi diabaikan. Duplikasi baris tetap dipertahankan agar mengikuti workbook; KPI produk adalah jumlah baris promosi, bukan jumlah SKU unik.

Harga reguler H; harga promo L; GP promo M mengikuti nilai tersimpan Excel, tidak dihitung ulang. Stok AQ/AR/AS tidak memiliki tanggal eksplisit; AK/AL/AM adalah snapshot 25 September 2026. Nilai persediaan menggunakan AU, bukan penjualan aktual. BA/BB adalah penjualan historis 1–25 Agustus 2026. Nilai kosong dan error tidak dijumlahkan. SUMMARY mengacu November 2025 sehingga tidak dipakai sebagai KPI Oktober. Master product tidak digabung karena FORMAT sudah berisi supplier dan assortment promosi.

Impor membaca hasil formula yang tersimpan, bukan menghitung ulang formula atau memperbarui tautan eksternal. Setelah memperbarui workbook dan menyimpannya di Excel, jalankan kembali `npm run legacy:promotion:import`. File JSON dikirim ke browser; gunakan hosting internal jika datanya bersifat internal.
