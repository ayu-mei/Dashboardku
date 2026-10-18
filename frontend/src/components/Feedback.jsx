import { LoaderCircle, Inbox, AlertCircle } from "lucide-react";
export function Loading() {
  return (
    <div
      className="panel flex min-h-52 items-center justify-center gap-3 text-slate-500"
      role="status"
    >
      <LoaderCircle className="animate-spin" size={22} />
      Memuat data penjualan…
    </div>
  );
}
export function Empty({
  message = "Belum ada data pada periode yang dipilih.",
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-slate-500">
      <Inbox size={30} />
      <p>{message}</p>
    </div>
  );
}
export function ErrorMessage({ message, onRetry }) {
  return (
    <div
      className="my-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"
      role="alert"
    >
      <AlertCircle size={19} />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Coba lagi
        </button>
      )}
    </div>
  );
}
