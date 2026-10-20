# Impor data sumber REFRAKSI

Alur: Data Penjualan → Import Excel → pilih sheet yang direkomendasikan → periksa jenis data dan periode → Periksa Data → periksa preview dan pengecualian → setujui → Konfirmasi Import.

## Jenis data

| Jenis | Yang disimpan | Pengaruh pada laporan |
|---|---|---|
| Master produk | SKU/UPC, nama, kategori, referensi biaya per wilayah jika tersedia | Referensi terpisah; tidak menambah omzet atau mengganti biaya transaksi lama |
| Rekap penjualan | SKU/produk, jumlah, total penjualan sumber, periode, lokasi, HPP opsional | Menambah omzet; HPP/laba tersedia hanya jika biaya lengkap |
| Rafaksi supplier | Supplier, periode, jumlah jika tersedia, nilai rafaksi | Terpisah dari omzet/biaya; tidak berarti sudah ditagih atau dicairkan |
| Ringkasan/pivot/program pendukung | Tidak diimpor sebagai transaksi | Referensi rekonsiliasi; pilih sumber detail yang sesuai |
| Transaksi | Jalur pencocokan kolom transaksi existing | Rumus dan validasi transaksi dua desimal tetap berlaku |

Master dan rekap dikelola di **Data sumber impor**. Pilih **Lihat data** untuk memeriksa seluruh baris, atau **Hapus impor** untuk menghapus seluruh sumber beserta semua periodenya. Penghapusan ini tidak mengikuti filter laporan; konfirmasi menyebutkan cakupannya. Tabel transaksi tetap mengelola transaksi individual.

## Workbook yang telah diperiksa

- NEW Form Product Promotion: `2026` atau sheet bulanan memakai pasangan **SALES QTY (ALL STORE)(1 BULAN)** dan **SALES VALUE (ALL STORE)(1 BULAN)**. VALUE PROMO/RAFAKSI tidak dipakai sebagai omzet. STORE pada program tidak dianggap pemisah omzet semua toko. Pengulangan identik SKU/bulan dikecualikan terlihat; nilai berbeda pada identitas sama menahan seluruh impor. Pilih satu sumber utama, bukan tahunan dan bulanan sekaligus.
- PAYDAY: gunakan DETAIL SALES; toko dibaca dari STORE_NAME, bukan kode STORE. Isi rentang periode dalam satu bulan. Periode di sheet pendukung ditampilkan sebagai saran, bukan tanggal transaksi yang dibuat aplikasi. HPP belum tersedia pada sumber ini.
- Double Date: pilih sheet detail event. Tahun dipilih pengguna, hari/bulan dibaca dari label kolom. Rekap menyimpan total penjualan langsung; tidak memaksakan pembagian dua desimal. Pilih basis HPP secara eksplisit atau omzet saja. Data lama yang beririsan harus diperiksa sebelum mengimpor rekap pengganti.
- FLUSH OUT: pembaca menggabungkan konteks header bertingkat. Qty AH:AQ dipasangkan dengan sales AW:BF. Desember memakai tahun awal laporan; Januari–September tahun berikutnya. Valuasi stok AD/AF tidak masuk omzet. HPP dipilih dari referensi COST/COST+PPN jika sesuai kebijakan bisnis.
- QSR: kolom quantity/value bulanan diubah menjadi rekap per bulan. AVG PER DAY dan TOTAL tidak ditambahkan sebagai quantity. Penanda X/N/A tanpa penjualan terukur ditampilkan sebagai periode yang dikecualikan, tidak diubah menjadi angka nol.
- DETAIL RAFRAKSI bulanan: nilai dibaca dari rekap supplier; baris total tidak ditambahkan lagi. Data ini bukan bukti penerimaan dana dan tidak otomatis menambah laba.

File asli tidak diubah. Hasil formula hanya boleh digunakan setelah pengguna menghitung ulang/menyimpan Excel dan menyetujui pemakaian cache. Aplikasi tidak mengeksekusi formula arbitrer atau memperbarui tautan eksternal. Kesalahan pada kolom wajib menahan seluruh sumber; cache error pada referensi biaya master yang opsional ditampilkan sebagai biaya tidak tersedia.

## Angka dan filter

Rekap menyimpan nilai uang sumber sebagai string desimal dalam JSONB. Backend menghitung dengan Decimal; tidak ada perubahan batas dua desimal transaksi existing. Jika ada satu baris tanpa HPP pada cakupan laporan, total HPP, gross/net profit dan margin laporan menjadi belum tersedia. Profitabilitas produk hanya tersedia untuk produk dengan HPP lengkap. Grafis tidak mengubah nilai laba yang tidak tersedia menjadi nol.

Rekap hanya masuk filter tanggal jika seluruh periodenya tercakup. Memilih sebagian hari dalam bulan tidak membagi omzet bulanan menjadi transaksi harian. Rekap rentang harus berada pada satu bulan agar tren bulanan tidak salah. Biaya operasional tetap mengikuti periode dan belum dialokasikan per produk.

Unduh Excel memisahkan Sales, Recaps, Expenses, Master, Rafaksi, dan Summary sesuai data yang tersedia. Transaksi/rekap mengikuti filter laporan; rafaksi mengikuti periode dan master merupakan referensi seluruh produk akun.

## Aktivasi penyimpanan

Kode frontend/backend sudah menyediakan preview dan penyimpanan. Pada database Supabase existing, jalankan hanya migrasi tambahan [`supabase/migrations/202610200001_source_imports.sql`](supabase/migrations/202610200001_source_imports.sql), setelah memastikan migrasi dasar 001–003 telah diterapkan.

Migrasi ini membuat tabel sumber, RLS per akun, pemeriksaan nilai dan irisan, serta trigger untuk mencegah transaksi baru menggandakan rekap. Tidak menghapus atau mengubah transaksi lama. Gunakan backup/prosedur deployment database yang biasa dipakai. Setelah selesai, muat ulang Data Penjualan. Kode mengirim notifikasi pembaruan schema PostgREST di akhir migrasi.

Jika migrasi belum ada, transaksi existing tetap dapat dibaca. UI memberi keterangan bahwa penyimpanan sumber belum aktif. Preview tetap dapat diperiksa, tetapi Konfirmasi Import sumber tidak ditawarkan. Tidak ada fallback penyimpanan ke file lokal atau database lain.

Identitas sumber berasal dari isi normalisasi, bukan nama file, sehingga mengganti nama file tidak melewati pemeriksaan impor ulang. Database juga menolak irisan data antarsumber, antarperiode yang bertumpang tindih, dan antara rekap/transaksi existing. Untuk cakupan agregat yang tidak rinci, pemeriksaan sengaja konservatif: gunakan sumber utama yang jelas, bukan menjumlahkan laporan beririsan.

## Verifikasi

- Backend: `cd backend` lalu `../.venv/bin/python -m pytest -q` (sesuaikan interpreter pada Windows).
- Browser integrasi: `node tests/source-import-browser.mjs`. API dan penyimpanan fixture lokal; tidak memakai akun/data produksi.
- SQL terisolasi: jalankan migrasi 001–003 dan migrasi sumber pada PostgreSQL uji, lalu `supabase/tests/source_imports.sql`, `security_finance.sql`, dan `money_precision.sql`. Test memakai transaksi dan rollback.

Pengujian SQL lokal tidak membuktikan bahwa migrasi atau konfigurasi produksi telah diterapkan. File sumber aktual digunakan hanya untuk klasifikasi dan preview read-only, bukan untuk impor otomatis ke akun pengguna.
