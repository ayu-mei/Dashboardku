from asyncio import gather
from uuid import UUID
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from app.models.records import Sale, Expense, Filters
from app.services.database import authenticated, database, all_records
from app.services.finance import report
from app.services.analysis import analyse
from app.services.excel import export_excel

router = APIRouter(prefix="/api")


def report_filters(
    year: int | None = Query(None, ge=1, le=9999),
    month: int | None = Query(None, ge=1, le=12),
    start: date | None = None,
    end: date | None = None,
    product: str = "",
    category: str = "",
    location: str = "",
):
    try:
        return Filters(
            year=year,
            month=month,
            start=start,
            end=end,
            product=product,
            category=category,
            location=location,
        )
    except ValidationError:
        raise HTTPException(
            400,
            "Rentang tanggal tidak valid. Tanggal akhir harus setelah tanggal awal.",
        )


async def get_report(filters, token, calculator=report):
    sales, expenses = await gather(
        all_records(token, "refraksi_sales"), all_records(token, "refraksi_expenses")
    )
    return await run_in_threadpool(calculator, sales, expenses, filters)


@router.get("/dashboard")
async def dashboard(
    filters: Filters = Depends(report_filters), token=Depends(authenticated)
):
    return await get_report(filters, token)


@router.get("/analysis")
async def analysis(
    filters: Filters = Depends(report_filters), token=Depends(authenticated)
):
    return await get_report(filters, token, analyse)


@router.get("/export")
async def download(
    filters: Filters = Depends(report_filters), token=Depends(authenticated)
):
    data = await get_report(filters, token)
    content = await run_in_threadpool(export_excel, data)
    return StreamingResponse(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="refraksi.xlsx"',
            "Cache-Control": "no-store",
        },
    )


@router.post("/sales")
async def add_sale(record: Sale, token=Depends(authenticated)):
    return await database(
        token, "POST", "refraksi_sales", body=record.model_dump(mode="json")
    )


@router.post("/expenses")
async def add_expense(record: Expense, token=Depends(authenticated)):
    return await database(
        token, "POST", "refraksi_expenses", body=record.model_dump(mode="json")
    )


@router.put("/sales/{record_id}")
async def edit_sale(record_id: UUID, record: Sale, token=Depends(authenticated)):
    rows = await database(
        token,
        "PATCH",
        "refraksi_sales",
        params={"id": "eq." + str(record_id)},
        body=record.model_dump(mode="json"),
    )
    if not rows:
        raise HTTPException(404, "Transaksi tidak ditemukan atau tidak diizinkan.")
    return rows


@router.put("/expenses/{record_id}")
async def edit_expense(record_id: UUID, record: Expense, token=Depends(authenticated)):
    rows = await database(
        token,
        "PATCH",
        "refraksi_expenses",
        params={"id": "eq." + str(record_id)},
        body=record.model_dump(mode="json"),
    )
    if not rows:
        raise HTTPException(404, "Biaya tidak ditemukan atau tidak diizinkan.")
    return rows


@router.delete("/{kind}/{record_id}")
async def delete_record(kind: str, record_id: UUID, token=Depends(authenticated)):
    if kind not in ("sales", "expenses"):
        raise HTTPException(404, "Rute tidak ditemukan.")
    rows = await database(
        token, "DELETE", "refraksi_" + kind, params={"id": "eq." + str(record_id)}
    )
    if not rows:
        raise HTTPException(404, "Data tidak ditemukan atau tidak diizinkan.")
    return {"ok": True}
