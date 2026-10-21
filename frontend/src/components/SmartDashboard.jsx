import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Sparkles,
  Send,
  Download,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  X,
} from "lucide-react";
import { api } from "../services/api";
import SalesCharts from "./SalesCharts";
import AIAnswer from "./AIAnswer";
import SummaryCards from "./SummaryCards";
import { sourceRupiah, monthLabel, filterSummary } from "../utils/format";

export default function SmartDashboard({
  query,
  setFilters,
  onPage,
  reportData,
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const chatScroll = useRef(null);
  const chatInput = useRef(null);
  const [sentAt, setSentAt] = useState(null);
  const [overview, setOverview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]),
    [question, setQuestion] = useState("");
  const request = useRef(null);
  useLayoutEffect(() => {
    const resize = () => {
      const input = chatInput.current;
      if (!input || !input.clientWidth) return;
      input.style.height = "auto";
      const height = Math.min(120, Math.max(44, input.scrollHeight));
      input.style.height = `${height}px`;
      input.style.overflowY = input.scrollHeight > 120 ? "auto" : "hidden";
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [question, chatOpen, overview]);
  useEffect(() => {
    const controller = new AbortController();
    setOverview(null);
    setMessages([]);
    setError("");
    setBusy(false);
    request.current?.abort();
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
      request.current = null;
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
  async function ask(text = question) {
    if (busy || request.current || !text.trim()) return;
    setChatOpen(true);
    setPendingQuestion(text);
    setQuestion("");
    const sent = new Date().toISOString();
    setSentAt(sent);
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 100000);
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/smart/ask?" + query, {
        method: "POST",
        body: { task: "chat", question: text },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setMessages((v) =>
          [
            ...v,
            {
              ...result,
              question: text,
              sent_at: sent,
            },
          ].slice(-12),
        );
      }
    } catch (e) {
      if (request.current === controller) {
        setQuestion((current) => (current.trim() ? current : text));
        setError(
          controller.signal.aborted
            ? "Permintaan AI dihentikan atau terlalu lama. Silakan coba lagi."
            : e.message,
        );
      }
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
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
      {error && !overview && (
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
              AI belum terhubung. Hubungi administrator. Estimasi tetap
              tersedia.
            </p>
          )}
          <div
            id="smart-panel-summary"
            className="relative grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]"
          >
            <div className="min-w-0 space-y-5">
              {reportData?.sales?.length > 0 && (
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
              aria-label="Tanya Yuwi"
              className={`yuwi-chat smart-chat-panel panel flex min-w-0 flex-col overflow-hidden fixed inset-x-3 bottom-3 z-30 max-h-[78dvh] shadow-2xl xl:sticky xl:inset-auto xl:top-24 xl:z-10 xl:h-[calc(100dvh-7rem)] xl:max-h-[900px] xl:shadow-sm ${chatOpen ? "" : "hidden xl:flex"}`}
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
              <header className="yuwi-header">
                <span className="yuwi-avatar" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="yuwi-kicker">REFRAKSI · ASISTEN BISNIS</p>
                  <h3 id="smart-chat-title" tabIndex={-1}>
                    Yuwi
                  </h3>
                  <p className="yuwi-subtitle">
                    Bantu memahami data bisnis Anda
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn xl:hidden"
                  aria-label="Tutup panel AI"
                  onClick={closeChat}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="yuwi-context">
                <span>Percakapan Anda dengan Yuwi</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMessages([]);
                    setQuestion("");
                    setError("");
                    chatInput.current?.focus();
                  }}
                >
                  Chat baru
                </button>
              </div>
              <div
                ref={chatScroll}
                role="log"
                aria-label="Percakapan AI"
                aria-live="polite"
                aria-busy={busy}
                className="yuwi-messages min-h-0 min-w-0 flex-1 space-y-5 overflow-y-auto overscroll-contain"
              >
                {!messages.length && !busy && (
                  <div className="yuwi-welcome">
                    <span className="yuwi-avatar" aria-hidden="true" />
                    <h4>Halo, saya Yuwi</h4>
                    <p>
                      Tanyakan penjualan, HPP, laba kotor, atau tren bisnis. AI
                      menganalisis data berdasarkan filter aktif dan riwayat
                      yang tersedia.
                    </p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <article key={i} className="space-y-3">
                    <div className="yuwi-user">
                      <span className="yuwi-user-text">{m.question}</span>
                      <time>
                        {new Date(
                          m.sent_at || m.generated_at,
                        ).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <div className="yuwi-assistant">
                      <span className="yuwi-avatar" aria-hidden="true" />
                      <div className="yuwi-answer">
                        <AIAnswer>{m.answer}</AIAnswer>
                        <p className="muted mt-3 text-[10px]">
                          {filterSummary(m.filters)} ·{" "}
                          {new Date(m.generated_at).toLocaleTimeString(
                            "id-ID",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
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
                          className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs text-slate-500 hover:text-navy"
                          onClick={() => download(m)}
                        >
                          <Download size={14} /> Unduh jawaban / laporan
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {busy && (
                  <div className="space-y-3">
                    <div className="yuwi-user">
                      <span className="yuwi-user-text">{pendingQuestion}</span>
                      <time>
                        {sentAt &&
                          new Date(sentAt).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                      </time>
                    </div>
                    <p role="status" className="yuwi-typing">
                      <span className="yuwi-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      Yuwi sedang menganalisis…{" "}
                      <button
                        className="underline"
                        onClick={() => request.current?.abort()}
                      >
                        Hentikan
                      </button>
                    </p>
                  </div>
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
                className="yuwi-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
              >
                <div className="yuwi-input-row">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Pertanyaan untuk AI</span>
                    <textarea
                      ref={chatInput}
                      rows={1}
                      maxLength={1500}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing &&
                          e.keyCode !== 229
                        ) {
                          e.preventDefault();
                          if (!e.repeat && !busy && question.trim())
                            e.currentTarget.form?.requestSubmit();
                        }
                      }}
                      placeholder="Tulis pertanyaan untuk Yuwi…"
                      disabled={!overview.ai_configured}
                    />
                  </label>
                  <button
                    className="yuwi-send"
                    aria-label="Kirim"
                    disabled={
                      busy || !overview.ai_configured || !question.trim()
                    }
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="yuwi-compose-hint">
                  Enter untuk kirim · Shift + Enter untuk baris baru
                </p>
              </form>
            </section>
            <button
              id="open-smart-chat"
              className={`btn fixed bottom-5 right-4 z-30 shadow-lg xl:hidden ${chatOpen ? "hidden" : ""}`}
              aria-expanded={chatOpen}
              aria-controls="smart-chat"
              onClick={() => setChatOpen(true)}
            >
              <Sparkles size={17} /> Tanya Yuwi
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Diperiksa {new Date(overview.generated_at).toLocaleString("id-ID")}{" "}
            · {overview.rows.sales} baris penjualan.
          </p>
        </>
      )}
    </div>
  );
}
