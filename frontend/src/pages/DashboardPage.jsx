import { useEffect, useRef, useState } from "react";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { api, downloadReport } from "../services/api";
import DashboardFilters from "../components/DashboardFilters";
import SummaryCards from "../components/SummaryCards";
import SalesCharts from "../components/SalesCharts";
import DataTable from "../components/DataTable";
import ExcelUpload from "../components/ExcelUpload";
import AnalysisView from "../components/AnalysisView";
import RecordEditor from "../components/RecordEditor";
import { Loading, ErrorMessage } from "../components/Feedback";
export default function DashboardPage({ page, onPage }) {
  const model = useDashboard(
      page === "analysis" ? "/api/analysis" : "/api/dashboard",
      page,
    ),
    options = useRef({}),
    years = useRef([]);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setNotice("");
    setError("");
  }, [page]);
  if (model.data) {
    options.current = model.data.options;
    years.current = model.data.years;
  }
  async function download() {
    setBusy(true);
    setError("");
    try {
      await downloadReport(model.query);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(kind, id) {
    if (
      !confirm(
        "Hapus data ini dari database? Tindakan ini tidak dapat dibatalkan.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/${kind}/${id}`, { method: "DELETE" });
      model.reload();
      setNotice("Data berhasil dihapus.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const title = {
    dashboard: "Dashboard Penjualan",
    data: "Data Penjualan",
    analysis: "Analisis Penjualan",
  }[page];
  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[.2em] text-accent">
            {
              {
                dashboard: "BUSINESS OVERVIEW",
                data: "KELOLA DATA",
                analysis: "ANALISIS PERFORMA",
              }[page]
            }
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {title}
          </h1>
          <p className="muted mt-2">
            {
              {
                dashboard: "Pantau kondisi penjualan dan laba bisnis Anda.",
                data: "Masukkan, periksa, dan kelola sumber data bisnis Anda.",
                analysis:
                  "Pahami tren, perubahan, kontribusi, dan profitabilitas penjualan.",
              }[page]
            }
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {page === "data" && (
            <button className="btn" onClick={() => setImporting(true)}>
              <Upload size={16} />
              Import Excel
            </button>
          )}
          <button
            className="btn-secondary"
            disabled={model.loading}
            onClick={model.reload}
            aria-label="Muat ulang data"
            title="Muat ulang data"
          >
            <RefreshCw size={16} />
          </button>
          {page === "data" && (
            <>
              <button
                className="btn-secondary"
                disabled={busy || !model.data}
                onClick={download}
              >
                <Download size={16} />
                Unduh Excel
              </button>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => setEditing({ kind: "sales" })}
              >
                <Plus size={16} />
                Tambah transaksi
              </button>
            </>
          )}
        </div>
      </div>
      <DashboardFilters
        filters={model.filters}
        setFilters={model.setFilters}
        options={options.current}
        years={years.current}
        onReset={model.reset}
      />
      {notice && (
        <p
          role="status"
          className="my-4 rounded-xl bg-emerald-50 p-3 text-sm text-accent"
        >
          {notice}
        </p>
      )}
      {(error || model.error) && (
        <ErrorMessage message={error || model.error} onRetry={model.reload} />
      )}{" "}
      {model.loading && <Loading />}
      {model.data && (
        <>
          {page === "dashboard" && (
            <>
              {(model.data.sales.length > 0 ||
                model.data.expenses.length > 0) && (
                <SummaryCards metrics={model.data.metrics} />
              )}
              {model.data.sales.length > 0 ? (
                <SalesCharts data={model.data} />
              ) : (
                <EmptySales onPage={onPage} />
              )}
            </>
          )}
          {page === "analysis" &&
            (model.data.has_sales ? (
              <AnalysisView data={model.data} />
            ) : (
              <EmptySales analysis onPage={onPage} />
            ))}
          {page !== "analysis" && (
            <p className="my-4 rounded-xl border border-slate-200 bg-slate-100/70 p-3 text-xs leading-relaxed text-slate-500">
              {model.data.note}
            </p>
          )}
          {page === "data" && (
            <>
              <section className="panel my-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Transaksi penjualan</h2>
                    <p className="muted mt-1">
                      Cari, urutkan, dan kelola transaksi pada pilihan filter.
                    </p>
                  </div>
                </div>
                <DataTable
                  rows={model.data.sales}
                  kind="sales"
                  onEdit={setEditing}
                  onDelete={remove}
                  busy={busy}
                />
              </section>
              <section className="panel my-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Biaya operasional</h2>
                    <p className="muted mt-1">
                      Catat biaya sekali saja, terpisah dari HPP.
                    </p>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => setEditing({ kind: "expenses" })}
                    disabled={busy}
                  >
                    <Plus size={15} />
                    Tambah biaya
                  </button>
                </div>
                <DataTable
                  rows={model.data.expenses}
                  kind="expenses"
                  onEdit={setEditing}
                  onDelete={remove}
                  busy={busy}
                />
              </section>
            </>
          )}
        </>
      )}
      <footer className="mt-8 text-xs leading-loose text-slate-400">
        Gross profit = penjualan − HPP · Actual net profit = gross profit −
        biaya operasional.
        <br />
        Margin dihitung dari total penjualan. Saat penjualan nol, margin
        ditampilkan “-”. Pajak/bunga/biaya yang belum dicatat belum mengurangi
        laba.
      </footer>
      {page === "data" && importing && (
        <ExcelUpload
          initialYear={model.filters.year}
          onClose={() => setImporting(false)}
          onImported={() => {
            model.reload();
            setNotice(
              "Impor berhasil. Sesuaikan periode filter jika data belum terlihat.",
            );
          }}
        />
      )}
      {page === "data" && editing && (
        <RecordEditor
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            model.reload();
            setNotice("Data berhasil disimpan.");
          }}
        />
      )}
    </>
  );
}

function EmptySales({ analysis = false, onPage }) {
  return (
    <section className="panel my-5 py-10 text-center">
      <h2 className="text-lg font-semibold text-navy">
        {analysis
          ? "Belum ada data untuk dianalisis"
          : "Belum ada data penjualan"}
      </h2>
      <p className="muted mx-auto mt-3 max-w-lg">
        {analysis
          ? "Tambahkan data penjualan terlebih dahulu untuk mulai melihat analisis."
          : "Tambahkan atau import data penjualan terlebih dahulu untuk mulai melihat performa bisnis."}{" "}
        Periksa juga filter periode yang dipilih.
      </p>
      <button className="btn mt-5" onClick={() => onPage("data")}>
        Kelola Data Penjualan
      </button>
    </section>
  );
}
