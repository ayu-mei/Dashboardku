# Dashboard Penjualan Refraksi

Aplikasi Python Flask lokal, terpisah dari project JavaScript yang sudah ada di folder ini. File Excel lama tidak digunakan atau diubah. Tidak ada data contoh yang dicampurkan ke laporan.

## 1. Persiapan di VS Code

Buka Terminal → New Terminal (PowerShell). Pastikan lokasi terminal adalah folder Dashboard. Pasang Python 3.11 atau lebih baru dari https://www.python.org/downloads/ jika belum tersedia, centang **Add Python to PATH**, lalu tutup dan buka kembali VS Code. Ekstensi Python dari Microsoft membantu memilih interpreter.

Jalankan satu per satu:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Jika perintah `py` tidak tersedia tetapi `python --version` berhasil, gunakan `python -m venv .venv` pada perintah pertama. Aktivasi environment tidak diperlukan sehingga tidak perlu mengubah execution policy PowerShell.

Buka **http://127.0.0.1:5000** di browser. Biarkan terminal berjalan. Untuk berhenti, tekan **Ctrl+C** di terminal. Untuk menjalankan lagi, cukup jalankan perintah terakhir. Aplikasi ini untuk penggunaan lokal, bukan untuk dipublikasikan langsung ke internet.

## 2. File project

| File | Fungsi |
|---|---|
| `app.py` | Server Flask, API CRUD, validasi input, perhitungan Decimal, baca/tulis Excel |
| `templates/dashboard.html` | Struktur dashboard, tabel, dan dialog formulir |
| `static/dashboard.css` | Desain responsif navy, putih, dan hijau |
| `static/dashboard.js` | Memuat data, grafik bulanan, filter tahun, tambah/edit/hapus |
| `requirements.txt` | Dependensi Flask dan openpyxl |
| `tests/test_dashboard.py` | Pengujian rumus, penyimpanan, validasi, dan CRUD memakai Excel sementara |
| `data/refraksi.xlsx` | Dibuat otomatis saat server pertama dijalankan; sheet Sales dan Expenses |
| `PANDUAN_REFRAKSI.md` | Panduan ini |

## 3. Aturan keuangan

- Sales value per transaksi = quantity × harga jual satuan.
- HPP per transaksi = quantity × HPP satuan.
- Total sales dan total HPP adalah penjumlahan transaksi pada tahun terpilih.
- Gross profit = total sales − total HPP.
- Gross margin = gross profit ÷ total sales × 100%.
- Operational cost = jumlah biaya pada sheet Expenses pada tahun terpilih.
- Actual net profit = gross profit − operational cost.
- Actual net margin = actual net profit ÷ total sales × 100%.

Margin menggunakan total, bukan rata-rata persentase transaksi. Saat sales nol, margin tidak terdefinisi dan ditampilkan “—”; kerugian tetap ditampilkan. Nilai uang diterima hingga dua desimal dan dihitung di server menggunakan Decimal. Input kuantitas berupa unit utuh positif.

**Jangan masukkan HPP lagi sebagai biaya operasional.** Jika harga pokok sudah termasuk ongkos tertentu, jangan catat ongkos tersebut lagi di Expenses. Aplikasi memisahkan kedua jenis catatan, tetapi tidak dapat menilai apakah pengguna memasukkan biaya ekonomi yang sama dua kali. Jangan memasukkan subtotal/total bulanan sebagai transaksi tambahan. Harga jual adalah nilai bersih setelah diskon; pajak pungutan bukan pendapatan. Pajak usaha, bunga, retur, dan penyusutan belum memiliki modul khusus. Nilai net mencerminkan biaya yang benar-benar dicatat; retur negatif tidak didukung.

## 4. Uji dengan contoh

Pilih tahun berjalan. Tambahkan transaksi: jumlah 2, harga jual 500000, HPP satuan 300000. Tambahkan biaya operasional 100000 dengan tanggal tahun yang sama.

Hasil: Sales Rp1.000.000; HPP Rp600.000; gross profit Rp400.000; gross margin 40%; operational cost Rp100.000; net profit Rp300.000; net margin 30%.

Edit jumlah menjadi 1: net profit harus Rp100.000. Muat ulang browser dan pastikan data tetap ada. Unduh Excel dan periksa kedua sheet. Uji hapus lalu hapus biaya contoh juga agar laporan kembali kosong.

Pengujian otomatis (tidak mengubah Excel asli):

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## 5. Penyimpanan dan pemecahan masalah

Setiap simpan/hapus yang berhasil langsung menulis Excel. Penulisan menggunakan file sementara lalu penggantian atomik; kegagalan simpan menampilkan pesan. Tutup `data/refraksi.xlsx` di Microsoft Excel sebelum mengubah data dari dashboard karena Excel dapat mengunci file. Unduh Excel dari dashboard untuk melihat salinannya. Jangan mengubah struktur sheet atau header secara manual.

Cadangkan `data/refraksi.xlsx` secara berkala saat server dihentikan. Data disimpan lokal, tanpa cloud. Jalankan hanya satu proses aplikasi untuk workbook yang sama; kunci dalam aplikasi melindungi permintaan dalam satu proses, bukan beberapa server atau edit Excel eksternal.

Jika muncul `ModuleNotFoundError`, ulangi instalasi requirements dengan interpreter `.venv` di atas. Jika port 5000 dipakai, hentikan aplikasi Flask lama. Jika `python.exe` tidak bisa diakses, gunakan Python terpasang melalui launcher `py`, bukan alias Microsoft Store. Grafik dan desain tidak membutuhkan CDN atau koneksi internet; internet hanya diperlukan saat menginstal dependensi.
