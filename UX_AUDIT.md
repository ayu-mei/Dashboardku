# Audit UX REFRAKSI

## Temuan dan perubahan

| Area | Temuan | Perilaku baru |
| --- | --- | --- |
| Navigasi | Urutan Dashboard → Data Penjualan → Analisis serta breadcrumb sudah benar | Dipertahankan, termasuk ikon dan active state |
| Dashboard | KPI, grafik, tabel CRUD, tambah transaksi, dan ekspor bercampur | Monitoring read-only: KPI dan grafik; data kosong mengarah ke Data Penjualan |
| Data Penjualan | Mengulang KPI Dashboard | Pusat transaksi dan biaya: impor utama di header, tambah dan ekspor sekunder, pencarian/sort/pagination/CRUD tetap memakai komponen existing |
| Analisis | Mengulang KPI dan grafik Dashboard | Perbandingan periode, pertumbuhan penjualan/gross profit, produk pemimpin, kontribusi Top 8 + lainnya, tabel profitabilitas berpaginasi, top/bottom berdasarkan gross profit |
| Impor | Pemilih file standar kurang jelas; pemetaan dan preview berulang | Tombol Pilih File Excel yang eksplisit, satu sheet pilihan, deteksi otomatis, preview asli, pemetaan yang dapat dikoreksi, validasi dan konfirmasi |
| Data kosong | Banyak kartu/grafik kosong tanpa arah | Empty state Dashboard dan Analisis dengan CTA Kelola Data Penjualan |
| State | Risiko data Dashboard terbaca sebagai data Analisis saat berganti endpoint | Hasil fetch diikat ke endpoint; request lama dibatalkan dan navigasi memuat ulang laporan |

## Sumber dan aturan data

React tetap menggunakan API client/token existing. Endpoint baru `GET /api/analysis` memakai autentikasi existing, pembacaan Supabase existing, dan perhitungan Decimal/report existing. Endpoint dashboard, CRUD, impor dan ekspor tetap kompatibel. Tidak ada migrasi, perubahan credential, environment file, atau konfigurasi hosting.

Analisis memakai transaksi aktual pada filter tahun/bulan/tanggal/produk/kategori/lokasi. Perbandingan bulan/tahun memakai periode kalender sebelumnya. Rentang tanggal khusus memakai rentang sebelumnya dengan durasi sama, setelah memperhitungkan irisan filter. Filter tanpa satu rentang yang jelas tidak diberi pembanding buatan. Persentase pertumbuhan tidak dihitung ketika baseline nol/negatif atau tidak ada transaksi pembanding; selisih nominal tetap tersedia bila dapat dihitung.

Margin produk = total gross profit / total sales, bukan rata-rata margin transaksi. Ranking memakai gross profit; kedua kelompok tidak mengulang produk. Margin dengan sales nol ditampilkan sebagai tidak tersedia. Biaya operasional tidak dialokasikan ke produk. Efektivitas promo tidak ditambahkan karena schema transaksi belum memiliki field promo.

Impor memeriksa maksimum 50 baris awal dan pola isi berikutnya, tanpa mematok posisi header. Multi-sheet wajib dipilih; tidak digabung. Preview menampilkan isi asli hingga 10 baris dengan kolom dan sheet pilihan. Field wajib tetap divalidasi; total SALES_VALUE tidak diperlakukan sebagai harga satuan. Hanya endpoint commit dengan konfirmasi eksplisit yang menulis. Identitas impor deterministik existing tetap mencegah impor ulang identik.

## Verifikasi pada salinan lokal

- Lint/format: `npm run lint` lulus; lint yang tersedia memakai pemeriksaan Prettier.
- Backend: 16 tes lulus, termasuk validasi sesi Supabase dengan respons auth terisolasi, penolakan token tidak valid, CORS, rumus finansial, analisis, variasi workbook, dan alur HTTP lengkap dari data kosong sampai ekspor terfilter.
- `npm run build:preview` lulus. Script `npm run build` diperiksa dengan nilai environment uji yang dibatasi pada proses build; file environment produksi tidak diubah. Build ini tidak membuktikan integrasi layanan produksi.
- Suite browser `npm run test:online` disiapkan menggunakan frontend asli, FastAPI asli, dan penyimpanan fixture terisolasi di `backend/tests/fixture_api.py`. Autentikasi Supabase pada suite browser dimock; tidak menyentuh akun/data produksi. Suite mencakup native file chooser, cancel, invalid file, sheet kosong/salah, preview, konfirmasi, CRUD, search/sort/pagination, ekspor, navigasi, perbandingan/filter, dan overflow 320–1440px.
- Setelah pengguna mengaktifkan Full access, suite browser berhasil dijalankan sampai selesai: impor/preview/konfirmasi dengan FastAPI nyata, pembatalan, file tidak valid, sheet kosong/salah, CRUD, pencarian/sort/pagination, ekspor terfilter, navigasi/empty states, analisis/filter, dan logout lulus. Tidak ada error JavaScript atau failed request tak terduga. Pemeriksaan overflow 320–1440px lulus; screenshot modal dan Analisis pada 390px ditinjau. Pengujian ini memakai fixture terisolasi dan Supabase Auth mock, bukan akun/data produksi.
- Konfigurasi lokal Supabase telah diisi menggunakan URL/publishable key yang diberikan pengguna; file `.env` lokal diabaikan Git. Frontend berjalan di 127.0.0.1:5173 dan backend di 127.0.0.1:8000, health 200 dan akses laporan tanpa token ditolak 401. Login dan transaksi terhadap Supabase nyata belum diuji menggunakan akun pengguna. Metadata `.git`/remote belum tersedia; commit/push/deploy menunggu repository yang benar. Tidak ada site atau service baru dibuat.
