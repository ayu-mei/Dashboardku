import json
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from starlette.concurrency import run_in_threadpool
from app.services.database import authenticated, database
from app.services.excel import inspect_excel, normalize_excel
from app.utils.config import settings

router = APIRouter(prefix="/api/import")


async def content_of(file):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            400, "Pilih file Excel .xlsx, bukan .xls, CSV, atau file lain."
        )
    content = await file.read(settings().max_upload_bytes + 1)
    await file.close()
    if not content or len(content) > settings().max_upload_bytes:
        raise HTTPException(400, "File kosong atau melebihi batas 15 MB.")
    return content


@router.post("/inspect")
async def inspect(
    file: UploadFile = File(...),
    sheet: str = Form(""),
    header_row: int = Form(1, ge=1, le=50),
    token=Depends(authenticated),
):
    return await run_in_threadpool(
        inspect_excel, await content_of(file), sheet or None, header_row
    )


@router.post("/preview")
@router.post("/commit")
async def process(
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
    if confirm:
        # Single database request: all rows commit atomically or none do. Stable IDs prevent exact file reimports.
        await database(token, "POST", "refraksi_sales", body=records)
        return {"imported": len(records)}
    return {
        "count": len(records),
        "sample": records[:5],
        "notice": "Pratinjau belum disimpan. Konfirmasikan bahwa ini detail transaksi dan belum pernah diimpor. File identik dengan pemetaan identik akan ditolak saat diimpor ulang.",
    }
