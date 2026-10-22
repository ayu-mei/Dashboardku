"""Read-only smart assistant. No model tools can mutate database records."""
import asyncio
import json
from collections import defaultdict, deque
from datetime import datetime, timezone
from time import monotonic
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.concurrency import run_in_threadpool
from app.models.records import Filters
from app.routes.dashboard import report_filters
from app.services.database import authenticated, all_records
from app.services.sources import source_datasets, recap_sales
from app.services.smart import evidence, generate, MODEL
from app.utils.config import settings

router = APIRouter(prefix='/api/smart', tags=['Smart Dashboard'])
_requests = defaultdict(deque)
_active = set()
_slots = asyncio.Semaphore(4)


class Ask(BaseModel):
    model_config = ConfigDict(extra='forbid')
    task: Literal['chat','summary','recommendations','report'] = 'chat'
    question: str = Field(default='', max_length=1500)


class ImportHelp(BaseModel):
    model_config = ConfigDict(extra='forbid')
    sheet: str = Field(max_length=100)
    kind: str = Field(max_length=50)
    columns: list[str] = Field(default_factory=list, max_length=100)
    issues: list[str] = Field(default_factory=list, max_length=30)
    can_import: bool = False
    message: str = Field(default='', max_length=1500)

    @field_validator('columns','issues')
    @classmethod
    def bounded_strings(cls, values):
        if any(len(v) > 500 for v in values): raise ValueError('Teks terlalu panjang')
        return values


async def load(token):
    sales, expenses, sources = await asyncio.gather(all_records(token,'refraksi_sales'), all_records(token,'refraksi_expenses'), source_datasets(token, all_records))
    datasets, ready = sources
    return sales + recap_sales(datasets), expenses, datasets, ready


def configured():
    config = settings()
    import re
    return bool(config.cloudflare_api_token and re.fullmatch(r'[a-fA-F0-9]{32}', config.cloudflare_account_id))


async def generate_until_disconnect(request, question, context, task):
    async def disconnected():
        while True:
            message = await request.receive()
            if message['type'] == 'http.disconnect':
                return

    generation = asyncio.create_task(generate(question, context, task))
    disconnect = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait(
            (generation, disconnect), return_when=asyncio.FIRST_COMPLETED
        )
        if disconnect in done:
            raise HTTPException(499, 'Permintaan AI dihentikan.')
        return await generation
    finally:
        for pending in (generation, disconnect):
            if not pending.done():
                pending.cancel()
        await asyncio.gather(generation, disconnect, return_exceptions=True)


async def limited_generate(token, question, context, task, request=None):
    owner = token.user_id
    now = monotonic()
    # Only request timestamps/IDs are stored; no business context or conversation.
    for key in list(_requests):
        while _requests[key] and now - _requests[key][0] >= 60:
            _requests[key].popleft()
        if not _requests[key]:
            del _requests[key]
    if owner in _active:
        raise HTTPException(429, 'Tunggu jawaban AI sebelumnya selesai.')
    if len(_requests[owner]) >= 8:
        raise HTTPException(429, 'Maksimal 8 permintaan AI per menit. Tunggu sebentar.')
    if len(_active) >= 4:
        raise HTTPException(429, 'AI sedang melayani permintaan lain. Coba sebentar lagi.')
    _requests[owner].append(now)
    _active.add(owner)
    try:
        async with _slots:
            if request is not None:
                return await generate_until_disconnect(request, question, context, task)
            return await generate(question, context, task)
    finally:
        _active.discard(owner)


@router.get('/overview')
async def overview(filters: Filters = Depends(report_filters), token=Depends(authenticated)):
    sales, expenses, datasets, ready = await load(token)
    context = await run_in_threadpool(evidence, sales, expenses, datasets, filters)
    return {**context, 'ai_configured':configured(), 'model':MODEL, 'source_storage_ready':ready,
            'generated_at':datetime.now(timezone.utc).isoformat()}


@router.post('/ask')
async def ask(body: Ask, request: Request, filters: Filters = Depends(report_filters), token=Depends(authenticated)):
    if body.task == 'chat' and not body.question.strip():
        raise HTTPException(422, 'Tulis pertanyaan terlebih dahulu.')
    sales, expenses, datasets, _ = await load(token)
    context = await run_in_threadpool(evidence, sales, expenses, datasets, filters)
    result = await limited_generate(token, body.question, context, body.task, request)
    return {**result, 'filters':filters.model_dump(mode='json'), 'metrics':context['metrics'],
            'generated_at':datetime.now(timezone.utc).isoformat(),
            'note':'Jawaban AI perlu diperiksa terhadap angka dashboard. Tidak ada data yang diubah.'}


@router.post('/import-help')
async def import_help(body: ImportHelp, request: Request, token=Depends(authenticated)):
    context = {'excel_review':body.model_dump(), 'scope':'Hanya metadata header dan masalah preview yang diberikan; tidak membaca file asli atau mengubah hasil validasi.'}
    return await limited_generate(token, '', context, 'import', request)
