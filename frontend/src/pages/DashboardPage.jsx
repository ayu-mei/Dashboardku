import { useRef, useState } from "react";
import { Download, Plus, RefreshCw } from "lucide-react";
import { useDashboard } from "../hooks/useDashboard";
import { api, downloadReport } from "../services/api";
import DashboardFilters from "../components/DashboardFilters";
import SummaryCards from "../components/SummaryCards";
import SalesCharts from "../components/SalesCharts";
import DataTable from "../components/DataTable";
import ExcelUpload from "../components/ExcelUpload";
import RecordEditor from "../components/RecordEditor";
import { Loading, ErrorMessage } from "../components/Feedback";
export default function DashboardPage({ page }) {
  const model = useDashboard(),
    options = useRef({}),
    years = useRef([]);
  const [editing, setEditing] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
            BUSINESS OVERVIEW
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {title}
          </h1>
          <p className="muted mt-2">
            Pantau penjualan dan laba dengan angka yang mudah dipahami.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            disabled={model.loading}
            onClick={model.reload}
            aria-label="Muat ulang data"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="btn-secondary"
            disabled={busy || !model.data}
            onClick={download}
          >
            <Download size={16} />
            Unduh Excel
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => setEditing({ kind: "sales" })}
          >
            <Plus size={16} />
            Tambah transaksi
          </button>
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
          <SummaryCards metrics={model.data.metrics} />
          {page !== "data" && <SalesCharts data={model.data} />}
          <p className="my-4 rounded-xl border border-slate-200 bg-slate-100/70 p-3 text-xs leading-relaxed text-slate-500">
            {model.data.note}
          </p>
          {page !== "analysis" && (
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
          {page === "data" && (
            <ExcelUpload
              onImported={() => {
                model.reload();
                setNotice(
                  "Impor berhasil. Sesuaikan periode filter jika data belum terlihat.",
                );
              }}
            />
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
      {editing && (
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
