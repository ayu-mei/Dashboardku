import { accessToken } from "./auth";
const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
export async function api(
  path,
  { body, method = "GET", signal, download = false } = {},
) {
  const token = await accessToken();
  const form = body instanceof FormData;
  const response = await fetch(base + path, {
    method,
    signal,
    headers: {
      Authorization: "Bearer " + token,
      ...(!form ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  }).catch((error) => {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Tidak dapat terhubung ke server. Periksa koneksi atau hubungi administrator, lalu coba lagi.",
    );
  });
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(
      typeof value.detail === "string"
        ? value.detail
        : "Layanan tidak dapat memproses permintaan. Periksa koneksi dan input Anda.",
    );
  }
  return download ? response.blob() : response.json();
}
export async function downloadReport(query) {
  const blob = await api("/api/export?" + query, { download: true });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "laporan-refraksi.xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
