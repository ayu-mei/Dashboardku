# Smart Dashboard Refraksi

Buka menu **Smart Dashboard** setelah login. Filter periode, produk, kategori, dan lokasi di bagian atas menjadi cakupan pertanyaan, laporan, peringatan.

Tampilan memakai empat angka utama: penjualan, HPP, laba kotor, dan margin kotor dan grafik dan panel **Tanya AI**. Dashboard menempatkan grafik dan panel Tanya AI berdampingan di desktop; panel AI tetap terlihat saat halaman digulir. Di ponsel, tombol **Tanya AI** membuka panel percakapan yang dapat ditutup tanpa kehilangan posisi grafik. Tombol Ringkasan, Rekomendasi dan Laporan menampilkan status proses serta hasil langsung di panel AI. Filter tanggal, produk, kategori dan lokasi tersedia di **Filter lainnya**; filter aktif tetap terlihat dan bisa dihapus satu per satu. HPP dan margin kotor tampil pada ringkasan; penjelasan perhitungan dapat dibuka sesuai kebutuhan. Peringatan HPP yang belum lengkap tetap ditampilkan.

## Kemampuan

- Ringkasan bisnis, rekomendasi tindakan, dan laporan teks yang dapat diunduh melalui Qwen3-30B-A3B FP8 di Cloudflare Workers AI.
- Tanya data memakai angka backend, perbandingan periode, kontribusi dan perubahan produk, ringkasan lokasi, serta klaim supplier. Jawaban harus membedakan bukti dan dugaan. Detail persediaan dan seluruh baris master belum menjadi konteks AI.
- Permintaan menampilkan periode lain menghasilkan **usulan filter**, lalu pengguna menekan **Terapkan filter usulan**. Data periode lain baru dibaca sesudah filter diterapkan. AI tidak dapat membuat, mengedit, atau menghapus transaksi.
- Peringatan berdasarkan aturan: HPP belum lengkap, laba negatif, penurunan penjualan minimal 20%, konsentrasi produk minimal 50%, dan transaksi yang tampak sama. Kemiripan transaksi bukan kepastian duplikasi.
- Estimasi penjualan satu bulan menggunakan rata-rata bergerak 3 bulan. Memerlukan 6 bulan berurutan yang memiliki data sampai bulan kalender terakhir yang sudah berakhir. Tidak mengisi bulan kosong dengan nol; tidak memakai bulan berjalan. Menampilkan MAE dari 3 prediksi historis. Ini baseline statistik, bukan prediksi musiman atau jaminan hasil. Pengguna perlu memastikan laporan bulanannya lengkap. Riwayat mengikuti produk/kategori/lokasi, terlepas dari filter waktu.
- Tombol **Jelaskan & sarankan kolom** di pemeriksaan Excel mengirim metadata header dan pesan pemeriksaan untuk mendapat penjelasan/saran. Saran berupa teks; tidak menerapkan pencocokan otomatis atau melewati validasi dan persetujuan impor.

## Koneksi Cloudflare

Simpan hanya di `backend/.env` (diabaikan Git):

```dotenv
CLOUDFLARE_ACCOUNT_ID=ACCOUNT_ID_32_KARAKTER
CLOUDFLARE_API_TOKEN=TOKEN_WORKERS_AI
```

Model tetap `@cf/qwen/qwen3-30b-a3b-fp8`. Backend memanggil `POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/@cf/qwen/qwen3-30b-a3b-fp8`.

Account ID tersedia di Workers AI → Use REST API. Token memerlukan izin Workers AI Read dan Edit. Keberhasilan `/user/tokens/verify` hanya membuktikan token aktif; belum membuktikan akses inference pada akun tertentu. Restart backend setelah mengubah `.env`. Untuk Render, isi kedua variabel lingkungan pada layanan backend; template `render.yaml` sudah memuatnya. Tidak ada token Cloudflare di variabel VITE atau frontend.

## Data dan batas

AI dibatasi pada data dan fitur dashboard. Backend menyaring pertanyaan di luar cakupan dan permintaan mengganti instruksi sebelum membaca data akun. Respons model juga harus memiliki penanda cakupan yang sesuai; respons di luar cakupan diganti dengan panduan singkat tentang dashboard. Pertanyaan yang tidak jelas perlu menyebut data atau fitur yang ingin dibahas. Header Excel dan teks sumber diperlakukan sebagai data, bukan instruksi.

Semua data dibaca memakai JWT pengguna dan aturan RLS Supabase yang sudah ada. Model menerima ringkasan bisnis, nama produk/lokasi/supplier/sheet dan pertanyaan pengguna. Nama pelanggan, ID pengguna, JWT dan token Cloudflare tidak dimasukkan ke prompt. Bantuan impor mengirim nama sheet, header, jenis sheet dan masalah pemeriksaan, bukan file asli.

Konteks dibatasi 30 produk, lokasi, sumber, supplier dan perubahan produk; timeline 36 bulan. Jika ringkasan terlalu besar, pengguna perlu mempersempit filter. Nilai uang dihitung backend, bukan oleh model. Jawaban naratif masih perlu diperiksa terhadap angka dashboard; penyebab perubahan tidak dapat dipastikan dari data penjualan saja. Percakapan tidak disimpan ke database; setiap pertanyaan harus lengkap dan tidak mengandalkan ingatan pertanyaan sebelumnya.

Maksimal 8 permintaan AI per akun per menit, satu permintaan aktif per akun, empat global per proses backend. Batas ini berada di memori proses; deployment dengan banyak proses/replica perlu shared limiter bila ingin kuota global lintas proses. Cloudflare dapat memberlakukan kuota tersendiri. Permintaan tidak diulang otomatis agar tidak menambah biaya tanpa tindakan pengguna.

Token dan Account ID wajib untuk fitur generatif. Peringatan dan estimasi statistik tetap berjalan tanpa layanan AI. Gagalnya Cloudflare tidak mengeluarkan pengguna dari sesi Supabase.

## Verifikasi

```sh
cd backend
../.venv/bin/python -m pytest tests -q
```

Dari root project:

```sh
npm run build:preview
node tests/smart-dashboard-browser.mjs
```

Tes browser memakai identitas, penyimpanan, dan provider AI tiruan yang terisolasi. Perhitungan dan endpoint Smart Dashboard memakai implementasi aplikasi asli. Tidak mengimpor data atau mengubah transaksi Supabase produksi.

Dashboard berfokus pada data Excel. Tab Biaya, angka biaya operasional dan laba bersih tidak ditampilkan. Ekspor tidak menyertakan sheet Expenses maupun metrik laba bersih. Data biaya lama tidak dihapus.
