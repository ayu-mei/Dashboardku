from collections import defaultdict
from datetime import date
from decimal import Decimal


def decimal(value):
    return Decimal(str(value))


def in_period(record, filters):
    start = date.fromisoformat(str(record.get("period_start", record.get("date"))))
    end = date.fromisoformat(str(record.get("period_end", record.get("date"))))
    # Keep a recap only when its whole period fits; never allocate monthly values
    # into invented daily transactions when a narrow date filter is selected.
    return (
        (not filters.year or start.year == filters.year and end.year == filters.year)
        and (not filters.month or start.month == filters.month and end.month == filters.month)
        and (not filters.start or start >= filters.start)
        and (not filters.end or end <= filters.end)
    )


def report(sales, expenses, filters):
    selected_sales = [
        r
        for r in sales
        if in_period(r, filters)
        and all(
            not value or r.get(key) == value
            for key, value in [
                ("product", filters.product),
                ("category", filters.category),
                ("location", filters.location),
            ]
        )
    ]
    selected_expenses = [r for r in expenses if in_period(r, filters)]
    total = cost = Decimal(0)
    missing_hpp = 0
    unknown_months = set()
    by_month = defaultdict(lambda: {"sales": Decimal(0), "gross": Decimal(0)})
    by_product = defaultdict(lambda: Decimal(0))
    normalized = []
    for row in selected_sales:
        value = decimal(row["sales_value"]) if row.get("is_recap") else decimal(row["quantity"]) * decimal(row["price"])
        hpp = (decimal(row['total_hpp']) if row.get('total_hpp') is not None else None) if row.get('is_recap') else decimal(row['quantity']) * decimal(row['unit_cost'])
        total += value
        if hpp is not None:
            cost += hpp
        else:
            missing_hpp += 1
        month = str(row["date"])[:7]
        by_month[month]["sales"] += value
        if hpp is not None:
            by_month[month]["gross"] += value - hpp
        else:
            unknown_months.add(month)
        by_product[row["product"]] += value
        normalized.append(
            {
                **{k: v for k, v in row.items() if k != "user_id"},
                "sales_value": str(value),
                "total_hpp": str(hpp) if hpp is not None else None,
            }
        )
    operational = sum((decimal(r["amount"]) for r in selected_expenses), Decimal(0))
    gross, net = (total - cost, total - cost - operational) if not missing_hpp else (None, None)
    metrics = {
        "sales": str(total),
        "hpp": str(cost) if not missing_hpp else None,
        "gross": str(gross) if gross is not None else None,
        "operational": str(operational),
        "net": str(net) if net is not None else None,
        "gross_margin": str(gross / total * 100) if total and gross is not None else None,
        "net_margin": str(net / total * 100) if total and net is not None else None,
    }
    if filters.year:
        for month in range(1, 13):
            if not filters.month or month == filters.month:
                key = f"{filters.year:04d}-{month:02d}"
                if (not filters.start or key >= filters.start.isoformat()[:7]) and (
                    not filters.end or key <= filters.end.isoformat()[:7]
                ):
                    by_month[key]
    products = [
        {
            "product": key,
            "sales": str(value),
            "contribution": str(value / total * 100) if total else "0",
        }
        for key, value in sorted(
            by_product.items(), key=lambda pair: pair[1], reverse=True
        )
    ]
    return {
        "sales": sorted(normalized, key=lambda r: r["date"], reverse=True),
        "expenses": [
            {k: v for k, v in r.items() if k != "user_id"} for r in selected_expenses
        ],
        "metrics": metrics,
        "timeline": [
            {"month": key, **{k: (None if k == "gross" and key in unknown_months else str(v)) for k, v in values.items()}}
            for key, values in sorted(by_month.items())
        ],
        "products": products,
        "options": {
            key: sorted({str(r[key]) for r in sales if r.get(key)})
            for key in ["product", "category", "location"]
        },
        "years": sorted({int(str(r["date"])[:4]) for r in sales + expenses}),
        "transactions": [row for row in normalized if not row.get("is_recap")],
        "missing_hpp_count": missing_hpp,
        "note": "Biaya operasional mengikuti periode dan belum dialokasikan ke produk/kategori/lokasi. Net profit = gross profit pilihan dikurangi seluruh biaya periode. Rekap hanya ditampilkan jika seluruh periodenya masuk filter tanggal; tidak dibagi menjadi transaksi harian." + (f" HPP belum lengkap pada {missing_hpp} baris; total HPP dan laba belum tersedia." if missing_hpp else ""),
    }
