# Dashboard Penjualan Refraksi

Dashboard bisnis responsif: React/Vite + Tailwind CSS + Recharts + Lucide, REST API FastAPI, Supabase Auth dan PostgreSQL permanen, pengolahan Excel memakai pandas/openpyxl. Frontend dideploy ke Netlify; backend di server Python terpisah.

Menu **Data Bisnis** menampilkan transaksi dan rekap hasil impor pada tabel **Penjualan**. Detail sumber dibuka melalui **Lihat sumber** pada baris rekap. Rekap mempertahankan periode asli; pilihan hapus massal hanya mencakup transaksi biasa. Tab Biaya dan Riwayat Impor tidak ditampilkan.

Menu **Smart Dashboard** menyediakan ringkasan AI, tanya data, rekomendasi, laporan, peringatan kualitas data, dan estimasi penjualan. Usulan filter otomatis dan simulasi tidak tersedia. Bantuan AI juga tersedia di pemeriksaan Excel. Lihat [panduan Smart Dashboard dan konfigurasi Cloudflare Workers AI](SMART_DASHBOARD.md).

**Mulai dari [panduan menjalankan dan deploy](DEPLOY_NETLIFY.md).** Lihat [hasil pemeriksaan Excel](EXCEL_REVIEW.md) sebelum mengimpor data. Login dan transaksi online memerlukan konfigurasi Supabase dan server backend; status layanan harus diperiksa pada deployment yang digunakan.

```text
frontend/
  src/
    components/   kartu, grafik, filter, tabel, upload, formulir
    pages/        halaman login dan dashboard
    layouts/      sidebar, navbar, navigasi responsif
    hooks/        state, filter, loading, permintaan data
    services/     autentikasi dan REST API
    utils/        format Rupiah/persen dan query filter
    assets/       Tailwind CSS
    App.jsx       komposisi halaman dan sesi
    main.jsx      entry React
  public/         redirect dan security headers Netlify
  scripts/        validasi konfigurasi build
  package.json
  vite.config.js
backend/
  app/
    routes/       endpoint dashboard, CRUD, upload, ekspor
    services/     database, perhitungan, pengolahan Excel
    models/       validasi input Pydantic
    utils/        konfigurasi environment
    main.py       komposisi FastAPI dan CORS
  data/           dokumentasi; bukan database produksi
  tests/          rumus, filter, Excel, autentikasi, CORS
  requirements.txt
  Dockerfile
supabase/
  migrations/     schema PostgreSQL dan RLS
  tests/          uji finansial dan isolasi akun
tests/            uji frontend browser dengan API mock
netlify.toml      konfigurasi hosting frontend
render.yaml       blueprint deployment backend Docker
```

Setelah environment diisi sesuai panduan, jalankan frontend dari folder utama dengan `npm.cmd run dev`. Backend dijalankan dari folder `backend` dengan `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload` setelah membuat environment dan menginstal requirements.

Navigasi memakai tiga tanggung jawab berbeda: **Dashboard** untuk monitoring read-only; **Data Bisnis** untuk impor, CRUD, biaya, dan ekspor; **Analisis** untuk perbandingan periode, kontribusi, profitabilitas, dan ranking. Perhitungan analitis tersedia melalui `GET /api/analysis` dengan filter yang sama dan autentikasi existing. Lihat [hasil audit UX](UX_AUDIT.md).

Rumus transaksi: penjualan = jumlah × harga jual satuan; HPP = jumlah × HPP satuan; laba kotor = penjualan − HPP. Rekap menggunakan total sumber. Margin memakai total, bukan rata-rata margin transaksi. Saat penjualan nol, margin `-`; HPP yang belum lengkap membuat total HPP, laba, dan margin belum tersedia. API biaya dan perhitungan laba bersih dipertahankan untuk kompatibilitas serta data lama; UI aktif dan ekspor berfokus pada laba kotor.

Workbook asli tidak diubah dan tidak dimigrasikan diam-diam. Import Excel dibuka melalui tombol di header Data Bisnis. Sistem meminta pilihan sheet untuk workbook dengan banyak sheet, mendeteksi struktur tabel otomatis, lalu menampilkan kolom dan preview sebelum konfirmasi simpan. Kolom transaksi yang dikenali dipilih otomatis dan dapat dikoreksi; laporan agregat tanpa field transaksi wajib ditolak dengan pesan jelas. File identik dan mapping identik ditolak saat impor ulang pada akun yang sama. Ekspor mengikuti filter laporan.

Impor sumber membedakan master produk, rekap penjualan, rafaksi supplier, serta ringkasan/pivot. Double Date menyimpan hari/bulan event dan tahun pilihan pengguna; FLUSH OUT/QSR dibaca sebagai rekap bulanan. Total penjualan dipertahankan langsung tanpa membulatkan harga satuan. HPP opsional memakai basis yang dipilih eksplisit. Master dan rafaksi tidak menambah omzet. Data berulang atau beririsan diperiksa sebelum penyimpanan. Dukungan ini memerlukan migrasi tambahan; baca [panduan impor sumber](IMPORT_SUMBER.md).

