import { AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";
import { sourceRupiah, monthLabel } from "../utils/format";

export default function BusinessInsights({ overview, onPage }) {
  return (
    <>
      <section className="panel">
        <h3 className="flex items-center gap-2 font-semibold">
          <AlertTriangle size={18} /> Hal yang perlu diperhatikan
        </h3>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {overview.alerts.length ? (
            [...overview.alerts]
              .sort(
                (a, b) =>
                  (a.level === "warning" ? 0 : 1) -
                  (b.level === "warning" ? 0 : 1),
              )
              .map((a) => (
                <article
                  key={a.code}
                  className={`rounded-xl border p-4 ${a.level === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                >
                  <h4 className="text-sm font-semibold">{a.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {a.detail}
                  </p>
                </article>
              ))
          ) : (
            <p className="muted">Tidak ada peringatan pada pemeriksaan ini.</p>
          )}
        </div>
        <button className="btn-secondary mt-4" onClick={() => onPage("data")}>
          Periksa data sumber <ArrowRight size={15} />
        </button>
      </section>
      <section className="panel">
        <h3 className="flex items-center gap-2 font-semibold">
          <TrendingUp size={18} /> Estimasi penjualan
        </h3>
        {overview.forecast.available ? (
          <>
            <p className="muted mt-3">
              Perkiraan {monthLabel(overview.forecast.month, true)}
            </p>
            <p className="mt-2 text-2xl font-bold text-navy">
              {sourceRupiah(overview.forecast.sales)}
            </p>
            <p className="muted mt-2">
              {overview.forecast.method} · Selisih historis rata-rata (MAE):{" "}
              {sourceRupiah(overview.forecast.backtest_mae)}
            </p>
            <details className="mt-4 text-xs text-slate-500">
              <summary className="cursor-pointer py-2 font-medium">
                Lihat riwayat estimasi
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Bulan riwayat</th>
                      <th>Penjualan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.forecast.training.map((r) => (
                      <tr key={r.month}>
                        <td>{monthLabel(r.month, true)}</td>
                        <td>{sourceRupiah(r.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Estimasi belum tersedia. Diperlukan 6 bulan data berurutan hingga
            bulan terakhir.
          </p>
        )}
        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer py-2 font-medium">
            Metode dan batasan estimasi
          </summary>
          <p className="mt-2 leading-relaxed">{overview.forecast.note}</p>
        </details>
      </section>
    </>
  );
}
