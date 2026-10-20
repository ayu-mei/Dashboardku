# Hasil pemeriksaan Excel lokal

File asli hanya dibaca. Profil rinci disimpan lokal pada `excel-profile.local.json` (diabaikan Git, tidak dikirim ke Netlify). Ada banyak sheet pivot/subtotal dan header bertingkat; pilih sheet detail serta nomor baris header yang benar. Nama kolom pada pemetaan upload berasal langsung dari worksheet, termasuk kolom bernama sama yang dibedakan dengan nomor kolom.

| File / sheet | Kolom yang ditemukan | Batas penggunaan |
|---|---|---|
| REPORT PAYDAY.xlsx / DETAIL SALES | STORE, STORE_NAME, SKU, SKU_DESC, QTY_SALES, SALES_VALUE, REGION; header baris 1 | SALES_VALUE adalah total aktual. Tidak ada tanggal transaksi/HPP satuan. Belum cukup untuk impor transaksi penuh. Sheet PAYDAY_ berisi pivot dan Grand Total. |
| REPORT SALES ITEM FOKUS.xlsx / JANUARI, FEBRUARI, MARET, APRIL, dan sheet detail lain | REGION, AREA, SKU, SKU_DESC, RSP REG PZ03, PROMO PRICE, QTY SALES, SALES VALUE, COST, COST+PPN; header baris 4 | Data agregat bulanan. Nama bulan tidak menentukan tanggal transaksi/tahun. Harga promo berbeda dari nilai penjualan aktual per unit; contoh JANUARI: QTY SALES 2898 × PROMO PRICE 10500 tidak sama dengan SALES VALUE 16966000. Jangan mengganti actual sales dengan hasil perkalian harga promo. |
| REPORT SALES DOUBLE DATE.xlsx / DOUBLE DATE MARET, APRIL, MEI, JUNI, dst. | REGION, AREA, SKU_DESC, QTY SALES (3 MARET), SALES VALUE (3 MARET), PROMO PRICE, COST, COST+PPN, dan variasi bulan lain | Ada periode pada label kolom, tetapi tahun/tanggal dan basis pajak perlu konfirmasi. Sheet PIVOT/Grand Total tidak digabung dengan detail. |
| Form Product Promotion - REGION BALI NOT PICKED MASTER ASSORTMENT FIN TANPA CONSIGMENT OKTOBER.xlsx / FORMAT | DEPARTMENT, SKU, SKU_DESC, COST, COST + PPn, RSP (PZ01), RSP PROMO, GP PROMO, RAFAKSI, STOCK ALL, TOTAL COST, TOTAL PROMO VALUE, QTY SALES, SALES VALUE; header baris 4 | Valuasi stok, margin promo, dan penjualan historis bercampur. TOTAL COST stok bukan otomatis HPP penjualan. Create Date di master product adalah tanggal produk dibuat, bukan tanggal transaksi. |
| REPORT PROMO PER BULAN ALL.xlsx / 2026, ITEM FOKUS | SKU_DESC, DEPARTMENT (sheet 2026), COST, COST + PPn, BULAN, JAN…AGS berulang, dan kolom growth | Format lebar dengan nama bulan berulang. Harus memahami blok quantity/value/periode dahulu; bukan langsung menganggap setiap kolom bulan sebagai sales. |
| REPORT SALES ITEM FLUSH OUT BALI 50%.xlsx / FORMAT | DEPARTMENT, SKU_DESC, COST, COST + PPn, STOCK ALL, TOTAL COST, TOTAL PROMO VALUE, DES (16-31), JAN…SEP, TOTAL, dan blok bulan berulang; header bertingkat sekitar baris 4–5 | Kolom stok, quantity, sales value, dan total berdekatan. Tidak boleh menjumlahkan nilai persediaan sebagai realisasi penjualan. |
| NEW Form Product Promotion 2026 2.xlsx | File 0 byte, tidak ada workbook valid | Ditolak; perlu file .xlsx yang benar. |

**Keputusan implementasi:** tidak ada data laporan tersebut yang dimasukkan otomatis ke database Refraksi. Tidak ada kolom tanggal, kategori, HPP, atau harga yang dibuat seolah berasal dari Excel. Upload meminta pemetaan eksplisit untuk file transaksi yang lengkap; jika belum lengkap, aplikasi memberi error. Tidak ada penggabungan master product, penggantian SALES VALUE dengan PROMO PRICE, pemilihan COST vs COST+PPN, atau alokasi biaya otomatis tanpa konfirmasi pengguna.

Untuk mengolah laporan agregat ini menjadi dashboard yang benar, perlu menentukan satu file/sheet sumber, periode/tahun, arti unit quantity dan harga, basis HPP termasuk/tanpa PPN, dan sumber biaya operasional. Rumus dan data asli tetap dipertahankan sambil menunggu keputusan tersebut.

