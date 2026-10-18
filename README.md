# Dashboard Penjualan Refraksi

Dashboard bisnis responsif: React/Vite + Tailwind CSS + Recharts + Lucide, REST API FastAPI, Supabase Auth dan PostgreSQL permanen, pengolahan Excel memakai pandas/openpyxl. Frontend dideploy ke Netlify; backend di server Python terpisah.

**Mulai dari [panduan menjalankan dan deploy](DEPLOY_NETLIFY.md).** Lihat [hasil pemeriksaan Excel](EXCEL_REVIEW.md) sebelum mengimpor data. Netlify sudah tertaut, tetapi Supabase dan server backend perlu dikonfigurasi sebelum login dan transaksi online aktif.

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

Rumus tetap: penjualan = jumlah × harga jual satuan; HPP = jumlah × HPP satuan; gross profit = penjualan − HPP; actual net profit = gross profit − biaya operasional. Margin memakai total, bukan rata-rata margin transaksi. Saat penjualan nol, margin `-`. Biaya operasional belum dialokasikan per produk; keterangan cakupan biaya ditampilkan saat memfilter.

Workbook asli tidak diubah dan tidak dimigrasikan diam-diam. Upload membutuhkan pemetaan kolom nyata dan pratinjau sebelum simpan; laporan agregat tanpa field transaksi wajib ditolak dengan pesan jelas. File identik dan mapping identik ditolak saat impor ulang pada akun yang sama. Ekspor mengikuti filter laporan.

Sumber project promosi sebelumnya di `src/`, workbook root, serta versi Flask lokal (`app.py`, `templates/`, `static/`) dipertahankan sebagai sumber lama dan **tidak digunakan oleh build Netlify aktif**. Panduan promosi asli disimpan di `LEGACY_PROMOTION_README.md`; panduan Flask lama ada di `PANDUAN_REFRAKSI.md`. Jangan menjalankan Flask untuk frontend React.
