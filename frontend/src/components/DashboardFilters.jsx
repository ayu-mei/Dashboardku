import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { months } from "../utils/format";
const labels = {
  product: "Produk",
  category: "Kategori",
  location: "Lokasi",
  start: "Dari",
  end: "Sampai",
};
export default function DashboardFilters({
  filters,
  setFilters,
  options,
  years,
  onReset,
}) {
  const set = (field, value) =>
    setFilters((previous) => ({ ...previous, [field]: value }));
  const dates = [
    ...new Set([
      new Date().getFullYear(),
      ...(years || []),
      Number(filters.year) || new Date().getFullYear(),
    ]),
  ].sort((a, b) => b - a);
  const active = ["start", "end", "product", "category", "location"].filter(
    (key) => filters[key],
  );
  return (
    <section className="panel mb-5" aria-label="Filter laporan">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 sm:max-w-44">
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
        <label className="min-w-0 flex-1 sm:max-w-52">
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
        <button
          className="btn-secondary !px-3"
          onClick={onReset}
          aria-label="Reset Filter"
          title="Reset filter"
        >
          <RotateCcw size={16} />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>
      <details className="mt-3 border-t border-slate-100 pt-3">
        <summary className="flex min-h-9 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
          <SlidersHorizontal size={15} /> Filter lainnya{" "}
          {active.length > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-accent">
              {active.length}
            </span>
          )}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            .filter((key) => options?.[key]?.length || filters[key])
            .map((key) => (
              <label key={key}>
                {labels[key]}
                <select
                  aria-label={
                    key === "location" ? "Cabang / Lokasi" : labels[key]
                  }
                  value={filters[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="">Semua</option>
                  {[
                    ...new Set([
                      ...(options?.[key] || []),
                      ...(filters[key] ? [filters[key]] : []),
                    ]),
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Semua filter berlaku bersamaan, termasuk tahun dan bulan.
        </p>
      </details>
      {active.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Filter aktif">
          {active.map((key) => (
            <button
              key={key}
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-accent"
              aria-label={`Hapus filter ${labels[key]}`}
              onClick={() => set(key, "")}
            >
              <span className="truncate">
                {labels[key]}: {filters[key]}
              </span>
              <X size={13} className="shrink-0" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
