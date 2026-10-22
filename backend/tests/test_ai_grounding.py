from types import SimpleNamespace
import pytest
from app.services.ai_grounding import facts_for, render_answer


def test_exact_money_percent_and_period_are_rendered_by_server():
    facts = facts_for({'metrics': {'sales': '350', 'gross_margin': '65.7142857', 'hpp': None},
                       'timeline': [{'month': '2026-09', 'sales': '0'}]})
    assert facts['metrics.sales'] == 'Rp350'
    assert facts['metrics.gross_margin'] == '65,71%'
    assert 'metrics.hpp' not in facts
    assert facts['timeline.0.month'] == 'September 2026'
    assert render_answer('Penjualan [[metrics.sales]].', facts) == 'Penjualan Rp350.'
    assert facts['timeline.0.sales'] == 'Rp0'


@pytest.mark.parametrize('answer', ['Penjualan Rp350 juta.', '[[metrics.sales]] juta',
                                    'Rp [[metrics.sales]]', '[[metrics.missing]]',
                                    'Penjualan [[metrics.sales', 'Turun 25%.'])
def test_unverified_numbers_and_currency_rescaling_are_rejected(answer):
    with pytest.raises(ValueError):
        render_answer(answer, {'metrics.sales': 'Rp350'})


@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.mark.anyio
@pytest.mark.parametrize('first', [
    '{"scope":"dashboard","answer":',
    {'scope':'dashboard','answer':'Penjualan Rp350 juta.'},
    {'scope':'dashboard','answer':'Penjualan [[metrics.sales]] juta.'},
    {'answer':'missing scope'},
])
async def test_invalid_answer_retries_until_success_and_never_returns_bad_draft(monkeypatch, first):
    from app.services import smart
    replies = [first, first, {'scope':'dashboard','answer':'Penjualan [[metrics.sales]].'}]
    calls = []
    class Response:
        status_code = 200
        def json(self):
            return {'success':True, 'result':{'response': replies.pop(0)}}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            calls.append(1)
            return Response()
    monkeypatch.setattr(smart, 'settings', lambda: SimpleNamespace(cloudflare_api_token='test',cloudflare_account_id='a'*32))
    monkeypatch.setattr(smart.httpx, 'AsyncClient', Client)
    result = await smart.generate('Jelaskan', {'metrics':{'sales':'350'}})
    assert result['answer'] == 'Penjualan Rp350.'
    assert result['suggested_filters'] is None
    assert len(calls) == 3


def test_exact_literal_date_and_percentage_are_allowed_without_rescaling():
    facts = facts_for({'filters': {'year': 2026}, 'metrics': {'sales': '350', 'gross_margin': '25'}})
    assert render_answer('Pada 2026, penjualan Rp350 dengan margin 25%.', facts) == 'Pada 2026, penjualan Rp350 dengan margin 25%.'
    with pytest.raises(ValueError):
        render_answer('Pada 2027 penjualan Rp350 juta.', facts)


def test_alternative_reference_syntax_keeps_exact_numeric_value():
    assert render_answer('Margin {{metrics.gross_margin}}%.', {'metrics.gross_margin':'25%'}) == 'Margin 25%.'
    with pytest.raises(ValueError):
        render_answer('Rp350 juta', {'metrics.sales':'Rp350'})


@pytest.mark.anyio
async def test_cancel_while_retrying_stops_further_provider_calls(monkeypatch):
    import asyncio
    from app.services import smart
    called = asyncio.Event()
    calls = []
    class Response:
        status_code = 200
        def json(self): return {'result':{'response':'invalid json'}}
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, *args, **kwargs):
            calls.append(1)
            called.set()
            return Response()
    monkeypatch.setattr(smart, 'settings', lambda: SimpleNamespace(cloudflare_api_token='test',cloudflare_account_id='a'*32))
    monkeypatch.setattr(smart.httpx, 'AsyncClient', Client)
    pending = asyncio.create_task(smart.generate('Jelaskan', {}))
    await called.wait()
    pending.cancel()
    with pytest.raises(asyncio.CancelledError):
        await pending
    assert len(calls) == 1


def test_period_rendering_does_not_repeat_month_and_preserves_table():
    facts = {'timeline.0.month':'Agustus 2026','timeline.0.sales':'Rp100'}
    answer = '| Periode | Penjualan |\n| --- | ---: |\n| Agustus [[timeline.0.month]] | [[timeline.0.sales]] |'
    rendered = render_answer(answer, facts)
    assert '| Agustus 2026 | Rp100 |' in rendered
    assert 'Agustus Agustus' not in rendered
    assert '| --- | ---: |' in rendered
