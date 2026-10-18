# Database REFRAKSI

Struktur saat ini sesuai untuk transaksi penjualan dengan harga/HPP satuan maksimal dua desimal dan biaya operasional terpisah. Pembatasan per akun memakai `user_id`, Supabase Auth, grants, serta RLS. Backend aktif membaca tabel lewat REST API dengan JWT pengguna; fungsi `refraksi_dashboard` tetap tersedia dan diuji, tetapi bukan jalur agregasi backend aktif.

## Migration

| File | Fungsi | Penggunaan |
|---|---|---|
| `migrations/202610180001_refraksi.sql` | Tabel penjualan/biaya, relasi akun, indeks, RLS, grants, dan fungsi dashboard | Sekali pada project baru. Pada database yang sudah memiliki tabel, periksa kesesuaian schema; tidak perlu membuat ulang tabel. |
| `migrations/202610180002_dimensions.sql` | Kategori dan lokasi opsional | Setelah 001. Kolom pada screenshot pengguna sudah mencakup keduanya. |
| `migrations/202610180003_money_value_checks.sql` | Menyamakan validasi SQL dengan backend untuk nol di belakang desimal, seperti `1.2300` = `1.23` | Setelah 001/002 atau setelah constraint database existing dipastikan sesuai. Tidak mengubah data/kolom maupun RLS. |

Migration 003 menerima nilai dengan nol tambahan di belakang desimal. Nilai yang memiliki pecahan uang bermakna di luar dua desimal tetap ditolak, misalnya `1.2301`. Nilai negatif dan batas maksimum tetap diperiksa. Tidak ada pembulatan otomatis.

## Memeriksa database yang sudah online

1. Buka **SQL Editor → New query** pada project Supabase existing.
2. Salin dan jalankan [`checks/schema_audit.sql`](checks/schema_audit.sql).
3. Hasil `database_audit` memperlihatkan kolom/default, constraint, RLS, policies, indeks, grants, serta konfigurasi fungsi dashboard. Script hanya membaca metadata, tidak membaca isi penjualan dan tidak melakukan perubahan.
4. Cocokkan hasilnya dengan migration. Jika constraint standar dari 001 sudah ada, migration 003 dapat diterapkan sebagai penyesuaian berikutnya. Migration 001 tidak perlu dijalankan ulang pada tabel existing.

Pemeriksaan yang diharapkan: kedua tabel ditemukan; RLS aktif; akun API `authenticated` memiliki CRUD tetapi bukan superuser/bypass-RLS; policy membatasi `user_id` sesuai `auth.uid()` dengan `USING` dan `WITH CHECK`; `anon` tidak memiliki CRUD; fungsi dashboard `security invoker`, search path kosong, dan hanya dapat dieksekusi oleh akun yang diizinkan. Periksa seluruh policies, karena policy tambahan juga dapat mengubah akses.

## Pengujian dan batas verifikasi

`tests/security_finance.sql` menguji rumus, filter, isolasi akun, CRUD, dan penolakan anonim. `tests/money_precision.sql` menguji trailing zero, batas angka, margin berbobot, dan penolakan perubahan pemilik. Keduanya memakai transaksi dan rollback dengan fixture akun. Gunakan project uji untuk pengujian yang menulis fixture; pada project produksi, script pemeriksaan metadata di atas cukup untuk audit awal tanpa penulisan.

Pada 18 Oktober 2026, ketiga migration dan kedua test SQL lulus di PostgreSQL 18.6/PGlite terisolasi dengan schema/helper Auth minimal yang disimulasikan. Script audit metadata juga berhasil dijalankan di sana. Ini menguji logika PostgreSQL, bukan keseluruhan layanan Supabase Auth atau konfigurasi produksi. PGlite dipasang hanya di direktori sementara, tidak ditambahkan ke dependency aplikasi.

Uji upgrade migration 003 juga mempertahankan seluruh nilai record existing, ID, kategori/lokasi, dan definisi fungsi dashboard. Penerapan ulang migration 003 dengan nama constraint standar berhasil.

Pemeriksaan HTTP read-only terhadap Supabase online menunjukkan akses anonim ke `refraksi_sales`, `refraksi_expenses`, dan `refraksi_dashboard` ditolak (HTTP 401, SQLSTATE 42501). Pemeriksaan tersebut tidak membuktikan isolasi antara dua akun login nyata, seluruh constraint, atau kesesuaian migration online. Diperlukan hasil audit metadata online untuk memastikannya. Tidak ada migration/data produksi yang diubah selama audit ini.

## Laporan Excel agregat

Harga/HPP dua desimal belum cukup untuk seluruh laporan sumber. Maret dapat disimpan tepat dengan schema existing. Beberapa sheet lain mempunyai HPP lebih rinci atau harga efektif berulang. Migration 003 mempertahankan batas nilai dua desimal, sehingga sheet tersebut tetap ditahan dari penyimpanan.

Dukungan penuh perlu menyimpan total aktual dan asal laporan secara eksplisit, lalu menyesuaikan backend, dashboard, analisis, ekspor, validasi dan deduplikasi bersama-sama. Menambah kolom saja belum cukup; tidak ada migration rekap atau perubahan fungsi bisnis yang diterapkan pada audit ini.

Referensi: [RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [fungsi database](https://supabase.com/docs/guides/database/functions), [numeric PostgreSQL](https://www.postgresql.org/docs/current/datatype-numeric.html).
