"""Read report semantics, preserving source totals and reporting periods."""
from calendar import monthrange
from datetime import date
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from io import BytesIO
import json
import re
from uuid import uuid5, NAMESPACE_URL
from zipfile import ZipFile
import xml.etree.ElementTree as ET
from fastapi import HTTPException
from app.services.excel import checked_workbook, column_name, MAX_ROWS, ALIASES

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
MONTHS = ['JANUARI', 'FEBRUARI', 'MARET', 'APRIL', 'MEI', 'JUNI', 'JULI', 'AGUSTUS', 'SEPTEMBER', 'OKTOBER', 'NOVEMBER', 'DESEMBER']
MONTH_ALIASES = {name: i + 1 for i, name in enumerate(MONTHS)}
MONTH_ALIASES.update(dict(JAN=1, FEB=2, MAR=3, APR=4, JUN=6, JUL=7, AGS=8, AGUST=8, SEP=9, OKT=10, NOV=11, DES=12))
LABELS = {'master': 'Master produk', 'sales_recap': 'Rekap penjualan', 'supplier_claim': 'Rafaksi supplier', 'reference': 'Ringkasan / referensi', 'transaction': 'Transaksi', 'unknown': 'Perlu pemeriksaan'}
PRODUCT = {'sku desc', 'sku description', 'description final', 'nama produk', 'produk', 'product', 'sku final description', 'nama barang', 'nama item', 'item desc', 'product name', 'nama produk'}
PRODUCT |= ALIASES['product']
SKU = {'sku', 'sku final', 'kode barang', 'kode produk'}


def text(value):
    return '' if value is None else str(value).strip()


def col_number(ref):
    result = 0
    for char in re.sub(r'\d', '', ref):
        result = result * 26 + ord(char) - 64
    return result - 1


