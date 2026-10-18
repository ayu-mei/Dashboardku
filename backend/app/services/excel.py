from datetime import datetime, date
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile, BadZipFile
from uuid import uuid5, NAMESPACE_URL
import hashlib
import json
import pandas as pd
from openpyxl import load_workbook, Workbook
from fastapi import HTTPException
from app.models.records import Sale

MAX_ROWS = 20000


def checked_workbook(content):
    try:
        with ZipFile(BytesIO(content)) as archive:
            if sum(info.file_size for info in archive.infolist()) > 100 * 1024 * 1024:
                raise HTTPException(
                    400, "Isi Excel terlalu besar setelah dibuka, maksimal 100 MB."
                )
            if any(
                "vbaproject" in info.filename.lower() for info in archive.infolist()
            ):
                raise HTTPException(400, "Excel dengan macro tidak diterima.")
        return load_workbook(
            BytesIO(content), read_only=True, data_only=False, keep_links=False
        )
    except (BadZipFile, KeyError, ValueError, OSError):
        raise HTTPException(
            400, "File bukan Excel .xlsx yang valid atau file kosong/rusak."
        )


def inspect_excel(content, sheet=None, header_row=1):
    wb = checked_workbook(content)
    try:
        if sheet and sheet not in wb.sheetnames:
            raise HTTPException(400, "Sheet tidak ditemukan.")
        ws = wb[sheet or wb.sheetnames[0]]
        rows = list(
            ws.iter_rows(min_row=header_row, max_row=header_row + 5, values_only=True)
        )
        header = (
            [str(v).strip() if v is not None else "" for v in rows[0]] if rows else []
        )
        columns = [
            {"index": i, "name": value} for i, value in enumerate(header) if value
        ]
        return {
            "sheets": wb.sheetnames,
            "sheet": ws.title,
            "header_row": header_row,
            "columns": columns,
            "sample": [
                [str(v) if v is not None else "" for v in row] for row in rows[1:]
            ],
            "warning": "Pilih sheet detail, bukan subtotal/pivot. Tanggal, produk, jumlah, harga jual aktual per unit, dan HPP per unit wajib tersedia. SALES_VALUE adalah total, bukan harga satuan. COST dan COST+PPN tidak boleh dijumlahkan.",
        }
    finally:
        wb.close()


def normalize_excel(content, sheet, header_row, mapping, owner="local"):
    required = ["date", "product", "quantity", "price", "unit_cost"]
    if not isinstance(mapping, dict) or any(
        mapping.get(field) is None for field in required
    ):
        raise HTTPException(
            400,
            "Pemetaan belum lengkap. Wajib: tanggal, produk, jumlah, harga jual aktual per unit, dan HPP satuan. Data agregat tanpa field ini belum dapat diimpor.",
        )
    indices = [value for value in mapping.values() if value is not None]
    if any(not isinstance(i, int) or i < 0 for i in indices) or len(
        set(indices)
    ) != len(indices):
        raise HTTPException(400, "Setiap field harus memakai satu kolom yang berbeda.")
    wb = checked_workbook(content)
    try:
        if sheet not in wb.sheetnames:
            raise HTTPException(400, "Sheet tidak ditemukan.")
        ws = wb[sheet]
        rows = []
        for row in ws.iter_rows(min_row=header_row + 1):
            if not any(cell.value is not None for cell in row):
                continue
            if len(rows) >= MAX_ROWS:
                raise HTTPException(400, "Maksimal 20.000 baris per impor.")
            number = row[0].row
            values = {}
            for field, index in mapping.items():
                if index is None:
                    continue
                if index >= len(row):
                    raise HTTPException(
                        400, f"Kolom tidak ditemukan pada baris {number}."
                    )
                cell = row[index]
                if cell.data_type == "f":
                    raise HTTPException(
                        400,
                        f"Baris {number} berisi formula pada kolom yang dipilih. Gunakan salinan ekspor nilai transaksi aktual.",
                    )
                value = cell.value
                if field == "date":
                    if isinstance(value, datetime):
                        value = value.date()
                    if not isinstance(value, date):
                        try:
                            value = date.fromisoformat(str(value))
                        except ValueError:
                            raise HTTPException(
                                400,
                                f"Baris {number}: tanggal harus tanggal Excel atau YYYY-MM-DD, bukan nama bulan/periode.",
                            )
                values[field] = value
            try:
                record = Sale.model_validate(values).model_dump(mode="json")
                if record["product"].strip().casefold() in {
                    "total",
                    "grand total",
                    "subtotal",
                    "sub total",
                }:
                    raise ValueError("Subtotal is not a transaction")
            except Exception:
                raise HTTPException(
                    400,
                    f"Baris {number} tidak valid. Periksa tanggal, jumlah positif bulat, teks, dan uang non-negatif maksimal 2 desimal. Jangan pilih subtotal/Grand Total.",
                )
            rows.append(record)
        if not rows:
            raise HTTPException(
                400, "Tidak ada baris transaksi pada sheet yang dipilih."
            )
        # pandas cleaning preserves numeric decimal strings; no fillna(0), rounding, or silent row deletion.
        records = (
            pd.DataFrame(rows)
            .where(pd.notna(pd.DataFrame(rows)), None)
            .to_dict(orient="records")
        )
        signature = hashlib.sha256(
            content
            + json.dumps(
                {"sheet": sheet, "header": header_row, "mapping": mapping},
                sort_keys=True,
            ).encode()
        ).hexdigest()
        for index, record in enumerate(records):
            record["id"] = str(
                uuid5(NAMESPACE_URL, owner + ":" + signature + ":" + str(index))
            )
        return records
    finally:
        wb.close()


def export_excel(data):
    wb = Workbook()
    wb.remove(wb.active)
    groups = [
        (
            "Sales",
            data["sales"],
            [
                "id",
                "date",
                "customer",
                "product",
                "category",
                "location",
                "quantity",
                "price",
                "unit_cost",
                "sales_value",
                "total_hpp",
            ],
        ),
        ("Expenses", data["expenses"], ["id", "date", "description", "amount"]),
        ("Summary", [data["metrics"]], list(data["metrics"])),
    ]
    for name, rows, headers in groups:
        ws = wb.create_sheet(name)
        ws.append(headers)
        for row in rows:
            ws.append([row.get(key) for key in headers])
            for cell in ws[ws.max_row]:
                if isinstance(cell.value, str):
                    cell.data_type = "s"
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for col in ws.columns:
            ws.column_dimensions[col[0].column_letter].width = 23
    buffer = BytesIO()
    wb.save(buffer)
    wb.close()
    buffer.seek(0)
    return buffer