## Pemeriksaan folder sumber yang diberikan pengguna

Folder `/Users/erwinyasa/Downloads/sumber` diperiksa pada 18 Oktober 2026. Keempat file valid sebagai workbook. Ini adalah salinan sumber baru; khusus `NEW Form Product Promotion 2026 2.xlsx`, temuan file 0 byte pada pemeriksaan lama di atas **tidak berlaku** untuk salinan baru ini. Ringkasan struktur dan hash lokal tersimpan di `test-artifacts/source-review.local.json`, diabaikan Git. Tidak ada file sumber yang diubah atau diimpor ke database.

| File | Hasil pemeriksaan aktual | Tindak lanjut |
|---|---|---|
| REPORT PAYDAY.xlsx | 3 sheet. `DETAIL SALES!A1:G1` berisi STORE, STORE_NAME, SKU, SKU_DESC, QTY_SALES, SALES_VALUE, REGION. Tidak ada kolom tanggal atau HPP. `PAYDAY_` merupakan pivot dengan Grand Total. | Gunakan DETAIL SALES sebagai sumber detail. Perlu tanggal/periode, sumber HPP, dan pengolahan total penjualan agar tidak keliru dianggap harga per unit. |
| REPORT SALES DOUBLE DATE.xlsx | 18 sheet. Contoh `DOUBLE DATE OKTOBER!L4:M4` berisi QTY SALES (10 OKTOBER) dan SALES VALUE (10 OKTOBER). COST ada di O4 dan COST+PPN di P4. Tahun tidak tercantum pada judul/kolom sheet detail yang diperiksa. | Konfirmasi tahun serta basis HPP. Jangan memakai rata-rata periode sebelumnya atau PROMO PRICE sebagai pengganti penjualan aktual. Sheet detail dan pivot tidak digabung. |
| REPORT SALES ITEM FLUSH OUT BALI 50%.xlsx | 3 sheet. FORMAT memiliki header bertingkat dan dua blok bulan: jumlah terjual di AH:AQ serta total penjualan aktual di AW:BF. Terdapat stok dan valuasi stok di area lain. Banyak nama produk/HPP merupakan formula. | Perlu pengolahan rekap bulanan secara khusus. Jangan memetakan stok sebagai jumlah terjual atau TOTAL COST persediaan sebagai HPP penjualan. |
| NEW Form Product Promotion 2026 2.xlsx | 43 sheet; file sekitar 28,2 MiB, isi ZIP sekitar 178,7 MiB. Sheet 2026 memiliki periode tahun 2026, jumlah/nilai promo dan jumlah/nilai seluruh penjualan dalam kolom yang berbeda. | Workbook melewati batas pemeriksaan isi terurai 100 MiB walaupun file di bawah 50 MiB. Simpan sheet yang dibutuhkan sebagai file terpisah. Tentukan apakah analisis memakai penjualan promo atau seluruh penjualan; hindari penggabungan sheet tahunan dan bulanan yang menduplikasi data. |

Tidak ada sheet yang otomatis menghasilkan seluruh pencocokan wajib impor transaksi saat ini. Pesan lama “Setiap field harus memakai satu kolom yang berbeda” berasal dari validasi pilihan ganda oleh pengguna, bukan bukti bahwa laporan tersebut cukup lengkap. UI kini mencegah pemakaian kolom yang sudah dipilih untuk isian lain, menampilkan isian pemilik kolom, dan memberi petunjuk bahwa SALES_VALUE adalah total. Backend tetap menolak pilihan ganda dengan menyebutkan isian yang berbenturan. Penyesuaian ini memperbaiki pencocokan; belum mengubah laporan agregat menjadi transaksi dan tidak membuat tanggal, harga, atau HPP pengganti.

## Alur laporan Double Date setelah konfirmasi tahun 2026

Pengguna menyatakan tahun laporan **2026**. Alur khusus laporan bertanggal kini mendeteksi pasangan kolom QTY SALES (hari/bulan) dan SALES VALUE (hari/bulan), nama produk, COST/COST+PPN, serta rumus margin. Tahun tampil sebagai isian bisnis pada preview, dengan nilai awal mengikuti filter tahun halaman. Tidak ada kolom tanggal palsu yang dibaca dari Excel: tanggal sumber hari/bulan dan tahun pilihan pengguna ditampilkan secara eksplisit.

Dasar HPP berasal dari referensi biaya pada rumus margin setiap baris. Maret, Mei, Juli, Agustus, September dan Oktober memakai COST+PPN; April memakai COST. Sheet Juni menyimpan margin sebagai angka, sehingga dasar HPP tidak diputuskan otomatis. Rumus COST+PPN sederhana berupa COST pada baris yang sama dikali faktor literal dihitung memakai Decimal, mengikuti faktor yang benar-benar tertulis di workbook. Tidak ada evaluasi formula arbitrer, akses tautan eksternal, pengambilan tarif pajak dari asumsi, atau pemakaian cache rumus untuk menyimpan uang.