class SourceBook:
    """Read cached XML numbers as Decimal strings, without binary float conversion."""
    def __init__(self, content):
        # Reuse the upload/expanded-size/macro guard before reading ZIP members.
        checked = checked_workbook(content)
        checked.close()
        self.archive = ZipFile(BytesIO(content))
        self.strings = []
        if 'xl/sharedStrings.xml' in self.archive.namelist():
            with self.archive.open('xl/sharedStrings.xml') as stream:
                for _, node in ET.iterparse(stream, events=['end']):
                    if node.tag.endswith('}si'):
                        self.strings.append(''.join(part.text or '' for part in node.iter() if part.tag.endswith('}t')))
                        node.clear()
        rels = {node.attrib['Id']: node.attrib['Target'] for node in ET.fromstring(self.archive.read('xl/_rels/workbook.xml.rels'))}
        self.sheets = []
        for node in ET.fromstring(self.archive.read('xl/workbook.xml')).find('m:sheets', NS):
            target = rels[node.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            self.sheets.append({'name': node.attrib['name'], 'hidden': node.attrib.get('state', 'visible') != 'visible',
                                'path': target.lstrip('/') if target.startswith('/') else 'xl/' + target})

    def close(self):
        self.archive.close()

    def rows(self, sheet, limit=None):
        info = next((item for item in self.sheets if item['name'] == sheet), None)
        if info is None:
            raise HTTPException(400, 'Sheet tidak ditemukan.')
        with self.archive.open(info['path']) as stream:
            for _, node in ET.iterparse(stream, events=['end']):
                if not node.tag.endswith('}row'):
                    continue
                number = int(node.attrib['r'])
                if limit and number > limit:
                    break
                cells = {}
                for cell in node:
                    if not cell.tag.endswith('}c'):
                        continue
                    value = cell.find('m:v', NS)
                    value = value.text if value is not None else None
                    kind = cell.attrib.get('t')
                    if kind == 's' and value is not None:
                        value = self.strings[int(value)]
                    elif kind == 'inlineStr':
                        value = ''.join(t.text or '' for t in cell.iter() if t.tag.endswith('}t'))
                    formula = cell.find('m:f', NS)
                    if value is not None or formula is not None:
                        cells[col_number(cell.attrib['r'])] = {'value': value, 'formula': formula is not None, 'error': kind == 'e', 'ref': cell.attrib['r']}
                if cells:
                    yield number, cells
                node.clear()


def row_values(cells):
    return {index: text(cell['value']) for index, cell in cells.items()}


def describe_source(book, name):
    rows = list(book.rows(name, 16))
    values = [(n, row_values(cells)) for n, cells in rows]
    candidates = []
    for number, cells in values:
        normalized = {i: column_name(v) for i, v in cells.items()}
        labels = set(normalized.values())
        score = (10 if labels & PRODUCT else 0) + (5 if labels & SKU else 0) + (8 if 'code supplier' in labels else 0)
        if score:
            candidates.append((score, len(labels), -number, normalized, cells))
    candidate = max(candidates, key=lambda item: item[:3]) if candidates else None
    header = -candidate[2] if candidate else None
    columns = candidate[3] if candidate else {}
    names = set(columns.values())
    norm = column_name(name)
    top_text = ' '.join(v for _, cells in values[:4] for v in cells.values())
    years = sorted(set(re.findall(r'\b(?:19|20)\d{2}\b', top_text)))
    year = int(years[0]) if len(years) == 1 else None
    period_label = next((v for _, cells in values[:4] for v in cells.values() if 'PERIODE' in v.upper()), '')
    kind, layout = 'unknown', 'unknown'
    if ('upc' in names and ('description final' in names or 'master product' in norm)):
        kind, layout = 'master', 'master'
    elif norm.startswith('detail rafraksi') or norm.startswith('detail rafaksi') or ('code supplier' in names and any('sum of raf' in v for v in names)):
        kind, layout = 'supplier_claim', 'supplier_claim'
    elif 'pivot' in norm or 'summary' in norm or norm in {'compare', 'list area', 'weekend'} or norm.startswith('payday'):
        kind, layout = 'reference', 'reference'
    elif any('sales qty all store' in v for v in names):
        kind, layout = 'sales_recap', 'monthly_promotions'
    elif any(re.match(r'qty sales \(\d', text(v['value']), re.I) for _, cells in rows for v in cells.values()):
        kind, layout = 'sales_recap', 'dated_event'
    elif 'sales qsr' == norm or 'sales qsr per bulan' == norm:
        kind, layout = 'sales_recap', 'qsr_wide'
    elif names & PRODUCT and 'stock all' in names and any('QTY SALES' in text(c['value']).upper() for _, cells in rows[:4] for c in cells.values()):
        kind, layout = 'sales_recap', 'flush_wide'
    elif names & PRODUCT and names & {'sales value', 'sales value sales'} and names & {'qty sales', 'sales qty sales', 'quantity', 'jumlah'}:
        kind, layout = 'sales_recap', 'simple_recap'
    elif names & PRODUCT and names & ALIASES['date']:
        kind, layout = 'transaction', 'transaction'
    elif names & PRODUCT and names & {'qty buy', 'promo discount', 'rsp promo'}:
        kind, layout = 'reference', 'promotion_program'
    elif names & PRODUCT and names & {'keterangan'}:
        kind, layout = 'reference', 'promotion_items'
    message = {
        'master': 'Daftar barang dan referensi biaya. Bukan transaksi penjualan; tanggal produk dibuat tidak dipakai sebagai tanggal penjualan.',
        'sales_recap': 'Jumlah dan total penjualan disimpan sebagai rekap periode. Harga satuan tidak dibulatkan untuk memaksakan total.',
        'supplier_claim': 'Nilai rafaksi supplier disimpan terpisah dari omzet. Data ini tidak membuktikan bahwa dana sudah diterima.',
        'reference': 'Sheet ringkasan atau pendukung. Gunakan untuk mencocokkan total; tidak ditambahkan sebagai penjualan.',
        'transaction': 'Sheet transaksi. Periksa pencocokan kolom sebelum menyimpan.',
        'unknown': 'Jenis data belum pasti. Pilih sheet detail yang direkomendasikan; data tidak akan ditebak.',
    }[kind]
    hidden = next(item['hidden'] for item in book.sheets if item['name'] == name)
    month = next((MONTH_ALIASES[token] for token in re.findall(r'[A-Z]+', (name + ' ' + period_label).upper()) if token in MONTH_ALIASES), None)
    if layout == 'monthly_promotions' and norm.isdigit():
        month = None
    if layout in {'qsr_wide', 'flush_wide'}:
        month = None
    if layout == 'flush_wide' and year:
        # Report begins in December and contains January onwards; year is a base year.
        message += ' Desember memakai tahun awal; Januari–September memakai tahun berikutnya. Periksa tahun awal pada preview.'
    return {'name': name, 'kind': kind, 'label': LABELS[kind], 'layout': layout, 'header_row': header,
            'hidden': hidden, 'year': year, 'month': month, 'period_label': period_label,
            'recommended': kind in {'sales_recap', 'master', 'supplier_claim'} and not hidden,
            'message': message, 'columns': columns}


def inspect_sources(content, sheet=''):
    book = SourceBook(content)
    try:
        profiles = [describe_source(book, item['name']) for item in book.sheets]
        selected = next((item for item in profiles if item['name'] == sheet), None)
        if sheet and selected is None:
            raise HTTPException(400, 'Sheet tidak ditemukan.')
        if not sheet and len(profiles) == 1:
            selected = profiles[0]
        known_years = {item['year'] for item in profiles if item['year'] and item['kind'] != 'master'}
        if selected and not selected['year'] and len(known_years) == 1:
            selected['suggested_year'] = next(iter(known_years))
        if selected and selected['layout'] == 'simple_recap':
            hints = [item['period_label'] for item in profiles if item['period_label']]
            for hint in hints:
                match = re.search(r'(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Z]+)\s+(20\d{2})', hint.upper())
                if match and match[3] in MONTH_ALIASES:
                    try:
                        selected['suggested_start'] = date(int(match[4]), MONTH_ALIASES[match[3]], int(match[1])).isoformat()
                        selected['suggested_end'] = date(int(match[4]), MONTH_ALIASES[match[3]], int(match[2])).isoformat()
                        selected['period_hint'] = hint
                    except ValueError:
                        pass
                    break
        public = lambda item: {k: v for k, v in item.items() if k != 'columns'}
        return {'sheets': [item['name'] for item in profiles], 'sheet_profiles': [public(item) for item in profiles],
                'source_profile': public(selected) if selected else None,
                'sheet': selected['name'] if selected else '', 'recognized': bool(selected and selected['kind'] != 'unknown'),
                'columns': [{'index': i, 'name': value} for i, value in (selected['columns'].items() if selected else [])], 'sample': []}
    finally:
        book.close()


def find_column(columns, aliases):
    matches = [index for index, value in columns.items() if value in aliases]
    return matches[0] if len(matches) == 1 else None


def prepare_source(content, sheet, options, owner, filename):
    book = SourceBook(content)
    try:
        profile = describe_source(book, sheet)
        kind, layout = profile['kind'], profile['layout']
        if kind not in {'master', 'sales_recap', 'supplier_claim'}:
            raise HTTPException(400, profile['message'])
        year = options.get('year')
        if kind != 'master' and (type(year) is not int or not 1 <= year <= 9998):
            raise HTTPException(400, 'Isi tahun laporan sesuai sumber.')
        if profile['year'] and kind != 'master' and year != profile['year']:
            raise HTTPException(400, f"Tahun sumber {profile['year']} berbeda dari pilihan Anda.")
        basis = options.get('cost_basis', 'none')
        if basis not in {'none', 'cost', 'tax_cost', 'source'}:
            raise HTTPException(400, 'Pilihan dasar HPP tidak valid.')
        columns = profile['columns']
        header = profile['header_row'] or 2
        product_col = find_column(columns, PRODUCT)
        sku_col = find_column(columns, {'sku', 'kode barang', 'kode produk'})
        if sku_col is None and kind == 'master':
            sku_col = next((i for i, label in columns.items() if label == 'sku final'), None)
        category_col = find_column(columns, {'department', 'dept final', 'kategori', 'category'})
        location_col = find_column(columns, {'store name'})
        if location_col is None:
            location_col = find_column(columns, {'location', 'lokasi'})
        if location_col is None:
            location_col = find_column(columns, {'store'})
        region_col = find_column(columns, {'region'})
        area_col = find_column(columns, {'area'})
        cost_col = find_column(columns, {'cost'})
        tax_col = find_column(columns, {'cost ppn'})
        raw_rows = list(book.rows(sheet))
        # These two formats have independent multi-row headers, not a single alias row.
        if layout == 'qsr_wide':
            header = 2 if column_name(sheet) == 'sales qsr' else 3
            product_col, sku_col = (2, 1) if header == 2 else (1, 0)
        if layout == 'flush_wide':
            header = 6
        issues, records, used, formula_refs = [], [], {}, set()
        excluded = CounterLike()
        all_periods = []
        unavailable_periods = []
        declared_period = profile['period_label']
        if kind == 'master':
            period = None
        elif layout in {'monthly_promotions', 'supplier_claim'}:
            month = options.get('month') or profile['month']
            period = period_for(year, month) if month else None
        elif layout == 'dated_event':
            dated = next((re.search(r'QTY SALES (\d{1,2}) ([A-Z]+)', v.upper()) for v in columns.values() if v.startswith('qty sales ')), None)
            if not dated or dated[2] not in MONTH_ALIASES:
                raise HTTPException(400, 'Tanggal event belum dapat dikenali.')
            try:
                day = date(year, MONTH_ALIASES[dated[2]], int(dated[1])).isoformat()
            except ValueError:
                raise HTTPException(400, 'Tanggal event tidak valid.')
            period = (day, day)
        elif layout == 'simple_recap':
            start, end = options.get('start'), options.get('end')
            # Period in another sheet is a suggestion only; never a fabricated transaction date.
            try:
                a, b = date.fromisoformat(start or ''), date.fromisoformat(end or '')
                if a > b or a.year != year or b.year != year or a.month != b.month:
                    raise ValueError()
            except ValueError:
                raise HTTPException(400, 'Isi rentang periode dalam satu bulan pada tahun laporan yang dipilih. Pisahkan rekap lintas bulan agar tren bulanan tetap tepat.')
            period = (a.isoformat(), b.isoformat())
        else:
            period = None
        if kind == 'supplier_claim' and not period:
            raise HTTPException(400, 'Pilih bulan rafaksi.')

        def value(cells, index, required=False):
            cell = cells.get(index, {})
            if cell.get('error') and not required and kind == 'master':
                excluded['optional_unavailable'] += 1
                return None
            if cell.get('error'):
                raise ValueError(f"Sel {cell.get('ref')}: sumber berisi error Excel.")
            if cell.get('formula'):
                formula_refs.add(cell['ref'])
            result = cell.get('value')
            if required and (result is None or text(result) == ''):
                raise ValueError(f"Nilai wajib belum tersedia pada kolom {(index + 1) if index is not None else '?' }.")
            return result

        def number(cells, index, required=True):
            raw = value(cells, index, required)
            if raw is None or text(raw) == '':
                return None
            try:
                result = Decimal(str(raw))
                if not result.is_finite() or result < 0 or result > Decimal('1e18'):
                    raise InvalidOperation()
            except (InvalidOperation, ValueError):
                raise ValueError(f"Sel {cells.get(index, {}).get('ref', '?')}: angka negatif atau tidak valid.")
            return result

        def add(record, key):
            comparable = {k: v for k, v in record.items() if k != 'source_row'}
            if key in used:
                if used[key] == comparable:
                    excluded['duplicate'] += 1
                else:
                    issues.append({'row': record['source_row'], 'message': 'Identitas produk/supplier, lokasi dan periode berulang dengan nilai berbeda. Pilih sumber yang tidak tumpang tindih; tidak ada baris digabung otomatis.'})
                return
            used[key] = comparable
            records.append(record)

        for n, cells in raw_rows:
            if n <= header:
                continue
            if len(records) > MAX_ROWS:
                raise HTTPException(400, 'Maksimal 20.000 baris hasil rekap per impor.')
            vals = row_values(cells)
            if not vals:
                continue
            if any(column_name(v) in {'grand total', 'total', 'subtotal', 'sub total'} for i, v in vals.items() if i < 5):
                excluded['total'] += 1
                continue
            if product_col is not None and column_name(vals.get(product_col, '')) in PRODUCT and column_name(vals.get(sku_col, '')) in SKU:
                excluded['heading'] += 1
                continue
            if kind != 'supplier_claim' and not text(vals.get(sku_col)) and not text(vals.get(product_col)):
                excluded['heading'] += 1
                continue
            try:
                if kind == 'supplier_claim':
                    supplier_col = find_column(columns, {'code supplier', 'supplier id', 'kode supplier'})
                    name_col = find_column(columns, {'supplier name', 'nama supplier'})
                    amount_col = find_column(columns, {'sum of rafaksi2', 'sum of rafraksi2', 'sum of rafaksi', 'sum of rafraksi', 'rafaksi', 'rafraksi'})
                    qty_col = find_column(columns, {'sum of sales qty promo', 'sales qty promo'})
                    code = text(value(cells, supplier_col, True))
                    if column_name(code) in {'code supplier', 'supplier id'}:
                        excluded['heading'] += 1
                        continue
                    amount = number(cells, amount_col)
                    if amount == 0:
                        excluded['zero'] += 1
                        continue
                    record = {'supplier_code': code, 'supplier_name': text(value(cells, name_col, True)),
                              'amount': str(amount), 'quantity': str(number(cells, qty_col, False)) if value(cells, qty_col) is not None else None,
                              'period_start': period[0], 'period_end': period[1], 'source_row': n}
                    add(record, (code, *period))
                    continue
                sku = text(value(cells, sku_col, True))
                product = text(value(cells, product_col, True))
                if len(product) > 150 or len(sku) > 100:
                    raise ValueError('Nama produk/SKU melewati batas yang didukung.')
                category = text(value(cells, category_col)) or None
                if kind == 'master':
                    upc_col = find_column(columns, {'upc', 'barcode'})
                    costs = {}
                    # Regional costs occur before the supplier/discount groups.
                    for index, label in columns.items():
                        if label in {'bali', 'lombok', 'makassar'} and 13 <= index <= 16:
                            try:
                                cost = number(cells, index, False)
                                costs[label] = str(cost) if cost is not None else None
                            except ValueError:
                                costs[label] = None
                    add({'sku': sku, 'upc': text(value(cells, upc_col)), 'product': product, 'category': category,
                         'regional_costs': costs, 'source_row': n}, (sku,))
                    continue
                location = text(value(cells, location_col))
                if not location:
                    location = ' / '.join(filter(None, [text(value(cells, region_col)), text(value(cells, area_col))]))
                if layout == 'flush_wide':
                    location = location or 'BALI'
                aggregate = layout in {'monthly_promotions', 'qsr_wide', 'flush_wide'}
                if layout == 'monthly_promotions':
                    # STORE describes a promotion's coverage, not necessarily the
                    # coverage of the repeated all-store monthly totals.
                    location = 'Semua toko (cakupan sumber)'
                location = location or 'Tidak dirinci'
                if len(location) > 150:
                    raise ValueError('Lokasi melewati batas yang didukung.')
                pairs = []
                if layout == 'monthly_promotions':
                    month_col = find_column(columns, {'bulan'})
                    month_name = text(value(cells, month_col)).upper()
                    m = MONTH_ALIASES.get(month_name) or options.get('month') or profile['month']
                    if not m:
                        raise ValueError('Bulan pada baris belum tersedia.')
                    if profile['month'] and m != profile['month']:
                        raise ValueError('Bulan baris berbeda dari sheet. Pilih sumber periode yang konsisten.')
                    pairs = [(find_column(columns, {'sales qty all store 1 bulan'}), find_column(columns, {'sales value all store 1 bulan'}), period_for(year, m))]
                elif layout == 'dated_event':
                    q = next((i for i, v in columns.items() if v.startswith('qty sales ')), None)
                    s = next((i for i, v in columns.items() if v.startswith('sales value ')), None)
                    pairs = [(q, s, period)]
                elif layout == 'simple_recap':
                    pairs = [(find_column(columns, {'qty sales', 'sales qty sales', 'quantity', 'jumlah'}), find_column(columns, {'sales value', 'sales value sales'}), period)]
                elif layout == 'flush_wide':
                    pairs = [(33 + m, 48 + m, period_for(year if m == 0 else year + 1, 12 if m == 0 else m)) for m in range(10)]
                elif layout == 'qsr_wide':
                    if header == 2:
                        pairs = [(q, s, period_for(year, m)) for m, q, s in [(1,3,13),(2,4,14),(3,5,15),(4,7,16),(5,8,17),(6,9,18),(7,10,19),(8,11,20)]]
                    else:
                        pairs = [(m + 1, m + 7, period_for(year, m)) for m in range(1, 7)]
                else:
                    raise ValueError('Struktur rekap belum didukung.')
                unit_cost = None
                chosen = None
                if basis in {'cost', 'tax_cost'}:
                    chosen = cost_col if basis == 'cost' else tax_col
                    if chosen is None:
                        raise ValueError('Kolom HPP pilihan tidak tersedia pada sheet ini. Pilih omzet saja atau sumber HPP yang sesuai.')
                    unit_cost = number(cells, chosen)
                elif basis == 'source':
                    raise ValueError('Pilih COST, COST+PPN, atau omzet saja. Dasar pajak harus dikonfirmasi.')
                for q, s, bounds in pairs:
                    q_raw, s_raw = value(cells, q), value(cells, s)
                    if (q_raw is None or text(q_raw) == '') and (s_raw is None or text(s_raw) == ''):
                        excluded['empty_period'] += 1
                        continue
                    # A zero unit count with no sales amount is an unavailable
                    # period, not a fabricated zero-valued sale. Expose exclusion.
                    if (text(q_raw) in {'0', '0.0', 'X', 'N/A', '-'} and (s_raw is None or text(s_raw).upper() in {'', 'X', 'N/A', '-'})):
                        excluded['unavailable_period'] += 1
                        if len(unavailable_periods) < 30:
                            unavailable_periods.append({'row': n, 'period_start': bounds[0], 'message': 'Periode tanpa penjualan terukur (jumlah nol atau penanda X/N/A dan nilai penjualan tidak tersedia); tidak diimpor.'})
                        continue
                    quantity, sales = number(cells, q), number(cells, s)
                    if quantity == 0 and sales == 0:
                        excluded['zero'] += 1
                        continue
                    if quantity <= 0 or quantity != quantity.to_integral_value() or quantity > 1000000:
                        raise ValueError('Jumlah harus bilangan bulat positif; nilai penjualan tidak boleh berdiri tanpa jumlah.')
                    record = {'sku': sku, 'product': product, 'category': category, 'location': location,
                              'aggregate_location': aggregate, 'quantity': int(quantity), 'sales_value': str(sales),
                              'total_hpp': str(quantity * unit_cost) if unit_cost is not None else None,
                              'unit_cost': str(unit_cost) if unit_cost is not None else None,
                              'cost_basis': basis, 'period_start': bounds[0], 'period_end': bounds[1], 'source_row': n}
                    add(record, (sku, column_name(location), *bounds))
                    all_periods.extend(bounds)
            except ValueError as error:
                issues.append({'row': n, 'message': str(error)})
        if not records:
            issues.append({'row': None, 'message': 'Tidak ada baris valid yang dapat disimpan.'})
        if len(records) > MAX_ROWS:
            issues.append({'row': None, 'message': 'Hasil melebihi 20.000 baris per impor. Pilih sheet periode lebih kecil.'})
        if formula_refs and not options.get('accept_cached'):
            issues.append({'row': None, 'message': 'Beberapa nilai memakai hasil rumus tersimpan Excel. Buka file di Excel, hitung ulang dan simpan, lalu setujui penggunaan hasil tersimpan pada pengaturan.'})
        comparable = sorted([{k:v for k,v in r.items() if k != 'source_row'} for r in records], key=lambda row: json.dumps(row, sort_keys=True))
        signature = sha256(json.dumps({'kind': kind, 'rows': comparable}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        payload = {'id': str(uuid5(NAMESPACE_URL, f'{owner}:source:{signature}')), 'kind': kind,
                   'source_name': filename[:255], 'sheet': sheet, 'fingerprint': signature, 'records': records,
                   'metadata': {'layout': layout, 'cost_basis': basis, 'year': year,
                                'period_start': min(all_periods) if all_periods else (period[0] if period else None),
                                'period_end': max(all_periods) if all_periods else (period[1] if period else None),
                                'cached_formula_count': len(formula_refs), 'excluded': dict(excluded)}}
        sales_total = sum((Decimal(r['sales_value']) for r in records if 'sales_value' in r), Decimal(0))
        complete_cost = kind == 'sales_recap' and all(r.get('total_hpp') is not None for r in records)
        hpp_total = sum((Decimal(r['total_hpp']) for r in records if r.get('total_hpp') is not None), Decimal(0)) if complete_cost else None
        view = {'kind': kind, 'label': LABELS[kind], 'sheet': sheet, 'count': len(records), 'can_import': bool(records and not issues),
                'unavailable_periods': unavailable_periods, 'sample': records[:10], 'issue_count': len(issues), 'issues': issues[:30], 'excluded': dict(excluded),
                'metadata': payload['metadata'], 'cached_formula_count': len(formula_refs), 'preview_signature': signature,
                'totals': {'sales': str(sales_total) if kind == 'sales_recap' else None, 'hpp': str(hpp_total) if hpp_total is not None else None,
                           'claim': str(sum((Decimal(r['amount']) for r in records if 'amount' in r), Decimal(0))) if kind == 'supplier_claim' else None},
                'notice': 'Preview belum disimpan. Master dan rafaksi tidak menambah omzet. Rekap disimpan dengan total sumber; HPP yang belum tersedia tidak dianggap nol. Pemilihan COST/COST+PPN menggunakan biaya referensi sheet, bukan audit biaya historis.'}
        return view, payload
    finally:
        book.close()


class CounterLike(dict):
    def __missing__(self, key):
        return 0


def period_for(year, month):
    if type(month) is not int or not 1 <= month <= 12:
        raise HTTPException(400, 'Bulan laporan tidak valid.')
    try:
        return date(year, month, 1).isoformat(), date(year, month, monthrange(year, month)[1]).isoformat()
    except ValueError:
        raise HTTPException(400, 'Tahun/bulan laporan tidak valid.')
