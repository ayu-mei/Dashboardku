import { useEffect, useState } from "react";
import { api } from "../services/api";
import { sourceRupiah } from "../utils/format";
import { ErrorMessage } from "./Feedback";
const labels = {
  master: "Master produk",
  sales_recap: "Rekap penjualan",
  supplier_claim: "Rafaksi supplier",
};
export default function SourceDataPanel({
  sources = [],
  ready,
  reload,
  initialSourceId,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detail, setDetail] = useState(null),
    [page, setPage] = useState(0);
  useEffect(() => {
    if (initialSourceId) {
      const source = sources.find((item) => item.id === initialSourceId);
      if (source) void open(source);
    }
  }, [initialSourceId]);
  async function open(source) {
    setBusy(true);
    setError("");
    try {
      setDetail(await api(`/api/sources/${source.id}`));
      setPage(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(source) {
    if (
      !confirm(
        `Hapus seluruh impor ${source.sheet} (${source.count} baris ${labels[source.kind].toLowerCase()})? Penghapusan mencakup seluruh periode dalam impor ini, bukan hanya filter aktif. Tindakan ini tidak dapat dibatalkan.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/sources/${source.id}`, { method: "DELETE" });
      if (detail?.id === source.id) setDetail(null);
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const columns =
    detail?.kind === "master"
      ? [
          ["sku", "SKU"],
          ["product", "Produk"],
          ["category", "Kategori"],
          ["regional_costs", "Referensi biaya wilayah"],
        ]
      : detail?.kind === "supplier_claim"
        ? [
            ["supplier_code", "Kode supplier"],
            ["supplier_name", "Supplier"],
            ["period_start", "Awal periode"],
            ["period_end", "Akhir periode"],
            ["amount", "Nilai rafaksi"],
          ]
        : [
            ["sku", "SKU"],
            ["product", "Produk"],
            ["location", "Lokasi"],
            ["period_start", "Awal periode"],
            ["period_end", "Akhir periode"],
            ["quantity", "Jumlah"],
            ["sales_value", "Penjualan"],
            ["total_hpp", "HPP"],
          ];
  return (
    <section className="panel my-5" aria-label="Data sumber impor">
      <h2 className="font-semibold">Data sumber impor</h2>
      <p className="muted mt-1">
        Kelola file yang sudah diimpor. Hanya rekap penjualan yang menambah
        omzet.
      </p>
      {ready === false && (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Penyimpanan data sumber belum diaktifkan administrator. Pemeriksaan
          Excel dan preview tetap tersedia.
        </p>
      )}
      {error && <ErrorMessage message={error} />}
      {sources.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {[
                  "Jenis",
                  "File / sheet",
                  "Periode",
                  "Baris dalam periode / seluruh impor",
                  "Aksi",
                ].map((name) => (
                  <th key={name}>{name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => (
                <tr key={source.id}>
                  <td>{labels[source.kind]}</td>
                  <td className="max-w-64 break-words">
                    {source.sheet}
                    <small className="block text-xs text-slate-500">
                      {source.source_name}
                    </small>
                  </td>
                  <td>
                    {source.metadata.period_start
                      ? `${source.metadata.period_start} – ${source.metadata.period_end}`
                      : "Referensi produk"}
                  </td>
                  <td>
                    {source.filtered_count ?? source.count} / {source.count}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => open(source)}
                      >
                        Lihat data
                      </button>
                      <button
                        className="btn-secondary !text-red-700"
                        disabled={busy}
                        onClick={() => remove(source)}
                      >
                        Hapus impor
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted mt-4">
          Belum ada master, rekap, atau rafaksi yang diimpor.
        </p>
      )}
      {detail && (
        <div className="mt-5 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              {labels[detail.kind]} · {detail.sheet}
            </h3>
            <button className="btn-secondary" onClick={() => setDetail(null)}>
              Tutup detail
            </button>
          </div>
          <p className="muted my-2">
            Seluruh baris dalam impor ini ditampilkan, termasuk yang berada di
            luar filter laporan.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.records
                  .slice(page * 10, page * 10 + 10)
                  .map((row, index) => (
                    <tr key={index}>
                      {columns.map(([key]) => (
                        <td key={key}>
                          {key === "regional_costs"
                            ? Object.entries(row[key] || {})
                                .map(
                                  ([region, value]) =>
                                    `${region}: ${sourceRupiah(value)}`,
                                )
                                .join(" · ")
                            : ["sales_value", "total_hpp", "amount"].includes(
                                  key,
                                )
                              ? sourceRupiah(row[key])
                              : (row[key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {detail.records.length} baris · Halaman {page + 1} dari{" "}
              {Math.max(1, Math.ceil(detail.records.length / 10))}
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Sebelumnya
              </button>
              <button
                className="btn-secondary"
                disabled={(page + 1) * 10 >= detail.records.length}
                onClick={() => setPage(page + 1)}
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