Jalur impor transaksi generik dan endpoint Double Date lama tetap tersedia dengan validasi dua desimal. Temuan dan batas versi lama serta pemeriksaan sumber dicatat di [pemeriksaan Excel](EXCEL_REVIEW.md).

Sumber project promosi sebelumnya di `src/`, workbook root, serta versi Flask lokal (`app.py`, `templates/`, `static/`) dipertahankan sebagai sumber lama dan **tidak digunakan oleh build Netlify aktif**. Panduan promosi asli disimpan di `LEGACY_PROMOTION_README.md`; panduan Flask lama ada di `PANDUAN_REFRAKSI.md`. Jangan menjalankan Flask untuk frontend React.

### Sesi login

Frontend memakai SDK resmi Supabase untuk menyimpan sesi browser, memulihkan login saat refresh/tab baru, dan memperbarui token. Logout menghapus sesi browser dan mencoba mencabut sesi perangkat ini di Supabase; tab lain pada browser yang sama ikut keluar. Kegagalan jaringan tidak dianggap sebagai logout; respons API 401 mengakhiri sesi.

Batas tidak aktif di antarmuka adalah 30 menit, dengan peringatan pada menit ke-28 dan tombol **Tetap masuk**. Aktivitas klik, ketik, scroll, atau sentuh dibagikan antar tab melalui penyimpanan browser. Waktu tetap diperiksa setelah tab kembali aktif atau browser dibuka ulang. Batas ini merupakan aturan antarmuka; pengaturan batas sesi/inaktivitas yang wajib ditegakkan server harus dikonfigurasi terpisah pada layanan autentikasi. Formulir yang belum disimpan belum dipulihkan setelah logout.

Uji sesi dan login dengan akun mock: `node tests/login-browser.mjs`.

### Hapus banyak data

Pada Data Bisnis, centang baris atau gunakan **Pilih semua hasil filter**, lalu **Hapus terpilih**. Pilihan mencakup semua halaman tabel sesuai filter laporan dan pencarian tabel, dengan transaksi dan biaya dipisahkan. Perubahan filter/pencarian membatalkan pilihan. Konfirmasi menampilkan jumlah dan jenis data; penghapusan tidak dapat dibatalkan. Untuk menghapus seluruh data suatu jenis, kosongkan filter laporan dan pencarian terlebih dahulu.

Backend menerima ID eksplisit melalui `POST /api/sales/bulk-delete` atau `POST /api/expenses/bulk-delete`, memakai token pengguna dan RLS yang sama. Penghapusan diproses per 100 ID untuk membatasi panjang URL database. Jika proses terhenti, respons melaporkan jumlah yang sudah dihapus dan tabel dimuat ulang; keseluruhan operasi tidak bersifat atomik antar kelompok. Uji browser memakai data mock: `node tests/bulk-delete-browser.mjs`.

### Impor master, rekap, dan rafaksi

Alur impor kini mengenali jenis sheet dan merekomendasikan sumber, termasuk header bertingkat pada FLUSH OUT dan blok bulanan QSR. Master produk dan rafaksi disimpan terpisah dari omzet; rekap mempertahankan total sumber dan periode. HPP boleh belum tersedia, dengan laba ditampilkan belum lengkap. Lihat [panduan impor sumber dan aktivasi penyimpanan](IMPORT_SUMBER.md).

Penyimpanan baru memerlukan migrasi tambahan `supabase/migrations/202610200001_source_imports.sql`. Sebelum migrasi, preview sumber tersedia dan transaksi lama tetap berfungsi, tetapi sumber baru belum dapat disimpan. Tidak ada migrasi produksi yang dijalankan otomatis oleh aplikasi.

### Pengembangan dan kode legacy

Perintah `npm run dev`, `npm run build`, dan `npm run preview` selalu memakai aplikasi aktif di `frontend/`. Kode promosi root (`src/`, `index.html`, `vite.config.js`) dipertahankan sebagai legacy dan hanya dijalankan melalui `npm run legacy:promotion:dev`, `npm run legacy:promotion:build`, serta `npm run legacy:promotion:import`. Impor legacy hanya memperbarui JSON dashboard promosi; tidak menyimpan transaksi Supabase. Lihat `LEGACY_PROMOTION_README.md`.

Flask root (`app.py`, `templates/`, `static/`, `requirements.txt`, `tests/test_dashboard.py`) adalah aplikasi lokal lama. Requirements aktif berada di `backend/requirements.txt`. Kedua jalur tidak boleh dicampur saat menjalankan tes atau deployment.

Validasi aktif: `npm run lint`, `npm run test:backend`, dan `npm run test:browser`. Backend menggunakan `.venv` di root. Audit JavaScript: `npm run audit:dependencies`; audit Python harus mencakup versi yang terpasang beserta dependency transitif, bukan hanya nama dalam requirements. Build produksi memerlukan tiga variabel `VITE_*` pada `frontend/.env` atau environment hosting. `npm run build:preview` memeriksa kompilasi tanpa validasi konfigurasi produksi.
