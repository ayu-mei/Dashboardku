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
import SourceDataPanel from "../components/SourceDataPanel";
import SmartDashboard from "../components/SmartDashboard";
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
  const [dataTab, setDataTab] = useState("sales");
  const [sourceId, setSourceId] = useState(null);
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
  async function removeSelected(kind, ids) {
    const label =
      kind === "sales" ? "transaksi penjualan" : "catatan biaya operasional";
    if (
      !confirm(
        `Hapus ${ids.length} ${label} yang dipilih? Pilihan mencakup semua halaman sesuai filter dan pencarian tabel. Tindakan ini tidak dapat dibatalkan.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api(`/api/${kind}/bulk-delete`, {
        method: "POST",
        body: { ids },
      });
      if (!result.complete)
        setError(`${result.deleted} data telah dihapus. ${result.message}`);
      else
        setNotice(
          `${result.deleted} ${label} berhasil dihapus.${result.deleted < result.requested ? " Sebagian data sudah tidak tersedia atau tidak dapat diakses." : ""}`,
        );
      model.reload();
    } catch (err) {
      setError(err.message);
      model.reload();
    } finally {
      setBusy(false);
    }
  }
  const title = {
    dashboard: "Dashboard Penjualan",
    data: "Data Bisnis",
    analysis: "Analisis Penjualan",
    smart: "Smart Dashboard",
  }[page];
  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[.2em] text-accent">
            {
              {
                dashboard: "RINGKASAN BISNIS",
                data: "KELOLA DATA",
                analysis: "ANALISIS PERFORMA",
                smart: "ASISTEN BISNIS",
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
                smart: "Pantau bisnis dan tentukan langkah berikutnya.",
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
          {page === "smart" && (
            <SmartDashboard
              reportData={model.data}
              query={model.query}
              setFilters={model.setFilters}
              onPage={onPage}
            />
          )}
          {page === "dashboard" && (
            <>
              {(model.data.sales.length > 0 ||
                model.data.expenses.length > 0) && (
                <SummaryCards
                  metrics={model.data.metrics}
                  missingHppCount={model.data.missing_hpp_count}
                />
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
          {page === "data" && (
            <>
              <div
                role="tablist"
                aria-label="Data Bisnis"
                className="mb-5 flex gap-1 rounded-xl border border-slate-200 bg-white p-1"
              >
                {[
                  ["sales", "Penjualan"],
                  ["expenses", "Biaya"],
                  ["imports", "Riwayat Impor"],
                ].map(([id, label], index) => (
                  <button
                    key={id}
                    id={`data-tab-${id}`}
                    role="tab"
                    aria-selected={dataTab === id}
                    aria-controls={`data-panel-${id}`}
                    tabIndex={dataTab === id ? 0 : -1}
                    className={`min-h-11 flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${dataTab === id ? "bg-navy text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    onClick={() => {
                      setDataTab(id);
                      if (id === "imports") setSourceId(null);
                    }}
                    onKeyDown={(event) => {
                      const ids = ["sales", "expenses", "imports"];
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % 3
                          : event.key === "ArrowLeft"
                            ? (index + 2) % 3
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? 2
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        setDataTab(ids[next]);
                        document
                          .getElementById(`data-tab-${ids[next]}`)
                          ?.focus();
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dataTab === "imports" && (
                <div
                  role="tabpanel"
                  id="data-panel-imports"
                  aria-labelledby="data-tab-imports"
                >
                  <SourceDataPanel
                    initialSourceId={sourceId}
                    sources={model.data.sources}
                    ready={model.data.source_storage_ready}
                    reload={model.reload}
                  />
                </div>
              )}
              <section
                role="tabpanel"
                id="data-panel-sales"
                aria-labelledby="data-tab-sales"
                hidden={dataTab !== "sales"}
                className="panel my-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Penjualan</h2>
                    <p className="muted mt-1">
                      Transaksi dan rekap hasil impor pada periode pilihan.
                    </p>
                  </div>
                </div>
                <DataTable
                  rows={model.data.sales}
                  kind="sales"
                  onSource={(id) => {
                    setSourceId(id);
                    setDataTab("imports");
                  }}
                  onEdit={setEditing}
                  onDelete={remove}
                  onBulkDelete={removeSelected}
                  busy={busy}
                />
              </section>
              <section
                role="tabpanel"
                id="data-panel-expenses"
                aria-labelledby="data-tab-expenses"
                hidden={dataTab !== "expenses"}
                className="panel my-5"
              >
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
                  onBulkDelete={removeSelected}
                  busy={busy}
                />
              </section>
            </>
          )}
        </>
      )}
      {model.data && (
        <details className="mt-6 text-xs text-slate-500">
          <summary className="min-h-10 cursor-pointer py-3 font-medium">
            Detail perhitungan
          </summary>
          <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-4 leading-relaxed">
            <p>
              Laba kotor = penjualan − HPP. Laba bersih = laba kotor − biaya
              operasional.
            </p>
            <p>{model.data.note}</p>
            <p>
              Margin tidak tersedia saat penjualan nol. Pajak, bunga, dan biaya
              yang belum dicatat belum mengurangi laba.
            </p>
          </div>
        </details>
      )}
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
