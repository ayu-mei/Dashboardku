import { Banknote, TrendingUp, Wallet, Receipt } from "lucide-react";
import { rupiah, percent } from "../utils/format";
const cards = [
  ["Penjualan", "sales", Banknote],
  ["Laba Kotor", "gross", TrendingUp],
  ["Biaya Operasional", "operational", Receipt],
  ["Laba Bersih", "net", Wallet],
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
              className={`block break-words text-xl font-bold tracking-tight ${Number(metrics[key]) < 0 ? "text-red-600" : key === "net" ? "text-accent" : ""}`}
            >
              {metrics[key] == null ? (
                <span className="text-sm font-medium">HPP belum lengkap</span>
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
      <details className="mt-3 text-xs text-slate-500">
        <summary className="min-h-9 cursor-pointer py-2 font-medium">
          HPP dan margin
        </summary>
        <dl className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          {[
            ["Total HPP", "hpp"],
            ["Margin Kotor", "gross_margin"],
            ["Margin Bersih", "net_margin"],
          ].map(([label, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd className="mt-1 font-semibold text-slate-700">
                {metrics[key] == null
                  ? "Belum tersedia"
                  : key.includes("margin")
                    ? percent(metrics[key])
                    : rupiah(metrics[key])}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
