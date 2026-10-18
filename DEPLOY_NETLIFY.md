# Menjalankan dan mempublikasikan Dashboard Refraksi

## Status dan arsitektur

Frontend aktif ada di `frontend/`: React + Vite + Tailwind CSS + Recharts + Lucide React. Backend aktif ada di `backend/`: FastAPI + pandas + openpyxl. Keduanya terpisah, berkomunikasi lewat REST API dengan token Supabase Auth. Data permanen tersimpan dalam PostgreSQL Supabase. Upload dan ekspor diproses di memori, tidak disimpan pada filesystem server.

Project lokal telah tertaut ke site Netlify **dashboardku-yume** (ID `4f7ffec9-b267-48aa-9031-d9970d9d6778`). Login Netlify telah diverifikasi. Pada pemeriksaan, environment Supabase belum tersedia. Preview frontend tidak berarti database dan backend sudah online. Situs produksi sebelumnya merupakan dashboard promosi; preview terpisah tidak menggantikannya.

Draft preview akun ini dilindungi login Netlify: akses tanpa sesi Netlify mendapat HTTP 401 / Login Redirect. Masuk ke Netlify dengan akun pemilik site sebelum membuka draft. Proteksi ini berbeda dari login bisnis Supabase. Pengaturan proteksi akun/site tidak diubah oleh project ini.

## 1. Buat database Supabase

1. Masuk ke Supabase dan buat project khusus Refraksi. Simpan password database secara pribadi.
2. Buka SQL Editor. Jalankan `supabase/migrations/202610180001_refraksi.sql` **sekali** pada project baru. Jangan menjalankan ulang skrip dengan menghapus tabel yang berisi data.
3. Jalankan `supabase/migrations/202610180002_dimensions.sql` untuk kolom kategori/lokasi opsional.
4. Jalankan `supabase/tests/security_finance.sql` untuk menguji rumus dan isolasi akun. Skrip memakai transaksi dengan rollback; bila terjadi error, jalankan `ROLLBACK;` sebelum memperbaiki masalah. Pengujian ini wajib dilakukan pada database yang benar sebelum produksi; unit test lokal tidak membuktikan RLS di akun Anda.
5. Pada Authentication, nonaktifkan **Allow new users to sign up** dan anonymous sign-ins. Buat akun email/password melalui menu Users → Add user; konfirmasi email akun sesuai kebijakan administrator. Tidak ada pendaftaran publik di aplikasi.
6. Salin **Project URL** dan **publishable key**. Legacy `anon` key juga didukung frontend. Jangan memakai `service_role`, secret key, atau password database pada frontend.
7. Set Site URL dan redirect URL ke domain Netlify produksi. Login saat ini memakai email/password langsung; reset password dilakukan administrator. Token hanya berada di memori browser: refresh halaman mengharuskan login ulang.

RLS membatasi setiap akun ke baris miliknya. Akun berbeda tidak berbagi transaksi. Gunakan desain organisasi/role terpisah bila Anda membutuhkan banyak staf dengan data perusahaan bersama; jangan menonaktifkan RLS untuk membuat data bersama.

## 2. Jalankan lokal dari VS Code

Pasang Python 3.11+ dan Node.js 22.12+ / 24 LTS. Terminal PowerShell memakai `npm.cmd` agar tidak perlu mengubah execution policy.

Setelah menginstal Python/Node, tutup dan buka kembali VS Code agar PATH baru dikenali. Environment Python lokal `backend/.venv` sudah dibuat pada sesi pengerjaan ini; jika masih tersedia, Anda dapat langsung memakai interpreter di dalamnya tanpa membuat ulang venv.

Dari folder utama:

```powershell
npm.cmd install
Copy-Item frontend/.env.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
```

Edit `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://PROJECT_ANDA.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_KUNCI_PUBLIK_ANDA
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Edit `backend/.env` dengan URL/key yang sama. `ALLOWED_ORIGINS` mencakup `http://127.0.0.1:5173` dan `http://localhost:5173`. Semua `.env` lokal diabaikan Git.

Terminal pertama:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Jika launcher `py` tidak tersedia, gunakan interpreter Python terpasang untuk langkah venv. Aktivasi environment tidak diperlukan.

Terminal kedua, dari folder utama:

```powershell
npm.cmd run dev
```

Buka http://127.0.0.1:5173. Dokumentasi API lokal ada di http://127.0.0.1:8000/docs, health check di `/health`. Health check membuktikan server berjalan; bukan bukti koneksi database berhasil. Tekan Ctrl+C di masing-masing terminal untuk berhenti.

