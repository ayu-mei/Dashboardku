"""Read-only analysis using the same records, filters and Decimal math as reports."""
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from app.models.records import Filters
from app.services.finance import report, decimal


def period_bounds(filters):
    start = date(filters.year, 1, 1) if filters.year else None
    end = date(filters.year, 12, 31) if filters.year else None
    if filters.year and filters.month:
        start = date(filters.year, filters.month, 1)
        end = date(filters.year, filters.month, monthrange(filters.year, filters.month)[1])
    if filters.start:
        start = max(start, filters.start) if start else filters.start
    if filters.end:
        end = min(end, filters.end) if end else filters.end
    # A month without a year can span disjoint years: no single previous period.
    if not start or not end or end < start or (filters.month and not filters.year):
        return None
    return start, end


def previous_bounds(filters, bounds):
    start, end = bounds
    if start == date.min:
        return None
    if not filters.start and not filters.end and filters.year:
        if filters.month:
            last = start - timedelta(days=1)
            return last.replace(day=1), last
        if filters.year == 1:
            return None
        return date(filters.year - 1, 1, 1), date(filters.year - 1, 12, 31)
    days = (end - start).days + 1
    previous_end = start - timedelta(days=1)
    if (previous_end - date.min).days + 1 < days:
        return None
    return previous_end - timedelta(days=days - 1), previous_end


def analyse(sales, expenses, filters):
    current = report(sales, expenses, filters)
    bounds = period_bounds(filters)
    before = previous_bounds(filters, bounds) if bounds else None
    previous = None
    if before:
        previous = report(sales, expenses, Filters(
            start=before[0], end=before[1], product=filters.product,
            category=filters.category, location=filters.location,
        ))
    comparisons = {}
    for key in ('sales', 'gross', 'operational'):
        value = decimal(current['metrics'][key])
        relevant_rows = 'expenses' if key == 'operational' else 'sales'
        available = previous is not None and bool(previous[relevant_rows])
        prior = decimal(previous['metrics'][key]) if available else None
        delta = value - prior if prior is not None else None
        # Negative/zero profit baselines don't yield a meaningful growth percentage.
        growth = delta / prior * 100 if prior is not None and prior > 0 else None
        comparisons[key] = {
            'current': str(value), 'previous': str(prior) if prior is not None else None,
            'change': str(delta) if delta is not None else None,
            'growth': str(growth) if growth is not None else None,
        }
    grouped = defaultdict(lambda: {'sales': Decimal(0), 'hpp': Decimal(0)})
    for row in current['sales']:
        grouped[row['product']]['sales'] += decimal(row['sales_value'])
        grouped[row['product']]['hpp'] += decimal(row['total_hpp'])
    total = decimal(current['metrics']['sales'])
    products = []
    for name, values in grouped.items():
        gross = values['sales'] - values['hpp']
        products.append({
            'product': name, 'sales': str(values['sales']), 'hpp': str(values['hpp']),
            'gross': str(gross),
            'margin': str(gross / values['sales'] * 100) if values['sales'] else None,
            'contribution': str(values['sales'] / total * 100) if total else None,
        })
    products.sort(key=lambda p: (-decimal(p['sales']), p['product']))
    ranked = sorted(products, key=lambda p: (-decimal(p['gross']), p['product']))
    top_count = min(3, (len(ranked) + 1) // 2)
    best_margin = sorted((p for p in products if p['margin'] is not None),
                         key=lambda p: (-decimal(p['margin']), -decimal(p['gross']), p['product']))
    return {
        'has_sales': bool(current['sales']),
        'period': {'start': str(bounds[0]), 'end': str(bounds[1])} if bounds else None,
        'previous_period': {'start': str(before[0]), 'end': str(before[1])} if before else None,
        'comparison_note': (
            'Pembanding memakai periode kalender sebelumnya; rentang tanggal khusus memakai durasi yang sama. Persentase tidak dihitung jika nilai pembanding nol/negatif atau tidak ada transaksi.'
            if before else 'Pilih satu tahun/bulan atau rentang tanggal lengkap untuk membandingkan periode.'
        ),
        'comparisons': comparisons, 'products': products,
        'leaders': {'sales': products[0] if products else None,
                    'gross': ranked[0] if ranked else None,
                    'margin': best_margin[0] if best_margin else None},
        'ranking': {'top': ranked[:top_count],
                    'bottom': sorted(ranked[top_count:], key=lambda p: (decimal(p['gross']), p['product']))[:3]},
        'timeline': current['timeline'],
        'previous_timeline': previous['timeline'] if previous else [],
        'options': current['options'], 'years': current['years'],
        'note': 'Profitabilitas produk memakai gross profit sebelum biaya operasional. Biaya belum dialokasikan per produk/kategori/lokasi.',
    }
