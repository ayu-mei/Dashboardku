# Validation

- Pemeriksaan metadata/header seluruh 6 workbook valid dan 1 file tidak valid; file sumber tidak ditulis. Temuan: `EXCEL_REVIEW.md`.
- Build preview frontend React + Vite + Tailwind berhasil. Build produksi sengaja ditolak saat environment belum lengkap. Hasil frontend hanya HTML/CSS/JavaScript dan konfigurasi Netlify; Excel asli tidak masuk publish directory.
- Pengujian browser dengan Playwright + Chrome berhasil: login, KPI dan filter bulan/produk/kategori/lokasi, search, numeric sorting, pagination, CRUD, preview/konfirmasi upload, XLSX download, navigasi aktif, logout. Uji overflow pada viewport 320, 390, 768, 1024, dan 1440 px. Screenshot lokal di `test-artifacts/` memakai fixture test, bukan laporan bisnis atau data produksi.
- 7 pengujian backend FastAPI lulus: rumus, weighted margin, filter tanggal/bulan/produk/kategori/lokasi, decimal, penjualan nol, pemetaan nama kolom asli, file invalid/formula/subtotal, ekspor aman, autentikasi, serta CORS. Ada peringatan deprecation dari Starlette TestClient/httpx; tidak memengaruhi hasil test.
- Akun dan site Netlify berhasil diverifikasi menggunakan login CLI lokal. Konfigurasi Supabase belum ada saat diperiksa. Preview frontend tidak membuktikan API/database online sudah tersambung.
- Draft terbaru berstatus `ready`, tetapi akses anonim mendapat HTTP 401 / Netlify Login Redirect karena proteksi preview akun. Buka preview setelah login akun Netlify pemilik. Pengaturan proteksi tidak diturunkan; verifikasi HTTP aset publik tertahan oleh proteksi ini. Situs produksi lama tidak diganti.
- SQL migration dan SQL test RLS disiapkan; **belum dieksekusi ke Supabase** karena akun/project belum dikonfigurasi. Backend hosting, login nyata, persistensi lintas restart, dan isolasi akun di database produksi masih harus diuji setelah provisioning sesuai `DEPLOY_NETLIFY.md`.

Jalankan ulang: `npm.cmd run test:online` dari root untuk browser; `.\.venv\Scripts\python.exe -m pytest tests -q` dari `backend` untuk backend. Test tidak mengubah workbook asli atau data produksi.