## 3. Deploy backend FastAPI

Netlify hanya menghosting frontend. Backend memerlukan layanan Python/Docker, misalnya Render. File `backend/Dockerfile` dan `render.yaml` disediakan; tidak ada akun backend yang dibuat otomatis.

1. Simpan perubahan project ke repository GitHub Anda. Periksa daftar file sebelum push: jangan commit `.env`, Excel bisnis, profil Excel lokal, atau token.
2. Di layanan hosting backend, buat Web Service dari repository tersebut, root directory `backend`, runtime Docker, gunakan `Dockerfile` yang tersedia. Tinjau paket/biaya layanan sebelum mengaktifkannya.
3. Isi environment backend: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, dan `ALLOWED_ORIGINS=https://dashboardku-yume.netlify.app`. Tambahkan URL preview tertentu bila perlu; jangan memakai wildcard origins.
4. Deploy dan periksa URL HTTPS backend, misalnya `https://refraksi-api-ANDA.onrender.com/health`.
5. Jangan mengatur disk lokal sebagai database. Semua CRUD memakai Supabase REST dengan JWT pengguna, sehingga RLS tetap berlaku. Tidak ada service-role key di aplikasi ini.

Pembatasan upload aplikasi: 15 MB file, 100 MB ukuran ZIP setelah ekstraksi, dan 20.000 baris per impor. Tambahkan rate limit pada gateway/hosting untuk trafik publik dan atur perlindungan/rate limits Supabase Auth. Untuk data besar, pindahkan agregasi/filter ke query SQL yang terindeks dan proses impor ke background job; versi ini memuat data pemilik dengan pagination API agar tidak terpotong batas 1.000 baris.

## 4. Atur Netlify

Di Project configuration → Environment variables, tambahkan untuk scope **Builds**, context production (dan preview jika dipakai):

| Nama | Nilai |
|---|---|
| `VITE_SUPABASE_URL` | Project URL Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key; bukan secret/service-role |
| `VITE_API_BASE_URL` | URL HTTPS backend FastAPI, tanpa akhiran `/api` |

Pengaturan build dalam `netlify.toml`:

- Base directory: root repository (kosong).
- Build command: `npm run build`.
- Publish directory: `frontend/dist`.
- Node: 24.

Variabel `VITE_` masuk bundle browser dan dapat dilihat pengunjung. Hanya URL/public key yang boleh diisi. Build produksi gagal bila konfigurasi wajib belum ada, URL backend bukan HTTPS, atau key berjenis secret/service-role. Sebelum build untuk deployment, ganti URL backend lokal pada `.env.local` dengan URL HTTPS backend online. Setelah mengubah environment variables, lakukan build/deploy ulang.

`frontend/public/_redirects` mendukung refresh URL SPA. `_headers` dan `netlify.toml` memberi CSP, anti-framing, nosniff, referrer policy, serta no-store. CSP mengizinkan Supabase, Render, dan Railway; bila backend memakai domain lain, tambahkan domain HTTPS tepatnya di **kedua** konfigurasi CSP sebelum build ulang.

CORS dikonfigurasi pada FastAPI dengan daftar origin eksplisit. Supabase Auth/Data API melayani akses REST browser sesuai layanan managed-nya. CORS bukan autentikasi: FastAPI memverifikasi bearer token melalui Supabase Auth pada setiap permintaan, lalu database menjalankan RLS untuk pengguna yang sama. Tidak ada cookie sesi lintas domain. Origin preview juga harus ditambahkan pada backend bila ingin menjalankan API dari preview.

## 5. Deploy dari terminal VS Code

Metode repository: hubungkan repository GitHub pada Netlify melalui Import existing project. Pada site lama, gunakan pengaturan repository site yang sama; jangan menautkan repository yang keliru. Periksa build/publish di atas, lalu Deploy. Project lokal sudah punya `.netlify/state.json`, tetapi itu tidak otomatis berarti continuous deployment GitHub aktif.

Metode CLI (setelah environment lokal dan online terisi):

```powershell
npx.cmd netlify-cli login
npx.cmd netlify-cli link --id 4f7ffec9-b267-48aa-9031-d9970d9d6778
npm.cmd run build
npx.cmd netlify-cli deploy --dir=frontend/dist
```

Periksa URL draft terlebih dahulu. Tambahkan origin draft tersebut ke `ALLOWED_ORIGINS` backend, redeploy backend, lalu uji login/API. Jika hasil sudah benar, publikasi produksi:

```powershell
npx.cmd netlify-cli deploy --dir=frontend/dist --prod
```

Perintah produksi menggantikan tampilan dashboard promosi lama pada domain utama, tetapi tidak menghapus workbook lokal. Jangan mempublikasikan preview tanpa konfigurasi backend sebagai aplikasi produksi yang sudah berfungsi.

Untuk inspeksi/publikasi draft via API dengan login CLI Windows yang sudah ada, tersedia `node scripts/netlify-status.mjs` dan `node scripts/netlify-draft.mjs`. Skrip draft hanya mengunggah isi `frontend/dist`, selalu `draft:true`, dan menyimpan hasil di `.netlify/refraksi-draft.json`. Token tidak dicetak atau disimpan dalam project. `npm run build:preview` hanya untuk melihat tampilan/preview saat konfigurasi belum ada; login dinonaktifkan dan ini bukan aplikasi produksi yang sudah terhubung.

## 6. Uji setelah deployment

1. Pengunjung tanpa login tidak bisa membaca/mengubah data. Panggilan API tanpa token harus mendapat 401.
2. Masuk dengan akun A, tambahkan transaksi jumlah 2, harga 500000, HPP 300000, biaya 100000. Hasil: penjualan 1000000, HPP 600000, gross 400000, gross margin 40%, net 300000, net margin 30%.
3. Reload dan login ulang: data tetap ada. Akun B tidak dapat membaca/mengedit/menghapus data A.
4. Uji tahun, bulan, tanggal, dan produk. Kartu, grafik, tabel, serta Excel memakai filter laporan yang sama. Reset mengembalikan tahun berjalan dan mengosongkan filter lain. Search tabel hanya mencari dalam tabel, tidak mengubah laporan.
5. Uji edit, konfirmasi hapus, search, sorting numerik, pagination, dan upload salah format. Uji file valid melalui preview sebelum commit. Jangan impor ulang data dengan workbook berbeda yang berisi transaksi sama; deteksi duplikat hanya untuk file dan mapping identik pada akun yang sama.
6. Unduh Excel: sheet Sales, Expenses, Summary sesuai filter. Angka uang diekspor sebagai teks desimal untuk menjaga ketelitian; tidak ada formula yang dijalankan dari input pengguna.
7. Periksa desktop, tablet, dan ponsel 320px. Sidebar memakai drawer di mobile, kartu tersusun ulang, grafik mengikuti container, tabel digeser secara horizontal.

Uji backend lokal dari folder `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

Uji browser frontend menggunakan API mock, tidak memasukkan data ke Supabase:

```powershell
node tests/frontend-browser.mjs
```

## Rumus dan data Excel yang ada

Rumus tidak diubah: sales = quantity × price; HPP = quantity × unit_cost; gross = sales − HPP; net = gross − biaya operasional; margin = total profit ÷ total sales × 100. Semua perhitungan backend memakai Decimal, uang maksimum dua desimal, tanpa pembulatan/import diam-diam. Penjualan nol menghasilkan margin null yang tampil `-`.

**Biaya operasional mengikuti periode, belum dialokasikan ke produk/kategori/lokasi.** Ketika produk dipilih, gross profit berubah mengikuti produk, sedangkan operational cost tetap seluruh biaya periode; net adalah selisih keduanya, bukan klaim laba bersih mandiri produk. Keterangan ini tampil di dashboard. HPP tidak dimasukkan ulang sebagai biaya operasional.

File yang diperiksa adalah laporan promosi/agregat, bukan seluruhnya transaksi lengkap. Lihat `EXCEL_REVIEW.md`. Tidak ada workbook yang diubah atau dimigrasikan otomatis. Upload hanya menerima kolom yang benar-benar ada dan dipilih pengguna, membutuhkan tanggal transaksi, produk, quantity, harga aktual per unit, dan HPP satuan. Data yang belum memuat field ini ditolak dengan penjelasan, bukan dilengkapi dengan angka/tanggal buatan. Kategori/lokasi bersifat opsional dan filternya hanya muncul saat ada data.

Sumber resmi: [Netlify deploy API](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/), [Supabase REST](https://supabase.com/docs/guides/api), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [keamanan key](https://supabase.com/docs/guides/database/secure-data), [pengaturan signup](https://supabase.com/docs/guides/auth/general-configuration), [Tailwind + Vite](https://tailwindcss.com/docs/installation/using-vite), [FastAPI UploadFile](https://fastapi.tiangolo.com/tutorial/request-files/).
