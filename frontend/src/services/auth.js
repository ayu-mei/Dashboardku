import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
function publicKey() {
  if (key?.startsWith("sb_publishable_")) return true;
  try {
    return (
      JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
        .role === "anon"
    );
  } catch {
    return false;
  }
}
export const configured = () =>
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url || "") &&
  publicKey() &&
  !!import.meta.env.VITE_API_BASE_URL;

export const SESSION_KEY = `refraksi-auth-${url}`;
export const ACTIVITY_KEY = `${SESSION_KEY}-activity`;
export const IDLE_LIMIT = 30 * 60 * 1000;
export const IDLE_WARNING = 2 * 60 * 1000;
const client = configured()
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: SESSION_KEY,
      },
    })
  : null;
export function observeSession(callback) {
  if (!client) {
    callback(null);
    return () => {};
  }
  const { data } = client.auth.onAuthStateChange((_event, session) =>
    callback(session),
  );
  return () => data.subscription.unsubscribe();
}
export async function signIn(email, password) {
  if (!client) throw new Error("Layanan masuk belum siap.");
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error)
    throw new Error(
      error.status === 400 || error.status === 401
        ? "Email atau password tidak valid."
        : "Layanan login tidak dapat dihubungi.",
    );
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
}
export async function accessToken() {
  if (!client) throw new Error("Layanan masuk belum siap.");
  const { data, error } = await client.auth.getSession();
  if (error)
    throw new Error(
      "Sesi belum dapat diperiksa. Periksa koneksi dan coba lagi.",
    );
  if (!data.session) throw new Error("Silakan masuk terlebih dahulu.");
  return data.session.access_token;
}
export async function signOut() {
  // Capture the token before clearing storage so the server can revoke it too.
  let token;
  try {
    token = JSON.parse(localStorage.getItem(SESSION_KEY))?.access_token;
  } catch {
    /* Invalid local session. */
  }
  // Clear the browser immediately, including when the auth service is offline.
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
  window.dispatchEvent(new Event("refraksi-signout"));
  await Promise.allSettled([
    client?.auth.signOut({ scope: "local" }),
    token
      ? fetch(`${url}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        })
      : Promise.resolve(),
  ]);
}
