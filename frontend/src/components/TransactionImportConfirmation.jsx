export default function TransactionImportConfirmation({
  preview,
  busy,
  confirmed,
  setConfirmed,
  onClose,
  onConfirm,
}) {
  return (
    <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <p className="font-semibold">{preview.count} baris transaksi valid</p>
      <p className="mt-2 text-sm text-slate-600">{preview.notice}</p>
      <label className="my-4 flex items-start gap-3">
        <input
          type="checkbox"
          disabled={busy}
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          Saya memastikan ini detail transaksi aktual, tanpa subtotal, tanggal
          benar, serta HPP bukan biaya operasional dan data ini belum pernah
          diimpor.
        </span>
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Batal
        </button>
        <button
          className="btn"
          disabled={busy || !confirmed}
          onClick={() => onConfirm()}
        >
          {busy ? "Menyimpan…" : `Konfirmasi Import ${preview.count} transaksi`}
        </button>
      </div>
    </div>
  );
}
