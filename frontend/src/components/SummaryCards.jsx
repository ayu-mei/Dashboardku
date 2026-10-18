import {
  Banknote,
  Package,
  TrendingUp,
  Wallet,
  Percent,
  Receipt,
} from "lucide-react";
import { rupiah, percent } from "../utils/format";
const cards = [
  ["Total Penjualan", "sales", Banknote],
  ["Total HPP", "hpp", Package],
  ["Gross Profit", "gross", TrendingUp],
  ["Gross Margin", "gross_margin", Percent],
  ["Operational Cost", "operational", Receipt],
  ["Actual Net Profit", "net", Wallet],
  ["Actual Net Margin", "net_margin", Percent],
];
export default function SummaryCards({ metrics }) {
  return (
    <section
      className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7"
      aria-label="Ringkasan keuangan"
    >
      {cards.map(([label, key, Icon]) => (
        <article
          key={key}
          className={`min-w-0 rounded-2xl border p-4 shadow-sm ${key === "sales" ? "border-navy bg-navy text-white" : "border-slate-200/80 bg-white"}`}
        >
          <div
            className={`mb-5 flex items-center justify-between gap-2 text-xs ${key === "sales" ? "text-slate-300" : "text-slate-500"}`}
          >
            <span>{label}</span>
            <Icon size={16} className="shrink-0" />
          </div>
          <strong
            className={`block break-words text-xl font-bold tracking-tight ${Number(metrics[key]) < 0 ? "text-red-500" : key === "net" ? "text-accent" : ""}`}
          >
            {key.includes("margin")
              ? percent(metrics[key])
              : rupiah(metrics[key])}
          </strong>
        </article>
      ))}
    </section>
  );
}
