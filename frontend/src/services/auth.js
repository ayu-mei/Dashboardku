const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
let session = null,
  refreshing = null;
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
async function authRequest(path, body, token) {
  if (!configured())
    throw new Error(
      "Konfigurasi online belum lengkap. Administrator perlu mengatur Supabase dan URL API, lalu build ulang.",
    );
  const response = await fetch(url + "/auth/v1/" + path, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      response.status === 400 || response.status === 401
        ? "Email atau password tidak valid, atau sesi telah berakhir."
        : data.msg || "Layanan login tidak dapat dihubungi.",
    );
  return data;
}
export async function signIn(email, password) {
  const value = await authRequest("token?grant_type=password", {
    email,
    password,
  });
  session = { ...value, expires_at: Date.now() + value.expires_in * 1000 };
}
export async function accessToken() {
  if (!session) throw new Error("Silakan masuk terlebih dahulu.");
  if (session.expires_at < Date.now() + 60000) {
    refreshing ??= authRequest("token?grant_type=refresh_token", {
      refresh_token: session.refresh_token,
    })
      .then((value) => {
        session = {
          ...value,
          expires_at: Date.now() + value.expires_in * 1000,
        };
      })
      .catch((error) => {
        session = null;
        throw error;
      })
      .finally(() => {
        refreshing = null;
      });
    await refreshing;
  }
  return session.access_token;
}
export async function signOut() {
  try {
    if (session) await authRequest("logout", null, session.access_token);
  } finally {
    session = null;
  }
}
