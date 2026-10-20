import { useEffect, useRef, useState } from "react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import DashboardLayout from "./layouts/DashboardLayout";
import {
  observeSession,
  signOut,
  ACTIVITY_KEY,
  SESSION_KEY,
  IDLE_LIMIT,
  IDLE_WARNING,
} from "./services/auth";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [page, setPage] = useState("dashboard");
  const [reason, setReason] = useState("");
  const [remaining, setRemaining] = useState(null);
  const ending = useRef(false);
  useEffect(() => {
    const stop = observeSession((value) => {
      setSession(value);
      if (value) ending.current = false;
      else {
        setRemaining(null);
        setPage("dashboard");
      }
    });
    const clear = () => {
      setSession(null);
      setPage("dashboard");
    };
    const storage = (event) => {
      if ((event.key === SESSION_KEY && !event.newValue) || event.key === null)
        clear();
    };
    window.addEventListener("refraksi-signout", clear);
    window.addEventListener("storage", storage);
    return () => {
      stop();
      window.removeEventListener("refraksi-signout", clear);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function logout(message = "") {
    if (ending.current) return;
    ending.current = true;
    setReason(message);
    setSession(null);
    setPage("dashboard");
    setRemaining(null);
    void signOut().catch(() => {
      /* Browser session has already been cleared. */
    });
  }
  useEffect(() => {
    if (!session) return;
    if (!localStorage.getItem(ACTIVITY_KEY))
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    const check = () => {
      const left =
        IDLE_LIMIT -
        (Date.now() - Number(localStorage.getItem(ACTIVITY_KEY) || 0));
      if (left <= 0)
        logout(
          "Anda keluar otomatis karena tidak aktif selama 30 menit. Silakan masuk kembali.",
        );
      else setRemaining(left <= IDLE_WARNING ? Math.ceil(left / 1000) : null);
    };
    const activity = () => {
      const elapsed =
        Date.now() - Number(localStorage.getItem(ACTIVITY_KEY) || 0);
      // Once warned, require an explicit choice to keep the session open.
      if (elapsed < IDLE_LIMIT - IDLE_WARNING && elapsed > 1000) {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      }
      check();
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, activity, { passive: true }),
    );
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("storage", check);
    const timer = setInterval(check, 1000);
    check();
    return () => {
      clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, activity));
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", check);
    };
  }, [Boolean(session)]);
  if (session === undefined)
    return (
      <div className="flex min-h-dvh items-center justify-center" role="status">
        Memeriksa sesi…
      </div>
    );
  if (!session)
    return (
      <>
        {reason && (
          <p
            className="bg-amber-50 p-4 text-center text-sm text-amber-900"
            role="status"
          >
            {reason}
          </p>
        )}
        <LoginPage onLogin={() => setReason("")} />
      </>
    );
  return (
    <>
      <DashboardLayout page={page} onPage={setPage} onLogout={() => logout()}>
        <DashboardPage page={page} onPage={setPage} />
      </DashboardLayout>
      {remaining !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = [
                ...event.currentTarget.querySelectorAll("button"),
              ];
              const index = buttons.indexOf(document.activeElement);
              event.preventDefault();
              buttons[
                (index + (event.shiftKey ? -1 : 1) + buttons.length) %
                  buttons.length
              ].focus();
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="idle-title"
            aria-describedby="idle-description"
            className="panel w-full max-w-md p-6"
          >
            <h2 id="idle-title" className="text-xl font-semibold">
              Sesi Anda akan berakhir
            </h2>
            <p id="idle-description" className="my-4 text-sm text-slate-600">
              Tidak ada aktivitas. Anda akan keluar dalam{" "}
              {Math.floor(remaining / 60)}:
              {String(remaining % 60).padStart(2, "0")}. Pilih Tetap masuk untuk
              melanjutkan.
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
                className="btn"
                onClick={() => {
                  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
                  setRemaining(null);
                }}
              >
                Tetap masuk
              </button>
              <button className="btn-secondary" onClick={() => logout()}>
                Keluar
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
