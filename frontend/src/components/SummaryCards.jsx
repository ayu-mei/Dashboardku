import { Banknote, TrendingUp, Receipt, Percent } from "lucide-react";
import { rupiah, percent } from "../utils/format";
const cards = [
  ["Penjualan", "sales", Banknote],
  ["Laba Kotor", "gross", TrendingUp],
  ["Total HPP", "hpp", Receipt],
  ["Margin Kotor", "gross_margin", Percent],
];
export default function SummaryCards({ metrics, missingHppCount }) {
  return (
    <section aria-label="Ringkasan keuangan">
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, key, Icon]) => (
          <article
            key={key}
            className={`min-w-0 rounded-2xl border p-4 shadow-sm ${key === "sales" ? "border-navy bg-navy text-white" : "border-slate-200/80 bg-white"}`}
          >
            <div
              className={`mb-4 flex items-center justify-between gap-2 text-xs ${key === "sales" ? "text-slate-300" : "text-slate-500"}`}
            >
              <span>{label}</span>
              <Icon size={16} className="shrink-0" />
            </div>
            <strong
              className={`block break-words text-xl font-bold tracking-tight ${Number(metrics[key]) < 0 ? "text-red-600" : ""}`}
            >
              {metrics[key] == null ? (
                <span className="text-sm font-medium">HPP belum lengkap</span>
              ) : key === "gross_margin" ? (
                percent(metrics[key])
              ) : (
                rupiah(metrics[key])
              )}
            </strong>
          </article>
        ))}
      </div>
      {missingHppCount > 0 && (
        <p
          role="status"
          className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          HPP belum lengkap pada {missingHppCount} baris. Laba belum tersedia.
        </p>
      )}
    </section>
  );
}
