import { useRef, useState } from "react";
import { ErrorMessage } from "./Feedback";
import { months, sourceRupiah } from "../utils/format";
import ImportAIHelp from "./ImportAIHelp";

export default function SourceImportReview({
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
  const source = profile.source_profile;
  const [options, setOptions] = useState({
    year:
      source.year ||
      source.suggested_year ||
      Number(initialYear) ||
      new Date().getFullYear(),
    month: source.month || "",
    start: source.suggested_start || "",
    end: source.suggested_end || "",
    cost_basis: "none",
    accept_cached: false,
  });
  const [preview, setPreview] = useState(null),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  const reference = ["reference", "unknown"].includes(source.kind);
  const change = (key, value) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setConfirmed(false);
    setError("");
    onStage(false);
  };
  async function process(commit = false) {
    if (
      busy ||
      inFlight.current ||
      reference ||
      (commit && (!preview?.can_import || !confirmed))
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("sheet", source.name);
      body.append("options", JSON.stringify(options));
      body.append("confirm", String(commit));
      if (commit) body.append("preview_signature", preview.preview_signature);
      const value = await request(
        `/api/import/sources/${commit ? "commit" : "preview"}`,
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
      if (!commit) setPreview(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const columns =
    source.kind === "master"
      ? [
          ["sku", "SKU"],
          ["upc", "UPC"],
          ["product", "Produk"],
          ["category", "Kategori"],
          ["regional_costs", "Referensi biaya wilayah"],
        ]
      : source.kind === "supplier_claim"
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
    <section className="my-5 space-y-4" aria-label="Pemeriksaan data sumber">
      <ImportAIHelp profile={profile} preview={preview} />
      <div
        className={`rounded-xl border p-4 ${reference ? "border-slate-200 bg-slate-50" : "border-emerald-200 bg-emerald-50"}`}
      >
        <h3 className="font-semibold text-navy">{source.label} dikenali</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {source.message}
        </p>
        {source.period_hint && (
          <p className="mt-2 text-sm text-slate-600">
            Saran periode dari sheet pendukung: {source.period_hint}. Periksa
            sebelum menyimpan.
          </p>
        )}
        {source.period_label && (
          <p className="mt-2 text-sm text-slate-600">
            Keterangan sumber: {source.period_label}
          </p>
        )}
        {source.kind === "master" && (
          <p className="mt-2 text-sm text-slate-600">
            Impor ini menyimpan referensi barang. Tidak menambah penjualan atau
            mengubah HPP transaksi yang sudah tercatat.
          </p>
        )}
        {source.layout === "monthly_promotions" && (
          <p className="mt-2 text-sm text-slate-600">
            Yang dibaca: jumlah dan nilai penjualan semua toko. VALUE PROMO dan
            RAFAKSI tidak dianggap omzet. Kolom STORE pada program tidak dipakai
            untuk membagi omzet semua toko. Baris produk/periode yang berulang
            dengan nilai berbeda akan ditahan untuk diperiksa.
          </p>
        )}
        {reference && (
          <p className="mt-2 font-medium text-sm">
            Pilih sheet master, rekap penjualan, atau rafaksi yang
            direkomendasikan di atas.
          </p>
        )}
      </div>
      {!reference && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {source.kind !== "master" && (
              <label>
                {source.layout === "flush_wide"
                  ? "Tahun awal (Desember)"
                  : "Tahun laporan"}
                <input
                  type="number"
                  min="1"
                  max="9998"
                  value={options.year}
                  disabled={busy || Boolean(source.year)}
                  onChange={(event) =>
                    change("year", Number(event.target.value))
                  }
                />
              </label>
            )}
            {["monthly_promotions", "supplier_claim"].includes(
              source.layout,
            ) && (
              <label>
                Bulan laporan
                <select
                  value={options.month}
                  disabled={
                    busy || Boolean(source.month) || source.name === "2026"
                  }
                  onChange={(event) =>
                    change(
                      "month",
                      event.target.value ? Number(event.target.value) : "",
                    )
                  }
                >
                  <option value="">Baca bulan setiap baris</option>
                  {months.map((month, index) => (
                    <option key={month} value={index + 1}>
                      {month}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {source.layout === "simple_recap" && (
              <>
                <label>
                  Awal periode
                  <input
                    type="date"
                    value={options.start}
                    disabled={busy}
                    onChange={(event) => change("start", event.target.value)}
                  />
                </label>
                <label>
                  Akhir periode
                  <input
                    type="date"
                    value={options.end}
                    disabled={busy}
                    onChange={(event) => change("end", event.target.value)}
                  />
                </label>
                <p className="muted sm:col-span-2">
                  Gunakan periode yang tercantum pada laporan atau sheet
                  pendukung. Rekap tidak dianggap transaksi pada satu tanggal
                  buatan.
                </p>
              </>
            )}
            {source.kind === "sales_recap" && (
              <label>
                Dasar HPP
                <select
                  value={options.cost_basis}
                  disabled={busy}
                  onChange={(event) => change("cost_basis", event.target.value)}
                >
                  <option value="none">Omzet saja — HPP belum tersedia</option>
                  <option value="cost">
                    COST pada sheet (tanpa tambahan PPN)
                  </option>
                  <option value="tax_cost">COST + PPN pada sheet</option>
                </select>
              </label>
            )}
          </div>
          {source.kind === "sales_recap" && (
            <p className="muted">
              Jika HPP belum tersedia, penjualan tetap ditampilkan dan laba
              ditandai belum lengkap. Pilih basis biaya sesuai aturan bisnis
              Anda; aplikasi tidak menebak pajak atau biaya historis.
            </p>
          )}
          <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
            <input
              className="mt-1 h-4 w-4 shrink-0 p-0 accent-emerald-700"
              type="checkbox"
              checked={options.accept_cached}
              disabled={busy}
              onChange={(event) =>
                change("accept_cached", event.target.checked)
              }
            />
            <span>
              Saya sudah menghitung ulang dan menyimpan file di Excel. Jika ada
              rumus, gunakan hasil terakhir yang tersimpan. Aplikasi tidak
              memperbarui tautan eksternal.
            </span>
          </label>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => process()}
          >
            {busy ? "Memproses…" : "Periksa Data"}
          </button>
        </>
      )}
      {error && <ErrorMessage message={error} />}
      {preview && (
        <>
          <h3 className="font-semibold">
            Preview {preview.label.toLowerCase()}
          </h3>
          <p className="muted">
            {preview.count} baris · {preview.sheet}
            {preview.metadata.period_start
              ? ` · ${preview.metadata.period_start} – ${preview.metadata.period_end}`
              : ""}
          </p>
          <p className="muted">{preview.notice}</p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Penjualan", preview.totals.sales],
              ["HPP", preview.totals.hpp],
              ["Rafaksi (terpisah dari omzet)", preview.totals.claim],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 font-semibold">
                  {value == null
                    ? "Belum tersedia / tidak berlaku"
                    : sourceRupiah(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            Pengecualian: {preview.excluded.zero || 0} baris/periode nol,{" "}
            {preview.excluded.total || 0} total, {preview.excluded.heading || 0}{" "}
            judul, {preview.excluded.duplicate || 0} pengulangan identik,{" "}
            {preview.excluded.empty_period || 0} pasangan bulan kosong.{" "}
            {preview.cached_formula_count} sel memakai hasil rumus tersimpan.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full" aria-label="Preview data sumber">
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, index) => (
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
                          : ["sales_value", "total_hpp", "amount"].includes(key)
                            ? sourceRupiah(row[key])
                            : (row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.excluded.optional_unavailable > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {preview.excluded.optional_unavailable} nilai referensi opsional
              pada master tidak tersedia karena error sumber. Nilai tersebut
              tidak diganti nol; SKU dan nama produk tetap wajib valid.
            </p>
          )}
          {preview.excluded.unavailable_period > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p>
                {preview.excluded.unavailable_period} periode tanpa jumlah/nilai
                penjualan terukur (nol atau penanda X/N/A) tidak diimpor. Nilai
                yang hilang tidak diubah menjadi nol.
              </p>
              <details className="mt-2">
                <summary>Lihat periode yang dikecualikan</summary>
                <ul>
                  {preview.unavailable_periods.map((item, index) => (
                    <li key={index}>
                      Baris {item.row} · {item.period_start}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          <p className="muted">
            Menampilkan maksimal 10 baris. Seluruh baris diperiksa sebelum
            penyimpanan.
          </p>
          {!preview.can_import ? (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-semibold">Data belum dapat disimpan</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {preview.issues.map((issue, i) => (
                  <li key={i}>
                    {issue.row ? `Baris ${issue.row}: ` : ""}
                    {issue.message}
                  </li>
                ))}
              </ul>
              {preview.issue_count > preview.issues.length && (
                <p className="mt-2">
                  {preview.issue_count} masalah ditemukan. Menampilkan{" "}
                  {preview.issues.length} pertama.
                </p>
              )}
            </div>
          ) : (
            <label className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 p-0 accent-emerald-700"
                checked={confirmed}
                disabled={busy}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Saya menyetujui jenis data, periode, dasar HPP, nilai preview
                dan pengecualian di atas. Saya memastikan sumber ini tidak
                menggandakan data yang sudah dicatat.
              </span>
            </label>
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
            Konfirmasi Import {preview.count} baris
          </button>
        )}
      </div>
    </section>
  );
}
