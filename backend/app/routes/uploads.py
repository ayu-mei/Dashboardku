import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from app.services.database import authenticated, database
from app.services.excel import inspect_excel, normalize_excel
from app.services.excel_reports import prepare_report
from app.utils.config import settings
from app.models.records import SourceImportOptions

router = APIRouter(prefix="/api/import")


async def content_of(file):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            400, "Pilih file Excel .xlsx, bukan .xls, CSV, atau file lain."
        )
    content = await file.read(settings().max_upload_bytes + 1)
    await file.close()
    if not content or len(content) > settings().max_upload_bytes:
        raise HTTPException(400, f"File kosong atau melebihi batas {settings().max_upload_bytes // (1024 * 1024)} MB.")
    return content


@router.post("/inspect")
async def inspect(
    file: UploadFile = File(...),
    sheet: str = Form(""),
    header_row: int | None = Form(None, ge=1, le=50),
    token=Depends(authenticated),
):
    return await run_in_threadpool(
        inspect_excel, await content_of(file), sheet or None, header_row
    )


@router.post("/preview")
@router.post("/commit")
async def process(
    request: Request,
    file: UploadFile = File(...),
    sheet: str = Form(...),
    header_row: int = Form(..., ge=1, le=50),
    mapping: str = Form(...),
    confirm: bool = Form(False),
    token=Depends(authenticated),
):
    try:
        columns = json.loads(mapping)
    except json.JSONDecodeError:
        raise HTTPException(400, "Pemetaan kolom tidak valid.")
    records = await run_in_threadpool(
        normalize_excel,
        await content_of(file),
        sheet,
        header_row,
        columns,
        token.user_id,
    )
    if confirm and request.url.path.endswith("/commit"):
        # Single database request: all rows commit atomically or none do. Stable IDs prevent exact file reimports.
        await database(token, "POST", "refraksi_sales", body=records)
        return {"imported": len(records)}
    return {
        "count": len(records),
        "sample": records[:5],
        "notice": "Pratinjau belum disimpan. Konfirmasikan bahwa ini detail transaksi dan belum pernah diimpor. File identik dengan pemetaan identik akan ditolak saat diimpor ulang.",
    }


@router.post("/report/preview")
@router.post("/report/commit")
async def process_report(
    request: Request,
    file: UploadFile = File(...),
    sheet: str = Form(...),
    year: int = Form(..., ge=1, le=9999),
    confirm: bool = Form(False),
    token=Depends(authenticated),
):
    committing = request.url.path.endswith("/commit")
    if committing and not confirm:
        raise HTTPException(400, "Periksa preview dan konfirmasikan impor terlebih dahulu.")
    view, records = await run_in_threadpool(
        prepare_report, await content_of(file), sheet, year, token.user_id
    )
    if view["can_import"]:
        # Stable IDs identify this owner/file/sheet/year. Probe both ends instead
        # of fetching all transactions or issuing hundreds of lookup requests.
        ids = sorted({records[0]["id"], records[-1]["id"]})
        existing = await database(token, "GET", "refraksi_sales", params={
            "select": "id", "id": "in.(" + ",".join(ids) + ")",
        })
        if existing:
            message = "Sebagian atau seluruh laporan ini sudah tersimpan. Periksa Data Penjualan; file, sheet, dan tahun yang sama tidak perlu diimpor ulang."
            if committing:
                raise HTTPException(409, message)
            view.update(can_import=False, already_imported=True,
                        issue_count=view["issue_count"] + 1,
                        issues=[{"row": None, "message": message}] + view["issues"])
    if committing:
        if not view["can_import"]:
            raise HTTPException(400, "Laporan belum dapat disimpan tanpa mengubah nilai sumber. Periksa keterangan pada preview.")
        # The database primary key remains the final atomic guard, including
        # overlapping imports after a row was deleted or concurrent requests.
        await database(token, "POST", "refraksi_sales", body=records)
        return {"imported": len(records)}
    return view


@router.post("/sources/inspect")
async def inspect_source_file(file: UploadFile = File(...), sheet: str = Form(""), token=Depends(authenticated)):
    from app.services.source_excel import inspect_sources
    return await run_in_threadpool(inspect_sources, await content_of(file), sheet)


@router.post("/sources/preview")
@router.post("/sources/commit")
async def process_source_file(request: Request, file: UploadFile = File(...), sheet: str = Form(...),
                              options: str = Form("{}"), confirm: bool = Form(False),
                              preview_signature: str = Form(""), token=Depends(authenticated)):
    from app.services.source_excel import prepare_source
    from app.services.sources import check_source_overlap
    try:
        parsed = json.loads(options)
        settings = SourceImportOptions.model_validate(parsed).model_dump(mode="json")
    except (ValueError, TypeError):
        raise HTTPException(400, "Pengaturan impor tidak valid.")
    filename = file.filename or 'sumber.xlsx'
    view, payload = await run_in_threadpool(prepare_source, await content_of(file), sheet, settings, token.user_id, filename)
    message, ready = await check_source_overlap(token, payload)
    view['storage_ready'] = ready
    if message:
        view['issues'].append({'row': None, 'message': message})
        view['issue_count'] += 1
        view['can_import'] = False
    if request.url.path.endswith('/commit'):
        if not confirm or not preview_signature or preview_signature != view['preview_signature']:
            raise HTTPException(400, 'Periksa preview terbaru dan konfirmasikan sebelum menyimpan.')
        if not view['can_import']:
            raise HTTPException(400, 'Data belum dapat disimpan. Periksa seluruh keterangan preview.')
        await database(token, 'POST', 'refraksi_sources', body=payload)
        return {'imported': view['count'], 'kind': payload['kind']}
    return view
