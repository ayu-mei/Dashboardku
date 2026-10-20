import { useMemo, useState, useEffect, useRef } from "react";
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from "lucide-react";
import { Empty } from "./Feedback";
import { rupiah } from "../utils/format";
export default function DataTable({
  rows,
  kind,
  onEdit,
  onDelete,
  onBulkDelete,
  busy,
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState({ key: "date", direction: -1 }),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const selectAll = useRef(null);
  useEffect(() => setPage(1), [search, rows, sort]);
  useEffect(() => setSelected(new Set()), [rows, search]);
  const columns =
    kind === "sales"
      ? [
          ["date", "Tanggal"],
          ["product", "Produk"],
          ["quantity", "Jumlah"],
          ["price", "Harga satuan"],
          ["unit_cost", "HPP satuan"],
          ["sales_value", "Penjualan"],
        ]
      : [
          ["date", "Tanggal"],
          ["description", "Deskripsi"],
          ["amount", "Biaya"],
        ];
  const filtered = useMemo(
    () =>
      rows
        .filter((row) =>
          Object.values(row).some((value) =>
            String(value ?? "")
              .toLowerCase()
              .includes(search.toLowerCase()),
          ),
        )
        .sort((a, b) => {
          const numeric = [
            "quantity",
            "price",
            "unit_cost",
            "sales_value",
            "amount",
          ].includes(sort.key);
          return (
            (numeric
              ? Number(a[sort.key]) - Number(b[sort.key])
              : String(a[sort.key]).localeCompare(String(b[sort.key]))) *
            sort.direction
          );
        }),
    [rows, search, sort],
  );
  const count = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, count);
  const selectedIds = filtered
    .filter((row) => selected.has(row.id))
    .map((row) => row.id);
  const allSelected =
    filtered.length > 0 && selectedIds.length === filtered.length;
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selectedIds.length > 0 && !allSelected;
  }, [selectedIds.length, allSelected]);
  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(filtered.map((row) => row.id)),
    );
  }
  return (
    <>
      <div className="relative my-5 max-w-md">
        <Search size={16} className="absolute left-3 top-3 text-slate-400" />
        <input
          className="w-full pl-9"
          type="search"
          aria-label={kind === "sales" ? "Cari transaksi" : "Cari biaya"}
          placeholder="Cari pada tabel…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <button
          className="btn-secondary"
          disabled={busy || !filtered.length}
          onClick={toggleAll}
        >
          {allSelected ? "Batalkan pilihan" : "Pilih semua hasil filter"}
        </button>
        <span role="status">
          {selectedIds.length} dari {filtered.length} baris dipilih (semua
          halaman)
        </span>
        <button
          className="btn-secondary !text-red-700"
          disabled={busy || !selectedIds.length}
          onClick={() => onBulkDelete(kind, selectedIds)}
        >
          <Trash2 size={15} /> Hapus terpilih ({selectedIds.length})
        </button>
      </div>
      <div
        className="overflow-x-auto rounded-xl border border-slate-100"
        tabIndex={0}
        role="region"
        aria-label={kind === "sales" ? "Tabel penjualan" : "Tabel biaya"}
      >
        <table className="w-full min-w-[630px]">
          <thead>
            <tr>
              <th>
                <input
                  ref={selectAll}
                  type="checkbox"
                  aria-label="Pilih semua hasil filter"
                  checked={allSelected}
                  disabled={busy || !filtered.length}
                  onChange={toggleAll}
                />
              </th>
              {columns.map(([key, label]) => (
                <th key={key}>
                  <button
                    className="flex items-center gap-2"
                    onClick={() =>
                      setSort((previous) => ({
                        key,
                        direction:
                          previous.key === key ? -previous.direction : 1,
                      }))
                    }
                  >
                    {label}
                    <ArrowUpDown size={12} />
                  </button>
                </th>
              ))}
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 10, current * 10).map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Pilih ${kind === "sales" ? row.product : row.description} ${row.date}`}
                    checked={selected.has(row.id)}
                    disabled={busy}
                    onChange={() =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                  />
                </td>
                {columns.map(([key]) => (
                  <td
                    key={key}
                    className={
                      ["product", "description"].includes(key)
                        ? "max-w-64 break-words"
                        : "whitespace-nowrap"
                    }
                  >
                    {["price", "unit_cost", "sales_value", "amount"].includes(
                      key,
                    )
                      ? rupiah(row[key])
                      : row[key]}
                    {key === "product" && (
                      <small className="mt-1 block text-xs text-slate-400">
                        {row.location || row.customer || ""}
                      </small>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap">
                  <button
                    className="mr-2 rounded-lg bg-emerald-50 p-2 text-accent"
                    aria-label={`Edit ${kind === "sales" ? row.product : row.description}`}
                    disabled={busy}
                    onClick={() => onEdit({ kind, record: row })}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="rounded-lg bg-red-50 p-2 text-red-600"
                    aria-label={`Hapus ${kind === "sales" ? row.product : row.description}`}
                    disabled={busy}
                    onClick={() => onDelete(kind, row.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <Empty
            message={
              search ? "Tidak ada data yang cocok dengan pencarian." : undefined
            }
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>
          {filtered.length} baris · Halaman {current} dari {count}
        </span>
        <div className="flex gap-2">
          <button
            className="btn-secondary !px-3"
            aria-label="Halaman sebelumnya"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            className="btn-secondary !px-3"
            aria-label="Halaman berikutnya"
            disabled={current === count}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
