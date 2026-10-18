from collections import defaultdict
from datetime import date
from decimal import Decimal


def decimal(value):
    return Decimal(str(value))


def report(sales, expenses, filters):
    def in_period(record):
        day = date.fromisoformat(str(record["date"]))
        return (
            (not filters.year or day.year == filters.year)
            and (not filters.month or day.month == filters.month)
            and (not filters.start or day >= filters.start)
            and (not filters.end or day <= filters.end)
        )

    selected_sales = [
        r
        for r in sales
        if in_period(r)
        and all(
            not value or r.get(key) == value
            for key, value in [
                ("product", filters.product),
                ("category", filters.category),
                ("location", filters.location),
            ]
        )
    ]
    selected_expenses = [r for r in expenses if in_period(r)]
    total = cost = Decimal(0)
    by_month = defaultdict(lambda: {"sales": Decimal(0), "gross": Decimal(0)})
    by_product = defaultdict(lambda: Decimal(0))
    normalized = []
    for row in selected_sales:
        value = decimal(row["quantity"]) * decimal(row["price"])
        hpp = decimal(row["quantity"]) * decimal(row["unit_cost"])
        total += value
        cost += hpp
        month = str(row["date"])[:7]
        by_month[month]["sales"] += value
        by_month[month]["gross"] += value - hpp
        by_product[row["product"]] += value
        normalized.append(
            {
                **{k: v for k, v in row.items() if k != "user_id"},
                "sales_value": str(value),
                "total_hpp": str(hpp),
            }
        )
    operational = sum((decimal(r["amount"]) for r in selected_expenses), Decimal(0))
    gross, net = total - cost, total - cost - operational
    metrics = {
        "sales": str(total),
        "hpp": str(cost),
        "gross": str(gross),
        "operational": str(operational),
        "net": str(net),
        "gross_margin": str(gross / total * 100) if total else None,
        "net_margin": str(net / total * 100) if total else None,
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
            {"month": key, **{k: str(v) for k, v in values.items()}}
            for key, values in sorted(by_month.items())
        ],
        "products": products,
        "options": {
            key: sorted({str(r[key]) for r in sales if r.get(key)})
            for key in ["product", "category", "location"]
        },
        "years": sorted({int(str(r["date"])[:4]) for r in sales + expenses}),
        "note": "Biaya operasional mengikuti periode dan belum dialokasikan ke produk/kategori/lokasi. Net profit = gross profit pilihan dikurangi seluruh biaya periode.",
    }
