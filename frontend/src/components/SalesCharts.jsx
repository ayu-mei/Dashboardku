import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { rupiah, compact, percent } from "../utils/format";
import { Empty } from "./Feedback";
export default function SalesCharts({ data }) {
  return (
    <section className="my-5 grid min-w-0 gap-5 xl:grid-cols-5">
      <article className="panel xl:col-span-3">
        <h2 className="font-semibold">Tren penjualan & gross profit</h2>
        <p className="muted mt-1">Ringkasan per bulan pada periode terpilih.</p>
        {!data.sales.length ? (
          <Empty />
        ) : (
          <div className="mt-5 h-72 min-w-0" data-testid="time-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data.timeline.map((row) => ({
                  ...row,
                  sales: Number(row.sales),
                  gross: Number(row.gross),
                }))}
                margin={{ left: 0, right: 5, top: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10 }}
                  minTickGap={22}
                />
                <YAxis
                  width={60}
                  tick={{ fontSize: 10 }}
                  tickFormatter={compact}
                />
                <Tooltip
                  formatter={(value, name) => [
                    rupiah(value),
                    name === "sales" ? "Penjualan" : "Gross Profit",
                  ]}
                />
                <Legend
                  formatter={(name) =>
                    name === "sales" ? "Penjualan" : "Gross Profit"
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
        )}
      </article>
      <article className="panel xl:col-span-2">
        <h2 className="font-semibold">Penjualan berdasarkan produk</h2>
        <p className="muted mt-1">
          8 produk terbesar · tooltip menampilkan kontribusi.
        </p>
        {!data.products.length ? (
          <Empty />
        ) : (
          <div className="mt-5 h-72 min-w-0" data-testid="product-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data.products
                  .slice(0, 8)
                  .map((row) => ({ ...row, sales: Number(row.sales) }))}
                margin={{ left: 0, right: 10 }}
              >
                <XAxis
                  type="number"
                  tickFormatter={compact}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="product"
                  width={90}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(name) =>
                    name.length > 14 ? name.slice(0, 13) + "…" : name
                  }
                />
                <Tooltip
                  formatter={(value, name, item) => [
                    `${rupiah(value)} (${percent(item.payload.contribution)})`,
                    "Penjualan",
                  ]}
                  labelFormatter={(label) => label}
                />
                <Bar
                  dataKey="sales"
                  fill="#10243d"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </article>
    </section>
  );
}
