from datetime import date
from decimal import Decimal
from app.models.records import Filters
from app.services.analysis import analyse, period_bounds, previous_bounds


def sale(day, product='Lensa', price='100', cost='60', qty=1, location='Bali'):
    return dict(date=day, product=product, price=price, unit_cost=cost,
                quantity=qty, location=location, category='Optik')


def test_month_and_year_comparison_use_calendar_periods():
    filters = Filters(year=2026, month=3)
    assert previous_bounds(filters, period_bounds(filters)) == (date(2026, 2, 1), date(2026, 2, 28))
    result = analyse([sale('2026-02-01'), sale('2026-03-02', price='150')], [], filters)
    assert Decimal(result['comparisons']['sales']['growth']) == 50
    assert Decimal(result['comparisons']['gross']['growth']) == 125
    assert result['previous_period'] == dict(start='2026-02-01', end='2026-02-28')
    filters = Filters(year=2024)
    assert previous_bounds(filters, period_bounds(filters)) == (date(2023, 1, 1), date(2023, 12, 31))
    filters = Filters(year=2026, month=1)
    assert previous_bounds(filters, period_bounds(filters)) == (date(2025, 12, 1), date(2025, 12, 31))


def test_custom_range_and_intersecting_filters():
    filters = Filters(start=date(2024, 3, 1), end=date(2024, 3, 10))
    assert previous_bounds(filters, period_bounds(filters)) == (date(2024, 2, 20), date(2024, 2, 29))
    filters = Filters(year=2026, month=2, start=date(2026, 2, 10), end=date(2026, 3, 4))
    assert period_bounds(filters) == (date(2026, 2, 10), date(2026, 2, 28))
    assert period_bounds(Filters(month=2)) is None
    assert period_bounds(Filters()) is None
    assert previous_bounds(Filters(year=1), period_bounds(Filters(year=1))) is None


def test_product_profitability_weighted_margin_ranking_and_filters():
    rows = [sale('2026-03-01', 'Omzet tinggi', '1000', '990'),
            sale('2026-03-01', 'Profit tinggi', '500', '100'),
            sale('2026-03-02', 'Profit tinggi', '100', '80', qty=2),
            sale('2026-03-01', 'Rugi', '100', '200'),
            sale('2026-03-01', 'Luar filter', '9999', '1', location='Jakarta')]
    result = analyse(rows, [], Filters(year=2026, month=3, location='Bali'))
    assert result['leaders']['sales']['product'] == 'Omzet tinggi'
    assert result['leaders']['gross']['product'] == 'Profit tinggi'
    assert Decimal(result['leaders']['gross']['gross']) == 440
    assert Decimal(result['leaders']['gross']['margin']) == Decimal(440) / 700 * 100
    assert result['ranking']['bottom'][0]['product'] == 'Rugi'
    assert not ({p['product'] for p in result['ranking']['top']} & {p['product'] for p in result['ranking']['bottom']})
    assert all(p['product'] != 'Luar filter' for p in result['products'])
    assert abs(sum(Decimal(p['contribution']) for p in result['products']) - 100) < Decimal('.00001')
    assert analyse(rows, [], Filters(year=2026, month=2))['has_sales'] is False


def test_no_fabricated_growth_for_missing_zero_or_negative_baselines():
    rows = [sale('2026-03-01')]
    assert analyse(rows, [], Filters(year=2026, month=3))['comparisons']['sales']['growth'] is None
    rows.append(sale('2026-02-01', price='0', cost='100'))
    result = analyse(rows, [], Filters(year=2026, month=3))
    assert result['comparisons']['sales']['growth'] is None
    assert result['comparisons']['gross']['growth'] is None
    assert result['comparisons']['gross']['change'] == '140'
    result = analyse([sale('2026-03-01', price='0', cost='0')], [], Filters(year=2026))
    assert result['leaders']['margin'] is None
    assert result['products'][0]['contribution'] is None
