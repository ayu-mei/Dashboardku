import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { months } from "../utils/format";
export default function DashboardFilters({
  filters,
  setFilters,
  options,
  years,
  onReset,
}) {
  const set = (field, value) =>
    setFilters((previous) => ({ ...previous, [field]: value }));
  const dates = Array.from(
    new Set([
      new Date().getFullYear(),
      ...(years || []),
      Number(filters.year) || new Date().getFullYear(),
    ]),
  ).sort((a, b) => b - a);
  return (
    <section className="panel mb-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal size={16} />
          Filter laporan
        </h2>
        <button
          className="flex items-center gap-2 text-xs font-semibold text-accent"
          onClick={onReset}
        >
          <RotateCcw size={14} />
          Reset Filter
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label>
          Tahun
          <select
            aria-label="Tahun"
            value={filters.year}
            onChange={(e) => set("year", e.target.value)}
          >
            <option value="">Semua tahun</option>
            {dates.map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
        <label>
          Bulan
          <select
            aria-label="Bulan"
            value={filters.month}
            onChange={(e) => set("month", e.target.value)}
          >
            <option value="">Semua bulan</option>
            {months.map((month, i) => (
              <option value={i + 1} key={month}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dari tanggal
          <input
            aria-label="Dari tanggal"
            type="date"
            value={filters.start}
            onChange={(e) => set("start", e.target.value)}
          />
        </label>
        <label>
          Sampai tanggal
          <input
            aria-label="Sampai tanggal"
            type="date"
            value={filters.end}
            min={filters.start || undefined}
            onChange={(e) => set("end", e.target.value)}
          />
        </label>
        {["product", "category", "location"]
          .filter((key) => options?.[key]?.length)
          .map((key) => (
            <label key={key}>
              {
                {
                  product: "Produk",
                  category: "Kategori",
                  location: "Cabang / Lokasi",
                }[key]
              }
              <select
                aria-label={
                  {
                    product: "Produk",
                    category: "Kategori",
                    location: "Cabang / Lokasi",
                  }[key]
                }
                value={filters[key]}
                onChange={(e) => set(key, e.target.value)}
              >
                <option value="">Semua</option>
                {options[key].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Tanggal, bulan, dan tahun berlaku bersamaan. Filter
        produk/kategori/lokasi hanya muncul jika tersedia dalam data.
      </p>
    </section>
  );
}
