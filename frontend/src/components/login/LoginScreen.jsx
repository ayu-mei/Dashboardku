import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";
import { ErrorMessage } from "../Feedback";
import LoginBrand from "./LoginBrand";
import BlinkingYuwi from "./BlinkingYuwi";
import "../../assets/login.css";

export default function LoginScreen({ busy, error, available, onSubmit }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const invalid = Boolean(error) && available;
  return (
    <div className="login-page">
      <div className="login-shell">
        <header
          className="login-logo"
          aria-label="REFRAKSI — Sales & Finance Dashboard"
        >
          <div>
            <span>REFRAKSI</span>
            <small>SALES &amp; FINANCE DASHBOARD</small>
          </div>
        </header>
        <div className="login-card">
          <LoginBrand />
          <main className="login-panel">
            <div className="login-mobile-yuwi" aria-hidden="true">
              <BlinkingYuwi decorative />
              <span className="login-mobile-greeting">Halo, aku Yuwi!</span>
            </div>
            <div className="login-panel-heading">
              <h1>Selamat datang</h1>
              <p>Masuk dan jelajahi data Anda bersama Yuwi.</p>
            </div>
            <form
              onSubmit={onSubmit}
              aria-label="Masuk ke REFRAKSI"
              aria-busy={busy}
            >
              <div className="login-form-fields">
                <div className="login-input-group">
                  <label htmlFor="login-email">Email</label>
                  <div className="login-input-wrap">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="Masukkan email"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      disabled={busy}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? "login-error" : undefined}
                    />
                  </div>
                </div>
                <div className="login-input-group">
                  <label htmlFor="login-password">Password</label>
                  <div className="login-input-wrap">
                    <input
                      id="login-password"
                      name="password"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Masukkan password"
                      required
                      disabled={busy}
                      aria-invalid={invalid || undefined}
                      aria-describedby={invalid ? "login-error" : undefined}
                    />
                    <button
                      type="button"
                      className="login-password-toggle"
                      aria-label={
                        passwordVisible
                          ? "Sembunyikan password"
                          : "Tampilkan password"
                      }
                      aria-pressed={passwordVisible}
                      aria-controls="login-password"
                      disabled={busy}
                      onClick={() => setPasswordVisible((value) => !value)}
                    >
                      {passwordVisible ? (
                        <EyeOff size={18} aria-hidden="true" />
                      ) : (
                        <Eye size={18} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {error && (
                <div id="login-error" className="login-error">
                  <ErrorMessage message={error} />
                </div>
              )}
              <button
                type="submit"
                className="btn login-submit"
                disabled={busy || !available}
                aria-busy={busy}
              >
                <span aria-live="polite">
                  {busy ? "Memproses..." : "Masuk"}
                </span>
                {busy ? (
                  <LoaderCircle
                    size={18}
                    className="login-spinner"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowRight size={18} aria-hidden="true" />
                )}
              </button>
              <p className="login-account-note">
                Akses hanya tersedia untuk akun yang telah terdaftar.
              </p>
              <div className="login-support-note">
                <p>
                  Lupa password? <span>Hubungi administrator.</span>
                </p>
              </div>
            </form>
          </main>
        </div>
        <footer className="login-footer">
          <span>Data lebih jelas, langkah lebih yakin.</span>
          <span>© {new Date().getFullYear()} REFRAKSI</span>
        </footer>
      </div>
    </div>
  );
}
