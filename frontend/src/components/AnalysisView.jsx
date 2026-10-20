import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { rupiah, percent, compact, monthLabel } from "../utils/format";

function periodLabel(period) {
  if (!period) return "Periode terpilih";
  const format = (value) =>
    new Date(value + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${format(period.start)} – ${format(period.end)}`;
}
function GrowthCard({ title, metric }) {
  const change = metric.change === null ? null : Number(metric.change);
  const direction =
    change === null || change === 0 ? "—" : change > 0 ? "↑" : "↓";
  return (
    <article className="panel">
      <h2 className="muted">{title}</h2>
      <strong
        className={`my-3 block text-2xl font-bold ${change > 0 ? "text-accent" : change < 0 ? "text-red-600" : "text-navy"}`}
      >
        {direction}{" "}
        {metric.growth === null
          ? "Belum tersedia"
          : `${Number(metric.growth) > 0 ? "+" : ""}${percent(metric.growth)}`}
      </strong>
      <p className="text-xs text-slate-500">
        {metric.previous === null
          ? "Data pembanding belum tersedia."
          : `vs periode sebelumnya · ${rupiah(metric.previous)}`}
      </p>
      {change !== null && (
        <p className="mt-2 text-xs text-slate-500">
          Perubahan nilai: {rupiah(change)}
        </p>
      )}
    </article>
  );
}
function ProductLeader({ title, row, field }) {
  return (
    <article className="panel">
      <h2 className="muted">{title}</h2>
      <strong className="my-3 block break-words text-lg text-navy">
        {row?.product || "Belum tersedia"}
      </strong>
      <p className="text-sm font-semibold text-accent">
        {row
          ? field === "margin"
            ? percent(row.margin)
            : rupiah(row[field])
          : "—"}
      </p>
    </article>
  );
}
export default function AnalysisView({ data }) {
  const [productPage, setProductPage] = useState(0);
  useEffect(() => setProductPage(0), [data]);
  const pages = Math.max(1, Math.ceil(data.products.length / 10));
  const productRows = data.products.slice(
    productPage * 10,
    productPage * 10 + 10,
  );
  const total = data.products.reduce((sum, row) => sum + Number(row.sales), 0);
  const leading = data.products.slice(0, 8);
  const remainder = data.products
    .slice(8)
    .reduce((sum, row) => sum + Number(row.sales), 0);
  const contribution = [
    ...leading,
    ...(data.products.length > 8
      ? [
          {
            product: "Produk lainnya",
            sales: remainder,
            contribution: total ? (remainder / total) * 100 : null,
          },
        ]
      : []),
  ];
  return (
    <>
      {data.missing_hpp_count > 0 && (
        <p
          role="status"
          className="my-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
        >
          HPP belum lengkap pada {data.missing_hpp_count} baris. Omzet tetap
          tersedia; laba dan peringkat profit hanya tersedia untuk produk dengan
          HPP lengkap.
        </p>
      )}
      <section className="panel my-5">
        <h2 className="font-semibold">Perbandingan Periode</h2>
        <p className="mt-2 text-sm text-navy">
          {periodLabel(data.period)}
          {data.previous_period && (
            <> dibandingkan {periodLabel(data.previous_period)}</>
          )}
        </p>
        <p className="muted mt-2">{data.comparison_note}</p>
      </section>
      <section
        className="my-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Ringkasan analisis"
      >
        <GrowthCard
          title="Pertumbuhan Penjualan"
          metric={data.comparisons.sales}
        />
        <GrowthCard
          title="Pertumbuhan Laba Kotor"
          metric={data.comparisons.gross}
        />
        <ProductLeader
          title="Penjualan Produk Tertinggi"
          row={data.leaders.sales}
          field="sales"
        />
        <ProductLeader
          title="Margin Produk Terbaik"
          row={data.leaders.margin}
          field="margin"
        />
      </section>
      <section className="panel my-5">
        <h2 className="font-semibold">Performa Penjualan</h2>
        <p className="muted mt-1">
          Penjualan dan laba kotor per bulan pada periode terpilih. Perbandingan
          periode tersedia pada ringkasan di atas.
        </p>
        <div className="mt-5 h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data.timeline.map((row) => ({
                ...row,
                sales: Number(row.sales),
                gross: row.gross === null ? null : Number(row.gross),
              }))}
              margin={{ left: 0, right: 10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="month"
                tickFormatter={(value) => monthLabel(value)}
                tick={{ fontSize: 10 }}
                minTickGap={22}
              />
              <YAxis
                width={65}
                tickFormatter={compact}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                labelFormatter={(value) => monthLabel(value, true)}
                formatter={(value, name) => [
                  rupiah(value),
                  name === "sales" ? "Penjualan" : "Laba Kotor",
                ]}
              />
              <Legend
                formatter={(name) =>
                  name === "sales" ? "Penjualan" : "Laba Kotor"
                }
              />
              <Bar
                dataKey="sales"
                fill="#087d65"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
              <Line
                dataKey="gross"
                stroke="#10243d"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel my-5">
        <h2 className="font-semibold">Kontribusi Produk</h2>
        <p className="muted mt-1">
          Produk dengan penjualan terbesar; produk di luar delapan teratas
          digabung sebagai produk lainnya.
        </p>
        <div className="mt-5 space-y-4">
          {contribution.map((row, index) => (
            <div key={index}>
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                <span className="break-words font-medium">{row.product}</span>
                <span>
                  {rupiah(row.sales)} · {percent(row.contribution)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(row.contribution) || 0))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="panel my-5">
        <h2 className="font-semibold">Profitabilitas Produk</h2>
        <p className="muted mt-1">
          Bandingkan omzet dengan laba dan margin untuk memahami kualitas
          penjualan.
        </p>
        <div
          className="mt-4 overflow-x-auto"
          role="region"
          aria-label="Tabel profitabilitas produk"
          tabIndex={0}
        >
          <table className="w-full min-w-[640px]">
            <thead>
              <tr>
                {["Produk", "Penjualan", "HPP", "Laba Kotor", "Margin"].map(
                  (label) => (
                    <th key={label}>{label}</th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {productRows.map((row) => (
                <tr key={row.product}>
                  <td>{row.product}</td>
                  <td>{rupiah(row.sales)}</td>
                  <td>{rupiah(row.hpp)}</td>
                  <td
                    className={
                      Number(row.gross) < 0 ? "text-red-600" : "text-accent"
                    }
                  >
                    {rupiah(row.gross)}
                  </td>
                  <td>{percent(row.margin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {data.products.length} produk · Halaman {productPage + 1} dari{" "}
            {pages}
          </span>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              disabled={productPage === 0}
              onClick={() => setProductPage((value) => value - 1)}
              aria-label="Produk sebelumnya"
            >
              Sebelumnya
            </button>
            <button
              className="btn-secondary"
              disabled={productPage + 1 >= pages}
              onClick={() => setProductPage((value) => value + 1)}
              aria-label="Produk berikutnya"
            >
              Berikutnya
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs text-slate-500">{data.note}</p>
      </section>
      <section className="panel my-5">
        <h2 className="font-semibold">Top &amp; Bottom Performance</h2>
        <p className="muted mt-1">
          Peringkat berdasarkan laba kotor, bukan hanya omzet. Produk pada kedua
          kelompok tidak diulang.
        </p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {[
            ["Laba kotor tertinggi", data.ranking.top],
            ["Laba kotor terendah", data.ranking.bottom],
          ].map(([label, rows]) => (
            <div key={label}>
              <h3 className="mb-3 text-sm font-semibold text-navy">{label}</h3>
              {rows.length ? (
                <ol className="space-y-3">
                  {rows.map((row) => (
                    <li
                      key={row.product}
                      className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"
                    >
                      <span className="break-words">{row.product}</span>
                      <span
                        className={
                          Number(row.gross) < 0 ? "text-red-600" : "text-accent"
                        }
                      >
                        {rupiah(row.gross)} · {percent(row.margin)}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">
                  Belum cukup produk untuk kelompok pembanding.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
