from datetime import date
from decimal import Decimal
from io import BytesIO
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from openpyxl import Workbook
from app.main import app
from app.services.database import authenticated, AuthToken
from app.services.excel import inspect_excel
from app.services.excel_reports import prepare_report
from app.routes import uploads


def workbook(*, cost=2000, sales=20001, quantity=2, basis='tax', conflict=False, unsafe=False):
    wb = Workbook()
    wb.active.title = 'Summary'
    wb.active.append(['Ringkasan'])
    ws = wb.create_sheet('Detail Maret')
    ws.append(['Judul laporan'])
    ws.append(['Periode promo'])
    ws.append([])
    ws.append([])
    ws.append([])
    ws.append(['REGION', 'AREA', 'SKU_DESC', 'QTY SALES (3 MARET)', 'SALES VALUE (3 MARET)', 'COST', 'COST+PPN', 'MARGIN', 'MARGIN PROMO', 'REGULAR PRICE'])
    ref = 'G' if basis == 'tax' else 'F'
    ws.append(['Bali', 'Denpasar', 'Produk A', quantity, sales, cost, '=F7*1.11' if not unsafe else '=WEBSERVICE("https://example.invalid")', f'=1-{ref}7/J7', '=1-F7/J7' if conflict else f'=1-{ref}7/J7', 15000])
    ws.append(['Bali', 'Ubud', 'Produk B', 0, 0, cost, '=F8*1.11', '=1-G8/J8', '=1-G8/J8', 15000])
    ws.append(['TOTAL', None, None, '=SUM(D7:D8)', '=SUM(E7:E8)'])
    out = BytesIO()
    wb.save(out)
    wb.close()
    return out.getvalue()


def test_report_detects_actual_columns_and_preserves_totals_and_year():
    content = workbook()
    assert inspect_excel(content)['sheet'] == ''
    profile = inspect_excel(content, 'Detail Maret')
    assert profile['header_row'] == 6
    assert profile['report']['period_label'] == '3 Maret'
    preview, records = prepare_report(content, 'Detail Maret', 2026, 'user-a')
    assert preview['can_import'] is True
    assert preview['date'] == '2026-03-03'
    assert preview['count'] == 1
    assert preview['excluded_zero_rows'] == 1
    assert preview['excluded_total_rows'] == 1
    assert preview['cost_basis'] == {'COST+PPN': 1}
    assert preview['totals'] == {'sales': '20001', 'hpp': '4440.00', 'gross': '15561.00'}
    assert records[0]['price'] == '10000.50'
    assert records[0]['unit_cost'] == '2220.00'
    assert records[0]['location'] == 'Bali / Denpasar'
    assert Decimal(records[0]['price']) * records[0]['quantity'] == Decimal(preview['totals']['sales'])
    assert prepare_report(content, 'Detail Maret', 2026, 'user-a')[1][0]['id'] == records[0]['id']
    assert prepare_report(content, 'Detail Maret', 2025, 'user-a')[1][0]['id'] != records[0]['id']
    assert prepare_report(content, 'Detail Maret', 2026, 'user-b')[1][0]['id'] != records[0]['id']


def test_report_follows_cost_formula_instead_of_assuming_tax_basis():
    view, rows = prepare_report(workbook(basis='cost'), 'Detail Maret', 2026)
    assert view['can_import'] is True
    assert view['cost_basis'] == {'COST': 1}
    assert rows[0]['unit_cost'] == '2000'


@pytest.mark.parametrize('options, message', [
    ({'cost': 1.23}, 'HPP sumber memiliki lebih dari dua desimal'),
    ({'sales': 100, 'quantity': 3}, 'Total penjualan tidak dapat diwakili'),
    ({'conflict': True}, 'Dasar HPP pada rumus margin belum jelas'),
    ({'unsafe': True}, 'Rumus HPP belum dapat diperiksa'),
    ({'quantity': 0}, 'Jumlah unit harus bilangan bulat positif'),
    ({'quantity': True}, 'Nilai angka aktual belum tersedia'),
])
def test_report_blocks_precision_loss_unsafe_formulas_and_invalid_data(options, message):
    view, rows = prepare_report(workbook(**options), 'Detail Maret', 2026)
    assert view['can_import'] is False
    assert any(message in issue['message'] for issue in view['issues'])
    if options.get('quantity') in [0, True]:
        assert view['totals']['sales'] is None


def test_report_cannot_treat_summary_or_non_workbook_as_detail():
    for content, sheet in [(workbook(), 'Summary'), (b'bad', 'Detail Maret')]:
        with pytest.raises(HTTPException):
            prepare_report(content, sheet, 2026)


def test_report_http_preview_never_writes_commit_revalidates_everything(monkeypatch):
    token = AuthToken('test')
    token.user_id = 'report-user'
    calls = []
    stored = set()
    async def database(*args, **kwargs):
        if args[1] == 'GET':
            query = kwargs['params']['id']
            return [{'id': id} for id in query[4:-1].split(',') if id in stored]
        calls.append(kwargs['body'])
        stored.update(row['id'] for row in kwargs['body'])
        return []
    app.dependency_overrides[authenticated] = lambda: token
    monkeypatch.setattr(uploads, 'database', database)
    try:
        with TestClient(app) as client:
            files = {'file': ('report.xlsx', workbook())}
            data = {'sheet': 'Detail Maret', 'year': 2026}
            response = client.post('/api/import/report/preview', files=files, data={**data, 'confirm': 'true'})
            assert response.status_code == 200
            assert response.json()['can_import'] is True
            assert calls == []
            assert client.post('/api/import/report/commit', files=files, data=data).status_code == 400
            bad = {'file': ('report.xlsx', workbook(sales=100, quantity=3))}
            assert client.post('/api/import/report/commit', files=bad, data={**data, 'confirm': 'true'}).status_code == 400
            assert calls == []
            result = client.post('/api/import/report/commit', files=files, data={**data, 'confirm': 'true'})
            assert result.json() == {'imported': 1}
            assert len(calls) == 1
            assert calls[0][0]['date'] == '2026-03-03'
            duplicate = client.post('/api/import/report/preview', files=files, data=data)
            assert duplicate.json()['already_imported'] is True
            assert duplicate.json()['can_import'] is False
            assert client.post('/api/import/report/commit', files=files, data={**data, 'confirm': 'true'}).status_code == 409
            assert len(calls) == 1
    finally:
        app.dependency_overrides.clear()
