import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Download,
  AlertTriangle,
  TrendingUp,
  Calculator,
  ArrowRight,
  X,
  LoaderCircle,
} from "lucide-react";
import { api } from "../services/api";
import SalesCharts from "./SalesCharts";
import SummaryCards from "./SummaryCards";
import { sourceRupiah, monthLabel, filterSummary } from "../utils/format";

const tasks = [
  ["summary", "Ringkasan bisnis"],
  ["recommendations", "Rekomendasi tindakan"],
  ["report", "Buat laporan"],
];
const prompts = [
  "Apa yang paling perlu saya perhatikan?",
  "Produk mana yang paling besar kontribusinya?",
  "Apa keterbatasan data saya saat ini?",
];

export default function SmartDashboard({
  query,
  setFilters,
  onPage,
  reportData,
}) {
  const [tab, setTab] = useState("summary");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTask, setActiveTask] = useState("chat");
  const [pendingQuestion, setPendingQuestion] = useState("");
  const chatScroll = useRef(null);
  const [overview, setOverview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]),
    [question, setQuestion] = useState("");
  const [changes, setChanges] = useState({
    price_pct: 0,
    volume_pct: 0,
    cost_pct: 0,
    expense_pct: 0,
  });
  const [scenario, setScenario] = useState(null),
    [simBusy, setSimBusy] = useState(false);
  const request = useRef(null),
    simRequest = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setMessages([]);
    setScenario(null);
    setError("");
    setBusy(false);
    setSimBusy(false);
    request.current?.abort();
    simRequest.current?.abort();
    api("/api/smart/overview?" + query, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setOverview(value);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      request.current?.abort();
      simRequest.current?.abort();
      request.current = null;
      simRequest.current = null;
    };
  }, [query]);

  useEffect(() => {
    if (chatScroll.current)
      chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages, busy, error, chatOpen]);
  function closeChat() {
    setChatOpen(false);
    requestAnimationFrame(() =>
      document.getElementById("open-smart-chat")?.focus(),
    );
  }
  async function ask(task = "chat", text = question) {
    if (busy || (task === "chat" && !text.trim())) return;
    setTab("summary");
    setChatOpen(true);
    setActiveTask(task);
    setPendingQuestion(
      task === "chat" ? text : tasks.find((item) => item[0] === task)[1],
    );
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100000);
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/smart/ask?" + query, {
        method: "POST",
        body: { task, question: task === "chat" ? text : "" },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setMessages((v) =>
          [
            ...v,
            {
              ...result,
              question:
                task === "chat" ? text : tasks.find((t) => t[0] === task)[1],
            },
          ].slice(-12),
        );
        if (task === "chat")
          setQuestion((current) => (current === text ? "" : current));
      }
    } catch (e) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? "Permintaan AI dihentikan atau terlalu lama. Silakan coba lagi."
            : e.message,
        );
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  async function simulate(event) {
    event.preventDefault();
    if (simBusy) return;
    const controller = new AbortController();
    simRequest.current = controller;
    setSimBusy(true);
    setError("");
    setScenario(null);
    try {
      const result = await api("/api/smart/simulate?" + query, {
        method: "POST",
        body: changes,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setScenario(result);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (simRequest.current === controller) {
        setSimBusy(false);
        simRequest.current = null;
      }
    }
  }
  function apply(suggestion) {
    // Explicit user action; never applies generated filters silently.
    setFilters((current) => {
      const next = {
        ...current,
        ...Object.fromEntries(
          Object.entries(suggestion).map(([k, v]) => [
            k,
            v == null ? "" : String(v),
          ]),
        ),
      };
      if ("year" in suggestion || "month" in suggestion) {
        next.start = suggestion.start || "";
        next.end = suggestion.end || "";
      }
      if (suggestion.start || suggestion.end) {
        next.year = "";
        next.month = "";
      }
      return next;
    });
  }
  function download(message) {
    const content = `LAPORAN SMART DASHBOARD REFRAKSI\nDibuat: ${message.generated_at}\nFilter: ${filterSummary(message.filters)}\n\n${message.answer}\n\nAngka backend:\n${Object.entries(
      message.metrics,
    )
      .map(([k, v]) => `${k}: ${v ?? "Belum tersedia"}`)
      .join("\n")}\n\n${message.note}`;
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "laporan-smart-dashboard.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="space-y-5">
      {error && (tab !== "summary" || !overview) && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {!overview && !error && (
        <p role="status" className="muted">
          Memeriksa data bisnis…
        </p>
      )}
      {overview && (
        <>
          <SummaryCards
            metrics={overview.metrics}
            missingHppCount={overview.missing_hpp_count}
          />
          {!overview.ai_configured && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              AI belum terhubung. Hubungi administrator. Simulasi dan estimasi
              tetap tersedia.
            </p>
          )}
          <div
            role="tablist"
            aria-label="Fitur Smart Dashboard"
            className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1"
          >
            {[
              ["summary", "Ringkasan"],
              ["simulation", "Simulasi"],
            ].map(([id, label], index) => (
              <button
                key={id}
                id={`smart-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`smart-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                className={`min-h-11 scroll-mt-24 flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === id ? "bg-navy text-white" : "text-slate-500 hover:bg-slate-50"}`}
                onClick={() => setTab(id)}
                onKeyDown={(event) => {
                  const ids = ["summary", "simulation"];
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % 2
                      : event.key === "ArrowLeft"
                        ? (index + 1) % 2
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? 1
                            : null;
                  if (next !== null) {
                    event.preventDefault();
                    setTab(ids[next]);
                    document.getElementById(`smart-tab-${ids[next]}`)?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div
            id="smart-panel-summary"
            role="tabpanel"
            aria-labelledby="smart-tab-summary"
            hidden={tab !== "summary"}
            className={`relative ${tab === "summary" ? "grid" : "hidden"} items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]`}
          >
            <div className="min-w-0 space-y-5">
              {tab === "summary" && reportData?.sales?.length > 0 && (
                <SalesCharts data={reportData} stacked />
              )}
              <section className="panel">
                <h3 className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={18} /> Hal yang perlu diperhatikan
                </h3>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {overview.alerts.length ? (
                    [...overview.alerts]
                      .sort(
                        (a, b) =>
                          (a.level === "warning" ? 0 : 1) -
                          (b.level === "warning" ? 0 : 1),
                      )
                      .map((a) => (
                        <article
                          key={a.code}
                          className={`rounded-xl border p-4 ${a.level === "warning" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}
                        >
                          <h4 className="text-sm font-semibold">{a.title}</h4>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            {a.detail}
                          </p>
                        </article>
                      ))
                  ) : (
                    <p className="muted">
                      Tidak ada peringatan pada pemeriksaan ini.
                    </p>
                  )}
                </div>
                <button
                  className="btn-secondary mt-4"
                  onClick={() => onPage("data")}
                >
                  Periksa data sumber <ArrowRight size={15} />
                </button>
              </section>
              <section className="panel">
                <h3 className="flex items-center gap-2 font-semibold">
                  <TrendingUp size={18} /> Estimasi penjualan
                </h3>
                {overview.forecast.available ? (
                  <>
                    <p className="muted mt-3">
                      Perkiraan {monthLabel(overview.forecast.month, true)}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-navy">
                      {sourceRupiah(overview.forecast.sales)}
                    </p>
                    <p className="muted mt-2">
                      {overview.forecast.method} · Selisih historis rata-rata
                      (MAE): {sourceRupiah(overview.forecast.backtest_mae)}
                    </p>
                    <details className="mt-4 text-xs text-slate-500">
                      <summary className="cursor-pointer py-2 font-medium">
                        Lihat riwayat estimasi
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th>Bulan riwayat</th>
                              <th>Penjualan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {overview.forecast.training.map((r) => (
                              <tr key={r.month}>
                                <td>{monthLabel(r.month, true)}</td>
                                <td>{sourceRupiah(r.sales)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">
                    Estimasi belum tersedia. Diperlukan 6 bulan data berurutan
                    hingga bulan terakhir.
                  </p>
                )}
                <details className="mt-4 text-xs text-slate-500">
                  <summary className="cursor-pointer py-2 font-medium">
                    Metode dan batasan estimasi
                  </summary>
                  <p className="mt-2 leading-relaxed">
                    {overview.forecast.note}
                  </p>
                </details>
              </section>
            </div>
            <section
              id="smart-chat"
              role="region"
              aria-labelledby="smart-chat-title"
              className={`smart-chat-panel panel flex min-w-0 flex-col overflow-hidden fixed inset-x-3 bottom-3 z-30 max-h-[78dvh] shadow-2xl xl:sticky xl:inset-auto xl:top-24 xl:z-10 xl:h-[calc(100dvh-7rem)] xl:max-h-[900px] xl:shadow-sm ${chatOpen ? "" : "hidden xl:flex"}`}
              onKeyDown={(event) => {
                if (
                  event.key === "Escape" &&
                  window.matchMedia("(max-width: 1279px)").matches
                ) {
                  event.preventDefault();
                  closeChat();
                }
              }}
            >
              <div className="flex shrink-0 items-center justify-between gap-2">
                <h3
                  id="smart-chat-title"
                  tabIndex={-1}
                  className="flex items-center gap-2 font-semibold"
                >
                  <Sparkles size={18} /> Tanya AI
                </h3>
                <button
                  type="button"
                  className="icon-btn xl:hidden"
                  aria-label="Tutup panel AI"
                  onClick={closeChat}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="smart-chat-period muted mt-2">
                {filterSummary(overview.filters)}
              </p>
              <div className="smart-chat-actions mt-3 flex shrink-0 flex-wrap gap-2">
                {tasks.map(([id, label]) => (
                  <button
                    key={id}
                    aria-label={label}
                    title={
                      {
                        summary: "Jelaskan angka utama pada periode pilihan",
                        recommendations: "Sarankan langkah berdasarkan data",
                        report: "Susun laporan yang dapat ditinjau dan diunduh",
                      }[id]
                    }
                    className={`${id === "summary" ? "btn" : "btn-secondary"} !px-3 !text-xs`}
                    disabled={busy || !overview?.ai_configured}
                    onClick={() => ask(id)}
                  >
                    {busy && activeTask === id ? (
                      <>
                        <LoaderCircle size={14} className="animate-spin" />{" "}
                        Memproses…
                      </>
                    ) : (
                      {
                        summary: "Ringkasan",
                        recommendations: "Rekomendasi",
                        report: "Laporan",
                      }[id]
                    )}
                  </button>
                ))}
              </div>
              <div className="smart-chat-prompts mt-3 hidden shrink-0 flex-wrap gap-2 xl:flex">
                {prompts.map((p) => (
                  <button
                    className="rounded-full border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 disabled:opacity-40"
                    key={p}
                    disabled={busy || !overview.ai_configured}
                    onClick={() => {
                      setQuestion(p);
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div
                ref={chatScroll}
                role="log"
                aria-label="Percakapan AI"
                aria-live="polite"
                aria-busy={busy}
                className="mt-4 min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1"
              >
                {!messages.length && !busy && (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-500">
                    Pilih tindakan di atas atau tanyakan data sambil melihat
                    grafik.
                  </p>
                )}
                {messages.map((m, i) => (
                  <article
                    key={i}
                    className="rounded-xl border border-slate-200 p-3"
                  >
                    <p className="font-semibold text-navy">{m.question}</p>
                    <div className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
                      {m.answer}
                    </div>
                    <p className="muted mt-4 text-xs">
                      {filterSummary(m.filters)} ·{" "}
                      {new Date(m.generated_at).toLocaleString("id-ID")}
                    </p>
                    {m.suggested_filters &&
                      Object.keys(m.suggested_filters).length > 0 && (
                        <div className="mt-4 rounded-lg bg-emerald-50 p-3">
                          <p className="text-sm">
                            Usulan filter:{" "}
                            {filterSummary({
                              ...m.filters,
                              ...m.suggested_filters,
                            })}
                          </p>
                          <button
                            className="btn mt-3"
                            onClick={() => apply(m.suggested_filters)}
                          >
                            Terapkan filter usulan
                          </button>
                        </div>
                      )}
                    <button
                      className="btn-secondary mt-4"
                      onClick={() => download(m)}
                    >
                      <Download size={14} /> Unduh jawaban / laporan
                    </button>
                  </article>
                ))}
                {busy && (
                  <p role="status" className="muted">
                    <strong className="mb-2 block text-slate-700">
                      {pendingQuestion}
                    </strong>
                    <LoaderCircle
                      size={14}
                      className="mr-2 inline animate-spin"
                    />{" "}
                    AI sedang memproses…{" "}
                    <button
                      className="underline"
                      onClick={() => request.current?.abort()}
                    >
                      Hentikan
                    </button>
                  </p>
                )}
                {error && (
                  <p
                    role="alert"
                    className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
                  >
                    {error}
                  </p>
                )}
              </div>
              <form
                className="mt-4 flex shrink-0 flex-col gap-2 border-t border-slate-100 pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <label className="grow">
                  <span className="sr-only">Pertanyaan untuk AI</span>
                  <textarea
                    rows={2}
                    maxLength={1500}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Tanyakan data atau fitur dashboard…"
                    disabled={!overview.ai_configured}
                  />
                </label>
                <button
                  className="btn self-end"
                  disabled={busy || !overview.ai_configured || !question.trim()}
                >
                  <Send size={16} /> Kirim
                </button>
              </form>
            </section>
            <button
              id="open-smart-chat"
              className={`btn fixed bottom-5 right-4 z-30 shadow-lg xl:hidden ${chatOpen ? "hidden" : ""}`}
              aria-expanded={chatOpen}
              aria-controls="smart-chat"
              onClick={() => setChatOpen(true)}
            >
              <Sparkles size={17} /> Tanya AI
            </button>
          </div>
          <section
            id="smart-panel-simulation"
            role="tabpanel"
            aria-labelledby="smart-tab-simulation"
            hidden={tab !== "simulation"}
            className="panel"
          >
            <h3 className="flex items-center gap-2 font-semibold">
              <Calculator size={18} /> Simulasi bisnis
            </h3>
            <p className="muted mt-2">
              Ubah harga, jumlah, atau biaya untuk melihat dampaknya.
            </p>
            <form onSubmit={simulate}>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["price_pct", "Harga jual (%)"],
                  ["volume_pct", "Volume unit (%)"],
                  ["cost_pct", "HPP per unit (%)"],
                  ["expense_pct", "Biaya operasional (%)"],
                ].map(([key, label]) => (
                  <label key={key} className="text-xs">
                    {label}
                    <input
                      type="number"
                      min="-100"
                      max="500"
                      step="0.1"
                      required
                      value={changes[key]}
                      onChange={(e) => {
                        setChanges((v) => ({ ...v, [key]: e.target.value }));
                        setScenario(null);
                      }}
                    />
                  </label>
                ))}
              </div>
              <button
                className="btn mt-4"
                disabled={simBusy || !overview.rows.sales}
              >
                {simBusy ? "Menghitung…" : "Hitung simulasi"}
              </button>
            </form>
            {scenario && (
              <>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  {[
                    ["sales", "Penjualan"],
                    ["hpp", "HPP"],
                    ["operational", "Biaya operasional"],
                    ["net", "Laba bersih"],
                  ].map(([k, label]) => (
                    <div className="rounded-lg bg-slate-50 p-3" key={k}>
                      <dt className="text-xs text-slate-500">{label}</dt>
                      <dd className="mt-1 text-sm font-semibold">
                        {scenario.scenario[k] == null
                          ? "HPP belum lengkap"
                          : sourceRupiah(scenario.scenario[k])}
                      </dd>
                      <dd className="mt-1 text-xs text-slate-500">
                        Awal:{" "}
                        {scenario.baseline[k] == null
                          ? "Belum tersedia"
                          : sourceRupiah(scenario.baseline[k])}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  {scenario.scenario.note}
                </p>
              </>
            )}
          </section>
          <p className="text-xs text-slate-500">
            Diperiksa {new Date(overview.generated_at).toLocaleString("id-ID")}{" "}
            · {overview.rows.sales} baris penjualan · {overview.rows.expenses}{" "}
            baris biaya.
          </p>
        </>
      )}
    </div>
  );
}
