import { useState } from "react";
import { Glasses, LockKeyhole } from "lucide-react";
import { configured, signIn } from "../services/auth";
import { ErrorMessage } from "../components/Feedback";
export default function LoginPage({ onLogin }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      configured()
        ? ""
        : "Konfigurasi online belum lengkap. Administrator perlu mengatur Supabase dan URL backend FastAPI di Netlify.",
    );
  async function submit(event) {
    event.preventDefault();
    const values = new FormData(event.target);
    setBusy(true);
    setError("");
    try {
      await signIn(values.get("email"), values.get("password"));
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-navy p-4">
      <form
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-9"
        onSubmit={submit}
      >
        <div className="mb-8 flex items-center gap-3 text-navy">
          <Glasses size={30} />
          <span className="text-xl font-bold tracking-widest">REFRAKSI</span>
        </div>
        <h1 className="text-2xl font-bold">Masuk ke dashboard</h1>
        <p className="muted mt-2">Penjualan dan keuangan, dalam satu tempat.</p>
        <div className="my-7 grid gap-5">
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              disabled={busy}
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              disabled={busy}
              required
            />
          </label>
        </div>
        {error && <ErrorMessage message={error} />}
        <button className="btn w-full" disabled={busy || !configured()}>
          <LockKeyhole size={16} />
          {busy ? "Memeriksa…" : "Masuk"}
        </button>
        <p className="mt-5 text-center text-xs leading-relaxed text-slate-400">
          Akses khusus akun yang dibuat administrator.
          <br />
          Lupa password? Hubungi administrator.
        </p>
      </form>
    </div>
  );
}
