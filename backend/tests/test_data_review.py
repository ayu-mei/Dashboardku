from app.services.data_review import review_records
from app.services.smart import evidence
from app.models.records import Filters


def record(**updates):
    return {'date':'2026-09-01','product':'Produk uji','customer':'PRIVATE CUSTOMER',
            'user_id':'private-owner','id':'internal-record','quantity':1,'price':'100',
            'unit_cost':'60','sales_value':'100','total_hpp':'60', **updates}


def test_review_distinguishes_indications_and_does_not_leak_identity():
    result = review_records([record(), record(), record(product='Diskon', sales_value='40'),
                             record(product='Rekap', is_recap=True, total_hpp=None)])
    assert result['finding_counts'] == {'possible_duplicate':1, 'sales_below_hpp':1, 'hpp_missing':1}
    assert result['checked_rows'] == 4
    assert len(result['samples']) == 3
    assert 'PRIVATE CUSTOMER' not in str(result)
    assert 'private-owner' not in str(result)
    assert 'internal-record' not in str(result)
    assert 'bukan kepastian' in result['interpretation']['possible_duplicate']


def test_review_only_receives_active_filter_records():
    data = evidence([record(date='2026-08-01', price='40'), record()], [], [], Filters(year=2026,month=9))
    assert data['data_review']['checked_rows'] == 1
    assert data['data_review']['finding_counts'] == {}


def test_samples_are_bounded_but_all_findings_are_counted():
    rows = [record(product=f'Produk {i}', sales_value='40') for i in range(30)]
    result = review_records(rows, sample_limit=3)
    assert result['finding_counts']['sales_below_hpp'] == 30
    assert len(result['samples']) == 3
    assert result['samples_truncated'] is True


def test_different_customers_are_not_duplicates_and_input_stays_unchanged():
    rows = [record(), record(customer='different')]
    before = [row.copy() for row in rows]
    assert review_records(rows)['finding_counts'] == {}
    assert rows == before


def test_free_and_zero_quantity_records_are_indications_not_auto_corrections():
    result = review_records([record(quantity=0, price='0', sales_value='0',total_hpp='0')])
    assert result['finding_counts'] == {'zero_quantity':1,'zero_price':1}
    assert result['samples'][0]['sales'] == '0'


import pytest

@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.mark.anyio
@pytest.mark.parametrize('supported', [True, False])
async def test_semantic_review_rejects_unsupported_conclusions(supported):
    from app.services.smart import review_answer
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {'result':{'response':{'supported':supported,'feedback':'Kelengkapan belum terbukti.'}}}
    class Client:
        async def post(self, *args, **kwargs):
            assert kwargs['json']['response_format']['json_schema']['required'] == ['supported','feedback']
            return Response()
    if supported:
        await review_answer(Client(), 'https://example.test', 'test', 'Periksa data', {}, 'Ada indikasi yang perlu diperiksa.')
    else:
        with pytest.raises(ValueError, match='Kelengkapan belum terbukti'):
            await review_answer(Client(), 'https://example.test', 'test', 'Periksa data', {}, 'Semua data benar dan lengkap.')


@pytest.mark.anyio
async def test_unsupported_draft_is_repaired_before_it_reaches_user(monkeypatch):
    from types import SimpleNamespace
    from app.services import smart
    replies = [
        {'scope':'dashboard','answer':'Semua data benar dan lengkap.'},
        {'supported':False,'feedback':'Jangan mengklaim kelengkapan seluruh data.'},
        {'scope':'dashboard','answer':'Ada indikasi transaksi yang tampak sama; cocokkan dengan sumber sebelum mengubahnya.'},
        {'supported':True,'feedback':''},
    ]
    class Response:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {'result':{'response':replies.pop(0)}}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs): return Response()
    monkeypatch.setattr(smart, 'settings', lambda: SimpleNamespace(cloudflare_api_token='test',cloudflare_account_id='a'*32))
    monkeypatch.setattr(smart.httpx, 'AsyncClient', Client)
    answer = await smart.generate('Periksa data', {'data_review':{'finding_counts':{'possible_duplicate':1}}})
    assert 'Semua data benar' not in answer['answer']
    assert 'cocokkan dengan sumber' in answer['answer']
    assert replies == []
