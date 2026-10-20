"""Persistence and overlap checks for imported source datasets."""
from fastapi import HTTPException
from app.services.database import database, all_records
from app.services.excel import column_name


class SourceSchemaMissing(HTTPException):
    def __init__(self):
        super().__init__(503, 'Penyimpanan master, rekap, dan rafaksi belum diaktifkan oleh administrator. Preview tetap dapat digunakan; tidak ada data disimpan.')


async def source_datasets(token, loader=None):
    try:
        return await (loader or all_records)(token, 'refraksi_sources'), True
    except SourceSchemaMissing:
        return [], False


def recap_sales(datasets):
    result = []
    for dataset in datasets:
        if dataset['kind'] != 'sales_recap':
            continue
        for index, row in enumerate(dataset['records']):
            result.append({**row, 'id': f"{dataset['id']}:{index}", 'source_id': dataset['id'],
                           'source_sheet': dataset['sheet'], 'date': row['period_start'], 'price': None,
                           'customer': '-', 'is_recap': True})
    return result


def overlaps(a, b):
    # Master/claim identity uses its own business key, not file names or row order.
    if 'supplier_code' in a or 'supplier_code' in b:
        same = a.get('supplier_code') == b.get('supplier_code')
    else:
        same = a['sku'] == b['sku'] if a.get('sku') and b.get('sku') else column_name(a.get('product', '')) == column_name(b.get('product', ''))
    if not same:
        return False
    if 'period_start' not in a or 'period_start' not in b:
        return True
    period_overlap = a['period_start'] <= b['period_end'] and a['period_end'] >= b['period_start']
    location_overlap = ('supplier_code' in a or a.get('aggregate_location') or b.get('aggregate_location')
                        or column_name(a.get('location', '')) == column_name(b.get('location', '')))
    return period_overlap and location_overlap


async def check_source_overlap(token, payload):
    datasets, ready = await source_datasets(token)
    if not ready:
        return 'Penyimpanan data sumber belum diaktifkan. Preview bisa diperiksa, tetapi administrator perlu mengaktifkan penyimpanan sebelum impor.', False
    rows = payload['records']
    for existing in datasets:
        if existing['kind'] != payload['kind']:
            continue
        if existing['fingerprint'] == payload['fingerprint']:
            return f"Data yang sama sudah tersimpan dari sheet {existing['sheet']}. Tidak ada data tambahan disimpan.", True
        indexed = {}
        for other in existing['records']:
            indexed.setdefault(other.get('sku', other.get('supplier_code')), []).append(other)
        for row in rows:
            if any(overlaps(row, other) for other in indexed.get(row.get('sku', row.get('supplier_code')), [])):
                return f"Ada data yang beririsan dengan sheet {existing['sheet']} yang sudah tersimpan. Pilih satu sumber utama atau hapus impor lama setelah diperiksa.", True
    if payload['kind'] == 'sales_recap':
        by_product = {}
        for row in rows:
            by_product.setdefault(column_name(row['product']), []).append(row)
        for old in await all_records(token, 'refraksi_sales'):
            other = {**old, 'period_start': old['date'], 'period_end': old['date']}
            if any(overlaps(row, other) for row in by_product.get(column_name(old['product']), [])):
                return 'Ada transaksi existing dengan produk, lokasi, dan periode yang beririsan. Periksa transaksi lama sebelum memakai rekap sebagai sumber pengganti.', True
    return None, True


def source_summary(dataset, filters=None):
    records = dataset['records']
    if filters is not None and dataset['kind'] != 'master':
        from app.services.finance import in_period
        records = [row for row in records if in_period(row, filters)]
    return {key: value for key, value in dataset.items() if key not in {'records', 'user_id'}} | {'count': len(dataset['records']), 'filtered_count': len(records), 'sample': records[:10]}
