import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../services/api";
export default function ImportAIHelp({ profile, preview }) {
  const [answer, setAnswer] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const controller = useRef(null);
  useEffect(() => {
    setAnswer("");
    setError("");
    setBusy(false);
    controller.current?.abort();
    return () => controller.current?.abort();
  }, [profile, preview]);
  async function explain() {
    if (busy) return;
    const current = new AbortController();
    controller.current = current;
    const timeout = setTimeout(() => current.abort(), 100000);
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/smart/import-help", {
        method: "POST",
        signal: current.signal,
        body: {
          sheet: profile.sheet || profile.source_profile?.name || "Sheet",
          kind: profile.source_profile?.kind || "transaction",
          columns: (profile.columns || [])
            .slice(0, 100)
            .map((c) => String(c.name || "").slice(0, 500)),
          issues: (preview?.issues || [])
            .slice(0, 30)
            .map((i) => String(i.message || i).slice(0, 500)),
          can_import: Boolean(preview?.can_import),
          message: String(
            profile.source_profile?.message ||
              "Jelaskan kemungkinan pencocokan header transaksi berikut dengan tanggal, produk, jumlah, harga jual per unit, dan HPP per unit. Pemeriksaan belum selesai; nilai total bukan harga per unit.",
          ).slice(0, 1500),
        },
      });
      if (!current.signal.aborted) setAnswer(result.answer);
    } catch (e) {
      if (controller.current === current)
        setError(
          current.signal.aborted
            ? "Permintaan terlalu lama. Silakan coba lagi."
            : e.message,
        );
    } finally {
      clearTimeout(timeout);
      if (controller.current === current) setBusy(false);
    }
  }
  return (
    <section className="my-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Sparkles size={16} /> Bantuan AI untuk Excel
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            AI membantu memahami kolom dan memberi saran untuk menyiapkan data
            sebelum impor.
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={explain}
        >
          {busy ? "AI sedang memeriksa…" : "Jelaskan & sarankan kolom"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {answer && (
        <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
          {answer}
        </p>
      )}
    </section>
  );
}
