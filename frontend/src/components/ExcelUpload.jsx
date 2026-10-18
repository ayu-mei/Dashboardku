import { useState } from "react";
import { Upload, CheckCircle2 } from "lucide-react";
import { api } from "../services/api";
import { ErrorMessage } from "./Feedback";
import { rupiah } from "../utils/format";
const fields = [
  ["date", "Tanggal transaksi", true],
  ["product", "Produk", true],
  ["quantity", "Jumlah unit", true],
  ["price", "Harga jual aktual per unit", true],
  ["unit_cost", "HPP per unit", true],
  ["customer", "Pelanggan", false],
  ["category", "Kategori", false],
  ["location", "Cabang / lokasi", false],
];
export default function ExcelUpload({ onImported }) {
  const [file, setFile] = useState(null),
    [profile, setProfile] = useState(null),
    [sheet, setSheet] = useState(""),
    [header, setHeader] = useState(1),
    [mapping, setMapping] = useState({}),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const form = () => {
    const body = new FormData();
    body.append("file", file);
    body.append("sheet", sheet);
    body.append("header_row", header);
    return body;
  };
  async function inspect() {
    setBusy(true);
    setError("");
    setPreview(null);
    setMapping({});
    setConfirmed(false);
    setMessage("");
    try {
      if (
        !file ||
        !file.name.toLowerCase().endsWith(".xlsx") ||
        file.size > 15 * 1024 * 1024 ||
        file.size === 0
      )
        throw new Error("Pilih file .xlsx tidak kosong, maksimal 15 MB.");
      const value = await api("/api/import/inspect", {
        method: "POST",
        body: form(),
      });
      setProfile(value);
      setSheet(value.sheet);
    } catch (err) {
      setError(err.message);
      setProfile(null);
    } finally {
      setBusy(false);
    }
  }
  async function process(commit = false) {
    setBusy(true);
    setError("");
    try {
      const body = form();
      body.append("mapping", JSON.stringify(mapping));
      body.append("confirm", commit ? "true" : "false");
      const value = await api(
        "/api/import/" + (commit ? "commit" : "preview"),
        { method: "POST", body },
      );
      if (commit) {
        setMessage(`${value.imported} transaksi berhasil disimpan.`);
        setPreview(null);
        setConfirmed(false);
        onImported();
      } else {
        setPreview(value);
        setConfirmed(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel my-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Upload size={18} />
        Upload Excel
      </h2>
      <p className="muted mt-2">
        File asli tidak diubah. Periksa sheet dan kolom, lalu tinjau sebelum
        menyimpan.
      </p>
      <div className="my-5 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label>
          File .xlsx
          <input
            type="file"
            accept=".xlsx"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setProfile(null);
              setPreview(null);
              setSheet("");
              setMessage("");
            }}
          />
        </label>
        {profile && (
          <label>
            Sheet
            <select
              value={sheet}
              disabled={busy}
              onChange={(e) => {
                setSheet(e.target.value);
                setPreview(null);
                setProfile((previous) => ({ ...previous, columns: [] }));
              }}
            >
              {profile.sheets.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Baris header
          <input
            type="number"
            min="1"
            max="50"
            value={header}
            disabled={busy}
            onChange={(e) => {
              setHeader(e.target.value);
              setPreview(null);
              if (profile)
                setProfile((previous) => ({ ...previous, columns: [] }));
            }}
          />
        </label>
        <button
          className="btn-secondary"
          disabled={busy || !file}
          onClick={inspect}
        >
          {busy ? "Memproses…" : "Periksa struktur Excel"}
        </button>
      </div>
      {error && <ErrorMessage message={error} />}{" "}
      {message && (
        <p
          className="my-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-accent"
          role="status"
        >
          <CheckCircle2 size={16} />
          {message}
        </p>
      )}
      {profile?.columns.length > 0 && (
        <>
          <p className="rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
            {profile.warning}
          </p>
          <div className="my-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {fields.map(([key, label, required]) => (
              <label key={key}>
                {label}
                {required ? " *" : ""}
                <select
                  value={mapping[key] ?? ""}
                  disabled={busy}
                  onChange={(e) => {
                    setMapping((previous) => ({
                      ...previous,
                      [key]:
                        e.target.value === "" ? null : Number(e.target.value),
                    }));
                    setPreview(null);
                  }}
                >
                  <option value="">
                    {required ? "Pilih kolom yang sesuai" : "Tidak tersedia"}
                  </option>
                  {profile.columns.map((col) => (
                    <option key={col.index} value={col.index}>
                      {col.name} (kolom {col.index + 1})
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => process(false)}
          >
            Validasi & pratinjau impor
          </button>
        </>
      )}
      {preview && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="font-semibold">{preview.count} baris transaksi valid</p>
          <p className="mt-2 text-sm text-slate-600">{preview.notice}</p>
          <div className="mt-3 overflow-x-auto rounded-lg bg-white">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Produk</th>
                  <th>Jumlah</th>
                  <th>Harga satuan</th>
                  <th>HPP satuan</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, index) => (
                  <tr key={index}>
                    <td>{row.date || "-"}</td>
                    <td>{row.product}</td>
                    <td>{row.quantity ?? "-"}</td>
                    <td>{rupiah(row.price)}</td>
                    <td>{rupiah(row.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="my-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              Saya memastikan ini detail transaksi aktual, tanpa subtotal,
              tanggal benar, serta HPP bukan biaya operasional dan data ini
              belum pernah diimpor.
            </span>
          </label>
          <button
            className="btn"
            disabled={busy || !confirmed}
            onClick={() => process(true)}
          >
            Simpan {preview.count} transaksi ke database
          </button>
        </div>
      )}
    </section>
  );
}
