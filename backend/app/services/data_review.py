"""Read-only checks on filtered records; no claim that source documents are correct."""
from collections import Counter
from decimal import Decimal


def review_records(rows, sample_limit=12):
    counts = Counter()
    samples = []
    seen = {}
    for position, row in enumerate(rows, 1):
        issues = []
        recap = bool(row.get('is_recap'))
        sales = Decimal(str(row['sales_value']))
        hpp = Decimal(str(row['total_hpp'])) if row.get('total_hpp') is not None else None
        if hpp is None:
            issues.append('hpp_missing')
        elif sales < hpp:
            issues.append('sales_below_hpp')
        if not recap:
            key = tuple(str(row.get(k, '')) for k in ('date','product','customer','quantity','price','unit_cost','location'))
            if key in seen:
                issues.append('possible_duplicate')
            else:
                seen[key] = position
            if Decimal(str(row['quantity'])) == 0:
                issues.append('zero_quantity')
            if Decimal(str(row['price'])) == 0:
                issues.append('zero_price')
        if not issues:
            continue
        counts.update(issues)
        if len(samples) < sample_limit:
            # Deliberately exclude customer names, account IDs and internal record IDs.
            samples.append({'date':str(row['date']), 'product':row.get('product'),
                            'location':row.get('location'), 'kind':'recap' if recap else 'transaction',
                            'sales':str(sales), 'hpp':str(hpp) if hpp is not None else None,
                            'issues':issues})
    return {
        'checked_rows':len(rows), 'finding_counts':dict(counts), 'samples':samples,
        'samples_truncated':sum(counts.values()) > sum(len(s['issues']) for s in samples),
        'interpretation': {
            'possible_duplicate':'Kesamaan field, bukan kepastian duplikat. Cocokkan nota atau sumber sebelum menghapus.',
            'sales_below_hpp':'Penjualan di bawah HPP; bisa transaksi rugi yang disengaja. Periksa harga/HPP pada sumber sebelum menyimpulkan salah input.',
            'hpp_missing':'HPP tidak tersedia; laba tidak bisa dipastikan untuk catatan tersebut.',
            'zero_quantity':'Jumlah unit nol perlu dicocokkan dengan sumber; belum membuktikan kesalahan.',
            'zero_price':'Harga nol perlu dicocokkan dengan sumber; bisa merupakan transaksi gratis.'},
        'scope':'Memeriksa catatan tersimpan yang masuk filter aktif. Tidak membandingkan dengan dokumen asli atau memastikan kelengkapan seluruh aktivitas bisnis. Tidak mengubah data.',
        'conclusion_rule':'Jika tidak ada temuan, katakan tidak ada indikasi pada pemeriksaan yang dilakukan, bukan seluruh data sudah benar. Konsentrasi produk dan perubahan tren adalah kondisi bisnis, bukan kesalahan pencatatan.'}
