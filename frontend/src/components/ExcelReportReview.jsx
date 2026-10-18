import { useRef, useState } from "react";
import { ErrorMessage } from "./Feedback";

const number = (value) =>
  value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 12 }).format(
        value,
      );

export default function ExcelReportReview({
  file,
  profile,
  initialYear,
  busy,
  setBusy,
  request,
  onStage,
  onImported,
  onClose,
}) {
  const [year, setYear] = useState(String(initialYear || ""));
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  async function process(commit = false) {
    if (
      busy ||
      inFlight.current ||
      !/^\d{4}$/.test(year) ||
      (commit && (!preview?.can_import || !confirmed))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("sheet", profile.sheet);
      body.append("year", year);
      body.append("confirm", commit ? "true" : "false");
      const value = await request(
        `/api/import/report/${commit ? "commit" : "preview"}`,
        body,
      );
      if (commit) {
        onImported();
        onClose();
      } else {
        setPreview(value);
        setConfirmed(false);
        onStage(value.can_import);
      }
    } catch (err) {
      setError(err.message);
      setConfirmed(false);
      if (!commit) {
        setPreview(null);
        onStage(false);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      className="my-5 space-y-4"
      aria-label="Pemeriksaan laporan penjualan"
    >
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <h3 className="font-semibold text-accent">
          ✓ Laporan penjualan dikenali
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          Sheet: {profile.sheet}. Jumlah unit dan total penjualan untuk{" "}
          {profile.report.period_label} akan dibaca otomatis. HPP mengikuti
          rumus margin pada sheet. Tidak perlu mencocokkan kolom satu per satu.
        </p>
      </div>
      <label className="block max-w-xs">
        Tahun laporan
        <input
          type="number"
          min="1000"
          max="9999"
          inputMode="numeric"
          value={year}
          disabled={busy}
          onChange={(event) => {
            setYear(event.target.value);
            setPreview(null);
            setConfirmed(false);
            setError("");
            onStage(false);
          }}
          aria-describedby="report-year-help"
        />
      </label>
      <p id="report-year-help" className="muted">
        Hari dan bulan berasal dari kolom Excel. Pastikan tahun sesuai laporan
        Anda sebelum memeriksa data.
      </p>
      <button
        type="button"
        className="btn"
        disabled={busy || !/^[1-9]\d{3}$/.test(year)}
        onClick={() => process(false)}
      >
        {busy ? "Memproses…" : "Periksa Data"}
      </button>
      {error && <ErrorMessage message={error} />}
      {preview && (
        <>
          <h3 className="font-semibold">Preview laporan penjualan</h3>
          <p className="muted">
            Tanggal: {preview.date} · {preview.count} baris penjualan · Sheet:{" "}
            {preview.sheet}
          </p>
          <p className="text-sm leading-relaxed text-slate-600">
            {preview.notice}
          </p>
          <p className="text-sm text-slate-600">
            Dasar HPP:{" "}
            {Object.entries(preview.cost_basis)
              .map(([basis, count]) => `${basis} (${count} baris)`)
              .join(", ") || "Belum dapat ditentukan"}
            .
            {` ${preview.excluded_zero_rows} baris tanpa penjualan dan ${preview.excluded_total_rows} baris total tidak ikut disimpan.`}
          </p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Penjualan aktual", preview.totals.sales],
              ["Total HPP", preview.totals.hpp],
              ["Gross profit", preview.totals.gross],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 break-words font-semibold text-navy">
                  {value === null ? "Belum lengkap" : `Rp ${number(value)}`}
                </dd>
              </div>
            ))}
          </dl>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full" aria-label="Preview laporan penjualan">
              <thead>
                <tr>
                  {[
                    "Produk",
                    "Lokasi",
                    "Jumlah unit",
                    "Penjualan aktual",
                    "HPP per unit",
                    "Total HPP",
                    "Dasar HPP",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row) => (
                  <tr key={row.source_row}>
                    <td>{row.product}</td>
                    <td>{row.location || "—"}</td>
                    <td>{number(row.quantity)}</td>
                    <td>{number(row.sales_value)}</td>
                    <td>{number(row.unit_cost)}</td>
                    <td>{number(row.total_hpp)}</td>
                    <td>{row.cost_basis || "Belum jelas"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted sm:hidden">
            Geser tabel ke samping untuk melihat seluruh kolom.
          </p>
          <p className="muted">
            Menampilkan maksimal 10 baris pertama. Seluruh baris diperiksa
            sebelum penyimpanan.
          </p>
          {!preview.can_import ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-semibold">
                {preview.already_imported
                  ? "Laporan ini sudah tersimpan"
                  : "Preview tersedia, tetapi laporan belum dapat disimpan"}
              </p>
              <p className="mt-2">
                {preview.already_imported
                  ? "Tidak ada data tambahan yang disimpan. Tutup dialog untuk melihat data penjualan yang sudah tersedia."
                  : `Ditemukan ${preview.issue_count} hal yang perlu ditangani. Seluruh sheet ditahan; tidak ada baris yang diimpor sebagian atau dibulatkan diam-diam.`}
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                {preview.issues.map((issue, index) => (
                  <li key={index}>
                    {issue.row ? `Baris ${issue.row}: ` : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p role="status" className="font-semibold text-accent">
                {preview.count} baris siap diimpor tanpa mengubah total
                penjualan dan HPP
              </p>
              <label className="mt-4 flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 p-0 accent-emerald-700"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  Saya sudah memeriksa tahun, tanggal, dasar HPP, dan nilai pada
                  preview. Saya menyetujui impor rekap penjualan ini serta
                  pengecualian baris nol dan total yang ditampilkan.
                </span>
              </label>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Batal
        </button>
        {preview?.can_import && (
          <button
            type="button"
            className="btn"
            disabled={busy || !confirmed}
            onClick={() => process(true)}
          >
            {busy
              ? "Menyimpan…"
              : `Konfirmasi Import ${preview.count} baris laporan`}
          </button>
        )}
      </div>
    </section>
  );
}
