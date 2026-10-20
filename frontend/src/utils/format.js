export const rupiah = (value) =>
  value === null || value === undefined
    ? "-"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 2,
      }).format(value);
export const percent = (value) =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? "-"
    : Number(value).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + "%";
export const compact = (value) =>
  new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
export const months = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];
export function monthLabel(value, full = false) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(value ?? ""));
  if (!match) return value ?? "—";
  const month = months[Number(match[2]) - 1];
  return `${full ? month : month.slice(0, 3)} ${match[1]}`;
}
export function filterSummary(filters = {}) {
  const parts = [];
  const month = months[Number(filters.month) - 1];
  if (month)
    parts.push(
      `${month}${filters.year ? ` ${filters.year}` : " (semua tahun)"}`,
    );
  else if (filters.year) parts.push(String(filters.year));
  for (const [key, label] of [
    ["start", "Dari"],
    ["end", "Sampai"],
    ["product", "Produk"],
    ["category", "Kategori"],
    ["location", "Lokasi"],
  ]) {
    if (!filters[key]) continue;
    const value = ["start", "end"].includes(key)
      ? new Date(`${filters[key]}T00:00:00`).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : filters[key];
    parts.push(`${label}: ${value}`);
  }
  return parts.join(" · ") || "Semua data";
}
export function filterQuery(filters) {
  return new URLSearchParams(
    Object.entries(filters).filter(
      ([, value]) => value !== "" && value !== null && value !== undefined,
    ),
  ).toString();
}

// Source previews retain all supplied decimal places, including values that
// cannot be represented by binary floating point or a two-decimal unit price.
export function sourceRupiah(value) {
  if (value === null || value === undefined) return "—";
  const raw = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return `Rp ${raw}`;
  const fraction = (match[3] || "").replace(/0+$/, "");
  return `${match[1]}Rp ${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction ? "," + fraction : ""}`;
}
