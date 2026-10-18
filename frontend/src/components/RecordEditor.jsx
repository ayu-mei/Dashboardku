import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../services/api";
import { ErrorMessage } from "./Feedback";
export default function RecordEditor({ editing, onClose, onSaved }) {
  const dialog = useRef(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
  }, []);
  const { kind, record } = editing;
  const today = new Date(),
    date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const fields =
    kind === "sales"
      ? [
          ["date", "Tanggal", "date"],
          ["customer", "Pelanggan", "text"],
          ["product", "Produk", "text"],
          ["quantity", "Jumlah unit", "number"],
          ["price", "Harga jual aktual per unit (Rp)", "number"],
          ["unit_cost", "HPP per unit (Rp)", "number"],
        ]
      : [
          ["date", "Tanggal", "date"],
          ["description", "Deskripsi biaya (bukan HPP)", "text"],
          ["amount", "Biaya (Rp)", "number"],
        ];
  async function submit(event) {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target));
    setBusy(true);
    setError("");
    try {
      await api(`/api/${kind}${record ? "/" + record.id : ""}`, {
        method: record ? "PUT" : "POST",
        body: {
          ...body,
          ...(kind === "sales"
            ? {
                category: record?.category ?? null,
                location: record?.location ?? null,
              }
            : {}),
        },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="m-auto max-h-[90dvh] w-[480px] max-w-[94vw] overflow-auto rounded-2xl border-0 p-5 shadow-2xl backdrop:bg-slate-950/60 sm:p-7"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="editor-title" className="text-lg font-semibold">
            {record ? "Edit" : "Tambah"}{" "}
            {kind === "sales" ? "transaksi" : "biaya"}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Tutup formulir"
          >
            <X size={18} />
          </button>
        </div>
        <div className="my-6 grid gap-4">
          {fields.map(([name, label, type]) => (
            <label key={name}>
              {label}
              <input
                name={name}
                type={type}
                required
                disabled={busy}
                defaultValue={
                  record?.[name] ??
                  (name === "date" ? date : name === "quantity" ? 1 : "")
                }
                maxLength={type === "text" ? 150 : undefined}
                min={
                  type === "number" ? (name === "quantity" ? 1 : 0) : undefined
                }
                max={
                  type === "number"
                    ? name === "quantity"
                      ? 1000000
                      : 1000000000000
                    : undefined
                }
                step={
                  type === "number"
                    ? name === "quantity"
                      ? 1
                      : ".01"
                    : undefined
                }
              />
            </label>
          ))}
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Batal
          </button>
          <button className="btn" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan data"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