| Sheet | Penjualan aktual | HPP sesuai rumus | Status penyimpanan dengan schema existing |
|---|---:|---:|---|
| DOUBLE DATE MARET | 11.541.000 | 4.953.394,98 | 47 baris dapat disimpan tepat pada tanggal 2026-03-03. Empat baris dengan jumlah/nilai penjualan nol dan satu total dikecualikan secara terlihat dan disetujui pada konfirmasi. Gross profit 6.587.605,02. |
| DOUBLE DATE APRIL | 9.505.000 | 2.734.312 | Ditahan: satu harga efektif tidak dapat mewakili total penjualan dengan dua desimal. |
| DOUBLE DATE MEI | 97.708.000 | Sesuai biaya pada sheet | Ditahan: beberapa harga efektif memerlukan lebih dari dua desimal. |
| DOUBLE DATE JUNI | 90.825.000 | Belum ditentukan otomatis | Ditahan: margin tersimpan sebagai angka, bukan rumus yang mengidentifikasi dasar HPP. |
| DOUBLE DATE JULI / AGUSTUS / SEPTEMBER | Sesuai preview masing-masing sheet | Sesuai rumus masing-masing baris | Ditahan: harga efektif dan/atau HPP tidak dapat disimpan tepat dengan schema dua desimal. |
| DOUBLE DATE OKTOBER | 79.050.000 | 67.046.863,023 | Preview akurat tersedia; penyimpanan ditahan karena HPP satuan memiliki empat desimal. |

Schema Supabase saat ini membatasi price dan unit_cost maksimal dua desimal. Alur baru tidak membulatkan biaya atau mengubah jumlah unit, tidak memecah baris menjadi transaksi buatan, dan tidak mengimpor hanya sebagian baris ketika terdapat masalah. Preview mencantumkan masalah serta batas ini. Mendukung penyimpanan seluruh rekap dengan presisi asli membutuhkan tindak lanjut penyimpanan nilai agregat/presisi; belum ada migration yang dijalankan.

Untuk memulai pada lokal: Data Penjualan → Import Excel → REPORT SALES DOUBLE DATE.xlsx → DOUBLE DATE MARET → Tahun laporan 2026 → Periksa Data → periksa nilai → centang persetujuan → Konfirmasi Import. Rekap produk/lokasi dijelaskan sebagai rekap, bukan daftar transaksi individual. Penjualan dihitung kembali dari jumlah × harga efektif yang lolos pemeriksaan kesetaraan tepat dengan SALES VALUE. HPP = jumlah × biaya sesuai rumus; biaya operasional tidak dimasukkan otomatis.

## Status impor aktual setelah instruksi pengujian AFK

Sheet **DOUBLE DATE MARET** telah diimpor ke Supabase online melalui sesi pengguna yang aktif, setelah preview dan Konfirmasi Import. Jumlah tersimpan 47 baris; hasil baca ulang dan ekspor cocok dengan sumber: penjualan 11.541.000, HPP 4.953.394,98, gross profit 6.587.605,02. Data tetap ada setelah backend dimuat ulang. File asli tidak diubah.

Percobaan ulang ditolak tanpa menambah jumlah baris. Aplikasi sekarang mendeteksi laporan existing saat preview dan menampilkan “Laporan ini sudah tersimpan”. Pengujian PAYDAY, FLUSH OUT, dan workbook promosi besar tidak menyimpan data baru. Laporan lain tetap mengikuti batas/masalah yang dijelaskan di atas; status keberhasilan Maret tidak berarti seluruh folder telah diimpor.

## Pembaca sumber baru — 20 Oktober 2026

Temuan pembatasan transaksi di atas tetap berlaku pada jalur transaksi lama. Jalur sumber baru kini membedakan master/rekap/rafaksi dan menyimpan rekap dengan total sumber serta periode melalui migrasi tambahan, tanpa membulatkan harga efektif. Karena itu sheet yang dulu ditahan hanya akibat presisi dapat diperiksa melalui alur sumber baru. Dasar HPP harus dipilih eksplisit; tidak ada pemilihan pajak otomatis.

Header tidak cukup untuk menentukan metrik. VALUE PROMO pada beberapa program setara potongan/rafaksi, bukan omzet. Penjualan semua toko yang berulang antarprogram diperiksa berdasarkan SKU/periode pada satu cakupan sumber, bukan dijumlahkan berdasarkan STORE program. Periode tanpa penjualan terukur dengan penanda X/N/A atau jumlah nol dan nilai kosong ditampilkan sebagai pengecualian, tidak diganti nilai nol. Detail alur, pengujian dan kebutuhan aktivasi terdapat di `IMPORT_SUMBER.md`.
