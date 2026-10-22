import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Send,
  Download,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  X,
  Maximize2,
  Minimize2,
  History,
  Trash2,
  Pencil,
} from "lucide-react";
import { api } from "../services/api";
import SalesCharts from "./SalesCharts";
import AIAnswer from "./AIAnswer";
import useChatHistory from "../hooks/useChatHistory";
import { formatDuration } from "../utils/duration";
import yuwiProfile from "../assets/images/yuwi-profile-anime.png";
import SummaryCards from "./SummaryCards";
import { sourceRupiah, monthLabel, filterSummary } from "../utils/format";

function YuwiAvatar() {
  return (
    <span className="yuwi-avatar" aria-hidden="true">
      <img src={yuwiProfile} alt="" decoding="async" />
    </span>
  );
}

export default function SmartDashboard({ query, onPage, reportData, userId }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const chatScroll = useRef(null);
  const chatInput = useRef(null);
  const chatDialog = useRef(null);
  const [sentAt, setSentAt] = useState(null);
  const [overviewQuery, setOverviewQuery] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overview, setOverview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const history = useChatHistory(userId);
  const { messages, setMessages, question, setQuestion } = history;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [historySearch, setHistorySearch] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  useLayoutEffect(() => {
    if (!chatOpen) return;
    const resize = () => {
      const bounds = document
        .getElementById("smart-panel-summary")
        ?.getBoundingClientRect();
      if (bounds && chatDialog.current) {
        chatDialog.current.style.setProperty(
          "--yuwi-workspace-left",
          `${bounds.left}px`,
        );
        chatDialog.current.style.setProperty(
          "--yuwi-workspace-width",
          `${bounds.width}px`,
        );
      }
    };
    resize();
    const workspace = document.getElementById("smart-panel-summary");
    const observer = new ResizeObserver(resize);
    if (workspace) observer.observe(workspace);
    window.addEventListener("resize", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [chatOpen, chatExpanded, overview]);
  const request = useRef(null);
  const startedAt = useRef(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const tick = () =>
      setElapsedSeconds(
        Math.floor((performance.now() - startedAt.current) / 1000),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    const dialog = chatDialog.current;
    if (!dialog) return;
    const mobile = window.matchMedia("(max-width: 1023px)");
    const syncPanel = () => {
      if (dialog.open) dialog.close();
      if (chatOpen) {
        if (mobile.matches) dialog.showModal();
        else dialog.show();
        chatInput.current?.focus({ preventScroll: true });
      }
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    syncPanel();
    mobile.addEventListener("change", syncPanel);
    return () => mobile.removeEventListener("change", syncPanel);
  }, [chatOpen, Boolean(overview)]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!chatOpen || !viewport) return;
    const resize = () => {
      chatDialog.current?.style.setProperty(
        "--yuwi-viewport-height",
        `${viewport.height}px`,
      );
      chatDialog.current?.style.setProperty(
        "--yuwi-viewport-top",
        `${viewport.offsetTop}px`,
      );
    };
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [chatOpen, overview]);
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
    setOverviewLoading(true);
    setError("");
    api("/api/smart/overview?" + query, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setOverview(value);
          setOverviewQuery(query);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setOverviewLoading(false);
      });
    return () => controller.abort();
  }, [query]);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [],
  );

  useEffect(() => {
    if (chatScroll.current)
      chatScroll.current.scrollTop = chatScroll.current.scrollHeight;
  }, [messages, busy, error, chatOpen]);
  function closeChat() {
    setChatOpen(false);
    setChatExpanded(false);
    requestAnimationFrame(() =>
      document.getElementById("open-smart-chat")?.focus(),
    );
  }
  async function ask(text = question) {
    if (
      busy ||
      request.current ||
      overviewQuery !== query ||
      overviewLoading ||
      !text.trim()
    )
      return;
    setChatOpen(true);
    setPendingQuestion(text);
    setQuestion("");
    const sent = new Date().toISOString();
    setSentAt(sent);
    const controller = new AbortController();
    request.current = controller;
    const started = performance.now();
    startedAt.current = started;
    setElapsedSeconds(0);
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/smart/ask?" + query, {
        method: "POST",
        body: { task: "chat", question: text },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setMessages((v) => [
          ...v,
          {
            ...result,
            question: text,
            sent_at: sent,
            duration_seconds: Math.floor((performance.now() - started) / 1000),
          },
        ]);
      }
    } catch (e) {
      if (request.current === controller) {
        setQuestion((current) => (current.trim() ? current : text));
        setError(
          controller.signal.aborted
            ? controller.signal.reason === "timeout"
              ? "AI belum merespons dalam batas waktu. Silakan coba lagi."
              : "Permintaan AI dihentikan."
            : e.message,
        );
      }
    } finally {
      if (request.current === controller) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  function download(message) {
    const content = `LAPORAN SMART DASHBOARD REFRAKSI\nDibuat: ${new Date(message.generated_at).toLocaleString("id-ID")}\nFilter: ${filterSummary(message.filters)}\n\n${message.answer}`;
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
    <div className="space-y-5" aria-busy={overviewLoading}>
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
      {overview && overviewLoading && (
        <p role="status" className="muted">
          Memperbarui data sesuai filter…
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
            className={`yuwi-workspace ${chatOpen ? "yuwi-workspace-open" : ""}`}
          >
            <div className="min-w-0 space-y-5">
              {reportData?.sales?.length > 0 && (
                <SalesCharts data={reportData} stacked={chatOpen} />
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
            <dialog
              ref={chatDialog}
              id="smart-chat"
              aria-label="Tanya Yuwi"
              className={`yuwi-chat yuwi-dialog panel ${chatExpanded ? "yuwi-expanded" : ""}`}
              onKeyDown={(event) => {
                if (event.key === "Escape" && chatExpanded) {
                  event.preventDefault();
                  setChatExpanded(false);
                }
              }}
              onCancel={(event) => {
                event.preventDefault();
                closeChat();
              }}
            >
              <header className="yuwi-header">
                <YuwiAvatar />
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
                  className="icon-btn yuwi-expand-toggle"
                  aria-label={
                    chatExpanded ? "Kembalikan ukuran chat" : "Perbesar chat"
                  }
                  title={chatExpanded ? "Kembalikan ukuran" : "Perbesar"}
                  aria-pressed={chatExpanded}
                  onClick={() => setChatExpanded((value) => !value)}
                >
                  {chatExpanded ? (
                    <Minimize2 size={18} />
                  ) : (
                    <Maximize2 size={18} />
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Tutup panel AI"
                  onClick={closeChat}
                >
                  <X size={18} />
                </button>
              </header>
              <div className="yuwi-context">
                <span>
                  {overviewLoading
                    ? "Memperbarui data…"
                    : "Percakapan Anda dengan Yuwi"}
                </span>
                <button
                  type="button"
                  aria-label="Riwayat chat"
                  aria-expanded={historyOpen}
                  aria-controls="yuwi-history"
                  onClick={() => setHistoryOpen((value) => !value)}
                >
                  <History size={14} /> Riwayat
                </button>
                <button
                  type="button"
                  disabled={busy}
                  title={
                    busy
                      ? "Hentikan atau tunggu jawaban sebelum memulai chat baru"
                      : "Mulai percakapan baru"
                  }
                  onClick={() => {
                    history.newChat();
                    setHistoryOpen(false);
                    setError("");
                    chatInput.current?.focus();
                  }}
                >
                  Chat baru
                </button>
              </div>
              {history.storageError && (
                <p role="alert" className="px-4 py-2 text-xs text-amber-800">
                  {history.storageError}
                </p>
              )}
              {historyOpen && (
                <section
                  id="yuwi-history"
                  className="yuwi-history"
                  aria-label="Riwayat percakapan"
                >
                  <div className="yuwi-history-heading">
                    <strong>Riwayat chat</strong>
                    <button
                      className="icon-btn"
                      aria-label="Tutup riwayat"
                      onClick={() => setHistoryOpen(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="muted text-xs">
                    Tersimpan di browser ini untuk akun Anda.
                  </p>
                  {busy && (
                    <p className="muted text-xs mt-2">
                      Tunggu jawaban atau tekan Hentikan sebelum berganti chat.
                    </p>
                  )}
                  <input
                    className="input mt-2 w-full"
                    aria-label="Cari riwayat chat"
                    placeholder="Cari percakapan…"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                  />
                  {!history.conversations.some((item) =>
                    item.title
                      .toLocaleLowerCase()
                      .includes(historySearch.toLocaleLowerCase()),
                  ) && (
                    <p className="muted mt-3 text-xs">
                      Percakapan tidak ditemukan.
                    </p>
                  )}
                  <ul className="yuwi-history-list">
                    {history.conversations
                      .filter((item) =>
                        item.title
                          .toLocaleLowerCase()
                          .includes(historySearch.toLocaleLowerCase()),
                      )
                      .map((item) => (
                        <li
                          key={item.id}
                          className={
                            item.id === history.activeId ? "is-active" : ""
                          }
                        >
                          <button
                            className="yuwi-history-item"
                            disabled={busy}
                            aria-current={
                              item.id === history.activeId ? "true" : undefined
                            }
                            onClick={() => {
                              history.select(item.id);
                              setHistoryOpen(false);
                              setDeleteCandidate(null);
                              setError("");
                            }}
                          >
                            <span>{item.title}</span>
                            <small>
                              {item.id === history.activeId ? "Aktif · " : ""}
                              {new Date(item.updatedAt).toLocaleString(
                                "id-ID",
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </small>
                          </button>
                          <button
                            className="icon-btn"
                            aria-label={`Ubah nama chat ${item.title}`}
                            onClick={() => {
                              setRenaming(item.id);
                              setNewTitle(item.title);
                              setDeleteCandidate(null);
                            }}
                          >
                            <Pencil size={14} />
                          </button>
                          {renaming === item.id && (
                            <form
                              className="yuwi-history-rename"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (newTitle.trim()) {
                                  history.rename(item.id, newTitle);
                                  setRenaming(null);
                                  setHistorySearch("");
                                }
                              }}
                            >
                              <input
                                autoFocus
                                className="input"
                                aria-label="Nama percakapan"
                                maxLength={80}
                                value={newTitle}
                                onChange={(event) =>
                                  setNewTitle(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setRenaming(null);
                                  }
                                }}
                              />
                              <button type="submit" disabled={!newTitle.trim()}>
                                Simpan
                              </button>
                              <button
                                type="button"
                                onClick={() => setRenaming(null)}
                              >
                                Batal
                              </button>
                            </form>
                          )}
                          {deleteCandidate === item.id ? (
                            <div className="yuwi-history-confirm">
                              <span>Hapus chat ini?</span>
                              <button
                                disabled={busy}
                                onClick={() => {
                                  history.remove(item.id);
                                  setDeleteCandidate(null);
                                  setError("");
                                }}
                              >
                                Hapus
                              </button>
                              <button onClick={() => setDeleteCandidate(null)}>
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              className="icon-btn"
                              disabled={busy}
                              aria-label={`Hapus chat ${item.title}`}
                              onClick={() => setDeleteCandidate(item.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </li>
                      ))}
                  </ul>
                </section>
              )}
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
                    <YuwiAvatar />
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
                      <YuwiAvatar />
                      <div className="yuwi-answer">
                        <AIAnswer>{m.answer}</AIAnswer>
                        <p className="muted mt-3 text-[10px]">
                          {filterSummary(m.filters)} ·{" "}
                          {new Date(m.generated_at).toLocaleTimeString(
                            "id-ID",
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </p>
                        {Number.isFinite(m.duration_seconds) && (
                          <p
                            className="muted mt-1 text-[10px]"
                            data-testid="ai-duration"
                          >
                            Diproses dalam {formatDuration(m.duration_seconds)}
                          </p>
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
                      <span>
                        Yuwi sedang menganalisis ·{" "}
                        <span aria-live="off" data-testid="ai-elapsed">
                          {formatDuration(elapsedSeconds)}
                        </span>
                      </span>{" "}
                      <button
                        className="underline"
                        onClick={() => request.current?.abort("user")}
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
                      busy ||
                      overviewLoading ||
                      overviewQuery !== query ||
                      !overview.ai_configured ||
                      !question.trim()
                    }
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="yuwi-compose-hint">
                  Enter untuk kirim · Shift + Enter untuk baris baru
                </p>
              </form>
            </dialog>
            <button
              id="open-smart-chat"
              className={`btn yuwi-launcher fixed bottom-5 right-4 z-30 shadow-lg ${chatOpen ? "hidden" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={chatOpen}
              aria-controls="smart-chat"
              onClick={() => setChatOpen(true)}
            >
              <YuwiAvatar /> Tanya Yuwi
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
