import { useRef, useState } from "react";
import { configured, signIn } from "../services/auth";
import LoginScreen from "../components/login/LoginScreen";

export default function LoginPage({ onLogin }) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(
      configured() ? "" : "Layanan masuk belum siap. Hubungi administrator.",
    );
  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const values = new FormData(event.target);
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await signIn(values.get("email"), values.get("password"));
      onLogin();
    } catch (err) {
      setError(
        /email atau password/i.test(err.message)
          ? "Email atau password tidak sesuai."
          : "Login belum berhasil. Periksa koneksi atau coba beberapa saat lagi.",
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <LoginScreen
      busy={busy}
      error={error}
      available={configured()}
      onSubmit={submit}
    />
  );
}
